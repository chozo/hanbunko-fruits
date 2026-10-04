import { StarShape, buildTube, paint, scale3, type Vec3 } from '../geometry/mesh';
import { fbm, mix, rng, smooth, type FruitDef } from './common';

// スイカ：少し横長の球。しま模様は GLSL、黒い種は断面テクスチャで立体的に配置する

export const watermelon: FruitDef = {
  id: 'watermelon',
  name: 'スイカ',
  skin: {
    roughness: 0.32,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
    bumpScale: 0.05,
    glsl: /* glsl */ `
      void skinDetail(vec3 p, inout vec3 col, out float bump) {
        vec3 d = normalize(p);
        float ang = atan(d.z, d.x);
        float th = acos(clamp(d.y, -1.0, 1.0));
        float n = fbm(p * 3.5);
        float wob = 0.22 * sin(th * 9.0 + ang * 2.0) + 0.35 * sin(th * 23.0 + ang * 5.0) * 0.4;
        float stripe = sin(ang * 8.0 + wob + n * 2.6);
        float dark = smoothstep(-0.25, 0.15, stripe);
        vec3 light = vec3(0.42, 0.62, 0.24);
        vec3 deep = vec3(0.04, 0.2, 0.06);
        col = mix(light, deep, dark) * (0.88 + 0.24 * vnoise(p * 25.0));
        // 地面に接していた黄色い部分
        col = mix(col, vec3(0.85, 0.78, 0.38), smoothstep(0.75, 0.95, -d.z * 0.7 - d.y * 0.7) * 0.7);
        bump = 0.0;
      }`,
  },
  extrasRoughness: 0.8,
  capRoughness: 0.28,
  glow: 0xff6a8a,
  palette: [0xff4d6d, 0x6cdc5a, 0xffd0dc, 0x1f8a3a],
  initialRotation: [0.3, -1.2, 0.18],
  sound: 'juicy',
  build(q = 1) {
    const shape = new StarShape(
      (dx, dy, dz) => {
        // 片方の端が太い俵形
        const t = dx * 0.85 + dy * 0.2 + dz * 0.49;
        return 1 + 0.015 * fbm(dx * 2 + 5, dy * 2, dz * 2) + 0.15 * (t * t * t - 0.6 * t);
      },
      scale3(1.12, 0.94, 0.95),
    );
    const body = shape.build(144 * q, 96 * q);
    paint(body, () => [1, 1, 1]);

    const top = shape.surfacePoint(0, 1, 0)[1];
    const stem = buildTube((t) => [0.05 * Math.sin(t * 5), top - 0.04 + 0.12 * t, 0.05 * (1 - Math.cos(t * 5))], () => 0.025, 10, 8);
    paint(stem, () => [0.35, 0.4, 0.15]);

    // 黒い種：果肉の中ほどの殻状の範囲に配置する
    const r = rng(23);
    const seeds: { c: Vec3; d: Vec3 }[] = [];
    while (seeds.length < 90) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const d: Vec3 = [s * Math.cos(a), u, s * Math.sin(a)];
      const rr = 0.42 + r() * 0.3;
      const c: Vec3 = [d[0] * rr, d[1] * rr, d[2] * rr];
      if (seeds.every((o) => Math.hypot(o.c[0] - c[0], o.c[1] - c[1], o.c[2] - c[2]) > 0.13)) seeds.push({ c, d });
    }
    const flesh = (x: number, y: number, z: number): Vec3 => {
      const s = shape.depth(x, y, z);
      if (s > 0.982) return [0.08, 0.28, 0.08];
      if (s > 0.955) return [0.55, 0.75, 0.38];
      if (s > 0.9) return mix([0.94, 0.96, 0.82], [0.85, 0.92, 0.7], smooth(0.9, 0.955, s));
      const q = shape.toShapeSpace(x, y, z);
      let c: Vec3 = mix([0.93, 0.16, 0.22], [0.98, 0.42, 0.45], smooth(0.84, 0.9, s));
      c = mix(c, [0.82, 0.08, 0.16], 0.35 * fbm(x * 9, y * 9, z * 9));
      if (fbm(x * 40, y * 40, z * 40) > 0.7) c = mix(c, [1.0, 0.5, 0.55], 0.35); // シャリ感
      if (s < 0.75) {
        for (const sd of seeds) {
          const dx = q[0] - sd.c[0], dy = q[1] - sd.c[1], dz = q[2] - sd.c[2];
          if (dx * dx + dy * dy + dz * dz > 0.01) continue;
          // 種の長軸は中心方向、厚みは薄い
          const along = dx * sd.d[0] + dy * sd.d[1] + dz * sd.d[2];
          const perp = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along));
          const e = (along / 0.055) ** 2 + (perp / 0.03) ** 2;
          if (e < 1) c = e > 0.6 ? [0.25, 0.14, 0.08] : [0.06, 0.04, 0.03];
        }
      }
      return c;
    };
    return { body, extras: stem, flesh, extrasCapColor: [0.7, 0.8, 0.5] };
  },
};
