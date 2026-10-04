import { StarShape, buildTube, mergeMeshes, paint, scale3, mul3, rotY3, rotZ3, type Vec3 } from '../geometry/mesh';
import { ellipsoid, fbm, mix, seedColor, smooth, type FruitDef } from './common';

// 柿（富有柿がモデル）：上下につぶれた角の丸い四角。ヘタ（4枚のがく）は体積から除外する

export const persimmon: FruitDef = {
  id: 'persimmon',
  name: '柿',
  skin: {
    roughness: 0.3,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
    bumpScale: 0.1,
    glsl: /* glsl */ `
      void skinDetail(vec3 p, inout vec3 col, out float bump) {
        float n = fbm(p * 6.0);
        col *= 0.93 + 0.14 * n;
        bump = n * 0.3;
      }`,
  },
  extrasRoughness: 0.85,
  capRoughness: 0.4,
  glow: 0xff9a30,
  palette: [0xff7a12, 0xffb648, 0xfff0b0, 0x4f8a2a],
  initialRotation: [0.5, 0.25, 0.04],
  sound: 'crisp',
  build(q = 1) {
    // 富有柿：上から見ると角の丸い四角、横に浅い溝が4本、底は平らで十字の筋、ヘタの周りがくぼむ
    const grooveDist = (ph: number) => {
      const m = ((ph % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
      return Math.min(m, Math.PI / 2 - m); // 一番近い溝（0°, 90°, 180°, 270°）までの角度
    };
    const shape = new StarShape(
      (dx, dy, dz) => {
        const th = Math.acos(Math.max(-1, Math.min(1, dy)));
        const ph = Math.atan2(dz, dx);
        const s = Math.sin(th);
        // 上下が平らな箱形の輪郭（超楕円）
        const P = 2.7;
        let r = (Math.abs(s) ** P + Math.abs(dy) ** P) ** (-1 / P);
        // 横の溝と、溝の間の張り出し
        const g = grooveDist(ph);
        r += s ** 4 * (0.035 - 0.07 * Math.exp(-((g / 0.2) ** 2)));
        // ヘタの周りのくぼみと、底の小さなへこみ
        r -= 0.16 * Math.exp(-((th / 0.38) ** 2));
        r -= 0.04 * Math.exp(-(((Math.PI - th) / 0.22) ** 2));
        // わずかな非対称（片側が少し大きく、上面が少し傾く）
        const t = dx * 0.6 - dz * 0.8;
        r += 0.15 * (t * t * t - 0.6 * t) * s;
        r += 0.03 * dy * Math.cos(ph - 0.8) * s;
        return r;
      },
      scale3(1, 0.68, 1),
    );
    const body = shape.build(144 * q, 90 * q);
    paint(body, (p) => {
      const q = shape.toShapeSpace(p[0], p[1], p[2]);
      const l = Math.hypot(q[0], q[1], q[2]);
      const dy = q[1] / l;
      const ph = Math.atan2(q[2], q[0]);
      // 柿色：下と日の当たる側は赤み、ヘタの周りは黄色み
      let c: Vec3 = [0.93, 0.32, 0.015];
      c = mix(c, [0.8, 0.16, 0.02], smooth(0.1, -0.85, dy) * 0.8);
      c = mix(c, [0.78, 0.14, 0.02], 0.4 * Math.max(0, Math.cos(ph - 2.4)) * (1 - Math.abs(dy)));
      c = mix(c, [0.96, 0.52, 0.06], smooth(0.62, 0.92, dy) * 0.7);
      c = mix(c, [0.7, 0.62, 0.18], smooth(0.9, 0.99, dy) * 0.6);
      // 溝はわずかに濃く、底の十字の筋
      c = mix(c, [0.8, 0.28, 0.04], 0.3 * Math.exp(-((grooveDist(ph) / 0.08) ** 2)) * (1 - Math.abs(dy)));
      if (dy < -0.8) c = mix(c, [0.62, 0.2, 0.05], 0.55 * Math.exp(-((grooveDist(ph) * l * 0.9 / 0.035) ** 2)) * smooth(-0.8, -0.95, dy));
      c = mix(c, [0.86, 0.26, 0.02], 0.2 * fbm(q[0] * 4, q[1] * 4, q[2] * 4));
      return c;
    });

    // ヘタ：幅の広い4枚のがく（縁が波打つ）、中央の台、太く短い軸
    const parts = [];
    const topY = shape.surfacePoint(0, 1, 0)[1];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const sepal = new StarShape(
        (dx, _dy, dz) => 1 + 0.07 * Math.cos(6 * Math.atan2(dz, dx)) - 0.12 * Math.abs(dz),
        mul3(rotY3(-a), mul3(rotZ3(0.2), scale3(0.3, 0.028, 0.25))),
        [0.24 * Math.cos(a), topY + 0.07, 0.24 * Math.sin(a)],
      ).build(24, 10);
      parts.push(sepal);
    }
    parts.push(new StarShape((dx, _dy, dz) => 1 + 0.06 * Math.cos(4 * Math.atan2(dz, dx)), scale3(0.15, 0.055, 0.15), [0, topY + 0.06, 0]).build(24, 10));
    parts.push(buildTube((t) => [0.012 * t, topY + 0.07 + 0.1 * t, 0], (t) => 0.042 - 0.006 * t, 6, 10));
    const calyx = mergeMeshes(parts);
    paint(calyx, (p) => {
      const rr = Math.hypot(p[0], p[2]);
      let c: Vec3 = mix([0.14, 0.2, 0.05], [0.22, 0.28, 0.08], smooth(0.05, 0.36, rr));
      c = mix(c, [0.4, 0.3, 0.12], smooth(0.38, 0.5, rr)); // 縁は乾いて茶色っぽい
      c = mix(c, [0.36, 0.25, 0.12], smooth(topY + 0.1, topY + 0.13, p[1])); // 軸
      return c;
    });

    const seeds: { c: Vec3; ex: Vec3; ez: Vec3 }[] = [];
    for (const k of [0, 2, 3, 5, 7]) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      seeds.push({ c: [0.36 * Math.cos(a), 0.0, 0.36 * Math.sin(a)], ex: [Math.cos(a), 0, Math.sin(a)], ez: [-Math.sin(a), 0, Math.cos(a)] });
    }
    const flesh = (x: number, y: number, z: number): Vec3 => {
      const s = shape.depth(x, y, z);
      if (s > 0.985) return [0.92, 0.36, 0.04];
      const q = shape.toShapeSpace(x, y, z);
      const qx = q[0], qy = q[1], qz = q[2];
      const rho = Math.hypot(qx, qz);
      const ang = Math.atan2(qz, qx);
      let c: Vec3 = mix([1.0, 0.64, 0.22], [0.98, 0.5, 0.1], smooth(0.4, 0.98, s));
      c = mix(c, [1.0, 0.7, 0.32], 0.2 * fbm(x * 8, y * 8, z * 8));
      // 中心から放射状に伸びる 8 本の筋
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
        const d = Math.abs(rho * Math.sin(ang - a));
        if (d < 0.014 && rho * Math.cos(ang - a) > 0 && rho < 0.7 * (1 - Math.abs(qy) * 0.8)) c = mix(c, [1.0, 0.82, 0.55], 0.75);
      }
      if (rho < 0.07 && Math.abs(qy) < 0.8) c = mix(c, [1.0, 0.85, 0.6], 0.8);
      // ゴマ（茶色の斑点）
      if (rho < 0.42 && fbm(x * 40, y * 40, z * 40) > 0.72) c = mix(c, [0.45, 0.22, 0.08], 0.7);
      for (const sd of seeds) {
        const e = ellipsoid(qx, qy, qz, sd.c[0], sd.c[1], sd.c[2], sd.ex, [0, 1, 0], sd.ez, 0.13, 0.09, 0.05);
        if (e < 1) c = seedColor(e, [0.4, 0.22, 0.09], [0.75, 0.5, 0.25]);
      }
      return c;
    };
    return { body, extras: calyx, flesh, extrasCapColor: [0.62, 0.66, 0.4] };
  },
};
