import { describe, expect, it } from 'vitest';
import { cutMesh, type PlaneDef } from '../src/geometry/cut';
import { signedVolume, type MeshData, type Vec3 } from '../src/geometry/mesh';
import { rng } from '../src/fruits/common';
import { FRUITS } from '../src/fruits';
import { makeBerries } from '../src/fruits/grapes';
import { closedVolume } from './helpers';

function bounds(mesh: MeshData): { c: Vec3; r: number } {
  const p = mesh.positions;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], p[i + k]);
    max[k] = Math.max(max[k], p[i + k]);
  }
  const c: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  return { c, r: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 };
}

/** 果物を通る平面（中心付近を通るものが多くなるように） */
function planes(mesh: MeshData, seed: number, count: number): PlaneDef[] {
  const { c, r } = bounds(mesh);
  const rnd = rng(seed);
  const out: PlaneDef[] = [];
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const n: Vec3 = [s * Math.cos(a), u, s * Math.sin(a)];
    const off = (rnd() * 2 - 1) * r * 0.5;
    out.push({ n, c: -(n[0] * c[0] + n[1] * c[1] + n[2] * c[2]) + off });
  }
  return out;
}

describe.each(FRUITS.map((f) => [f.name, f] as const))('%s', (_name, def) => {
  const model = def.build(1);
  const V = signedVolume(model.body);

  it('体積が正で、切断の前後で保存され、断面がかけらを閉じる', () => {
    expect(V).toBeGreaterThan(0);
    let worstCons = 0, worstCap = 0;
    for (const pl of planes(model.body, 3, 40)) {
      const res = cutMesh(model.body, pl);
      worstCons = Math.max(worstCons, Math.abs(res.pos.volume + res.neg.volume - V) / V);
      worstCap = Math.max(worstCap, Math.abs(closedVolume(res.pos) - res.pos.volume) / V, Math.abs(closedVolume(res.neg) - res.neg.volume) / V);
    }
    // 保存誤差・断面の閉じ具合とも 0.001% 未満
    expect(worstCons * 100).toBeLessThan(1e-3);
    expect(worstCap * 100).toBeLessThan(1e-3);
  });

  it('メッシュを2倍細かくしても体積比の差は 0.1% 未満（1%判定に十分な精度）', () => {
    const fine = def.build(2);
    const Vf = signedVolume(fine.body);
    let worst = 0;
    for (const pl of planes(model.body, 17, 30)) {
      const a = (cutMesh(model.body, pl, false).pos.volume / V) * 100;
      const b = (cutMesh(fine.body, pl, false).pos.volume / Vf) * 100;
      worst = Math.max(worst, Math.abs(a - b));
    }
    console.log(`${def.name}: 解像度による体積比の最大差 ${worst.toFixed(4)}%`);
    expect(worst).toBeLessThan(0.1);
  });
});

describe('ぶどう：切れていない粒も体積に含まれる', () => {
  const def = FRUITS.find((f) => f.id === 'grapes')!;
  const model = def.build(1);
  const V = signedVolume(model.body);
  const berries = makeBerries().map((b) => b.shape.build(28, 18));

  it('房の体積 = 各粒の体積の合計', () => {
    const sum = berries.reduce((s, m) => s + signedVolume(m), 0);
    expect(Math.abs(sum - V) / V).toBeLessThan(1e-9);
    expect(berries.length).toBeGreaterThanOrEqual(24);
  });

  it('房ごと切った片側の体積 = 粒ごとに切った片側の合計（切れていない粒を含む）', () => {
    for (const pl of planes(model.body, 29, 20)) {
      const bunch = cutMesh(model.body, pl, false);
      let pos = 0, untouchedPos = 0, untouchedNeg = 0, cutCount = 0;
      for (const m of berries) {
        const r = cutMesh(m, pl, false);
        pos += r.pos.volume;
        if (r.neg.empty) untouchedPos++;
        else if (r.pos.empty) untouchedNeg++;
        else cutCount++;
      }
      expect(Math.abs(bunch.pos.volume - pos) / V).toBeLessThan(1e-9);
      // 平面が房を通るとき、切れていない粒が両側に残る（それらも合計に入っている）
      expect(untouchedPos + untouchedNeg + cutCount).toBe(berries.length);
    }
  });
});

describe('複数の物体からなる果物は重ならない（合計体積が二重に数えられない）', () => {
  it('バナナ5本：どのバナナの表面も、ほかのバナナの外側にある', async () => {
    const { bunchLayout, bananaDepthLocal } = await import('../src/fruits/banana');
    const layout = bunchLayout();
    const model = FRUITS.find((f) => f.id === 'banana')!.build(1);
    const p = model.body.positions;
    const per = p.length / 3 / layout.length;
    let minDepth = Infinity;
    for (let i = 0; i < p.length / 3; i++) {
      const own = Math.floor(i / per);
      layout.forEach((L, k) => {
        if (k === own) return;
        const lp = L.toLocal(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
        minDepth = Math.min(minDepth, bananaDepthLocal(lp[0], lp[1], lp[2]));
      });
    }
    console.log(`バナナ：ほかのバナナに対する最小の正規化深さ ${minDepth.toFixed(3)}（1 より大きければ重なりなし）`);
    expect(minDepth).toBeGreaterThan(1.0);
  });

  it('さくらんぼ2粒：互いの外側にある', async () => {
    const { cherryShapes } = await import('../src/fruits/cherries');
    const [a, b] = cherryShapes();
    const ma = a.build(96, 64);
    let minDepth = Infinity;
    for (let i = 0; i < ma.positions.length; i += 3) minDepth = Math.min(minDepth, b.depth(ma.positions[i], ma.positions[i + 1], ma.positions[i + 2]));
    console.log(`さくらんぼ：最小の正規化深さ ${minDepth.toFixed(3)}`);
    expect(minDepth).toBeGreaterThan(1.0);
  });
});
