import { StarShape, buildTube, mergeMeshes, mul3, paint, rotX3, rotZ3, scale3, type MeshData, type Vec3 } from '../geometry/mesh';
import { fbm, mix, rng, smooth, type FruitDef } from './common';

// ぶどう（一房）：重ならないように配置した粒の集まり。体積は全粒の合計で、
// 切断平面の両側の「切れていない粒」と「切れた粒の部分」をすべて足し合わせる。枝は体積から除外する。

export interface Berry {
  shape: StarShape;
  center: Vec3;
  /** 外接半径（配置の重なり判定用） */
  bound: number;
  /** 粒の上端（枝が付く点） */
  top: Vec3;
}

export function makeBerries(): Berry[] {
  const r = rng(5);
  const berries: Berry[] = [];
  const yTop = 0.78, yBot = -1.0;
  const rmax = (y: number) => 0.14 + 0.62 * ((y - yBot) / (yTop - yBot)) ** 0.8;
  for (let tries = 0; tries < 40000 && berries.length < 34; tries++) {
    const y = yBot + (yTop - yBot) * r() ** 0.85;
    const R = rmax(y) * Math.sqrt(0.25 + 0.75 * r());
    const a = r() * Math.PI * 2;
    const c: Vec3 = [R * Math.cos(a), y, R * Math.sin(a) * 0.9];
    const sz = 0.165 + r() * 0.03;
    const ry = sz * 1.1;
    const bound = ry;
    if (!berries.every((b) => Math.hypot(b.center[0] - c[0], b.center[1] - c[1], b.center[2] - c[2]) > (b.bound + bound) * 1.02)) continue;
    // 粒は軸（中心）の方へ少し傾く
    const tilt = Math.atan2(R, 1.2);
    const m = scale3(sz, ry, sz);
    const rot = mul3(rotZ3(-tilt * Math.cos(a)), rotX3(tilt * Math.sin(a)));
    const shape = new StarShape((_dx, dy) => 1 + 0.03 * dy, mul3(rot, m), c);
    berries.push({ shape, center: c, bound, top: shape.surfacePoint(0, 1, 0) });
  }
  return berries;
}

export const grapes: FruitDef = {
  id: 'grapes',
  name: 'ぶどう（一房）',
  skin: {
    roughness: 0.45,
    sheen: 0.6,
    sheenColor: 0x8899cc,
    clearcoat: 0.3,
    clearcoatRoughness: 0.5,
    bumpScale: 0.05,
    glsl: /* glsl */ `
      void skinDetail(vec3 p, inout vec3 col, out float bump) {
        float b = fbm(p * 18.0);
        col = mix(col, vec3(0.42, 0.4, 0.58), 0.22 * smoothstep(0.4, 0.8, b));
        bump = b * 0.2;
      }`,
  },
  extrasRoughness: 0.85,
  capRoughness: 0.3,
  glow: 0x9a3cff,
  palette: [0xb04cff, 0xe0a0ff, 0x7a2cff, 0x9cff8a],
  initialRotation: [0.12, 0.45, 0.02],
  sound: 'pop',
  build(q = 1) {
    const berries = makeBerries();
    const meshes: MeshData[] = [];
    const r = rng(9);
    for (const b of berries) {
      const m = b.shape.build(28 * q, 18 * q);
      const tone = r();
      paint(m, (p) => {
        const q = b.shape.toShapeSpace(p[0], p[1], p[2]);
        let c: Vec3 = mix([0.26, 0.06, 0.28], [0.17, 0.04, 0.22], tone);
        c = mix(c, [0.36, 0.12, 0.34], smooth(0.2, 0.95, q[1]) * 0.4);
        c = mix(c, [0.3, 0.22, 0.12], smooth(0.9, 0.99, q[1]));
        return c;
      });
      meshes.push(m);
    }
    const body = mergeMeshes(meshes);

    // 枝：中心の軸から各粒の上端へ
    const stems: MeshData[] = [];
    const axisAt = (y: number): Vec3 => [0.04 * Math.sin(y * 2), y, 0];
    stems.push(buildTube((t) => axisAt(1.28 - 2.05 * t), (t) => 0.05 - 0.03 * t, 14, 8));
    stems.push(buildTube((t) => [0.04 * Math.sin(2.5) + 0.12 * t, 1.25 + 0.05 * t, 0.02 * t], () => 0.035, 6, 8));
    for (const b of berries) {
      const ay = Math.min(1.1, b.top[1] + 0.16);
      const a = axisAt(ay);
      const t0 = b.top;
      stems.push(
        buildTube(
          (t) => [a[0] + (t0[0] - a[0]) * t, a[1] + (t0[1] - a[1]) * t + 0.06 * Math.sin(t * Math.PI), a[2] + (t0[2] - a[2]) * t],
          (t) => 0.018 - 0.004 * t,
          6,
          6,
        ),
      );
    }
    const extras = mergeMeshes(stems);
    paint(extras, (p) => mix([0.42, 0.42, 0.18], [0.36, 0.28, 0.14], fbm(p[0] * 5, p[1] * 5, p[2] * 5)));

    const flesh = (x: number, y: number, z: number): Vec3 => {
      let best = 2;
      let q: Vec3 = [0, 0, 0];
      for (const b of berries) {
        const dx = x - b.center[0], dy = y - b.center[1], dz = z - b.center[2];
        if (dx * dx + dy * dy + dz * dz > b.bound * b.bound * 1.1) continue;
        const d = b.shape.depth(x, y, z);
        if (d < best) {
          best = d;
          q = b.shape.toShapeSpace(x, y, z);
        }
      }
      const s = best;
      if (s > 0.94) return [0.3, 0.06, 0.3];
      if (s > 0.88) return mix([0.62, 0.3, 0.55], [0.4, 0.1, 0.38], smooth(0.88, 0.94, s));
      let c: Vec3 = mix([0.8, 0.9, 0.6], [0.7, 0.84, 0.5], smooth(0.2, 0.88, s));
      c = mix(c, [0.86, 0.94, 0.7], 0.25 * fbm(x * 20, y * 20, z * 20));
      // 小さな種が 2 つ
      for (const sx of [-0.22, 0.22]) {
        const e = ((q[0] - sx) / 0.13) ** 2 + ((q[1] + 0.05) / 0.26) ** 2 + (q[2] / 0.13) ** 2;
        if (e < 1) c = e > 0.6 ? [0.62, 0.48, 0.24] : [0.75, 0.6, 0.32];
      }
      return c;
    };
    return { body, extras, flesh, extrasCapColor: [0.7, 0.72, 0.45] };
  },
};
