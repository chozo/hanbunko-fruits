// 告知動画（縦 1080x1920 / 30fps / H.264 + AAC / 約30秒）を作る。
//   1. インストール済みの Chrome をヘッドレスで開き、ゲームを1コマずつ進めてスクリーンショットを撮る
//   2. ゲーム中に鳴った効果音と、合成したリズムを OfflineAudioContext で WAV に書き出す
//   3. ffmpeg で MP4 にまとめ、最後の場面を表紙画像にする
//
// 使い方: 開発サーバ（npm run dev）を起動した状態で
//   npm run promo -- [URL]          （既定: http://localhost:5173/）
// 出力: ../video/hanbunko-fruits-promo.mp4 と ../video/hanbunko-fruits-promo-cover.jpg
//   別の場所に出すとき: PROMO_OUT_DIR=/path/to/dir npm run promo

import { chromium } from 'playwright-core';
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const url = process.argv[2] ?? 'http://localhost:5173/';
// 動画はリポジトリとは別に管理する（アプリのフォルダの隣の video/）
const outDir = process.env.PROMO_OUT_DIR ?? join(root, '..', 'video');
const workDir = join(outDir, 'work');
const frameDir = join(workDir, 'frames');
const FPS = 30;
const MAX_SECONDS = 40;
const SLUG = 'hanbunko-fruits';
// 確認用：PROMO_EVERY=15 のようにすると 15 コマごとにだけ撮る（動画は作らない）
const EVERY = Number(process.env.PROMO_EVERY ?? 1);

// 撮影し直さずに書き出しだけやり直す：PROMO_ENCODE_ONLY=1（../video/work/ のコマと音声を使う）
const ENCODE_ONLY = process.env.PROMO_ENCODE_ONLY === '1';
const wavPath = join(workDir, 'audio.wav');

if (!ENCODE_ONLY) {
  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().startsWith('[promo]')) console.log(m.text());
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: readFileSync(join(here, 'promo.css'), 'utf8') });
  await page.addScriptTag({ content: readFileSync(join(here, 'scenario.js'), 'utf8') });
  await page.evaluate(() => window.promo.prepare());

  let n = 0;
  const t0 = Date.now();
  for (; n < MAX_SECONDS * FPS; n++) {
    const cont = await page.evaluate((i) => window.promo.frame(i), n);
    if (n % EVERY === 0) await page.screenshot({ path: join(frameDir, `f${String(EVERY > 1 ? n / EVERY : n).padStart(5, '0')}.jpg`), type: 'jpeg', quality: EVERY > 1 ? 70 : 92, scale: EVERY > 1 ? 'css' : 'device' });
    if (n % 30 === 0) process.stdout.write(`\r撮影中 ${(n / FPS).toFixed(0)}秒`);
    if (!cont) {
      n++;
      break;
    }
  }
  const duration = n / FPS;
  console.log(`\r撮影完了: ${n}コマ（${duration.toFixed(1)}秒） ${((Date.now() - t0) / 1000).toFixed(0)}秒かかった`);

  if (EVERY > 1) {
    await browser.close();
    console.log('確認用のコマ:', frameDir);
    process.exit(0);
  }

  // 音（効果音 + リズム）
  const wavB64 = await page.evaluate((d) => window.promo.renderAudio(d), duration);
  writeFileSync(wavPath, Buffer.from(wavB64, 'base64'));
  await browser.close();

}

/**
 * 音量を -14 LUFS にそろえる。効果音の鋭い山を先に圧縮・制限してから、
 * loudnorm（ダイナミックモード：真のピークを -2 dBTP に抑える）で整える。
 */
function loudnormFilter() {
  const pre = 'acompressor=threshold=-26dB:ratio=5:attack=3:release=150:makeup=4,alimiter=limit=0.5:level=false';
  return `${pre},loudnorm=I=-14:TP=-2:LRA=9,aresample=44100,aformat=channel_layouts=stereo`;
}

// MP4（スマホのショート動画向け: H.264 / yuv420p / AAC / faststart、音量 -14 LUFS）
const mp4 = join(outDir, `${SLUG}-promo.mp4`);
execFileSync(
  ffmpegPath,
  [
    '-y', '-loglevel', 'error',
    '-framerate', String(FPS), '-i', join(frameDir, 'f%05d.jpg'),
    '-i', wavPath,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
    '-af', loudnormFilter(),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100',
    '-shortest', '-movflags', '+faststart',
    mp4,
  ],
  { stdio: 'inherit' },
);
// 表紙（最後の場面＝ロゴとURL）
const cover = join(outDir, `${SLUG}-promo-cover.jpg`);
execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', '-sseof', '-1.0', '-i', mp4, '-frames:v', '1', '-q:v', '2', cover], { stdio: 'inherit' });
console.log('出力:', mp4);
console.log('表紙:', cover);
