import { StarShape, buildTube, mergeMeshes, paint, scale3, type Vec3 } from '../geometry/mesh';
import { ellipsoid, fbm, mix, rng, seedColor, smooth, type FruitDef } from './common';

// マスクメロン：ほぼ球。網目は GLSL で描く。中心の種の空洞も体積に含む

export const melon: FruitDef = {
  id: 'melon',
  name: 'メロン',
  skin: {
    roughness: 0.75,
    bumpScale: 1.2,
    glsl: /* glsl */ `
      void skinDetail(vec3 p, inout vec3 col, out float bump) {
        vec3 q = p * 6.5 + 0.35 * vec3(vnoise(p * 9.0), vnoise(p * 9.0 + 7.0), vnoise(p * 9.0 + 13.0));
        vec2 w = worley(q);
        float line = 1.0 - smoothstep(0.03, 0.11, w.y - w.x);
        vec2 w2 = worley(q * 2.3 + 5.0);
        float fine = 1.0 - smoothstep(0.02, 0.07, w2.y - w2.x);
        float net = max(line, fine * 0.55);
        col *= 0.85 + 0.25 * vnoise(p * 14.0);
        col = mix(col, vec3(0.82, 0.8, 0.66), net * 0.92);
        bump = net;
      }`,
  },
  extrasRoughness: 0.8,
  capRoughness: 0.3,
  glow: 0xb8ff80,
  palette: [0x9ff26a, 0xe6ffb0, 0xffd27a, 0x5fd17a],
  initialRotation: [0.4, 0.8, 0.1],
  sound: 'juicy',
  build(q = 1) {
    const shape = new StarShape(
      (dx, dy, dz) => {
        const th = Math.acos(Math.max(-1, Math.min(1, dy)));
        const ph = Math.atan2(dz, dx);
        let r = 1 + 0.012 * Math.cos(10 * ph) * Math.sin(th);
        r -= 0.035 * Math.exp(-((th / 0.22) ** 2));
        r -= 0.025 * Math.exp(-(((Math.PI - th) / 0.25) ** 2));
        // 斜めの軸に沿った卵形（片側だけ太い）。中心を通る切り方でも角度次第で半分にならない
        const t = dx * 0.62 + dy * 0.45 + dz * 0.64;
        r += 0.13 * (t * t * t - 0.6 * t);
        return r;
      },
      scale3(1, 0.95, 1.02),
    );
    const body = shape.build(144 * q, 96 * q);
    paint(body, (p) => mix([0.5, 0.6, 0.38], [0.38, 0.5, 0.28], fbm(p[0] * 2.5, p[1] * 2.5, p[2] * 2.5)));

    const top = shape.surfacePoint(0, 1, 0)[1];
    const stem = mergeMeshes([
      buildTube((t) => [0, top - 0.04 + 0.2 * t, 0], () => 0.045, 6, 10),
      buildTube((t) => [-0.17 + 0.34 * t, top + 0.17 + 0.02 * Math.sin(t * Math.PI), 0], () => 0.035, 8, 10),
    ]);
    paint(stem, () => [0.48, 0.52, 0.3]);

    // 種：空洞の縁に沿って 3 列に並べる
    const r = rng(11);
    const seeds: { c: Vec3; ex: Vec3; ey: Vec3; ez: Vec3 }[] = [];
    for (let i = 0; i < 60; i++) {
      const lobe = i % 3;
      const a = (lobe / 3) * Math.PI * 2 + (r() - 0.5) * 0.7;
      const yy = (r() * 2 - 1) * 0.38;
      const rr = 0.22 * Math.sqrt(Math.max(0, 1 - (yy / 0.45) ** 2)) + 0.03;
      const c: Vec3 = [rr * Math.cos(a), yy, rr * Math.sin(a)];
      const ex: Vec3 = [Math.cos(a), 0, Math.sin(a)];
      seeds.push({ c, ex, ey: [0, 1, 0], ez: [-Math.sin(a), 0, Math.cos(a)] });
    }
    const flesh = (x: number, y: number, z: number): Vec3 => {
      const s = shape.depth(x, y, z);
      if (s > 0.975) return [0.5, 0.56, 0.38];
      if (s > 0.935) return mix([0.42, 0.62, 0.28], [0.58, 0.76, 0.38], smooth(0.975, 0.935, s));
      const q = shape.toShapeSpace(x, y, z);
      const rho = Math.hypot(q[0], q[2]);
      const ang = Math.atan2(q[2], q[0]);
      let c: Vec3 = mix([0.86, 0.94, 0.56], [0.7, 0.88, 0.45], smooth(0.4, 0.93, s));
      c = mix(c, [0.9, 0.96, 0.62], 0.25 * fbm(x * 10, y * 10, z * 10));
      // 種の空洞（三つ葉の形）
      const cav = (rho / (0.34 * (1 + 0.14 * Math.cos(3 * ang)))) ** 2 + (q[1] / 0.48) ** 2;
      if (cav < 1) {
        c = mix([0.96, 0.82, 0.5], [0.92, 0.72, 0.38], fbm(x * 18, y * 18, z * 18));
        for (const sd of seeds) {
          const e = ellipsoid(q[0], q[1], q[2], sd.c[0], sd.c[1], sd.c[2], sd.ex, sd.ey, sd.ez, 0.025, 0.06, 0.04);
          if (e < 1) c = seedColor(e, [0.97, 0.93, 0.78], [0.8, 0.7, 0.5]);
        }
      } else if (cav < 1.12) c = mix(c, [0.95, 0.9, 0.55], 0.5);
      return c;
    };
    return { body, extras: stem, flesh, extrasCapColor: [0.75, 0.8, 0.55] };
  },
};
