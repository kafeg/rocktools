/**
 * Seeded 2D simplex noise + fractal helpers (fbm, ridged, domain warp).
 *
 * Pure TS, no dependencies. Every noise field is keyed by an integer seed so
 * generation is fully deterministic and reproducible: the same (seed, x, y)
 * always yields the same value. This is what lets a fixed asteroid produce
 * unlimited but reproducible surface variants — vary the seed, not the math.
 */

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const GRAD2: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

/** Build a 512-entry permutation table from a seed (Fisher–Yates). */
function buildPerm(seed: number): Uint8Array {
  const p = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  let s = (seed | 0) ^ 0x1234567;
  for (let i = 255; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    const tmp = base[i]!;
    base[i] = base[j]!;
    base[j] = tmp;
  }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255]!;
  return p;
}

/** A reusable 2D noise sampler bound to a seed. Returns values in ~[-1, 1]. */
export type Noise2D = (x: number, y: number) => number;

export function makeNoise2D(seed: number): Noise2D {
  const perm = buildPerm(seed);
  return (x: number, y: number): number => {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      t0 *= t0;
      const g = GRAD2[perm[ii + perm[jj]!]! % 8]!;
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      t1 *= t1;
      const g = GRAD2[perm[ii + i1 + perm[jj + j1]!]! % 8]!;
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      t2 *= t2;
      const g = GRAD2[perm[ii + 1 + perm[jj + 1]!]! % 8]!;
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  };
}

export interface FbmOptions {
  octaves: number;
  /** Frequency multiplier per octave (typ. ~2). */
  lacunarity: number;
  /** Amplitude multiplier per octave (typ. ~0.5). */
  persistence: number;
  /** Base frequency (world units → noise units). */
  frequency: number;
}

/** Standard fractal Brownian motion. Output roughly in [-1, 1]. */
export function fbm(noise: Noise2D, x: number, y: number, opts: FbmOptions): number {
  let value = 0;
  let amp = 1;
  let freq = opts.frequency;
  let norm = 0;
  for (let o = 0; o < opts.octaves; o++) {
    value += amp * noise(x * freq, y * freq);
    norm += amp;
    freq *= opts.lacunarity;
    amp *= opts.persistence;
  }
  return norm > 0 ? value / norm : 0;
}

/** Ridged multifractal — sharp crests, good for mountains/escarpments. [0, 1]. */
export function ridged(noise: Noise2D, x: number, y: number, opts: FbmOptions): number {
  let value = 0;
  let amp = 1;
  let freq = opts.frequency;
  let norm = 0;
  for (let o = 0; o < opts.octaves; o++) {
    const n = 1 - Math.abs(noise(x * freq, y * freq));
    value += amp * n * n;
    norm += amp;
    freq *= opts.lacunarity;
    amp *= opts.persistence;
  }
  return norm > 0 ? value / norm : 0;
}

/**
 * Domain-warped fbm: f(p + warp * fbm(p)). Produces organic, eroded, swirled
 * terrain instead of bland noise. The warp offset uses two independent noise
 * channels so x and y are displaced separately.
 */
export function warpedFbm(
  noiseBase: Noise2D,
  noiseWarpX: Noise2D,
  noiseWarpY: Noise2D,
  x: number,
  y: number,
  opts: FbmOptions,
  warp: number,
): number {
  if (warp <= 0) return fbm(noiseBase, x, y, opts);
  const wx = fbm(noiseWarpX, x, y, opts);
  const wy = fbm(noiseWarpY, x, y, opts);
  return fbm(noiseBase, x + warp * wx, y + warp * wy, opts);
}
