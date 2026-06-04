export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic, stateless integer hash mixer (SplitMix32 / Weyl style).
 * Combines any number of integer inputs into one uint32 with good avalanche.
 *
 * This is the foundation of the terrain seed model: a fixed `asteroidSeed`
 * mixed with a varying `surfaceSeed` and a per-layer index yields independent,
 * reproducible sub-seeds. Changing `surfaceSeed` reshuffles every layer while
 * the asteroid (which never includes `surfaceSeed`) stays bit-for-bit identical.
 *
 *   const layerSeed = deriveSeed(asteroidSeed, surfaceSeed, layerIndex);
 */
export function deriveSeed(...ints: number[]): number {
  // Start from a non-zero constant so deriveSeed() of all-zeros is still mixed.
  let h = 0x9e3779b9 | 0;
  for (let k = 0; k < ints.length; k++) {
    // Fold the input (truncate to 32 bits) into the accumulator.
    let x = (ints[k]! | 0) ^ 0x85ebca6b;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    x ^= x >>> 16;
    h = Math.imul(h ^ x, 0x6d2b79f5);
    h = (h << 13) | (h >>> 19); // rotate-left 13 for extra diffusion
  }
  // Final avalanche.
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
