import { StarShape, buildTube, mergeMeshes, paint, scale3, mul3, rotY3, rotZ3, type Vec3 } from '../geometry/mesh';
import { ellipsoid, fbm, mix, seedColor, smooth, type FruitDef } from './common';

// 柿：上下につぶれた四角っぽい形。ヘタ（4枚のがく）は体積から除外する

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
  glow: 0xffb040,
  palette: [0xff8a1f, 0xffc04d, 0xfff0b0, 0x6fae3a],
  initialRotation: [0.5, 0.1, 0.04],
  sound: 'crisp',
  build(q = 1) {
    const shape = new StarShape(
      (dx, dy, dz) => {
        const th = Math.acos(Math.max(-1, Math.min(1, dy)));
        const ph = Math.atan2(dz, dx);
        const s = Math.sin(th);
        let r = 1 + 0.07 * Math.cos(4 * ph + 0.3) * s * s;
        r -= 0.14 * Math.exp(-((th / 0.42) ** 2));
        r -= 0.06 * Math.exp(-(((Math.PI - th) / 0.45) ** 2));
        r += 0.035 * Math.cos(ph - 1.1) * s;
        r += 0.04 * dy * s; // 肩が少し張る
        const t = dx * 0.6 - dz * 0.8;
        r += 0.11 * (t * t * t - 0.6 * t);
        return r;
      },
      mul3(rotZ3(0.05), scale3(1, 0.72, 1)),
    );
    const body = shape.build(144 * q, 90 * q);
    paint(body, (p) => {
      const q = shape.toShapeSpace(p[0], p[1], p[2]);
      const l = Math.hypot(q[0], q[1], q[2]);
      const dy = q[1] / l;
      let c: Vec3 = mix([0.98, 0.5, 0.06], [0.88, 0.3, 0.04], smooth(0.3, -0.9, dy));
      c = mix(c, [1.0, 0.62, 0.15], smooth(0.5, 0.95, dy) * 0.6);
      c = mix(c, [0.82, 0.32, 0.05], 0.25 * fbm(q[0] * 3, q[1] * 3, q[2] * 3));
      return c;
    });

    // ヘタ
    const parts = [];
    const topY = shape.surfacePoint(0, 1, 0)[1];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4 + 0.3;
      const sepal = new StarShape(
        (dx) => 1 - 0.25 * Math.abs(dx),
        mul3(rotY3(-a), mul3(rotZ3(-0.18), scale3(0.3, 0.035, 0.17))),
        [0.2 * Math.cos(a), topY + 0.05, 0.2 * Math.sin(a)],
      ).build(16, 10);
      parts.push(sepal);
    }
    parts.push(new StarShape(() => 1, scale3(0.16, 0.06, 0.16), [0, topY + 0.04, 0]).build(20, 10));
    parts.push(buildTube((t) => [0.01 * t, topY + 0.05 + 0.13 * t, 0], () => 0.035, 6, 8));
    const calyx = mergeMeshes(parts);
    paint(calyx, (p) => mix([0.33, 0.38, 0.12], [0.42, 0.3, 0.12], smooth(topY + 0.08, topY + 0.18, p[1])));

    const seeds: { c: Vec3; ex: Vec3; ez: Vec3 }[] = [];
    for (const k of [0, 2, 3, 5, 7]) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      seeds.push({ c: [0.36 * Math.cos(a), 0.0, 0.36 * Math.sin(a)], ex: [Math.cos(a), 0, Math.sin(a)], ez: [-Math.sin(a), 0, Math.cos(a)] });
    }
    const flesh = (x: number, y: number, z: number): Vec3 => {
      const s = shape.depth(x, y, z);
      if (s > 0.985) return [0.9, 0.36, 0.05];
      const q = shape.toShapeSpace(x, y, z);
      const qx = q[0], qy = q[1], qz = q[2];
      const rho = Math.hypot(qx, qz);
      const ang = Math.atan2(qz, qx);
      let c: Vec3 = mix([1.0, 0.62, 0.2], [0.98, 0.5, 0.1], smooth(0.4, 0.98, s));
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
