import { StarShape, computeNormals, flipWinding, mergeMeshes, mul3, paint, rotY3, rotZ3, scale3, signedVolume, type MeshData, type Vec3 } from '../geometry/mesh';
import { fbm, mix, rng, smooth, type FruitDef } from './common';

// パイナップル：縦長の樽形（上が少し細い）。表面は六角形の「目」が少しねじれながら並び、
// それぞれの目の下側に茶色いとがった苞がある。上の冠芽は細長い剣形の葉が噴水のように反る（体積から除外）。
// 断面は外側に目のくぼみ（茶色の点）、黄色い果肉、中心の白っぽい芯。

const SX = 0.7, SY = 1.0;
/** 一周あたりの目の数と、高さ 1 あたりの段数 */
const EYES_AROUND = 13;
const ROWS_PER_UNIT = 4.6;
const TWIST = 0.55;

/** 六角形の目の格子で、目の中心からのずれ（x: 周方向, y: 上方向。目の半径 ≈ 0.5） */
function eyeOffset(ang: number, h: number): [number, number] {
  const a = (ang / (Math.PI * 2)) * EYES_AROUND + h * TWIST;
  const b = h * ROWS_PER_UNIT * 0.866;
  const m = (v: number, r: number) => v - r * Math.floor(v / r);
  const pax = m(a, 1) - 0.5, pay = m(b, 1.732) - 0.866;
  const pbx = m(a - 0.5, 1) - 0.5, pby = m(b - 0.866, 1.732) - 0.866;
  return pax * pax + pay * pay < pbx * pbx + pby * pby ? [pax, pay] : [pbx, pby];
}

export const pineapple: FruitDef = {
  id: 'pineapple',
  name: 'パイナップル',
  skin: {
    roughness: 0.6,
    bumpScale: 2.2,
    glsl: /* glsl */ `
      vec2 eyeOffset(float ang, float h) {
        float a = ang / 6.2831853 * ${EYES_AROUND.toFixed(1)} + h * ${TWIST.toFixed(2)};
        float b = h * ${ROWS_PER_UNIT.toFixed(2)} * 0.866;
        vec2 g = vec2(a, b);
        vec2 r = vec2(1.0, 1.732);
        vec2 hh = r * 0.5;
        vec2 pa = mod(g, r) - hh;
        vec2 pb = mod(g - hh, r) - hh;
        return dot(pa, pa) < dot(pb, pb) ? pa : pb;
      }
      void skinDetail(vec3 p, inout vec3 col, out float bump) {
        // 色はリニア値で指定する（sRGB より暗く書く）
        vec2 f = eyeOffset(atan(p.z, p.x), p.y);
        float d = length(f);
        float dome = 1.0 - smoothstep(0.05, 0.48, d);
        float seam = smoothstep(0.3, 0.46, d);
        float ring = smoothstep(0.18, 0.36, d) * (1.0 - seam);
        // 目の下側の苞（上向きにとがった茶色い三角形）
        float ty = (f.y + 0.5) / 0.42;
        float w = 0.24 * (1.0 - ty);
        float bract = step(0.0, ty) * step(ty, 1.0) * (1.0 - smoothstep(w - 0.025, w + 0.025, abs(f.x)));
        // 目の中央は明るい黄色〜黄緑、外周は緑の輪
        col = mix(col, col * vec3(1.25, 1.2, 0.6), (1.0 - smoothstep(0.0, 0.3, d)) * 0.6);
        col = mix(col, vec3(0.06, 0.16, 0.015), ring * 0.55);
        col *= 0.75 + 0.35 * dome;
        col = mix(col, vec3(0.02, 0.05, 0.012), seam * 0.92);
        col = mix(col, vec3(0.1, 0.05, 0.015), bract * 0.9);
        col = mix(col, vec3(0.16, 0.1, 0.03), (1.0 - smoothstep(0.02, 0.07, d)) * 0.8);
        col *= 0.9 + 0.16 * vnoise(p * 28.0);
        bump = dome * 0.8 + bract * 0.5 - seam * 0.4;
      }`,
  },
  extrasRoughness: 0.5,
  capRoughness: 0.32,
  glow: 0xffd84a,
  palette: [0xffd23a, 0xfff2a0, 0xff9a2a, 0x5fae4a],
  initialRotation: [0.2, 1.8, 0.06],
  sound: 'juicy',
  build(q = 1) {
    const shape = new StarShape(
      (dx, dy, dz) => {
        const th = Math.acos(Math.max(-1, Math.min(1, dy)));
        const ph = Math.atan2(dz, dx);
        const s = Math.sin(th);
        // 樽形（上下が平らぎみ）、上が細く下がふっくら
        const P = 2.5;
        let r = (Math.abs(s) ** P + Math.abs(dy) ** P) ** (-1 / P);
        r *= 1 - 0.16 * Math.max(0, dy) * s + 0.04 * Math.max(0, -dy) * s;
        r -= 0.1 * Math.exp(-((th / 0.3) ** 2)); // 冠芽の付け根のくぼみ
        r -= 0.05 * Math.exp(-(((Math.PI - th) / 0.3) ** 2)); // お尻の切り口
        // 片側が少しふくらむ
        const t = dx * 0.8 + dz * 0.6;
        r += 0.12 * (t * t * t - 0.6 * t) * s;
        r += 0.03 * dy * Math.cos(ph - 2.0) * s;
        return r;
      },
      mul3(rotZ3(0.04), scale3(SX, SY, SX)),
    );
    const body = shape.build(176 * q, 120 * q);
    paint(body, (p) => {
      const h = p[1];
      // 下は黄金色〜橙、中ほどは黄色、上は緑（写真の熟し方）
      let c: Vec3 = mix([0.88, 0.55, 0.1], [0.78, 0.7, 0.18], smooth(-0.95, -0.2, h));
      c = mix(c, [0.4, 0.58, 0.14], smooth(-0.45, 0.6, h) * 0.85);
      c = mix(c, [0.9, 0.5, 0.08], 0.2 * fbm(p[0] * 2.5, p[1] * 2.5, p[2] * 2.5));
      return c;
    });

    // 冠芽：細長い剣形の葉が外へ反る。内側ほど長く立ち、外側は短く寝る
    const top = shape.surfacePoint(0, 1, 0);
    const leaves: MeshData[] = [];
    const r = rng(41);
    const N = 44;
    for (let k = 0; k < N; k++) {
      const az = k * 2.39996 + r() * 0.25; // 黄金角で並べる
      const inner = 1 - k / N;
      const len = 0.22 + 0.62 * inner ** 0.8 + r() * 0.08;
      const width = 0.05 + 0.02 * r();
      const tilt = 0.1 + (1 - inner) * 1.0 + r() * 0.12; // 付け根の傾き
      const bend = 0.35 + (1 - inner) * 0.5 + r() * 0.2; // 先へ行くほど外へ反る
      // 先がとがった細長い葉（局所 y が長さ方向、0..2len）
      const leaf = new StarShape((_dx, dy) => 1 - 0.75 * Math.max(0, dy) ** 1.2, scale3(width, len, 0.014), [0, len, 0]).build(10, 14);
      const pos = leaf.positions;
      for (let i = 0; i < pos.length; i += 3) {
        // 長さ方向に沿って外（+x）へ曲げる
        const y = pos[i + 1];
        const t = y / (2 * len);
        const a = tilt + bend * t * t;
        const x = pos[i];
        pos[i] = x * Math.cos(a) + y * Math.sin(a);
        pos[i + 1] = -x * Math.sin(a) + y * Math.cos(a);
      }
      // 方位へ回して冠芽の付け根に置く
      const m = rotY3(-az);
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i], y = pos[i + 1], z = pos[i + 2];
        pos[i] = m[0] * x + m[1] * y + m[2] * z + top[0] + 0.05 * Math.cos(az) * (1 - inner);
        pos[i + 1] = m[3] * x + m[4] * y + m[5] * z + top[1] - 0.06;
        pos[i + 2] = m[6] * x + m[7] * y + m[8] * z + top[2] + 0.05 * Math.sin(az) * (1 - inner);
      }
      if (signedVolume(leaf) < 0) flipWinding(leaf);
      computeNormals(leaf);
      leaves.push(leaf);
    }
    const crown = mergeMeshes(leaves);
    paint(crown, (p) => {
      const t = smooth(top[1], top[1] + 0.85, p[1]);
      let c: Vec3 = mix([0.16, 0.3, 0.2], [0.34, 0.5, 0.42], t); // 灰緑色、先は明るい
      c = mix(c, [0.5, 0.42, 0.22], smooth(top[1] + 0.15, top[1] - 0.05, p[1]) * 0.6); // 付け根は黄土色
      return c;
    });

    const flesh = (x: number, y: number, z: number): Vec3 => {
      const s = shape.depth(x, y, z);
      const qq = shape.toShapeSpace(x, y, z);
      const rho = Math.hypot(qq[0], qq[2]);
      const ang = Math.atan2(z, x);
      if (s > 0.978) return [0.55, 0.45, 0.15];
      // 皮に近い帯に、目のくぼみが茶色い点として並ぶ
      if (s > 0.86) {
        const [ex, ey] = eyeOffset(ang, y);
        const ed = Math.hypot(ex, ey);
        if (ed < 0.16 + (s - 0.86) * 1.8) return mix([0.42, 0.28, 0.1], [0.66, 0.5, 0.2], smooth(0.1, 0.3, ed));
        return mix([0.99, 0.82, 0.3], [0.88, 0.68, 0.22], smooth(0.86, 0.978, s));
      }
      // 芯
      if (rho < 0.2 && Math.abs(qq[1]) < 0.92) {
        const c: Vec3 = mix([1.0, 0.95, 0.72], [0.98, 0.88, 0.55], smooth(0.12, 0.2, rho));
        return mix(c, [0.94, 0.86, 0.55], 0.3 * fbm(x * 40, y * 6, z * 40));
      }
      let c: Vec3 = mix([1.0, 0.86, 0.32], [1.0, 0.8, 0.24], smooth(0.2, 0.86, s));
      // 放射状の繊維
      const fib = fbm(Math.cos(ang) * 3 + 10, y * 9, Math.sin(ang) * 3 + rho * 2);
      c = mix(c, [1.0, 0.92, 0.5], 0.35 * smooth(0.45, 0.75, fib));
      if (rho < 0.24) c = mix(c, [0.98, 0.9, 0.55], 0.6);
      return c;
    };
    return { body, extras: crown, flesh, extrasCapColor: [0.6, 0.75, 0.5] };
  },
};
