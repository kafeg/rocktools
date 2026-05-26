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
  height: 0.08,
  width: 0.15,
  length: 0.8,
  irregularity: 0.3,
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
  const numSegments = Math.max(8, Math.floor(angularLength * 30));
  const perpDir = vecCross(axis, startDir);

  for (let i = 0; i <= numSegments; i++) {
    const frac = i / numSegments;
    const angle = frac * angularLength;

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const point: [number, number, number] = [
      (startDir[0] * cosA + perpDir[0] * sinA) * meshRadius,
      (startDir[1] * cosA + perpDir[1] * sinA) * meshRadius,
      (startDir[2] * cosA + perpDir[2] * sinA) * meshRadius,
    ];

    const tangent = vecNormalize([
      -startDir[0] * sinA + perpDir[0] * cosA,
      -startDir[1] * sinA + perpDir[1] * cosA,
      -startDir[2] * sinA + perpDir[2] * cosA,
    ]);

    // Height variation along the ridge: taper at ends + noise
    const endTaper = Math.sin(frac * Math.PI);
    const heightNoise = 1.0 + irregularity * (rand() * 2 - 1) * 0.8;
    const widthNoise = 1.0 + irregularity * (rand() * 2 - 1) * 0.4;

    segments.push({
      point,
      tangent,
      height: baseHeight * endTaper * heightNoise,
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
      const angularLength = p.length * Math.PI * (0.5 + rand() * 0.5);

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

      let totalDisplacement = 0;

      for (const segments of allRidges) {
        const result = distToRidgePath([vx, vy, vz], segments);
        if (!result) continue;

        const seg = segments[result.segIdx]!;
        const nextSeg = segments[Math.min(result.segIdx + 1, segments.length - 1)]!;

        const localHalfWidth = (seg.halfWidth + nextSeg.halfWidth) * 0.5;
        const localHeight = (seg.height + nextSeg.height) * 0.5;

        const t = result.dist / localHalfWidth;
        if (t >= 1.0) continue;

        // Asymmetric profile: steeper on one side, gentler on the other
        const profile = Math.cos(t * Math.PI * 0.5);
        const asymmetry = 0.7 + 0.3 * profile;
        totalDisplacement += localHeight * profile * asymmetry;
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
