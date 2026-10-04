import type { MeshData, Vec3 } from '../geometry/mesh';

export type Sound = 'crisp' | 'soft' | 'juicy' | 'pop';

export interface FruitModel {
  /** 体積の対象（皮・芯を含む果実本体）。閉じたメッシュ */
  body: MeshData;
  /** 体積から除外する部分（枝・ヘタ）。表示と切断はするが体積には数えない */
  extras: MeshData | null;
  /** ローカル座標の点の断面色（sRGB 0..1）。断面テクスチャの生成に使う */
  flesh: (x: number, y: number, z: number) => Vec3;
  /** 枝・ヘタの断面色 */
  extrasCapColor: Vec3;
}

export interface FruitDef {
  id: string;
  name: string;
  /** q はメッシュの細かさの倍率（検証用。ゲームでは 1） */
  build: (q?: number) => FruitModel;
  skin: {
    roughness: number;
    clearcoat?: number;
    clearcoatRoughness?: number;
    sheen?: number;
    sheenColor?: number;
    /** 凹凸の強さ */
    bumpScale: number;
    /**
     * 皮の細かな模様（GLSL）。次の関数を定義する:
     * void skinDetail(vec3 p, inout vec3 col, out float bump)
     */
    glsl: string;
  };
  extrasRoughness: number;
  /** 断面のツヤ（小さいほど濡れて見える） */
  capRoughness: number;
  /** 断面が光るときの色 */
  glow: number;
  /** 成功時の祝福の粒の色 */
  palette: number[];
  /** 初期姿勢（XYZ オイラー角, ラジアン） */
  initialRotation: Vec3;
  sound: Sound;
}

// ---- 決定的な乱数とノイズ（毎回同じ形・模様になるように） ----

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x: number, y: number, z: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}

export function fbm(x: number, y: number, z: number, oct = 3): number {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f, z * f);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scaleC = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const hex = (h: number): Vec3 => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

/** 楕円体の内側判定量（1 未満なら内側）。軸は ex/ey/ez（単位ベクトル）、半径 a/b/c */
export function ellipsoid(
  px: number, py: number, pz: number,
  cx: number, cy: number, cz: number,
  ex: Vec3, ey: Vec3, ez: Vec3,
  a: number, b: number, c: number,
): number {
  const dx = px - cx, dy = py - cy, dz = pz - cz;
  const x = (dx * ex[0] + dy * ex[1] + dz * ex[2]) / a;
  const y = (dx * ey[0] + dy * ey[1] + dz * ey[2]) / b;
  const z = (dx * ez[0] + dy * ez[1] + dz * ez[2]) / c;
  return x * x + y * y + z * z;
}

/** 種などを描くときの、輪郭に少し明るい縁を付けた色 */
export function seedColor(e: number, base: Vec3, rim: Vec3): Vec3 {
  return mix(base, rim, smooth(0.55, 1.0, e));
}
