// SNS共有用の OGP 画像（1200×630）を public/ogp.png に作る。
//   npm run ogp
// 1. Vite の開発サーバーを立ててゲームを縦長の画面で開き、確認用の入口（window.__game）で
//    果物をほぼ 50:50 に切った直後の場面まで進めて撮る
// 2. 同じゲームを 1200×630 で開き直し、その上に台紙を重ねて、撮った画面・タイトル・遊び方・URL を並べて撮る
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outFile = path.join(root, 'public/ogp.png');

// 撮る場面: このステージの果物を、画面上でこの角度（度）の線で切る。片側 − 50 がおよそ TARGET になる位置を探す
const STAGE = 6; // スイカ
const ANGLE = 62;
const TARGET = 0.1;
const AFTER_CUT = 2.2; // 切ってから撮るまでの秒数
const URL_TEXT = 'game.chozo.net/hanbunko-fruits';

const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

// 1. ゲーム画面を撮る
const page = await browser.newPage({ viewport: { width: 390, height: 693 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__game);
const result = await page.evaluate(({ stage, angle, target, after }) => {
  const g = window.__game;
  const DT = 1 / 30;
  g.start();
  g.manual(true);
  g.goStage(stage);
  for (let i = 0; i < 40; i++) g.step(DT); // 登場の演出を終わらせる
  // 画面中央から d だけずらした、角度 angle の線（表示領域の端から端まで）
  const { width: w, height: h } = g.size;
  const a = (angle * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const lineFor = (d) => {
    const px = w / 2 - dy * d, py = h / 2 + dx * d, m = 8;
    let t0 = -Infinity, t1 = Infinity;
    for (const [p, v, lo, hi] of [[px, dx, m, w - m], [py, dy, m, h - m]]) {
      if (Math.abs(v) < 1e-9) continue;
      const ta = (lo - p) / v, tb = (hi - p) / v;
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
    }
    return [px + dx * t0, py + dy * t0, px + dx * t1, py + dy * t1];
  };
  // 切らずに体積比を測りながら、二分探索で線の位置を決める
  const f = (d) => g.preview(...lineFor(d));
  const R = Math.min(w, h) * 0.35;
  let lo = -R, hi = R, flo = f(lo);
  if ((flo - target) * (f(hi) - target) > 0) target = -target;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if ((fm - target) * (flo - target) <= 0) hi = mid;
    else [lo, flo] = [mid, fm];
  }
  const [x0, y0, x1, y1] = lineFor((lo + hi) / 2);
  // 本物のスワイプと同じ処理で切る
  g.touchDown(x0, y0);
  for (let i = 1; i <= 10; i++) {
    g.touchMove(x0 + ((x1 - x0) * i) / 10, y0 + ((y1 - y0) * i) / 10);
    g.step(DT / 3);
  }
  g.touchUp(x1, y1);
  for (let t = 0; t < after; t += DT) g.step(DT);
  return { state: g.state, judgement: g.judgement };
}, { stage: STAGE, angle: ANGLE, target: TARGET, after: AFTER_CUT });
console.log('撮った場面:', JSON.stringify(result));
const shot = await page.locator('#app').screenshot({ type: 'png' });

// 2. 台紙に並べて撮る
const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await card.goto(url, { waitUntil: 'networkidle' });
await card.evaluate(({ img, urlText }) => {
  const style = document.createElement('style');
  style.textContent = `
    #ogp { position: fixed; inset: 0; width: 1200px; height: 630px; z-index: 9999; overflow: hidden; color: #fff;
      font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif; font-weight: 900;
      background: radial-gradient(circle at 34% 46%, #3c1478, #0b0620 74%); }
    #ogp .shot { position: absolute; left: 790px; top: 30px; width: 360px; border-radius: 22px;
      transform: rotate(4deg); transform-origin: 50% 0;
      box-shadow: 0 0 0 6px #ffd84a, 0 0 40px rgba(255, 200, 80, .45), 0 20px 40px rgba(0, 0, 0, .5); }
    #ogp .text { position: absolute; left: 60px; top: 0; bottom: 0; width: 700px;
      display: flex; flex-direction: column; justify-content: center; align-items: flex-start; }
    #ogp .logo1 { font-size: 96px; line-height: 1.1; white-space: nowrap;
      -webkit-text-stroke: 18px #c2185b; paint-order: stroke fill; text-shadow: 0 8px 0 #2a1050; }
    #ogp .logo2 { margin: 6px 0 0 140px; font-size: 50px; color: #ffd84a; letter-spacing: .12em;
      -webkit-text-stroke: 10px #2a1050; paint-order: stroke fill; }
    #ogp .lead { margin-top: 30px; font-size: 38px; line-height: 1.45;
      -webkit-text-stroke: 8px #2a1050; paint-order: stroke fill; }
    #ogp .lead em { font-style: normal; color: #ffd84a; }
    #ogp .url { margin-top: 30px; padding: 14px 30px; border-radius: 999px; color: #3a2300; font-size: 32px;
      background: linear-gradient(#ffe27a, #ffb931); box-shadow: 0 6px 0 #b9780f, 0 0 26px rgba(255, 200, 80, .55); }
  `;
  document.head.append(style);
  const el = document.createElement('div');
  el.id = 'ogp';
  el.innerHTML = `
    <img class="shot" src="${img}">
    <div class="text">
      <div class="logo1">ひと切り半分こ</div>
      <div class="logo2">〜果物編〜</div>
      <div class="lead">果物をスワイプでひと切り。<br><em>ぴったり 50:50</em> に切り分けよう！</div>
      <div class="url">${urlText}</div>
    </div>`;
  document.body.append(el);
}, { img: `data:image/png;base64,${shot.toString('base64')}`, urlText: URL_TEXT });
await card.waitForFunction(() => document.querySelector('#ogp .shot').complete);
await card.evaluate(() => document.fonts.ready);
await card.screenshot({ path: outFile, clip: { x: 0, y: 0, width: 1200, height: 630 } });

await browser.close();
await server.close();
console.log('OGP画像:', outFile);
