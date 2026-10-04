import { buildRings, buildTube, paint, type Vec3 } from '../geometry/mesh';
import { clamp01, fbm, mix, smooth, type FruitDef } from './common';

// バナナ：円弧に沿った五角形断面のチューブ。軸（柄）は体積から除外する。
// 中心線は xy 平面上の円弧（中心 O=(0, RC)）。断面は円弧に垂直な平面上にあるので、
// 任意の点から「円弧上の位置」と「断面内の位置」を逆算でき、断面の模様が形と一致する。

const RC = 1.75;
const A0 = -0.66; // 柄の側
const A1 = 0.62; // 先端側
const RMAX = 0.24;

function profile(u: number): number {
  // 中央が太く、両端が丸く閉じる。柄の側は細くくびれる
  const body = Math.sqrt(Math.max(0, 1 - Math.abs(2 * u - 1) ** 6));
  const neck = 0.5 + 0.5 * smooth(0.0, 0.3, u);
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

export const banana: FruitDef = {
  id: 'banana',
  name: 'バナナ',
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
  initialRotation: [0.35, -0.3, 0.12],
  sound: 'soft',
  build(q = 1) {
    const nR = 130 * q, nS = 64 * q;
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
      let c: Vec3 = mix([0.98, 0.82, 0.16], [0.92, 0.72, 0.1], fbm(p[0] * 3, p[1] * 3, p[2] * 3));
      c = mix(c, [0.55, 0.65, 0.15], smooth(0.2, 0.02, u) * 0.85);
      c = mix(c, [0.25, 0.17, 0.08], smooth(0.965, 0.995, u));
      // 稜線を少し濃く
      const f = frame(a);
      const w = (p[0] - f.c[0]) * f.er[0] + (p[1] - f.c[1]) * f.er[1];
      const psi = Math.atan2(p[2], w);
      c = mix(c, [0.8, 0.62, 0.1], 0.35 * Math.max(0, Math.cos(5 * psi + 0.4)) ** 8);
      return c;
    });

    // 柄：柄の側の端から接線方向へ伸びる
    const f0 = frame(A0);
    const tan: Vec3 = [Math.cos(A0), Math.sin(A0), 0];
    const stalk = buildTube(
      (t) => {
        const d = -0.06 + 0.42 * t;
        return [f0.c[0] - tan[0] * d, f0.c[1] - tan[1] * d + 0.05 * t * t, 0];
      },
      (t) => 0.075 - 0.015 * t,
      10,
      8,
    );
    paint(stalk, (p) => mix([0.45, 0.55, 0.15], [0.3, 0.25, 0.1], clamp01((f0.c[0] - p[0]) / 0.4)));

    const flesh = (x: number, y: number, z: number): Vec3 => {
      const a = Math.atan2(x, RC - y);
      const u = (a - A0) / (A1 - A0);
      const f = frame(Math.min(A1, Math.max(A0, a)));
      const w = (x - f.c[0]) * f.er[0] + (y - f.c[1]) * f.er[1];
      const rho = Math.hypot(w, z);
      const psi = Math.atan2(z, w);
      const R = u <= 0 || u >= 1 ? 1e-6 : tubeRadius(u, psi);
      const s = rho / R;
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
    };
    return { body, extras: stalk, flesh, extrasCapColor: [0.85, 0.85, 0.62] };
  },
};
