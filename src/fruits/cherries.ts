import { StarShape, buildTube, mergeMeshes, mul3, paint, rotY3, rotZ3, scale3, type MeshData, type Vec3 } from '../geometry/mesh';
import { fbm, mix, smooth, type FruitDef } from './common';

// さくらんぼ（2つ連結）：大きさの違う2粒が、上でつながった柄にぶら下がる。
// 体積は2粒の合計（種を含む）。柄は体積から除外する。2粒は重ならないように配置する。

export function cherryShapes(): StarShape[] {
  const make = (size: number, center: Vec3, yaw: number, roll: number) =>
    new StarShape(
      (dx, dy, dz) => {
        const th = Math.acos(Math.max(-1, Math.min(1, dy)));
        const ph = Math.atan2(dz, dx);
        let r = 1;
        r -= 0.16 * Math.exp(-((th / 0.36) ** 2)); // 柄の付け根のくぼみ
        r -= 0.035 * Math.exp(-((Math.abs(Math.atan2(Math.sin(ph), Math.cos(ph))) / 0.2) ** 2)) * Math.sin(th); // 縫合線
        r += 0.04 * dx * Math.sin(th); // 少しハート形
        return r;
      },
      mul3(rotY3(yaw), mul3(rotZ3(roll), scale3(size * 1.04, size * 0.92, size))),
      center,
    );
  return [make(0.43, [-0.42, -0.42, 0.02], 0.4, 0.18), make(0.35, [0.44, -0.55, -0.06], -0.5, -0.22)];
}

export const cherries: FruitDef = {
  id: 'cherries',
  name: 'さくらんぼ（2つ連結）',
  skin: {
    roughness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    bumpScale: 0.04,
    glsl: /* glsl */ `
      void skinDetail(vec3 p, inout vec3 col, out float bump) {
        float n = fbm(p * 9.0);
        vec2 w = worley(p * 30.0);
        float dotm = 1.0 - smoothstep(0.03, 0.08, w.x);
        col *= 0.9 + 0.2 * n;
        col = mix(col, vec3(0.95, 0.65, 0.45), dotm * 0.25);
        bump = n * 0.2;
      }`,
  },
  extrasRoughness: 0.6,
  capRoughness: 0.25,
  glow: 0xff3a6a,
  palette: [0xff2a4a, 0xff8aa0, 0xffe0e6, 0x6ab84a],
  initialRotation: [0.15, 0.7, 0.04],
  sound: 'pop',
  build(q = 1) {
    const shapes = cherryShapes();
    const tones: [Vec3, Vec3][] = [
      [[0.62, 0.02, 0.06], [0.38, 0.0, 0.04]],
      [[0.78, 0.06, 0.08], [0.5, 0.01, 0.05]],
    ];
    const bodies: MeshData[] = shapes.map((sh, k) => {
      const m = sh.build(96 * q, 64 * q);
      paint(m, (p) => {
        const qq = sh.toShapeSpace(p[0], p[1], p[2]);
        const l = Math.hypot(qq[0], qq[1], qq[2]);
        let c = mix(tones[k][0], tones[k][1], smooth(0.4, -0.8, qq[1] / l));
        c = mix(c, [0.9, 0.3, 0.12], smooth(0.75, 0.97, qq[1] / l) * 0.5); // 付け根は明るい
        return c;
      });
      return m;
    });
    const body = mergeMeshes(bodies);

    // 柄：それぞれの付け根から上で一つにつながる
    const join: Vec3 = [0.08, 0.95, -0.02];
    const stems = shapes.map((sh, k) => {
      const a = sh.surfacePoint(0, 1, 0);
      const bend = k === 0 ? -0.22 : 0.18;
      return buildTube(
        (t) => {
          const x = a[0] + (join[0] - a[0]) * t + bend * Math.sin(Math.PI * t);
          const y = a[1] - 0.05 + (join[1] - a[1] + 0.05) * t;
          const z = a[2] + (join[2] - a[2]) * t;
          return [x, y, z];
        },
        (t) => 0.024 - 0.004 * t,
        16,
        8,
      );
    });
    stems.push(buildTube((t) => [join[0] - 0.02 + 0.06 * t, join[1] - 0.03 + 0.12 * t, join[2]], () => 0.035, 6, 8));
    const extras = mergeMeshes(stems);
    paint(extras, (p) => mix([0.35, 0.55, 0.18], [0.45, 0.35, 0.15], smooth(0.75, 1.05, p[1])));

    const flesh = (x: number, y: number, z: number): Vec3 => {
      let s = 2;
      let qq: Vec3 = [0, 0, 0];
      for (const sh of shapes) {
        const d = sh.depth(x, y, z);
        if (d < s) {
          s = d;
          qq = sh.toShapeSpace(x, y, z);
        }
      }
      if (s > 0.975) return [0.45, 0.0, 0.05];
      // 種（中心のやや上）
      const se = (qq[0] / 0.3) ** 2 + ((qq[1] - 0.04) / 0.36) ** 2 + (qq[2] / 0.27) ** 2;
      if (se < 1) return se > 0.7 ? [0.86, 0.74, 0.55] : mix([0.95, 0.88, 0.7], [0.88, 0.78, 0.58], fbm(x * 40, y * 40, z * 40));
      let c: Vec3 = mix([0.86, 0.14, 0.18], [0.62, 0.03, 0.1], smooth(0.4, 0.97, s));
      c = mix(c, [0.95, 0.35, 0.35], 0.3 * smooth(0.5, 0.8, fbm(x * 14, y * 30, z * 14)));
      if (se < 1.4) c = mix(c, [0.95, 0.5, 0.45], smooth(1.4, 1.0, se) * 0.5);
      return c;
    };
    return { body, extras, flesh, extrasCapColor: [0.75, 0.82, 0.55] };
  },
};
