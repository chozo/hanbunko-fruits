import { StarShape, buildTube, mergeMeshes, mul3, paint, rotX3, rotY3, rotZ3, scale3, type Vec3 } from '../geometry/mesh';
import { ellipsoid, fbm, mix, smooth, type FruitDef } from './common';

// 桃：丸くて、縫合線のくぼみが一周し、お尻の先が少しとがる。片方のほっぺが大きい。
// 大きな種も「芯を含む果実本体」として体積に含める。軸と葉は体積から除外する。

export const peach: FruitDef = {
  id: 'peach',
  name: '桃',
  skin: {
    roughness: 0.72,
    sheen: 1.0,
    sheenColor: 0xffe6ea,
    bumpScale: 0.12,
    glsl: /* glsl */ `
      void skinDetail(vec3 p, inout vec3 col, out float bump) {
        // 赤い斑点と、うぶ毛のような細かいざらつき
        vec2 w = worley(p * 22.0);
        float dotm = (1.0 - smoothstep(0.05, 0.16, w.x)) * smoothstep(0.35, 0.7, fbm(p * 3.0 + 4.0));
        col = mix(col, vec3(0.78, 0.12, 0.2), dotm * 0.45);
        float fuzz = vnoise(p * 90.0);
        col *= 0.95 + 0.08 * fuzz;
        bump = fuzz * 0.25;
      }`,
  },
  extrasRoughness: 0.6,
  capRoughness: 0.35,
  glow: 0xff9ab4,
  palette: [0xff8aa8, 0xffd6c0, 0xffb070, 0x7ccf6a],
  initialRotation: [0.25, -1.45, 0.05],
  sound: 'soft',
  build(q = 1) {
    // 縫合線は φ = 0 の子午線に沿って、軸からお尻まで片側に走る（φ = 0 までの角度）
    const suture = (ph: number) => Math.abs(Math.atan2(Math.sin(ph), Math.cos(ph)));
    const shape = new StarShape(
      (dx, dy, dz) => {
        const th = Math.acos(Math.max(-1, Math.min(1, dy)));
        const ph = Math.atan2(dz, dx);
        const s = Math.sin(th);
        let r = 1;
        r -= 0.06 * Math.exp(-((suture(ph) / 0.14) ** 2)) * s; // 縫合線
        r -= 0.12 * Math.exp(-((th / 0.3) ** 2)); // 軸のくぼみ
        r += 0.06 * Math.exp(-(((Math.PI - th) / 0.16) ** 2)); // お尻の先
        // 片方のほっぺが大きい
        const t = dx * 0.35 + dz * 0.94;
        r += 0.14 * (t * t * t - 0.6 * t) * s;
        r += 0.03 * dy * Math.cos(ph - 1.2) * s;
        return r;
      },
      mul3(rotZ3(-0.06), scale3(1, 1.02, 0.95)),
    );
    const body = shape.build(144 * q, 96 * q);
    paint(body, (p) => {
      const qq = shape.toShapeSpace(p[0], p[1], p[2]);
      const l = Math.hypot(qq[0], qq[1], qq[2]);
      const dy = qq[1] / l;
      const ph = Math.atan2(qq[2], qq[0]);
      // クリーム色の地に、日の当たる側の赤み（ぼかした境目）
      const blushMask = smooth(0.25, 0.75, 0.55 + 0.45 * Math.cos(ph - 0.9) * (1 - Math.abs(dy) * 0.4) + 0.25 * (fbm(qq[0] * 3, qq[1] * 3, qq[2] * 3) - 0.5));
      let c: Vec3 = mix([0.98, 0.86, 0.62], [0.97, 0.72, 0.55], smooth(-0.6, 0.6, dy) * 0.4);
      c = mix(c, [0.9, 0.3, 0.36], blushMask * 0.85);
      c = mix(c, [0.82, 0.2, 0.3], blushMask * smooth(0.2, 0.9, dy) * 0.4);
      c = mix(c, [0.94, 0.8, 0.5], smooth(0.85, 0.98, dy) * 0.5);
      return c;
    });

    // 軸と葉
    const top = shape.surfacePoint(0, 1, 0);
    const stem = buildTube((t) => [top[0] + 0.02 * t, top[1] - 0.05 + 0.12 * t, top[2]], () => 0.035, 6, 8);
    const leaf = new StarShape(
      (dx) => 1 - 0.35 * Math.abs(dx) ** 1.5,
      mul3(rotY3(0.6), mul3(rotZ3(0.35), mul3(rotX3(0.25), scale3(0.38, 0.018, 0.13)))),
      [top[0] + 0.24, top[1] + 0.11, top[2] - 0.14],
    ).build(24, 10);
    const extras = mergeMeshes([stem, leaf]);
    paint(extras, (p) => (p[1] > top[1] + 0.08 || Math.hypot(p[0] - top[0], p[2] - top[2]) > 0.06 ? [0.28, 0.55, 0.18] : [0.45, 0.35, 0.18]));

    const flesh = (x: number, y: number, z: number): Vec3 => {
      const s = shape.depth(x, y, z);
      if (s > 0.988) return [0.88, 0.35, 0.38];
      const qq = shape.toShapeSpace(x, y, z);
      // 種（中心よりやや上、縦長でとがった楕円体）
      const se = ellipsoid(qq[0], qq[1], qq[2], 0, 0.04, 0, [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.27, 0.37 - 0.05 * Math.max(0, qq[1]) * 2, 0.21);
      if (se < 1) {
        if (se < 0.42) return mix([0.94, 0.86, 0.68], [0.86, 0.74, 0.55], fbm(x * 30, y * 30, z * 30)); // 中の仁
        const wr = fbm(x * 26, y * 26, z * 26);
        return mix([0.56, 0.3, 0.17], [0.4, 0.2, 0.12], wr); // しわのある殻
      }
      let c: Vec3 = mix([0.99, 0.94, 0.82], [0.99, 0.88, 0.78], smooth(0.5, 0.98, s));
      c = mix(c, [0.97, 0.66, 0.66], smooth(0.9, 0.985, s) * 0.7); // 皮の近くの赤み
      // 種のまわりの赤い繊維
      if (se < 1.6) c = mix(c, [0.86, 0.3, 0.32], smooth(1.6, 1.0, se) * (0.55 + 0.45 * fbm(x * 18, y * 50, z * 18)));
      c = mix(c, [1.0, 0.92, 0.8], 0.15 * fbm(x * 10, y * 10, z * 10));
      return c;
    };
    return { body, extras, flesh, extrasCapColor: [0.7, 0.8, 0.5] };
  },
};
