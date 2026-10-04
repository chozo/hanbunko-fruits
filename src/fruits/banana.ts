import { buildRings, buildTube, invert3, mergeMeshes, mul3, paint, rotY3, rotZ3, scale3, transformMesh, type MeshData, type Vec3 } from '../geometry/mesh';
import { clamp01, fbm, mix, smooth, type FruitDef } from './common';

// バナナ（1房・5本）：1本は円弧に沿った五角形断面のチューブ。5本を房の付け根（クラウン）から扇形に並べる。
// 体積は5本の合計で、柄とクラウンは体積から除外する。
// 中心線は xy 平面上の円弧（中心 O=(0, RC)）。断面は円弧に垂直な平面上にあるので、
// 任意の点から「円弧上の位置」と「断面内の位置」を逆算でき、断面の模様が形と一致する。

const RC = 1.32;
const A0 = -0.86; // 柄の側
const A1 = 0.82; // 先端側
const RMAX = 0.2;

function profile(u: number): number {
  // 中央が太く、両端が丸く閉じる。柄の側は細くくびれる
  const body = Math.sqrt(Math.max(0, 1 - Math.abs(2 * u - 1) ** 6));
  const neck = 0.32 + 0.68 * smooth(0.0, 0.42, u); // 柄の側へ長くすぼまる
  const tipBulge = 1 + 0.06 * Math.exp(-(((u - 0.7) / 0.2) ** 2));
  return RMAX * body * neck * tipBulge;
}

function tubeRadius(u: number, psi: number): number {
  return profile(u) * (1 + 0.055 * Math.cos(5 * psi + 0.4)) * (1 - 0.05 * Math.cos(psi));
}

/** 角度 a での中心線の点と外向き方向 */
function frame(a: number): { c: Vec3; er: Vec3 } {
  const er: Vec3 = [Math.sin(a), -Math.cos(a), 0];
  return { c: [RC * er[0], RC + RC * er[1], 0], er };
}

/** 1本のバナナの局所座標での位置情報（s: 中心 0・表面 1 の正規化深さ） */
function localInfo(x: number, y: number, z: number) {
  const a = Math.atan2(x, RC - y);
  const u = (a - A0) / (A1 - A0);
  const f = frame(Math.min(A1, Math.max(A0, a)));
  const w = (x - f.c[0]) * f.er[0] + (y - f.c[1]) * f.er[1];
  const rho = Math.hypot(w, z);
  const psi = Math.atan2(z, w);
  const R = u <= 0 || u >= 1 ? 1e-6 : tubeRadius(u, psi);
  return { s: rho / R, u, psi, rho };
}

function localFlesh(info: ReturnType<typeof localInfo>, x: number, y: number, z: number): Vec3 {
  const { s, u, psi, rho } = info;
  if (s > 0.96) return u > 0.97 ? [0.3, 0.2, 0.1] : [0.95, 0.78, 0.15];
  if (s > 0.84) return mix([0.96, 0.92, 0.72], [0.92, 0.86, 0.6], smooth(0.84, 0.96, s));
  let c: Vec3 = mix([1.0, 0.97, 0.84], [0.98, 0.93, 0.74], smooth(0.2, 0.84, s));
  c = mix(c, [0.97, 0.92, 0.75], 0.2 * fbm(x * 12, y * 12, z * 12));
  // 中心の三つ割れの筋と小さな黒い種
  const rr = rho / profile(clamp01(u));
  if (rr < 0.32) {
    for (let k = 0; k < 3; k++) {
      const b = (k / 3) * Math.PI * 2 + 0.5;
      if (Math.abs(rr * Math.sin(psi - b)) < 0.025 && Math.cos(psi - b) > 0) c = mix(c, [0.93, 0.86, 0.66], 0.7);
      const sx = 0.13 * Math.cos(b + Math.PI / 3), sz = 0.13 * Math.sin(b + Math.PI / 3);
      if (Math.hypot(rr * Math.cos(psi) - sx, rr * Math.sin(psi) - sz) < 0.045) c = [0.3, 0.22, 0.15];
    }
  }
  return c;
}

function buildOne(q: number, greenish: number): MeshData {
  const nR = 110 * q, nS = 48 * q;
  const uAt = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;
  const body = buildRings(
    nR,
    nS,
    (i, j) => {
      const u = uAt((i + 1) / (nR + 1));
      const a = A0 + (A1 - A0) * u;
      const psi = (j / nS) * Math.PI * 2;
      const f = frame(a);
      const r = tubeRadius(u, psi);
      return [f.c[0] + f.er[0] * r * Math.cos(psi), f.c[1] + f.er[1] * r * Math.cos(psi), r * Math.sin(psi)];
    },
    frame(A0).c,
    frame(A1).c,
  );
  paint(body, (p) => {
    const a = Math.atan2(p[0], RC - p[1]);
    const u = clamp01((a - A0) / (A1 - A0));
    let c: Vec3 = mix([0.98, 0.82, 0.16], [0.92, 0.72, 0.1], fbm(p[0] * 3 + greenish * 9, p[1] * 3, p[2] * 3));
    c = mix(c, [0.55, 0.65, 0.15], smooth(0.2 + greenish * 0.1, 0.02, u) * 0.85);
    c = mix(c, [0.25, 0.17, 0.08], smooth(0.965, 0.995, u));
    // 稜線を少し濃く
    const f = frame(a);
    const w = (p[0] - f.c[0]) * f.er[0] + (p[1] - f.c[1]) * f.er[1];
    const psi = Math.atan2(p[2], w);
    c = mix(c, [0.8, 0.62, 0.1], 0.35 * Math.max(0, Math.cos(5 * psi + 0.4)) ** 8);
    return c;
  });
  return body;
}

/** 房の付け根（クラウン）の局所座標。各バナナの柄をのばした先にある */
const S0 = frame(A0).c;
const STALK: Vec3 = [-Math.cos(A0), -Math.sin(A0), 0];
const LS = 0.32;
const CROWN: Vec3 = [S0[0] + STALK[0] * LS, S0[1] + STALK[1] * LS, 0];

/**
 * 5本の配置：外側の列に3本、その内側（反りの内側＝上）に2本が重なる。
 * どれも同じ向きに反り、柄の側はクラウン（房の付け根）に集まる。
 * クラウンを通る縦軸のまわりに少しずつ開き、内側の列は外側の列のすき間の上に乗る。
 */
export function bunchLayout() {
  // [列内の横位置, 開き角, 持ち上げ, 大きさ, 傾き]
  const spec: [number, number, number, number, number][] = [
    [-0.31, 0.12, 0, 0.98, 0.02], // 外側の列（rotY の正の角度で -z 側へ開く）
    [0, 0, 0, 1.0, 0],
    [0.31, -0.12, 0, 0.97, -0.02],
    [-0.155, 0.06, 0.5, 0.93, -0.06], // 内側の列
    [0.155, -0.06, 0.5, 0.92, -0.05],
  ];
  return spec.map(([side, yaw, lift, size, tilt]) => {
    const m = mul3(rotY3(yaw), mul3(rotZ3(tilt), scale3(size, size, size)));
    const inv = invert3(m);
    const off: Vec3 = [0, lift, side];
    const toWorld = (p: Vec3): Vec3 => {
      const x = p[0] - CROWN[0], y = p[1] - CROWN[1], z = p[2] - CROWN[2];
      return [m[0] * x + m[1] * y + m[2] * z + off[0], m[3] * x + m[4] * y + m[5] * z + off[1], m[6] * x + m[7] * y + m[8] * z + off[2]];
    };
    const toLocal = (x: number, y: number, z: number): Vec3 => {
      x -= off[0];
      y -= off[1];
      z -= off[2];
      return [inv[0] * x + inv[1] * y + inv[2] * z + CROWN[0], inv[3] * x + inv[4] * y + inv[5] * z + CROWN[1], inv[6] * x + inv[7] * y + inv[8] * z + CROWN[2]];
    };
    return { m, off, toWorld, toLocal };
  });
}

/** 1本のバナナの正規化深さ（テスト用：重なりの確認） */
export function bananaDepthLocal(x: number, y: number, z: number): number {
  return localInfo(x, y, z).s;
}

export const banana: FruitDef = {
  id: 'banana',
  name: 'バナナ（1房）',
  skin: {
    roughness: 0.5,
    clearcoat: 0.25,
    clearcoatRoughness: 0.4,
    bumpScale: 0.2,
    glsl: /* glsl */ `
      void skinDetail(vec3 p, inout vec3 col, out float bump) {
        vec2 w = worley(p * 13.0);
        float spot = (1.0 - smoothstep(0.04, 0.11, w.x)) * smoothstep(0.45, 0.6, fbm(p * 4.0 + 2.0));
        col = mix(col, vec3(0.35, 0.2, 0.06), spot * 0.85);
        col *= 0.92 + 0.12 * vnoise(p * vec3(40.0, 8.0, 40.0));
        bump = spot * 0.3;
      }`,
  },
  extrasRoughness: 0.75,
  capRoughness: 0.45,
  glow: 0xfff070,
  palette: [0xffe14a, 0xfff6c0, 0xffb84a, 0x9ad04a],
  initialRotation: [0.5, -0.8, 0],
  sound: 'soft',
  build(q = 1) {
    const layout = bunchLayout();
    const bodies: MeshData[] = [];
    const stalks: MeshData[] = [];
    layout.forEach((L, k) => {
      const shift: Vec3 = [-L.m[0] * CROWN[0] - L.m[1] * CROWN[1] - L.m[2] * CROWN[2] + L.off[0], -L.m[3] * CROWN[0] - L.m[4] * CROWN[1] - L.m[5] * CROWN[2] + L.off[1], -L.m[6] * CROWN[0] - L.m[7] * CROWN[1] - L.m[8] * CROWN[2] + L.off[2]];
      bodies.push(transformMesh(buildOne(q, (k * 0.37) % 1), L.m, shift));
      // 柄：クラウンからバナナの柄の側の端（少し内側）まで
      const st = buildTube(
        (t) => {
          const d = LS * (1 - t * 1.12);
          return [S0[0] + STALK[0] * d, S0[1] + STALK[1] * d, 0];
        },
        (t) => 0.075 - 0.012 * t,
        8,
        8,
      );
      stalks.push(transformMesh(st, L.m, shift));
    });
    // クラウン：2列の柄の付け根をまとめる小さな台（切り口は黒っぽい）
    stalks.push(buildTube((t) => [0.03 - 0.12 * t, -0.08 + 0.66 * t, 0], () => 0.1, 8, 12));
    stalks.push(buildTube((t) => [-0.06 - 0.12 * t, 0.06 + 0.42 * t, 0], () => 0.085, 6, 10));
    const body = mergeMeshes(bodies);
    const extras = mergeMeshes(stalks);
    paint(extras, (p) => {
      const d = Math.hypot(p[0], p[2]);
      let c: Vec3 = mix([0.36, 0.28, 0.12], [0.5, 0.62, 0.18], smooth(0.12, 0.4, d));
      c = mix(c, [0.2, 0.14, 0.08], smooth(-0.05, -0.2, p[0]) * 0.8); // クラウンの切り口
      return c;
    });

    const flesh = (x: number, y: number, z: number): Vec3 => {
      let best: ReturnType<typeof localInfo> | null = null;
      let bp: Vec3 = [0, 0, 0];
      for (const L of layout) {
        const lp = L.toLocal(x, y, z);
        const info = localInfo(lp[0], lp[1], lp[2]);
        if (!best || info.s < best.s) {
          best = info;
          bp = lp;
        }
      }
      return localFlesh(best!, bp[0], bp[1], bp[2]);
    };
    return { body, extras, flesh, extrasCapColor: [0.85, 0.85, 0.62] };
  },
};
