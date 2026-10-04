// 告知動画の台本（ブラウザのページ内で実行される）。
// record.mjs から読み込まれ、window.promo.frame(i) を1コマごとに呼ばれる。
// ゲームの確認用フック（window.__game）で、ゲームを1コマずつ進め、本物のスワイプと回転パッドの操作を再現する。
// 切る位置は、切る前に「切らずに体積比を測る」フックで探し、成功・惜しい失敗を狙って作る。
/* eslint-disable */
(() => {
  const FPS = 30;
  const DT = 1 / FPS;
  const END = 30.0;
  const g = window.__game;

  // ---- 乱数を固定（毎回同じ動画になるように） ----
  let seed = 20261004;
  Math.random = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ---- 重ねるレイヤー ----
  const layer = document.createElement('div');
  layer.id = 'promo';
  document.body.appendChild(layer);
  const mk = (cls) => {
    const el = document.createElement('div');
    el.className = cls;
    layer.appendChild(el);
    return el;
  };
  const dim = mk('endbg');
  const flashEl = mk('flash');
  const ffEl = mk('ff');
  ffEl.textContent = '×2';
  const finger = mk('finger');
  const app = document.getElementById('app');
  let stageRect, padRect, size;

  let tNow = 0;
  const CX = 256; // ゲーム画面の中央（字幕の中心）

  // ---- 字幕・効果文字 ----
  const items = [];
  function caption(text, opts = {}) {
    const el = document.createElement('div');
    el.className = 'cap ' + (opts.cls || '');
    el.innerHTML = text;
    layer.appendChild(el);
    const it = { el, start: tNow + (opts.delay ?? 0), end: opts.end ?? Infinity, x: opts.x ?? CX, y: opts.y ?? 112, rot: opts.rot ?? 0, size: opts.size ?? 1 };
    items.push(it);
    return it;
  }
  function sfx(text, x, y, opts = {}) {
    return caption(text, { cls: 'sfx ' + (opts.cls || ''), x, y, rot: opts.rot ?? -8, size: opts.size ?? 1, end: tNow + (opts.dur ?? 0.9), delay: opts.delay });
  }
  function endAt(it, t) {
    if (it) it.end = Math.min(it.end, t);
  }
  const easeOutBack = (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
  function updateItems() {
    for (const it of items) {
      const age = tNow - it.start;
      const left = it.end - tNow;
      if (age < 0 || left <= 0) {
        it.el.style.display = 'none';
        continue;
      }
      it.el.style.display = 'block';
      const k = easeOutBack(Math.min(age / 0.22, 1));
      const out = Math.min(1, left / 0.12);
      const wob = Math.sin(age * 18) * Math.max(0, 1 - age * 3) * 4;
      it.el.style.opacity = String(out);
      it.el.style.left = it.x + 'px';
      it.el.style.top = it.y + 'px';
      it.el.style.transform = `translate(-50%, -50%) rotate(${it.rot + wob}deg) scale(${Math.max(0.01, k) * it.size})`;
    }
  }

  // ---- 画面効果（フラッシュ・揺れ・ズーム・暗転） ----
  const fx = [];
  const flash = (s = 0.9) => fx.push({ k: 'flash', t: tNow, s });
  const shake = (amp = 9, dur = 0.3) => fx.push({ k: 'shake', t: tNow, amp, dur });
  const punch = (amt = 0.06, dur = 0.5) => fx.push({ k: 'zoom', t: tNow, amt, dur });
  let dimTarget = 0, dimLevel = 0, baseZoom = 1, zoomTarget = 1;
  let shakeX = 0, shakeY = 0;
  function updateFx() {
    let fl = 0, z = 0;
    shakeX = shakeY = 0;
    for (const f of fx) {
      const a = tNow - f.t;
      if (a < 0) continue;
      if (f.k === 'flash' && a < 0.35) fl = Math.max(fl, f.s * Math.exp(-a / 0.07));
      if (f.k === 'shake' && a < f.dur) {
        const p = 1 - a / f.dur;
        shakeX += (Math.random() * 2 - 1) * f.amp * p;
        shakeY += (Math.random() * 2 - 1) * f.amp * p;
      }
      if (f.k === 'zoom' && a < f.dur) z += f.amt * Math.sin(Math.PI * Math.min(1, a / f.dur)) ** 0.6;
    }
    flashEl.style.opacity = String(fl);
    baseZoom += (zoomTarget - baseZoom) * 0.12;
    app.style.transform = `translate(${shakeX}px, ${shakeY}px) scale(${baseZoom + z})`;
    dimLevel += (dimTarget - dimLevel) * 0.2;
    dim.style.opacity = String(dimLevel);
  }

  /** ゲーム画面内の点（表示領域の CSS px）を、拡大・揺れを考慮したページ座標へ */
  function toPage(x, y) {
    const ar = { left: 86, top: 150, width: 340, height: 604 };
    const ox = ar.left + ar.width * 0.5, oy = ar.top + ar.height * 0.45;
    const s = parseFloat(app.style.transform.match(/scale\(([^)]+)\)/)?.[1] ?? '1');
    const px = stageRect.left + x, py = stageRect.top + y;
    return [ox + (px - ox) * s + shakeX, oy + (py - oy) * s + shakeY];
  }

  // ---- 指の動き ----
  const tweens = [];
  function showFinger(x, y, press) {
    finger.style.display = 'block';
    finger.style.left = x + 'px';
    finger.style.top = y + 'px';
    finger.style.transform = `scale(${press ? 0.85 : 1})`;
  }
  function hideFinger() {
    finger.style.display = 'none';
  }

  /** 角度 deg の直線で、表示領域の中心から d だけずらした線の端点（表示領域の内側 8px まで） */
  function lineFor(deg, d) {
    const a = (deg * Math.PI) / 180;
    const w = size.width, h = size.height, m = 8;
    const dx = Math.cos(a), dy = Math.sin(a);
    const px = w / 2 - dy * d, py = h / 2 + dx * d;
    let t0 = -Infinity, t1 = Infinity;
    for (const [p, v, lo, hi] of [[px, dx, m, w - m], [py, dy, m, h - m]]) {
      if (Math.abs(v) < 1e-9) continue;
      const ta = (lo - p) / v, tb = (hi - p) / v;
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
    }
    return [px + dx * t0, py + dy * t0, px + dx * t1, py + dy * t1];
  }

  /** 体積比の「片側 − 50」が target になる線を探す（切らずに測る） */
  function findCut(deg, target) {
    const R = Math.min(size.width, size.height) * 0.35;
    const f = (d) => g.preview(...lineFor(deg, d));
    let lo = -R, hi = R, flo = f(lo), fhi = f(hi);
    if ((flo - target) * (fhi - target) > 0) target = -target;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2, fm = f(mid);
      if ((fm - target) * (flo - target) <= 0) hi = mid;
      else {
        lo = mid;
        flo = fm;
      }
    }
    const line = lineFor(deg, (lo + hi) / 2);
    console.log(`[promo] stage ${g.stage + 1} 角度 ${deg} → 片側−50 = ${f((lo + hi) / 2).toFixed(2)}`);
    return line;
  }

  /** 実際のスワイプを再現する（少し曲がった指の軌跡。切断は始点と終点の直線） */
  function swipe(deg, target, dur = 0.34) {
    const [x0, y0, x1, y1] = findCut(deg, target);
    const t0 = tNow;
    g.touchDown(x0, y0);
    tweens.push({
      until: t0 + dur,
      fn: (t) => {
        const u = ease((t - t0) / dur);
        const bend = Math.sin(Math.PI * u) * 10;
        const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny);
        const x = x0 + (x1 - x0) * u + (nx / nl) * bend, y = y0 + (y1 - y0) * u + (ny / nl) * bend;
        if (t - t0 >= dur) {
          g.touchUp(x1, y1);
          hideFinger();
          return;
        }
        g.touchMove(x, y);
        showFinger(...toPage(x, y), true);
      },
    });
  }

  /** 回転パッドを円を描くようにドラッグする */
  function padDrag(dur = 1.4, rx = 52, ry = 30) {
    const t0 = tNow;
    let px = 0, py = 0;
    tweens.push({
      until: t0 + dur,
      fn: (t) => {
        const u = Math.min(1, (t - t0) / dur);
        const env = Math.sin(Math.PI * u);
        const kx = rx * Math.sin(u * Math.PI * 2) * env;
        const ky = ry * Math.sin(u * Math.PI * 1.3) * env;
        if (u >= 1) {
          g.padRelease();
          hideFinger();
          return;
        }
        g.pad(kx - px, ky - py, kx, ky);
        px = kx;
        py = ky;
        const cx = padRect.left + padRect.width / 2 + kx, cy = padRect.top + padRect.height / 2 + ky;
        showFinger(cx, cy, true);
      },
    });
  }

  // ---- 台本 ----
  const T = [];
  const at = (t, fn) => T.push({ t, fn, done: false });

  // 0〜2.6 秒：つかみ（ぶどう一房が紫に光ってぴったり半分）
  at(0.0, () => caption('この<span class="hl">一刀</span>で…', { end: 0.9 }));
  at(0.25, () => swipe(-62, 0.15, 0.32));
  // ぶどうは最後のステージなので結果が「全ステージ成功！」になる。冒頭では通常の成功表示にそろえる（描画の直前に毎コマ確認）
  at(0.0, () =>
    tweens.push({
      until: 2.6,
      late: true,
      fn: () => {
        const el = document.getElementById('result-title');
        if (el.textContent === '全ステージ成功！') el.textContent = '成功！ ぴったり半分こ';
      },
    }),
  );
  at(0.62, () => {
    flash(0.9);
    shake(10, 0.35);
    punch(0.07, 0.6);
    sfx('シャキーン!!', 250, 300, { cls: 'big', dur: 1.0, rot: -10 });
  });
  at(0.95, () => caption('ぶどう<span class="pk">一房</span>まるごと', { end: 1.95 }));
  at(1.95, () => {
    caption('<span class="hl">ぴったり半分こ!!</span>', { end: 2.6, size: 1.12 });
    flash(0.4);
  });

  // 2.6〜5.4 秒：タイトル
  at(2.6, () => {
    g.goStage(0);
    dimTarget = 0.72;
    flash(1);
    caption('<span class="endlogo"><span class="logo1">ひと切り半分こ</span><span class="logo2">〜果物編〜</span></span>', { y: 360, end: 5.3 });
  });
  at(3.25, () => caption('果物の体積を', { y: 500, end: 5.3, cls: 'small' }));
  at(3.6, () => caption('<span class="hl">50:50</span> に切り分けろ！', { y: 548, end: 5.3 }));
  at(5.3, () => {
    dimTarget = 0;
  });

  // 5.4〜7.6 秒：回して観察
  at(5.4, () => caption('ぐるっと回して <span class="hl">よ〜く見る</span>', { end: 7.6 }));
  at(5.6, () => padDrag(1.6));

  // 7.6〜10.6 秒：外から外へスワイプ → 惜しい失敗
  at(7.6, () => caption('外から外へ <span class="hl">スワイプ！</span>', { end: 8.7 }));
  at(7.75, () => swipe(-8, 2.6, 0.32));
  at(8.08, () => {
    flash(0.8);
    shake(7, 0.25);
    punch(0.05, 0.5);
    sfx('スパッ!', 330, 290, { dur: 0.8, rot: 8 });
  });
  at(9.45, () => {
    caption('<span class="pk">おしい!</span> 1%ズレたら失敗…', { end: 10.6 });
    sfx('ガーン', 160, 470, { cls: 'soft', dur: 1.0, rot: -6 });
  });

  // 10.6〜14.2 秒：同じ角度から再挑戦 → 成功
  at(10.6, () => {
    g.retry();
    caption('もう一度！', { end: 11.6 });
  });
  at(11.2, () => swipe(-14, 0.2, 0.3));
  at(11.52, () => {
    flash(0.9);
    shake(9, 0.3);
    punch(0.06, 0.6);
    sfx('ズバッ!!', 300, 280, { cls: 'big blue', dur: 0.9, rot: -8 });
  });
  at(12.9, () => {
    caption('<span class="hl">誤差1%以内</span>で成功！', { end: 14.2 });
    sfx('やった!', 360, 470, { dur: 1.2, rot: 10 });
  });

  // 14.2〜22.4 秒：倍速で次々と
  const montage = [
    [1, '柿!', 25, 0.15],
    [4, 'パイナップル!', -70, 0.12],
    [5, '桃!', 12, 0.18],
    [7, 'バナナ1房!', -80, 0.12],
    [8, 'さくらんぼ!', 70, 0.15],
  ];
  at(14.2, () => {
    g.setTimeScale(2);
    ffEl.style.display = 'block';
    caption('<span class="hl">10種類</span>の果物に挑戦！', { end: 22.4 });
  });
  montage.forEach(([stage, name, deg, target], k) => {
    const t0 = 14.25 + k * 1.63;
    at(t0, () => g.goStage(stage));
    at(t0 + 0.34, () => swipe(deg, target, 0.24));
    at(t0 + 0.6, () => {
      flash(0.7);
      shake(7, 0.22);
      sfx(name, k % 2 ? 340 : 180, k % 2 ? 300 : 260, { dur: 0.95, rot: k % 2 ? 8 : -8, cls: k % 2 ? 'blue' : '' });
    });
  });
  at(22.4, () => {
    g.setTimeScale(1);
    ffEl.style.display = 'none';
  });

  // 22.4〜26.6 秒：クライマックス（スイカをスローで）
  at(22.4, () => {
    g.goStage(6);
    caption('いくぞ… <span class="pk">スイカ</span>！', { end: 23.3 });
  });
  at(23.02, () => swipe(-35, 0.1, 0.3));
  at(23.34, () => {
    g.setTimeScale(0.3);
    zoomTarget = 1.08;
    flash(1);
    shake(14, 0.5);
    sfx('ズバァン!!', 260, 300, { cls: 'big', dur: 1.3, rot: -10 });
  });
  at(24.3, () => {
    g.setTimeScale(1);
    zoomTarget = 1;
  });
  at(25.2, () => {
    caption('<span class="hl">ぴったり半分こ!!</span>', { end: 26.6, size: 1.15 });
    flash(0.5);
  });

  // 26.6〜30 秒：エンドカード
  at(26.6, () => {
    dim.classList.add('solid');
    dimLevel = Math.max(dimLevel, 0.3);
    dimTarget = 1;
    flash(0.8);
    caption('<span class="endlogo"><span class="logo1">ひと切り半分こ</span><span class="logo2">〜果物編〜</span></span>', { y: 330 });
  });
  at(26.95, () => caption('スマホで<span class="hl">いますぐ</span>遊べる！', { y: 470, cls: 'endsub' }));
  at(27.3, () => caption('game.chozo.net/hanbunko-fruits', { y: 548, cls: 'endurl' }));
  at(27.65, () => caption('全10種類の果物に挑戦！', { y: 624, cls: 'endtag' }));

  window.promo = {
    prepare() {
      g.start();
      g.manual(true);
      g.goStage(9);
      for (let i = 0; i < 40; i++) g.step(DT); // 登場アニメーションを終わらせておく
      g.manual(true); // 時計と効果音の記録をここから始める
      stageRect = document.getElementById('stage').getBoundingClientRect();
      padRect = document.getElementById('pad').getBoundingClientRect();
      size = g.size;
      console.log('[promo] stage', JSON.stringify(size), 'pad', Math.round(padRect.left), Math.round(padRect.top));
    },
    frame(i) {
      tNow = i / FPS;
      for (const a of T) {
        if (!a.done && a.t <= tNow + 1e-6) {
          a.done = true;
          a.fn();
        }
      }
      for (let k = tweens.length - 1; k >= 0; k--) {
        const tw = tweens[k];
        if (!tw.late) tw.fn(tNow);
        if (tNow >= tw.until) tweens.splice(k, 1);
      }
      g.step(DT);
      for (const tw of tweens) if (tw.late) tw.fn(tNow);
      updateFx();
      updateItems();
      return tNow + DT < END - 1e-6;
    },
    /** 効果音（記録したもの）と合成したリズムを WAV（base64）で返す */
    async renderAudio(dur) {
      const sr = 44100;
      const ctx = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
      const mix = ctx.createGain();
      mix.connect(ctx.destination);
      const music = ctx.createGain();
      music.gain.value = 0.3;
      music.connect(mix);
      buildMusic(ctx, music, dur);
      const sfxBus = ctx.createGain();
      sfxBus.gain.value = 1.1;
      sfxBus.connect(mix);
      g.replaySfx(ctx, sfxBus);
      console.log('[promo] 効果音', g.sfxEvents(), '個');
      const buf = await ctx.startRendering();
      return wavBase64(buf);
    },
  };

  // ---- リズムの合成（著作権の心配がない自作の短いループ） ----
  function buildMusic(ctx, out, dur) {
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const env = (node, t, a, peak, d) => {
      node.gain.setValueAtTime(0.0001, t);
      node.gain.exponentialRampToValueAtTime(peak, t + a);
      node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    };
    const osc = (type, f, t, d, peak, f2) => {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      env(gn, t, 0.004, peak, d);
      o.connect(gn).connect(out);
      o.start(t);
      o.stop(t + d + 0.05);
      return o;
    };
    const nz = (t, d, peak, type, f, q = 1) => {
      const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), gn = ctx.createGain();
      s.buffer = noise;
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = q;
      env(gn, t, 0.003, peak, d);
      s.connect(fl).connect(gn).connect(out);
      s.start(t, Math.random() * 0.5);
      s.stop(t + d + 0.05);
    };
    const kick = (t, p = 1) => osc('sine', 150, t, 0.24, 0.9 * p, 42);
    const snare = (t) => {
      nz(t, 0.16, 0.45, 'bandpass', 1900, 0.8);
      osc('triangle', 190, t, 0.09, 0.25);
    };
    const hat = (t, p = 0.18) => nz(t, 0.04, p, 'highpass', 7500);
    const crash = (t) => nz(t, 1.6, 0.35, 'highpass', 3500);
    const boom = (t) => osc('sine', 70, t, 1.1, 0.9, 28);
    const bass = (t, f, d) => {
      const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), gn = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = f;
      fl.type = 'lowpass';
      fl.frequency.value = 520;
      fl.Q.value = 3;
      env(gn, t, 0.008, 0.32, d);
      o.connect(fl).connect(gn).connect(out);
      o.start(t);
      o.stop(t + d + 0.05);
    };
    const pad = (t, d, fs, peak = 0.07) => {
      for (const f of fs)
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), gn = ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = det;
          fl.type = 'lowpass';
          fl.frequency.value = 1500;
          gn.gain.setValueAtTime(0.0001, t);
          gn.gain.linearRampToValueAtTime(peak, t + 0.25);
          gn.gain.setValueAtTime(peak, t + d - 0.6);
          gn.gain.linearRampToValueAtTime(0.0001, t + d);
          o.connect(fl).connect(gn).connect(out);
          o.start(t);
          o.stop(t + d + 0.05);
        }
    };
    const riser = (t0, t1) => {
      const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), gn = ctx.createGain();
      s.buffer = noise;
      s.loop = true;
      fl.type = 'bandpass';
      fl.Q.value = 2;
      fl.frequency.setValueAtTime(300, t0);
      fl.frequency.exponentialRampToValueAtTime(7000, t1);
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(0.4, t1);
      s.connect(fl).connect(gn).connect(out);
      s.start(t0);
      s.stop(t1 + 0.02);
    };

    const BEAT = 60 / 124;
    // C - Am - F - G
    const roots = [65.41, 55.0, 43.65, 49.0];
    const chords = [
      [261.63, 329.63, 392.0],
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [196.0, 246.94, 293.66],
    ];
    const sectionAt = (t) =>
      t < 2.6 ? 'hook' : t < 5.4 ? 'title' : t < 14.2 ? 'groove' : t < 22.4 ? 'full' : t < 23.34 ? 'build' : t < 26.6 ? 'full' : 'end';
    for (let i = 0; i * (BEAT / 2) < dur; i++) {
      const t = i * (BEAT / 2);
      const sec = sectionAt(t);
      const beat = i / 2;
      const bar = Math.floor(beat / 4) % 4;
      const onBeat = i % 2 === 0;
      if (sec === 'end') continue;
      if (sec === 'build') {
        snare(t);
        continue;
      }
      if (sec === 'title') {
        if (i % 4 === 0) kick(t, 0.8);
        if (!onBeat) hat(t, 0.1);
        continue;
      }
      if (onBeat) kick(t);
      else hat(t);
      if (sec === 'full' || sec === 'hook') {
        if (onBeat && Math.floor(beat) % 2 === 1) snare(t);
        hat(t + BEAT / 4, 0.08);
      }
      bass(t, roots[bar] * (i % 4 === 3 ? 2 : 1), BEAT / 2 - 0.02);
      if (sec === 'full') {
        const ch = chords[bar];
        osc('triangle', ch[i % 3] * 2, t, 0.16, 0.06);
        osc('triangle', ch[(i + 1) % 3] * 4, t + BEAT / 4, 0.12, 0.035);
      }
    }
    crash(0.62);
    boom(0.62);
    crash(2.6);
    boom(2.6);
    pad(2.6, 2.8, chords[0], 0.05);
    crash(14.2);
    riser(22.4, 23.34);
    boom(23.34);
    crash(23.34);
    crash(26.6);
    boom(26.6);
    pad(26.6, dur - 26.6, [261.63, 329.63, 392.0, 523.25], 0.06);
  }

  function wavBase64(buf) {
    const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
    const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
    const w = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF');
    data.setUint32(4, 36 + len * ch * 2, true);
    w(8, 'WAVE');
    w(12, 'fmt ');
    data.setUint32(16, 16, true);
    data.setUint16(20, 1, true);
    data.setUint16(22, ch, true);
    data.setUint32(24, sr, true);
    data.setUint32(28, sr * ch * 2, true);
    data.setUint16(32, ch * 2, true);
    data.setUint16(34, 16, true);
    w(36, 'data');
    data.setUint32(40, len * ch * 2, true);
    const chans = [...Array(ch)].map((_, c) => buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++)
      for (let c = 0; c < ch; c++) {
        const v = Math.max(-1, Math.min(1, chans[c][i]));
        data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
        o += 2;
      }
    const bytes = new Uint8Array(data.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
})();
