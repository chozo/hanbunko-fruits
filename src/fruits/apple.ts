import { StarShape, buildTube, mul3, paint, scale3, type Vec3 } from '../geometry/mesh';
import { clamp01, ellipsoid, fbm, mix, seedColor, smooth, type FruitDef } from './common';

// リンゴ：上が張った形、軸の傾き、片側のふくらみで「真ん中」が体積の半分にならないようにしている

export const apple: FruitDef = {
  id: 'apple',
  name: 'りんご',
  skin: {
    roughness: 0.38,
    clearcoat: 0.7,
    clearcoatRoughness: 0.25,
    bumpScale: 0.35,
    glsl: /* glsl */ `
      void skinDetail(vec3 p, inout vec3 col, out float bump) {
        vec2 w = worley(p * 26.0);
        float dotm = 1.0 - smoothstep(0.04, 0.1, w.x);
        col = mix(col, vec3(0.95, 0.82, 0.5), dotm * 0.45);
        col *= 0.92 + 0.16 * vnoise(p * vec3(30.0, 6.0, 30.0));
        bump = dotm * 0.5;
      }`,
  },
  extrasRoughness: 0.8,
  capRoughness: 0.5,
  glow: 0xffe0a0,
  palette: [0xff3b3b, 0xffd54a, 0xfff3c4, 0x8ee05a],
  initialRotation: [0.34, 2.0, 0.05],
  sound: 'crisp',
  build(q = 1) {
    const shape = new StarShape(
      (dx, dy, dz) => {
        const th = Math.acos(Math.max(-1, Math.min(1, dy)));
        const ph = Math.atan2(dz, dx);
        const s = Math.sin(th);
        let r = 0.93 + 0.1 * s * (1 + 0.3 * dy);
        r -= 0.4 * Math.exp(-((th / 0.32) ** 2));
        r -= 0.17 * Math.exp(-(((Math.PI - th) / 0.3) ** 2));
        r += 0.075 * s * s * Math.cos(ph - 0.6);
        r += 0.03 * s * Math.cos(2 * ph + 0.4);
        r += 0.025 * Math.cos(5 * ph) * s * smooth(1.2, 2.6, th);
        // 片側だけ丸く張り出す（中心を通る縦切りでも半分にならない）
        const t = dx * 0.83 + dz * 0.56;
        r += 0.17 * (t * t * t - 0.6 * t);
        return r;
      },
      mul3([1, 0.07, 0, 0, 1, 0, 0, 0, 1], scale3(1, 0.9, 1)),
    );
    const body = shape.build(144 * q, 96 * q);
    paint(body, (p) => {
      const q = shape.toShapeSpace(p[0], p[1], p[2]);
      const l = Math.hypot(q[0], q[1], q[2]);
      const th = Math.acos(q[1] / l);
      const ph = Math.atan2(q[2], q[0]);
      let c: Vec3 = mix([0.66, 0.05, 0.07], [0.42, 0.02, 0.06], fbm(q[0] * 2.5 + 3, q[1] * 2.5, q[2] * 2.5));
      const streak = fbm(q[0] * 7, q[1] * 1.3, q[2] * 7, 4);
      c = mix(c, [0.86, 0.36, 0.12], smooth(0.52, 0.72, streak) * 0.55);
      c = mix(c, [0.36, 0.02, 0.05], 0.35 * clamp01(Math.cos(ph - 0.6)));
      c = mix(c, [0.74, 0.64, 0.22], smooth(0.62, 0.12, th) * 0.85);
      c = mix(c, [0.72, 0.55, 0.2], smooth(2.75, 3.1, th) * 0.6);
      return c;
    });

    const stem = buildTube(
      (t) => [0.037 + 0.07 * t * t, 0.4 + 0.56 * t, 0.025 * t],
      (t) => 0.03 + 0.008 * t,
      10,
      10,
    );
    paint(stem, (p) => mix([0.36, 0.22, 0.1], [0.22, 0.14, 0.07], clamp01((p[1] - 0.5) * 2)));

    const brown: Vec3 = [0.25, 0.12, 0.05];
    const vasc = Array.from({ length: 10 }, (_, k) => [0.4 * Math.cos((k / 10) * Math.PI * 2 + 0.3), 0.4 * Math.sin((k / 10) * Math.PI * 2 + 0.3)]);
    const carp = Array.from({ length: 5 }, (_, k) => [Math.cos((k / 5) * Math.PI * 2 + 0.31), Math.sin((k / 5) * Math.PI * 2 + 0.31)]);
    const flesh = (x: number, y: number, z: number): Vec3 => {
      const s = shape.depth(x, y, z);
      if (s > 0.985) return [0.6, 0.05, 0.06];
      const q = shape.toShapeSpace(x, y, z);
      const qx = q[0], qy = q[1], qz = q[2];
      const rho = Math.hypot(qx, qz);
      const ang = Math.atan2(qz, qx);
      let c: Vec3 = mix([0.98, 0.95, 0.82], [0.95, 0.88, 0.62], smooth(0.55, 0.97, s));
      c = mix(c, [0.96, 0.9, 0.7], 0.25 * fbm(x * 9, y * 9, z * 9));
      if (s > 0.962) c = mix(c, [0.93, 0.62, 0.55], smooth(0.962, 0.985, s));
      // 維管束（芯の周りの小さな点の輪）
      if (Math.abs(qy) < 0.38 && rho > 0.36 && rho < 0.44)
        for (const [vx, vz] of vasc) if (Math.hypot(qx - vx, qz - vz) < 0.02) c = mix(c, [0.8, 0.84, 0.55], 0.7);
      // 芯
      const rc = 0.25 + 0.05 * Math.cos(5 * (ang - 0.31));
      const e = (rho / rc) ** 2 + ((qy - 0.02) / 0.5) ** 2;
      if (e < 1) {
        c = mix(c, [0.93, 0.92, 0.7], 0.6);
        if (e > 0.9) c = mix(c, [0.72, 0.78, 0.45], 0.8);
        // 種の部屋（5つ）と種
        for (const [ca, sa] of carp) {
          const radial = qx * ca + qz * sa;
          const tang = -qx * sa + qz * ca;
          const ch = ((radial - 0.15) / 0.075) ** 2 + (tang / 0.05) ** 2 + ((qy - 0.02) / 0.23) ** 2;
          if (ch < 1) {
            c = ch > 0.75 ? [0.85, 0.8, 0.62] : [0.94, 0.9, 0.76];
            const ex: Vec3 = [ca, 0, sa], ez: Vec3 = [-sa, 0, ca];
            const se = ellipsoid(qx, qy, qz, 0.15 * ca, 0.03, 0.15 * sa, ex, [0, 1, 0], ez, 0.042, 0.11, 0.03);
            if (se < 1) c = seedColor(se, brown, [0.45, 0.25, 0.1]);
          }
        }
      }
      if (rho < 0.025 && qy > 0.35) c = [0.85, 0.78, 0.55];
      return c;
    };

    return { body, extras: stem, flesh, extrasCapColor: [0.75, 0.68, 0.45] };
  },
};
