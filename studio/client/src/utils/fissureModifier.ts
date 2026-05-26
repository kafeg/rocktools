import {
  type MeshData,
  type MeshModifier,
  computeVertexNormals,
  getMeshRadius,
  ensureOccupancy,
  ensureFeatureData,
} from "./meshModifiers";
import { mulberry32 } from "./prng";

export interface FissureParams {
  count: number;
  depth: number;
  width: number;
  length: number;
  branching: number;
  jaggedness: number;
  avoidOverlap: boolean;
  seed: number;
}

const DEFAULTS: FissureParams = {
  count: 5,
  depth: 0.02,
  width: 0.04,
  length: 0.5,
  branching: 0.3,
  jaggedness: 0.4,
  avoidOverlap: true,
  seed: 1,
};

interface FissureSegment {
  start: [number, number, number];
  end: [number, number, number];
  depth: number;
  halfWidth: number;
}

function vecSub(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vecAdd(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vecScale(v: [number, number, number], s: number): [number, number, number] {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vecLen(v: [number, number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vecNormalize(v: [number, number, number]): [number, number, number] {
  const len = vecLen(v);
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

function distanceToSegment(
  point: [number, number, number],
  start: [number, number, number],
  end: [number, number, number],
): number {
  const seg = vecSub(end, start);
  const segLen = vecLen(seg);
  if (segLen < 1e-10) return vecLen(vecSub(point, start));

  const segDir: [number, number, number] = [seg[0] / segLen, seg[1] / segLen, seg[2] / segLen];
  const toPoint = vecSub(point, start);
  const proj = toPoint[0] * segDir[0] + toPoint[1] * segDir[1] + toPoint[2] * segDir[2];

  if (proj <= 0) return vecLen(toPoint);
  if (proj >= segLen) return vecLen(vecSub(point, end));

  const closest: [number, number, number] = [
    start[0] + segDir[0] * proj,
    start[1] + segDir[1] * proj,
    start[2] + segDir[2] * proj,
  ];
  return vecLen(vecSub(point, closest));
}

function generateFissurePath(
  startPoint: [number, number, number],
  meshRadius: number,
  length: number,
  jaggedness: number,
  branching: number,
  depth: number,
  halfWidth: number,
  rand: () => number,
): FissureSegment[] {
  const segments: FissureSegment[] = [];
  const segLength = meshRadius * 0.04;
  const numSegments = Math.max(3, Math.floor(length * meshRadius * Math.PI / segLength));

  const radialDir = vecNormalize(startPoint);
  const randomVec: [number, number, number] = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
  let tangent = vecNormalize(vecCross(radialDir, randomVec));

  let current = startPoint;

  for (let i = 0; i < numSegments; i++) {
    const jitter: [number, number, number] = [
      (rand() - 0.5) * jaggedness,
      (rand() - 0.5) * jaggedness,
      (rand() - 0.5) * jaggedness,
    ];
    tangent = vecNormalize(vecAdd(tangent, jitter));

    const currentRadial = vecNormalize(current);
    const radialComp = tangent[0] * currentRadial[0] + tangent[1] * currentRadial[1] + tangent[2] * currentRadial[2];
    tangent = vecNormalize([
      tangent[0] - radialComp * currentRadial[0],
      tangent[1] - radialComp * currentRadial[1],
      tangent[2] - radialComp * currentRadial[2],
    ]);

    const next = vecAdd(current, vecScale(tangent, segLength));
    const nextNorm = vecNormalize(next);
    const nextOnSurface: [number, number, number] = vecScale(nextNorm, meshRadius);

    const fadeout = 1.0 - Math.pow(i / numSegments, 2);
    segments.push({
      start: current,
      end: nextOnSurface,
      depth: depth * fadeout,
      halfWidth: halfWidth * (0.7 + 0.3 * fadeout),
    });

    current = nextOnSurface;

    if (rand() < branching * 0.15 && i > 2 && i < numSegments - 2) {
      const branchLen = (numSegments - i) * 0.5;
      const branchTangent = vecNormalize(vecAdd(tangent, [
        (rand() - 0.5) * 1.5,
        (rand() - 0.5) * 1.5,
        (rand() - 0.5) * 1.5,
      ]));
      let branchCurrent = current;
      for (let b = 0; b < branchLen; b++) {
        const branchNext = vecAdd(branchCurrent, vecScale(branchTangent, segLength * 0.7));
        const bn = vecNormalize(branchNext);
        const branchOnSurface: [number, number, number] = vecScale(bn, meshRadius);
        const branchFade = 1.0 - Math.pow(b / branchLen, 2);
        segments.push({
          start: branchCurrent,
          end: branchOnSurface,
          depth: depth * fadeout * branchFade * 0.6,
          halfWidth: halfWidth * 0.5 * branchFade,
        });
        branchCurrent = branchOnSurface;
      }
    }
  }

  return segments;
}

export const fissureModifier: MeshModifier = {
  name: "mesh:fissures",

  apply(mesh: MeshData, rawParams: Record<string, number | string | boolean>): MeshData {
    const p: FissureParams = { ...DEFAULTS };
    if (rawParams.count !== undefined) p.count = Number(rawParams.count);
    if (rawParams.depth !== undefined) p.depth = Number(rawParams.depth);
    if (rawParams.width !== undefined) p.width = Number(rawParams.width);
    if (rawParams.length !== undefined) p.length = Number(rawParams.length);
    if (rawParams.branching !== undefined) p.branching = Number(rawParams.branching);
    if (rawParams.jaggedness !== undefined) p.jaggedness = Number(rawParams.jaggedness);
    if (rawParams.avoidOverlap !== undefined) p.avoidOverlap = rawParams.avoidOverlap === true || rawParams.avoidOverlap === "true";
    if (rawParams.seed !== undefined) p.seed = Number(rawParams.seed);

    if (p.count <= 0) return mesh;

    const rand = mulberry32(p.seed);
    const meshRadius = getMeshRadius(mesh);
    const occupancy = ensureOccupancy(mesh);
    const featureData = ensureFeatureData(mesh);

    const allSegments: FissureSegment[] = [];
    for (let i = 0; i < p.count; i++) {
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      const start: [number, number, number] = [
        meshRadius * Math.sin(phi) * Math.cos(theta),
        meshRadius * Math.sin(phi) * Math.sin(theta),
        meshRadius * Math.cos(phi),
      ];

      const segments = generateFissurePath(
        start, meshRadius, p.length, p.jaggedness, p.branching,
        p.depth * meshRadius, p.width * meshRadius * 0.5,
        rand,
      );
      allSegments.push(...segments);
    }

    const newPositions = new Float64Array(mesh.positions);

    for (let vi = 0; vi < mesh.vertexCount; vi++) {
      const vx = newPositions[vi * 3]!;
      const vy = newPositions[vi * 3 + 1]!;
      const vz = newPositions[vi * 3 + 2]!;

      if (p.avoidOverlap && occupancy[vi]! > meshRadius * 0.01) continue;

      // Project vertex onto the sphere where fissure paths live
      const vr = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const scale = vr > 1e-10 ? meshRadius / vr : 1;
      const vProjected: [number, number, number] = [vx * scale, vy * scale, vz * scale];

      let maxDepth = 0;

      for (const seg of allSegments) {
        const dist = distanceToSegment(vProjected, seg.start, seg.end);
        if (dist >= seg.halfWidth) continue;

        const t = dist / seg.halfWidth;
        const profile = (1.0 - t) * (1.0 - t * 0.3);
        const displacement = -seg.depth * profile;

        if (displacement < maxDepth) {
          maxDepth = displacement;
        }
      }

      if (Math.abs(maxDepth) > 1e-10) {
        const nx = mesh.normals[vi * 3]!;
        const ny = mesh.normals[vi * 3 + 1]!;
        const nz = mesh.normals[vi * 3 + 2]!;
        newPositions[vi * 3] += nx * maxDepth;
        newPositions[vi * 3 + 1] += ny * maxDepth;
        newPositions[vi * 3 + 2] += nz * maxDepth;

        const absDepth = Math.abs(maxDepth);
        occupancy[vi] = Math.max(occupancy[vi]!, absDepth);
        const fi = vi * 4;
        featureData[fi + 2] = Math.max(featureData[fi + 2]!, Math.min(absDepth / (meshRadius * 0.02), 1.0));
      }
    }

    const normals = computeVertexNormals(newPositions, mesh.indices, mesh.vertexCount);
    return { ...mesh, positions: newPositions, normals, occupancy, featureData };
  },
};
