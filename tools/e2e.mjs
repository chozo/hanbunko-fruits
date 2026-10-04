// ブラウザでの動作確認（ヘッドレス Chrome）。
// 使い方: npm run dev（または npm run preview）を起動した状態で
//   node tools/e2e.mjs http://localhost:5173/
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'NG  '} ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failed++;
};
const wait = (p, ms) => p.waitForTimeout(ms);
const errors = [];

async function open(init) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  page.on('pageerror', (e) => errors.push(e.message));
  if (init) await page.addInitScript(init);
  await page.goto(url);
  await wait(page, 1200);
  return page;
}
const rect = (page, id) => page.evaluate((id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }, id);
async function drag(page, x0, y0, x1, y1, n = 12) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= n; i++) await page.mouse.move(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
  await page.mouse.up();
}
const g = (page, expr) => page.evaluate(expr);

// ---- 操作の判定 ----
{
  const page = await open();
  await page.click('#start-btn');
  await wait(page, 800);
  check('開始するとステージ1の照準状態', (await g(page, '__game.state')) === 'aim' && (await g(page, '__game.stage')) === 0);
  const pad = await rect(page, 'pad');
  const st = await rect(page, 'stage');
  const cx = pad.x + pad.w / 2, cy = pad.y + pad.h / 2;
  const q0 = await g(page, '__game.quaternion()');
  await drag(page, cx, cy, cx + 80, cy - 30);
  const q1 = await g(page, '__game.quaternion()');
  check('回転パッドで回転する', JSON.stringify(q0) !== JSON.stringify(q1));
  await wait(page, 400);
  check('指を離すと姿勢を保つ', JSON.stringify(q1) === JSON.stringify(await g(page, '__game.quaternion()')));
  await drag(page, cx, cy, cx, st.y + 80, 16);
  check('パッドから果物の上へドラッグしても切れない', (await g(page, '__game.state')) === 'aim' && (await g(page, '__game.stats()[0].tries')) === 0);
  await page.click('#reset-btn');
  await wait(page, 1500);
  const qr = await g(page, '__game.quaternion()');
  const dot = Math.abs(qr.reduce((s, v, i) => s + v * q0[i], 0));
  check('姿勢リセットで初期姿勢に戻る', dot > 0.99999);
  await drag(page, st.x + 195, st.y + 250, st.x + 198, st.y + 252, 2);
  check('タップ・短い動きでは切れない', (await g(page, '__game.state')) === 'aim');
  await drag(page, st.x + 195, st.y + 270, st.x + 340, st.y + 300, 8);
  check('果物の内側から始めると切れない', (await g(page, '__game.state')) === 'aim');
  await drag(page, st.x + 10, st.y + 20, st.x + 380, st.y + 50, 10);
  check('果物を横切らないスワイプでは切れない', (await g(page, '__game.state')) === 'aim');
  // 回転してから実際のマウス操作で切る
  await drag(page, cx, cy, cx + 60, cy + 70);
  const qCut = await g(page, '__game.quaternion()');
  await drag(page, st.x + 5, st.y + 200, st.x + 385, st.y + 380, 16);
  await wait(page, 300);
  check('果物を横切るスワイプで切れる', ['cutting', 'result'].includes(await g(page, '__game.state')));
  await wait(page, 3000);
  const v = await g(page, '__game.verify()');
  check('回転後も、判定の体積比と独立計算が一致', v.diffPt < 1e-6, `差 ${v.diffPt.toExponential(1)}pt`);
  check('断面がスワイプの直線上にある', v.maxLinePx < 0.5, `最大 ${v.maxLinePx.toExponential(1)}px`);
  check('切断前後で体積が保存される', v.conservation < 1e-9, `${v.conservation.toExponential(1)}`);
  const j = await g(page, '__game.judgement');
  const labelA = await page.textContent('#ratio-a');
  check('結果表示と判定が同じ丸め', labelA === j.displayA && j.success === Math.abs(Number(j.displayA) - 50) <= 1.0 + 1e-9);
  await wait(page, 600);
  if (!j.success) {
    await page.click('#retry-btn');
    await wait(page, 800);
    check('失敗後の再挑戦で同じ果物に戻る', (await g(page, '__game.state')) === 'aim' && (await g(page, '__game.stage')) === 0);
    const qRetry = await g(page, '__game.quaternion()');
    check('再挑戦では切ったときの角度で表示される', Math.abs(qRetry.reduce((s, v, i) => s + v * qCut[i], 0)) > 0.99999);
    await page.click('#reset-btn');
    await wait(page, 1500);
    const qr2 = await g(page, '__game.quaternion()');
    check('再挑戦後も「姿勢を戻す」で初期姿勢に戻る', Math.abs(qr2.reduce((s, v, i) => s + v * q0[i], 0)) > 0.99999);
  }
  await page.close();
}

// ---- 全ステージの遷移（しきい値を一時的に広げて流れだけ確認） ----
{
  const page = await open();
  await page.click('#start-btn');
  await wait(page, 800);
  await g(page, '__game.config.judge.thresholdPt = 50');
  for (let i = 0; i < 7; i++) {
    await g(page, '(()=>{const s=__game.size; __game.cut(s.width*0.45, 3, s.width*0.55, s.height-3)})()');
    await wait(page, 2400);
    const ok = (await g(page, '__game.state')) === 'result' && (await g(page, '__game.judgement.success'));
    const v = await g(page, '__game.verify()');
    check(`ステージ${i + 1} 成功と検算`, ok && v.diffPt < 1e-6, `ループ数 ${v.capLoops}`);
    await wait(page, 900);
    await page.click('#next-btn');
    await wait(page, 900);
  }
  check('全7ステージ成功でクリア画面', (await g(page, '__game.state')) === 'clear' && !(await page.isHidden('#clear-screen')));
  await page.click('#again-btn');
  await wait(page, 800);
  check('最初から再プレイ', (await g(page, '__game.state')) === 'aim' && (await g(page, '__game.stage')) === 0);
  await page.close();
}

// ---- 音・保存領域が使えなくても止まらない ----
{
  const page = await open("window.AudioContext=function(){throw new Error('no audio')};window.webkitAudioContext=window.AudioContext;Storage.prototype.getItem=function(){throw new Error('no storage')};Storage.prototype.setItem=Storage.prototype.getItem;");
  await page.click('#start-btn');
  await wait(page, 800);
  await page.click('#mute-btn');
  await g(page, '(()=>{const s=__game.size; __game.cut(3, s.height*0.4, s.width-3, s.height*0.6)})()');
  await wait(page, 2600);
  check('音・ストレージが使えなくても遊べる', (await g(page, '__game.state')) === 'result');
  await page.close();
}

check('ページエラーなし', errors.length === 0, errors.join(' / '));
await browser.close();
console.log(failed ? `\n${failed} 件失敗` : '\nすべて成功');
process.exit(failed ? 1 : 0);
