import { StarShape, mergeMeshes, mul3, paint, rotX3, rotY3, rotZ3, scale3, type MeshData, type Vec3 } from '../geometry/mesh';
import { fbm, mix, rng, smooth, type FruitDef } from './common';

// パイナップル：縦長の樽形。表面はらせん状に並ぶ「目」。上の葉（冠芽）は体積から除外する。
// 断面は外側に目のくぼみ（茶色の点）、黄色い果肉、中心の白っぽい芯。

const SX = 0.7, SY = 1.0;

/** 目の格子（8 本と 13 本のらせん）。返り値は目の中心からの距離 0..~0.7 */
function eyeDist(ang: number, h: number): number {
  const u = (ang / (Math.PI * 2)) * 8 + h * 2.4;
  const v = (ang / (Math.PI * 2)) * 13 - h * 3.9;
  const fu = u - Math.floor(u) - 0.5, fv = v - Math.floor(v) - 0.5;
  return Math.hypot(fu, fv);
}

export const pineapple: FruitDef = {
  id: 'pineapple',
  name: 'パイナップル',
  skin: {
    roughness: 0.62,
    bumpScale: 1.6,
    glsl: /* glsl */ `
      void skinDetail(vec3 p, inout vec3 col, out float bump) {
        float ang = atan(p.z, p.x);
        float h = p.y;
        float u = ang / 6.2831853 * 8.0 + h * 2.4;
        float v = ang / 6.2831853 * 13.0 - h * 3.9;
        vec2 f = fract(vec2(u, v)) - 0.5;
        float d = length(f);
        float dome = 1.0 - smoothstep(0.1, 0.5, d);
        float seam = smoothstep(0.36, 0.5, d);
        // 目のとげ（下寄りの小さな茶色い点）
        float tip = 1.0 - smoothstep(0.03, 0.08, length(f - vec2(0.12, -0.12)));
        col *= 0.8 + 0.35 * dome;
        col = mix(col, vec3(0.32, 0.36, 0.14), seam * 0.75);
        col = mix(col, vec3(0.3, 0.18, 0.08), tip * 0.85);
        col *= 0.92 + 0.12 * vnoise(p * 30.0);
        bump = dome;
      }`,
  },
  extrasRoughness: 0.55,
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
        // 樽形（上下が平らぎみ）、上が少し細い
        const P = 2.4;
        let r = (Math.abs(s) ** P + Math.abs(dy) ** P) ** (-1 / P);
        r *= 1 - 0.16 * Math.max(0, dy) * s + 0.04 * Math.max(0, -dy) * s; // 上が細く、下がふっくら
        r -= 0.08 * Math.exp(-((th / 0.3) ** 2)); // 冠芽の付け根のくぼみ
        // 片側が少しふくらむ
        const t = dx * 0.8 + dz * 0.6;
        r += 0.12 * (t * t * t - 0.6 * t) * s;
        r += 0.03 * dy * Math.cos(ph - 2.0) * s;
        return r;
      },
      mul3(rotZ3(0.04), scale3(SX, SY, SX)),
    );
    const body = shape.build(160 * q, 110 * q);
    paint(body, (p) => {
      const h = p[1];
      // 下は黄色〜橙、上は緑がかる
      let c: Vec3 = mix([0.86, 0.58, 0.14], [0.78, 0.66, 0.22], smooth(-0.9, 0.4, h));
      c = mix(c, [0.5, 0.56, 0.2], smooth(0.2, 0.95, h) * 0.65);
      c = mix(c, [0.9, 0.5, 0.1], 0.25 * fbm(p[0] * 2.5, p[1] * 2.5, p[2] * 2.5));
      return c;
    });

    // 冠芽：らせん状に並ぶ細い葉
    const top = shape.surfacePoint(0, 1, 0);
    const leaves: MeshData[] = [];
    const r = rng(41);
    const N = 26;
    for (let k = 0; k < N; k++) {
      const az = k * 2.39996 + r() * 0.2; // 黄金角
      const inner = 1 - k / N; // 内側ほど立ち、長い
      const tilt = 0.18 + (1 - inner) * 0.95 + r() * 0.1;
      const len = 0.24 + 0.26 * inner + r() * 0.05;
      const d: Vec3 = [Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az)];
      const leaf = new StarShape(
        (_dx, dy) => 1 - 0.55 * Math.max(0, dy) ** 1.4,
        mul3(rotY3(-az), mul3(rotZ3(-tilt), mul3(rotX3((r() - 0.5) * 0.3), scale3(0.055, len, 0.012)))),
        [top[0] + d[0] * len * 0.85, top[1] - 0.04 + d[1] * len * 0.85, top[2] + d[2] * len * 0.85],
      ).build(10, 12);
      leaves.push(leaf);
    }
    const crown = mergeMeshes(leaves);
    paint(crown, (p) => mix([0.18, 0.34, 0.16], [0.36, 0.5, 0.3], smooth(top[1], top[1] + 0.6, p[1])));

    const flesh = (x: number, y: number, z: number): Vec3 => {
      const s = shape.depth(x, y, z);
      const qq = shape.toShapeSpace(x, y, z);
      const rho = Math.hypot(qq[0], qq[2]);
      const ang = Math.atan2(z, x);
      if (s > 0.975) return [0.62, 0.48, 0.16];
      // 皮に近い帯に、目のくぼみが茶色い点として並ぶ
      if (s > 0.88) {
        const ed = eyeDist(ang, y);
        if (ed < 0.2 + (s - 0.88) * 1.6) return mix([0.4, 0.26, 0.1], [0.6, 0.45, 0.18], smooth(0.12, 0.3, ed));
        return mix([0.98, 0.8, 0.3], [0.86, 0.66, 0.22], smooth(0.88, 0.975, s));
      }
      // 芯
      if (rho < 0.2 && Math.abs(qq[1]) < 0.92) {
        const c: Vec3 = mix([1.0, 0.95, 0.7], [0.98, 0.88, 0.55], smooth(0.12, 0.2, rho));
        return mix(c, [0.94, 0.86, 0.55], 0.3 * fbm(x * 40, y * 6, z * 40));
      }
      let c: Vec3 = mix([1.0, 0.86, 0.32], [1.0, 0.8, 0.24], smooth(0.2, 0.88, s));
      // 放射状の繊維
      const fib = fbm(Math.cos(ang) * 3 + 10, y * 9, Math.sin(ang) * 3 + rho * 2);
      c = mix(c, [1.0, 0.92, 0.5], 0.35 * smooth(0.45, 0.75, fib));
      if (rho < 0.24) c = mix(c, [0.98, 0.9, 0.55], 0.6);
      return c;
    };
    return { body, extras: crown, flesh, extrasCapColor: [0.6, 0.75, 0.5] };
  },
};
