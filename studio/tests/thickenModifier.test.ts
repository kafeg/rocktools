import { describe, it, expect } from "vitest";
import { computeVertexNormals, type MeshData } from "../client/src/utils/meshModifiers";
import { thickenModifier } from "../client/src/utils/thickenModifier";

/**
 * A sphere of latitude/longitude quads carrying one thin standing blade around its equator —
 * the shape `mesh:thicken` exists to remove.
 *
 * The blade is a band of latitude rings squeezed together and lifted: squeezing gives its flanks
 * vertices whose normals point sideways, which is what a ray cast into the rock needs in order to
 * measure a blade at all, and lifting makes it stand off the body.
 */
function sphereWithFin(rings = 32, segments = 48, finHeight = 0.5, band = 4): MeshData {
  const mid = Math.floor(rings / 2);
  const phiMid = (mid / rings) * Math.PI;
  const smoothstep = (x: number) => x * x * (3 - 2 * x);
  const positions: number[] = [];
  for (let r = 0; r <= rings; r++) {
    let phi = (r / rings) * Math.PI;
    let scale = 1;
    const offset = Math.abs(r - mid);
    if (finHeight > 0 && offset <= band) {
      const u = smoothstep(offset / band);
      // Latitude squeeze: hard at the crest, back to 1 where the band ends, so the blade's two
      // faces end up nearly back to back without a step at its foot.
      phi = phiMid + (phi - phiMid) * (0.02 + 0.98 * u * u * u);
      scale = 1 + finHeight * (1 - u);
    }
    for (let s = 0; s < segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      positions.push(
        Math.sin(phi) * Math.cos(theta) * scale,
        Math.cos(phi) * scale,
        Math.sin(phi) * Math.sin(theta) * scale,
      );
    }
  }
  const indices: number[] = [];
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * segments + s;
      const b = r * segments + ((s + 1) % segments);
      const c = (r + 1) * segments + s;
      const d = (r + 1) * segments + ((s + 1) % segments);
      indices.push(a, b, c, b, d, c);
    }
  }
  const pos = new Float64Array(positions);
  const idx = new Uint32Array(indices);
  const vertexCount = pos.length / 3;
  return {
    positions: pos,
    normals: computeVertexNormals(pos, idx, vertexCount),
    indices: idx,
    vertexCount,
    triCount: idx.length / 3,
  };
}

/** Share of vertices with less than `threshold` of the radius of mesh behind them. */
function thinShare(mesh: MeshData, threshold: number): number {
  let radius = 0;
  for (let v = 0; v < mesh.vertexCount; v++) {
    radius = Math.max(radius, Math.hypot(mesh.positions[v * 3]!, mesh.positions[v * 3 + 1]!, mesh.positions[v * 3 + 2]!));
  }
  const reach = radius * threshold;
  const eps = radius * 1e-4;
  let thin = 0;
  for (let v = 0; v < mesh.vertexCount; v++) {
    let nx = mesh.normals[v * 3]!, ny = mesh.normals[v * 3 + 1]!, nz = mesh.normals[v * 3 + 2]!;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const ox = mesh.positions[v * 3]! - nx * eps;
    const oy = mesh.positions[v * 3 + 1]! - ny * eps;
    const oz = mesh.positions[v * 3 + 2]! - nz * eps;
    // Brute-force nearest hit along the inverted normal (Möller–Trumbore, double-sided).
    for (let t = 0; t < mesh.triCount; t++) {
      const i0 = mesh.indices[t * 3]!, i1 = mesh.indices[t * 3 + 1]!, i2 = mesh.indices[t * 3 + 2]!;
      if (i0 === v || i1 === v || i2 === v) continue;
      const ax = mesh.positions[i0 * 3]!, ay = mesh.positions[i0 * 3 + 1]!, az = mesh.positions[i0 * 3 + 2]!;
      const e1x = mesh.positions[i1 * 3]! - ax, e1y = mesh.positions[i1 * 3 + 1]! - ay, e1z = mesh.positions[i1 * 3 + 2]! - az;
      const e2x = mesh.positions[i2 * 3]! - ax, e2y = mesh.positions[i2 * 3 + 1]! - ay, e2z = mesh.positions[i2 * 3 + 2]! - az;
      const px = -ny * e2z + nz * e2y, py = -nz * e2x + nx * e2z, pz = -nx * e2y + ny * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-18) continue;
      const inv = 1 / det;
      const tx = ox - ax, ty = oy - ay, tz = oz - az;
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const vv = (-nx * qx - ny * qy - nz * qz) * inv;
      if (vv < 0 || u + vv > 1) continue;
      const hit = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (hit > 0 && hit < reach) { thin++; break; }
    }
  }
  return thin / mesh.vertexCount;
}

describe("mesh:thicken", () => {
  const params = { threshold: 0.05, strength: 1, spread: 4, smoothPasses: 8, referencePasses: 96, rounds: 8, grainPasses: 3 };

  it("removes a standing fin and leaves the rest of the body where it was", () => {
    const mesh = sphereWithFin();
    const before = thinShare(mesh, 0.03);
    expect(before).toBeGreaterThan(0.02);

    const out = thickenModifier.apply(mesh, params);
    expect(thinShare(out, 0.03)).toBeLessThan(before / 3);

    // The repair is local: a vertex a long way from the fin must not have moved.
    let radius = 0;
    for (let v = 0; v < mesh.vertexCount; v++) {
      radius = Math.max(radius, Math.hypot(mesh.positions[v * 3]!, mesh.positions[v * 3 + 1]!, mesh.positions[v * 3 + 2]!));
    }
    const pole = 0; // the first vertex sits on the +Y pole, as far from the equatorial fin as it gets
    const moved = Math.hypot(
      out.positions[pole * 3]! - mesh.positions[pole * 3]!,
      out.positions[pole * 3 + 1]! - mesh.positions[pole * 3 + 1]!,
      out.positions[pole * 3 + 2]! - mesh.positions[pole * 3 + 2]!,
    );
    expect(moved).toBeLessThan(radius * 0.001);
  });

  it("is deterministic and does nothing at zero strength", () => {
    const mesh = sphereWithFin();
    const a = thickenModifier.apply(mesh, params);
    const b = thickenModifier.apply(mesh, params);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(thickenModifier.apply(mesh, { ...params, strength: 0 }).positions).toBe(mesh.positions);
  });

  it("leaves a body that has no thin surface alone", () => {
    const mesh = sphereWithFin(32, 48, 0);
    const out = thickenModifier.apply(mesh, params);
    expect(out.positions).toBe(mesh.positions);
  });
});
