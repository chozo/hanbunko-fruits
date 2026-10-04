import { buildRings, buildTube, paint, type Vec3 } from '../geometry/mesh';
import { clamp01, ellipsoid, fbm, mix, seedColor, smooth, type FruitDef } from './common';

// 洋梨：下がふくらみ、首が細く片側へ曲がる。水平断面ごとに中心と半径を決める回転体として作る

const Y0 = -1.0;
const Y1 = 1.08;

/** なめらかな最大値 */
function smax(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (a - b)) / k);
  return b + (a - b) * h + k * h * (1 - h);
}

/** 高さ y での軸の位置（首が x 方向へ曲がる） */
function axis(y: number): [number, number] {
  const t = smooth(-0.15, Y1, y);
  return [0.14 * t * t, 0.04 * t];
}

/** 高さ y・方向 φ での半径 */
function radius(y: number, ph: number): number {
  const bulb = 0.8 * Math.sqrt(Math.max(0, 1 - ((y + 0.3) / 0.7) ** 2));
  const neck = 0.37 * Math.sqrt(Math.max(0, 1 - ((y - 0.52) / 0.56) ** 2));
  let r = smax(bulb, neck, 0.22);
  // 端では 0 に収束させる
  r *= Math.sqrt(clamp01((y - Y0) / 0.04)) * Math.sqrt(clamp01((Y1 - y) / 0.04));
  const bulbW = smooth(0.4, -0.2, y);
  r *= 1 + 0.06 * Math.cos(ph - 2.1) * bulbW + 0.02 * Math.cos(3 * ph + 0.5);
  return r;
}

export const pear: FruitDef = {
  id: 'pear',
  name: '洋梨',
  skin: {
    roughness: 0.55,
    clearcoat: 0.2,
    clearcoatRoughness: 0.5,
    bumpScale: 0.3,
    glsl: /* glsl */ `
      void skinDetail(vec3 p, inout vec3 col, out float bump) {
        vec2 w = worley(p * 34.0);
        float dotm = 1.0 - smoothstep(0.05, 0.14, w.x);
        col = mix(col, vec3(0.5, 0.36, 0.14), dotm * 0.55);
        float rus = smoothstep(0.55, 0.75, fbm(p * 5.0 + 3.1));
        col = mix(col, vec3(0.6, 0.45, 0.2), rus * 0.35);
        bump = dotm * 0.4;
      }`,
  },
  extrasRoughness: 0.8,
  capRoughness: 0.45,
  glow: 0xf4ff9a,
  palette: [0xd8e04a, 0xfff2a0, 0xffb060, 0x9ccf4a],
  initialRotation: [0.14, 0.75, -0.06],
  sound: 'soft',
  build(q = 1) {
    const nR = 120 * q, nS = 128 * q;
    const yAt = (t: number) => Y0 + (Y1 - Y0) * ((1 - Math.cos(Math.PI * t)) / 2);
    const body = buildRings(
      nR,
      nS,
      (i, j) => {
        const y = yAt((i + 1) / (nR + 1));
        const ph = (j / nS) * Math.PI * 2;
        const r = radius(y, ph);
        const [ax, az] = axis(y);
        return [ax + r * Math.cos(ph), y, az + r * Math.sin(ph)];
      },
      [axis(Y0)[0], Y0, axis(Y0)[1]],
      [axis(Y1)[0], Y1, axis(Y1)[1]],
    );
    paint(body, (p) => {
      const [ax, az] = axis(p[1]);
      const ph = Math.atan2(p[2] - az, p[0] - ax);
      let c: Vec3 = mix([0.76, 0.78, 0.26], [0.62, 0.7, 0.2], fbm(p[0] * 3, p[1] * 3, p[2] * 3));
      c = mix(c, [0.86, 0.46, 0.2], 0.55 * clamp01(Math.cos(ph - 0.3)) * smooth(0.7, -0.4, p[1]));
      c = mix(c, [0.55, 0.45, 0.18], smooth(0.8, 1.05, p[1]) * 0.6);
      return c;
    });

    const top = axis(Y1);
    const stem = buildTube(
      (t) => [top[0] - 0.02 + 0.1 * t, Y1 - 0.08 + 0.36 * t - 0.06 * t * t, top[1]],
      (t) => 0.034 - 0.006 * t,
      10,
      8,
    );
    paint(stem, () => [0.36, 0.24, 0.12]);

    const flesh = (x: number, y: number, z: number): Vec3 => {
      const [ax, az] = axis(y);
      const dx = x - ax, dz = z - az;
      const rho = Math.hypot(dx, dz);
      const ph = Math.atan2(dz, dx);
      const R = radius(y, ph);
      const s = R > 1e-6 ? rho / R : 2;
      if (s > 0.975) return [0.66, 0.68, 0.24];
      let c: Vec3 = mix([0.98, 0.97, 0.88], [0.94, 0.93, 0.74], smooth(0.5, 0.97, s));
      // 石細胞（ザラザラした粒）
      if (fbm(x * 55, y * 55, z * 55) > 0.7) c = mix(c, [0.86, 0.84, 0.66], 0.6);
      // 芯の筋（上へ伸びる）
      if (rho < 0.028 && y > -0.1 && y < Y1 - 0.06) c = mix(c, [0.86, 0.82, 0.6], 0.8);
      // 芯
      const e = (rho / 0.2) ** 2 + ((y + 0.32) / 0.34) ** 2;
      if (e < 1) {
        c = mix(c, [0.93, 0.91, 0.72], 0.6);
        if (e > 0.86) c = mix(c, [0.8, 0.8, 0.55], 0.8);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + 0.6;
          const ca = Math.cos(a), sa = Math.sin(a);
          const ch = ((dx * ca + dz * sa - 0.1) / 0.06) ** 2 + ((-dx * sa + dz * ca) / 0.04) ** 2 + ((y + 0.32) / 0.18) ** 2;
          if (ch < 1) {
            c = [0.92, 0.88, 0.72];
            const se = ellipsoid(dx, y, dz, 0.1 * ca, -0.32, 0.1 * sa, [ca, 0, sa], [0, 1, 0], [-sa, 0, ca], 0.035, 0.09, 0.025);
            if (se < 1) c = seedColor(se, [0.22, 0.12, 0.05], [0.42, 0.26, 0.12]);
          }
        }
      }
      return c;
    };
    return { body, extras: stem, flesh, extrasCapColor: [0.7, 0.62, 0.42] };
  },
};
