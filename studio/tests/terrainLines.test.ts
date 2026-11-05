import { describe, it, expect } from "vitest";
import { createField, applyLines } from "../client/src/utils/terrain";

/** Closest approach between two segments — the test's own, independent of the source. */
function segDist(a: number[], b: number[], c: number[], d: number[]): number {
  const ptSeg = (p: number[], q: number[], r: number[]) => {
    const vx = r[0]! - q[0]!, vz = r[1]! - q[1]!;
    const l2 = vx * vx + vz * vz || 1e-9;
    const u = Math.min(1, Math.max(0, ((p[0]! - q[0]!) * vx + (p[1]! - q[1]!) * vz) / l2));
    return Math.hypot(p[0]! - (q[0]! + u * vx), p[1]! - (q[1]! + u * vz));
  };
  const o = (p: number[], q: number[], r: number[]) =>
    Math.sign((q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!));
  if (o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b)) return 0;
  return Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b));
}

function minGap(lines: Array<Array<[number, number]>>): number {
  let best = Infinity;
  for (let a = 0; a < lines.length; a++) {
    for (let b = a + 1; b < lines.length; b++) {
      for (let i = 0; i < lines[a]!.length - 1; i++) {
        for (let j = 0; j < lines[b]!.length - 1; j++) {
          const d = segDist(lines[a]![i]!, lines[a]![i + 1]!, lines[b]![j]!, lines[b]![j + 1]!);
          if (d < best) best = d;
        }
      }
    }
  }
  return best;
}

const PARAMS = {
  count: 4, amount: 0.05, width: 0.03, length: 0.7, jaggedness: 0.35, kind: "ridge" as const,
};

describe("applyLines keeps its lines apart", () => {
  // A ridge crossing another ridge in an X is the most synthetic-looking thing a
  // patch can carry, so the placer re-rolls a line that runs into one already down.
  it("never lets two ridges on one patch cross", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const field = createField(96, 100);
      const lines = applyLines(field, PARAMS, seed);
      if (lines.length < 2) continue;
      expect(minGap(lines)).toBeGreaterThan(0);
    }
  });

  it("honours an explicit minimum separation", () => {
    const field = createField(96, 100);
    const gapFrac = 0.08;
    const lines = applyLines(field, { ...PARAMS, minSeparation: gapFrac }, 7);
    if (lines.length >= 2) expect(minGap(lines)).toBeGreaterThanOrEqual(gapFrac * 100 - 1e-6);
  });

  it("keeps fissures off the ridges they are handed", () => {
    const field = createField(96, 100);
    const ridges = applyLines(field, PARAMS, 11);
    const fissures = applyLines(field, { ...PARAMS, kind: "fissure" }, 12, ridges);
    for (const f of fissures) for (const r of ridges) {
      expect(minGap([f, r])).toBeGreaterThan(0);
    }
  });

  it("drops a line rather than forcing a crossing", () => {
    // A crowded patch: many long wide lines cannot all fit apart, so the placer
    // must return FEWER than asked instead of overlapping them.
    const field = createField(96, 100);
    const lines = applyLines(field, { ...PARAMS, count: 30, length: 1.2, width: 0.06 }, 3);
    expect(lines.length).toBeLessThan(30);
    if (lines.length >= 2) expect(minGap(lines)).toBeGreaterThan(0);
  });
});
