import {
  type MeshData,
  type MeshModifier,
  computeVertexNormals,
  getMeshRadius,
  ensureOccupancy,
  ensureFeatureData2,
} from "./meshModifiers";
import { mulberry32 } from "./prng";

export interface RidgeParams {
  count: number;
  height: number;
  width: number;
  length: number;
  irregularity: number;
  mode: string;
  avoidOverlap: boolean;
  seed: number;
}

const DEFAULTS: RidgeParams = {
  count: 4,
  height: 0.05,
  width: 0.1,
  length: 0.6,
  irregularity: 0.4,
  mode: "ridge",
  avoidOverlap: false,
  seed: 1,
};

interface RidgeSegment {
  point: [number, number, number];
  tangent: [number, number, number];
  height: number;
  halfWidth: number;
}

function vecNormalize(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len < 1e-10) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vecCross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vecDot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vecAdd(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vecScale(v: [number, number, number], s: number): [number, number, number] {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function generateRidgePath(
  startDir: [number, number, number],
  axis: [number, number, number],
  angularLength: number,
  meshRadius: number,
  baseHeight: number,
  baseHalfWidth: number,
  irregularity: number,
  rand: () => number,
): RidgeSegment[] {
  const segments: RidgeSegment[] = [];
  const numSegments = Math.max(10, Math.floor(angularLength * 45));
  const perpDir = vecCross(axis, startDir);

  // Meander: tilt the path off its great circle (toward ±axis) with a couple of
  // smooth harmonics, so ridges curve naturally instead of tracing a perfectly
  // straight "weld seam" across the body. Height/width also vary smoothly
  // (low-frequency sine) rather than per-segment white noise → no lumpiness.
  const m1Amp = (0.12 + 0.35 * irregularity);
  const m1Freq = 1 + Math.floor(rand() * 2);
  const m1Phase = rand() * Math.PI * 2;
  const m2Amp = (0.05 + 0.15 * irregularity);
  const m2Freq = 3 + Math.floor(rand() * 3);
  const m2Phase = rand() * Math.PI * 2;
  const hFreq = 1 + Math.floor(rand() * 2);
  const hPhase = rand() * Math.PI * 2;

  for (let i = 0; i <= numSegments; i++) {
    const frac = i / numSegments;
    const angle = frac * angularLength;

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const baseDir: [number, number, number] = [
      startDir[0] * cosA + perpDir[0] * sinA,
      startDir[1] * cosA + perpDir[1] * sinA,
      startDir[2] * cosA + perpDir[2] * sinA,
    ];

    const endTaper = Math.sin(frac * Math.PI);
    // Lateral wander (along the rotation axis = out of the great-circle plane),
    // tapered to 0 at the ends so the ridge starts/ends cleanly.
    const lateral = endTaper * (
      m1Amp * Math.sin(frac * Math.PI * m1Freq + m1Phase) +
      m2Amp * Math.sin(frac * Math.PI * m2Freq + m2Phase)
    );
    const dir = vecNormalize([
      baseDir[0] + axis[0] * lateral,
      baseDir[1] + axis[1] * lateral,
      baseDir[2] + axis[2] * lateral,
    ]);
    const point: [number, number, number] = [dir[0] * meshRadius, dir[1] * meshRadius, dir[2] * meshRadius];

    const tangent = vecNormalize([
      -startDir[0] * sinA + perpDir[0] * cosA,
      -startDir[1] * sinA + perpDir[1] * cosA,
      -startDir[2] * sinA + perpDir[2] * cosA,
    ]);

    const heightNoise = 1.0 + irregularity * 0.4 * Math.sin(frac * Math.PI * 2 * hFreq + hPhase);
    const widthNoise = 1.0 + irregularity * 0.25 * Math.sin(frac * Math.PI * 2 * hFreq + hPhase + 1.7);

    segments.push({
      point,
      tangent,
      // Smoothstep end taper for a rounded start/end instead of a hard cap.
      height: baseHeight * (endTaper * endTaper * (3 - 2 * endTaper)) * heightNoise,
      halfWidth: baseHalfWidth * (0.6 + 0.4 * endTaper) * widthNoise,
    });
  }

  return segments;
}

function distToRidgePath(
  vertex: [number, number, number],
  segments: RidgeSegment[],
): { dist: number; segIdx: number } | null {
  let bestDist = Infinity;
  let bestIdx = -1;

  for (let i = 0; i < segments.length - 1; i++) {
    const s0 = segments[i]!;
    const s1 = segments[i + 1]!;

    const sx = s1.point[0] - s0.point[0];
    const sy = s1.point[1] - s0.point[1];
    const sz = s1.point[2] - s0.point[2];
    const segLenSq = sx * sx + sy * sy + sz * sz;
    if (segLenSq < 1e-20) continue;

    const tx = vertex[0] - s0.point[0];
    const ty = vertex[1] - s0.point[1];
    const tz = vertex[2] - s0.point[2];
    let proj = (tx * sx + ty * sy + tz * sz) / segLenSq;
    proj = Math.max(0, Math.min(1, proj));

    const cx = s0.point[0] + sx * proj;
    const cy = s0.point[1] + sy * proj;
    const cz = s0.point[2] + sz * proj;
    const dx = vertex[0] - cx;
    const dy = vertex[1] - cy;
    const dz = vertex[2] - cz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  if (bestIdx < 0) return null;
  return { dist: bestDist, segIdx: bestIdx };
}

export const ridgeModifier: MeshModifier = {
  name: "mesh:ridges",

  apply(mesh: MeshData, rawParams: Record<string, number | string | boolean>): MeshData {
    const p: RidgeParams = { ...DEFAULTS };
    if (rawParams.count !== undefined) p.count = Number(rawParams.count);
    if (rawParams.height !== undefined) p.height = Number(rawParams.height);
    if (rawParams.width !== undefined) p.width = Number(rawParams.width);
    if (rawParams.length !== undefined) p.length = Number(rawParams.length);
    if (rawParams.irregularity !== undefined) p.irregularity = Number(rawParams.irregularity);
    if (rawParams.mode !== undefined) p.mode = String(rawParams.mode);
    if (rawParams.avoidOverlap !== undefined) p.avoidOverlap = rawParams.avoidOverlap === true || rawParams.avoidOverlap === "true";
    if (rawParams.seed !== undefined) p.seed = Number(rawParams.seed);

    if (p.count <= 0) return mesh;

    const rand = mulberry32(p.seed);
    const meshRadius = getMeshRadius(mesh);
    const sign = p.mode === "groove" ? -1 : 1;
    const occupancy = ensureOccupancy(mesh);
    const featureData2 = ensureFeatureData2(mesh);

    const allRidges: RidgeSegment[][] = [];
    for (let i = 0; i < p.count; i++) {
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      const axis = vecNormalize([
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
      ]);

      const randomDir: [number, number, number] = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
      const crossDir = vecCross(axis, randomDir);
      const startDir = vecNormalize(crossDir);
      // Shorter arcs → localized scarps instead of a band wrapping the whole body.
      const angularLength = p.length * Math.PI * (0.3 + rand() * 0.35);

      const baseHeight = p.height * meshRadius * sign;
      const baseHalfWidth = p.width * meshRadius * 0.5;

      const segments = generateRidgePath(
        startDir, axis, angularLength, meshRadius,
        baseHeight, baseHalfWidth, p.irregularity, rand,
      );
      allRidges.push(segments);
    }

    const newPositions = new Float64Array(mesh.positions);

    for (let vi = 0; vi < mesh.vertexCount; vi++) {
      const vx = newPositions[vi * 3]!;
      const vy = newPositions[vi * 3 + 1]!;
      const vz = newPositions[vi * 3 + 2]!;

      if (p.avoidOverlap && occupancy[vi]! > meshRadius * 0.01) continue;

      // Ridge paths live on a sphere of `meshRadius`, but real asteroid vertices
      // sit well inside it — measuring distance from the raw vertex makes the arc
      // float above the surface and only graze the highest bumps (uneven/abrupt
      // ridges). Project the vertex onto that sphere first, like mesh:fissures.
      const vr = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      const px = (vx / vr) * meshRadius;
      const py = (vy / vr) * meshRadius;
      const pz = (vz / vr) * meshRadius;

      let totalDisplacement = 0;

      for (const segments of allRidges) {
        const result = distToRidgePath([px, py, pz], segments);
        if (!result) continue;

        const seg = segments[result.segIdx]!;
        const nextSeg = segments[Math.min(result.segIdx + 1, segments.length - 1)]!;

        const localHalfWidth = (seg.halfWidth + nextSeg.halfWidth) * 0.5;
        const localHeight = (seg.height + nextSeg.height) * 0.5;

        if (localHalfWidth <= 1e-9) continue;
        const t = result.dist / localHalfWidth;
        if (t >= 1.0) continue;

        // Smoothstep cross-section: rounded crest with zero-slope toes so the
        // ridge blends into the surface (no sharp flanks / gorge-like edges).
        const e = 1 - t;
        const profile = e * e * (3 - 2 * e);
        totalDisplacement += localHeight * profile;
      }

      if (Math.abs(totalDisplacement) > 1e-10) {
        const nx = mesh.normals[vi * 3]!;
        const ny = mesh.normals[vi * 3 + 1]!;
        const nz = mesh.normals[vi * 3 + 2]!;
        newPositions[vi * 3] += nx * totalDisplacement;
        newPositions[vi * 3 + 1] += ny * totalDisplacement;
        newPositions[vi * 3 + 2] += nz * totalDisplacement;

        const absDisp = Math.abs(totalDisplacement);
        occupancy[vi] = Math.max(occupancy[vi]!, absDisp);
        const fi = vi * 4;
        featureData2[fi] = Math.max(featureData2[fi]!, Math.min(absDisp / (meshRadius * 0.03), 1.0));
      }
    }

    const normals = computeVertexNormals(newPositions, mesh.indices, mesh.vertexCount);
    return { ...mesh, positions: newPositions, normals, occupancy, featureData2 };
  },
};
