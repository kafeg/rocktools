import {
  type MeshData,
  type MeshModifier,
  computeTriangleAreas,
  computeVertexNormals,
  pickRandomSurfacePoint,
  getMeshRadius,
  ensureOccupancy,
  ensureFeatureData,
} from "./meshModifiers";
import { mulberry32 } from "./prng";

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export interface CraterParams {
  count: number;
  minSize: number;
  maxSize: number;
  depthRatio: number;
  rimHeight: number;
  rimWidth: number;
  ejectaExtent: number;
  degradation: number;
  sizeExponent: number;
  avoidOverlap: boolean;
  spacing: number;
  seed: number;
}

const DEFAULTS: CraterParams = {
  count: 15,
  minSize: 0.03,
  maxSize: 0.35,
  depthRatio: 0.25,
  rimHeight: 0.06,
  rimWidth: 0.25,
  ejectaExtent: 0.4,
  degradation: 0.3,
  sizeExponent: 1.8,
  avoidOverlap: true,
  spacing: 0.8,
  seed: 1,
};

interface Crater {
  center: [number, number, number];
  normal: [number, number, number];
  radius: number;
  depth: number;
  rimH: number;
  freshness: number;
}

export const craterModifier: MeshModifier = {
  name: "mesh:craters",

  apply(mesh: MeshData, rawParams: Record<string, number | string | boolean>): MeshData {
    const p: CraterParams = { ...DEFAULTS };
    if (rawParams.count !== undefined) p.count = Number(rawParams.count);
    if (rawParams.minSize !== undefined) p.minSize = Number(rawParams.minSize);
    if (rawParams.maxSize !== undefined) p.maxSize = Number(rawParams.maxSize);
    if (rawParams.depthRatio !== undefined) p.depthRatio = Number(rawParams.depthRatio);
    if (rawParams.rimHeight !== undefined) p.rimHeight = Number(rawParams.rimHeight);
    if (rawParams.rimWidth !== undefined) p.rimWidth = Number(rawParams.rimWidth);
    if (rawParams.ejectaExtent !== undefined) p.ejectaExtent = Number(rawParams.ejectaExtent);
    if (rawParams.degradation !== undefined) p.degradation = Number(rawParams.degradation);
    if (rawParams.sizeExponent !== undefined) p.sizeExponent = Number(rawParams.sizeExponent);
    if (rawParams.avoidOverlap !== undefined) p.avoidOverlap = rawParams.avoidOverlap === true || rawParams.avoidOverlap === "true";
    if (rawParams.spacing !== undefined) p.spacing = Number(rawParams.spacing);
    if (rawParams.seed !== undefined) p.seed = Number(rawParams.seed);

    if (p.count <= 0) return mesh;

    const rand = mulberry32(p.seed);
    const meshRadius = getMeshRadius(mesh);
    const areas = computeTriangleAreas(mesh);
    const totalArea = areas.reduce((s, a) => s + a, 0);
    const occupancy = ensureOccupancy(mesh);
    const featureData = ensureFeatureData(mesh);

    const craters: Crater[] = [];
    for (let i = 0; i < p.count; i++) {
      const u = rand();
      const relSize = p.minSize * Math.pow(u, -1.0 / p.sizeExponent);
      const clampedSize = Math.min(relSize, p.maxSize);
      const radius = clampedSize * meshRadius;

      const maxAttempts = p.spacing > 0 ? 5 : 1;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const { point, normal } = pickRandomSurfacePoint(mesh, areas, totalArea, rand);
        const freshness = 1.0 - p.degradation * rand();

        if (p.spacing > 0) {
          let overlaps = false;
          for (const existing of craters) {
            const dx = point[0] - existing.center[0];
            const dy = point[1] - existing.center[1];
            const dz = point[2] - existing.center[2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < (radius + existing.radius) * p.spacing) {
              overlaps = true;
              break;
            }
          }
          if (overlaps) continue;
        }

        craters.push({
          center: point,
          normal,
          radius,
          depth: radius * p.depthRatio * 2,
          rimH: radius * p.rimHeight * 2,
          freshness,
        });
        break;
      }
    }

    craters.sort((a, b) => b.radius - a.radius);

    const newPositions = new Float64Array(mesh.positions);

    for (let vi = 0; vi < mesh.vertexCount; vi++) {
      const vx = newPositions[vi * 3]!;
      const vy = newPositions[vi * 3 + 1]!;
      const vz = newPositions[vi * 3 + 2]!;

      if (p.avoidOverlap && occupancy[vi]! > meshRadius * 0.01) continue;

      let dispX = 0, dispY = 0, dispZ = 0;
      let maxCraterEffect = 0;
      let craterSign = 0;

      for (const crater of craters) {
        const dx = vx - crater.center[0];
        const dy = vy - crater.center[1];
        const dz = vz - crater.center[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const t = dist / crater.radius;

        const rimWidth = Math.max(0.05, p.rimWidth);
        const ejectaExtent = Math.max(0, p.ejectaExtent);
        const affectedRadius = 1.0 + rimWidth + ejectaExtent;

        if (t >= affectedRadius) continue;

        const bowl = t < 1.0
          ? -crater.depth * Math.pow(1.0 - t * t, 1.35)
          : 0;
        const rimT = Math.abs(t - 1.0) / rimWidth;
        const rimFade = smoothstep(1.0, 0.0, rimT);
        const rimDisp = crater.rimH * rimFade;
        const ejectaT = ejectaExtent > 0 ? (t - 1.0 - rimWidth) / ejectaExtent : 1.0;
        const ejectaFade = t > 1.0 + rimWidth ? smoothstep(1.0, 0.0, ejectaT) : 1.0;
        const ejecta = t > 1.0
          ? crater.rimH * 0.18 * Math.pow(Math.max(t, 1.0), -3) * ejectaFade
          : 0;
        const displacement = (bowl + rimDisp + ejecta) * crater.freshness;

        // Use crater normal for consistent displacement direction (fixes floor artifacts)
        dispX += crater.normal[0] * displacement;
        dispY += crater.normal[1] * displacement;
        dispZ += crater.normal[2] * displacement;

        const absDisp = Math.abs(displacement);
        if (absDisp > Math.abs(maxCraterEffect)) {
          maxCraterEffect = absDisp;
          craterSign = displacement < 0 ? 1.0 : -0.5;
        }
      }

      const totalDisp = Math.sqrt(dispX * dispX + dispY * dispY + dispZ * dispZ);
      if (totalDisp > 1e-10) {
        newPositions[vi * 3] += dispX;
        newPositions[vi * 3 + 1] += dispY;
        newPositions[vi * 3 + 2] += dispZ;

        occupancy[vi] = Math.max(occupancy[vi]!, totalDisp);
        // featureData R channel: positive = crater floor, negative = rim
        const fi = vi * 4;
        featureData[fi] = Math.max(featureData[fi]!, craterSign * Math.min(maxCraterEffect / (meshRadius * 0.1), 1.0));
      }
    }

    const normals = computeVertexNormals(newPositions, mesh.indices, mesh.vertexCount);
    return { ...mesh, positions: newPositions, normals, occupancy, featureData };
  },
};
