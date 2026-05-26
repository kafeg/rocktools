import { create } from "zustand";
import type { PipelineStep, ToolDefinition, JournalEntry, MeshInfo } from "../types";
import type { HeightmapParams } from "../utils/heightmap";
import { TOOL_DEFINITIONS, SAMPLE_MESHES } from "../toolDefinitions";
import { parseOBJToMeshData, meshDataToOBJ, type MeshData } from "../utils/meshModifiers";
import { MESH_MODIFIER_MAP } from "../utils/modifierMap";
import {
  ASTEROID_TEXTURE_LIST,
  DEFAULT_ASTEROID_MATERIAL_PARAMS,
  type AsteroidMaterialParams,
  type AsteroidTextureId,
} from "../runtime/asteroid";

export type SourceType = "create" | "sample";

// ── Lighting types ────────────────────────────────────────────────

export interface LightSource {
  id: string;
  type: "directional" | "point" | "ambient";
  enabled: boolean;
  color: string;
  intensity: number;
  azimuth: number;
  elevation: number;
  distance: number;
  castShadow: boolean;
}

export function polarToCartesian(azimuth: number, elevation: number, distance: number): [number, number, number] {
  const azRad = azimuth * Math.PI / 180;
  const elRad = elevation * Math.PI / 180;
  return [
    distance * Math.cos(elRad) * Math.sin(azRad),
    distance * Math.sin(elRad),
    distance * Math.cos(elRad) * Math.cos(azRad),
  ];
}

export const DEFAULT_LIGHTS: LightSource[] = [
  { id: "key",  type: "directional", enabled: true, color: "#fff5e0", intensity: 3.0, azimuth: 22, elevation: 31, distance: 7, castShadow: false },
  { id: "fill", type: "ambient",     enabled: true, color: "#ffffff", intensity: 0.4, azimuth: 0, elevation: 0, distance: 5, castShadow: false },
  { id: "back", type: "directional", enabled: true, color: "#6688cc", intensity: 0.8, azimuth: 214, elevation: -18, distance: 5, castShadow: false },
  { id: "top",  type: "directional", enabled: true, color: "#aabbdd", intensity: 0.6, azimuth: 243, elevation: 53, distance: 5, castShadow: false },
  { id: "warm", type: "point",       enabled: true, color: "#ffe8cc", intensity: 1.5, azimuth: 34, elevation: 18, distance: 3.7, castShadow: false },
];

const MAX_LIGHTS = 8;

// ── Background types ──────────────────────────────────────────────

export type BackgroundMode = "solid" | "starfield" | "hdri" | "transparent";

export interface BackgroundConfig {
  mode: BackgroundMode;
  solidColor: string;
  starfieldDensity: number;
  hdriId: string | null;
  hdriResolution: HdriResolution;
  hdriCustomUrl: string | null;
  hdriCustomName: string | null;
  hdriScale: number;
  hdriIntensity: number;
  hdriBlur: number;
  hdriRotation: number;
  showDust: boolean;
}

export const DEFAULT_BACKGROUND: BackgroundConfig = {
  mode: "starfield",
  solidColor: "#050810",
  starfieldDensity: 2000,
  hdriId: null,
  hdriResolution: "2K" as HdriResolution,
  hdriCustomUrl: null,
  hdriCustomName: null,
  hdriScale: 100,
  hdriIntensity: 1.0,
  hdriBlur: 0,
  hdriRotation: 0,
  showDust: true,
};

// ── HDRI registry ─────────────────────────────────────────────────

export type HdriResolution = "1K" | "2K" | "4K";

export const HDRI_RESOLUTIONS: HdriResolution[] = ["1K", "2K", "4K"];

export interface HdriEntry {
  id: string;
  name: string;
  baseFile: string;
  category: "space" | "studio" | "outdoor";
}

export function hdriFile(entry: HdriEntry, resolution: HdriResolution): string {
  return `${entry.baseFile}_${resolution}.exr`;
}

export const HDRI_LIST: HdriEntry[] = [
  { id: "nightsky001", name: "Night Sky 001", baseFile: "NightSkyHDRI001", category: "space" },
  { id: "nightsky003", name: "Night Sky 003", baseFile: "NightSkyHDRI003", category: "space" },
  { id: "nightsky004", name: "Night Sky 004", baseFile: "NightSkyHDRI004", category: "space" },
  { id: "nightsky007", name: "Night Sky 007", baseFile: "NightSkyHDRI007", category: "space" },
  { id: "nightsky008", name: "Night Sky 008", baseFile: "NightSkyHDRI008", category: "space" },
  { id: "nightsky009", name: "Night Sky 009", baseFile: "NightSkyHDRI009", category: "space" },
];

// ── Scene presets ─────────────────────────────────────────────────

export interface ScenePreset {
  id: string;
  name: string;
  description: string;
  lights: LightSource[];
  background: BackgroundConfig;
}

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: "space",
    name: "Space",
    description: "Default space look: warm key + cool fill, starfield background",
    lights: DEFAULT_LIGHTS,
    background: DEFAULT_BACKGROUND,
  },
  {
    id: "studio",
    name: "Studio",
    description: "3-point studio lighting, solid dark gray background",
    lights: [
      { id: "key",  type: "directional", enabled: true, color: "#ffffff", intensity: 2.5, azimuth: 45, elevation: 35, distance: 7, castShadow: false },
      { id: "fill", type: "directional", enabled: true, color: "#c0c8d8", intensity: 1.2, azimuth: 315, elevation: 10, distance: 5, castShadow: false },
      { id: "rim",  type: "directional", enabled: true, color: "#e0e8ff", intensity: 1.8, azimuth: 180, elevation: 20, distance: 5, castShadow: false },
      { id: "amb",  type: "ambient",     enabled: true, color: "#ffffff", intensity: 0.3, azimuth: 0, elevation: 0, distance: 5, castShadow: false },
    ],
    background: { ...DEFAULT_BACKGROUND, mode: "solid", solidColor: "#1a1a1a", showDust: false },
  },
  {
    id: "dramatic",
    name: "Dramatic",
    description: "Single strong directional + dim ambient, deep black",
    lights: [
      { id: "key",  type: "directional", enabled: true, color: "#fff0d0", intensity: 4.0, azimuth: 30, elevation: 25, distance: 7, castShadow: false },
      { id: "amb",  type: "ambient",     enabled: true, color: "#101020", intensity: 0.15, azimuth: 0, elevation: 0, distance: 5, castShadow: false },
    ],
    background: { ...DEFAULT_BACKGROUND, mode: "solid", solidColor: "#000000", showDust: false },
  },
  {
    id: "rim",
    name: "Rim Light",
    description: "Strong backlight with low front fill",
    lights: [
      { id: "back", type: "directional", enabled: true, color: "#e0e8ff", intensity: 4.0, azimuth: 180, elevation: 10, distance: 7, castShadow: false },
      { id: "fill", type: "directional", enabled: true, color: "#c8c0b0", intensity: 0.6, azimuth: 0, elevation: 20, distance: 5, castShadow: false },
      { id: "amb",  type: "ambient",     enabled: true, color: "#ffffff", intensity: 0.15, azimuth: 0, elevation: 0, distance: 5, castShadow: false },
    ],
    background: { ...DEFAULT_BACKGROUND, mode: "solid", solidColor: "#080810", showDust: false },
  },
  {
    id: "flat",
    name: "Flat",
    description: "Even illumination for texture inspection",
    lights: [
      { id: "amb",  type: "ambient",     enabled: true, color: "#ffffff", intensity: 1.0, azimuth: 0, elevation: 0, distance: 5, castShadow: false },
      { id: "soft", type: "directional", enabled: true, color: "#ffffff", intensity: 1.0, azimuth: 45, elevation: 45, distance: 7, castShadow: false },
    ],
    background: { ...DEFAULT_BACKGROUND, mode: "solid", solidColor: "#1a1a2a", showDust: false },
  },
];

// ── Image export types ────────────────────────────────────────────

export type ImageFormat = "png" | "jpg";

export interface ImageExportSettings {
  width: number;
  height: number;
  format: ImageFormat;
  jpegQuality: number;
}

export const IMAGE_RESOLUTION_PRESETS: { label: string; width: number; height: number }[] = [
  { label: "1080p", width: 1920, height: 1080 },
  { label: "2K", width: 2560, height: 1440 },
  { label: "4K", width: 3840, height: 2160 },
];

export const TEXTURE_LIST = ASTEROID_TEXTURE_LIST;

export type TextureId = AsteroidTextureId;

export const FX_STEPS = {
  "fx:material": {
    label: "material",
    description: "Base surface material: color, roughness, metalness, texture, color variation",
    color: "accent",
    params: {
      baseColor: "#8a8a7a",
      roughness: 0.85,
      metalness: 0.1,
      texture: "none" as string,
      applyTint: false as boolean,
      colorVariation: 0.15,
      colorVariationScale: 2.5,
    },
  },
  "fx:dust": {
    label: "dust",
    description: "Regolith / dust layer that accumulates in surface concavities",
    color: "warm",
    params: {
      dustAmount: 0.4,
      dustColor: "#2a2420",
    },
  },
  "fx:veins": {
    label: "veins",
    description: "Mineral veins and material inclusions via noise patterns",
    color: "warm",
    params: {
      veinIntensity: 0.3,
      veinScale: 5.0,
      veinColor: "#8a7a60",
    },
  },
  "fx:subsurface": {
    label: "subsurface",
    description: "Subsurface scattering for translucent materials (ice, some minerals)",
    color: "warm",
    params: {
      subsurface: 0.4,
    },
  },
  "fx:features": {
    label: "features",
    description: "Per-modifier shading: intensity, tint, normal detail per feature type",
    color: "warm",
    params: {
      featureIntensity: 0.7,
      craterShading: 1.0,
      craterTint: "#6b5c4a",
      boulderShading: 1.0,
      boulderTint: "#8a8a7a",
      ridgeShading: 1.0,
      ridgeTint: "#9a9080",
      fissureShading: 1.0,
      fissureTint: "#3a3a4a",
      layerShading: 1.0,
      layerTint: "#888880",
      normalStrength: 1.0,
    },
  },
  "fx:ao": {
    label: "ao",
    description: "Vertex ambient occlusion from geometry curvature (darkens crevices)",
    color: "warm",
    params: {
      aoStrength: 0.5,
      aoRadius: 0.5,
    },
  },
  "fx:frost": {
    label: "frost",
    description: "Ice frost patches in concavities and sheltered areas",
    color: "warm",
    params: {
      frostAmount: 0.4,
      frostColor: "#d0e8ff",
      frostBias: 0.5,
    },
  },
  "fx:weathering": {
    label: "weathering",
    description: "Space weathering on convex/exposed surfaces (darkening + reddening)",
    color: "warm",
    params: {
      weatherAmount: 0.4,
      weatherTint: "#3a2820",
      directionBias: 0.5,
    },
  },
  "fx:emission": {
    label: "emission",
    description: "Emissive glowing regions (vents, minerals, lava)",
    color: "warm",
    params: {
      emissionColor: "#ff6030",
      emissionIntensity: 0.5,
      emissionPattern: "spots" as string,
    },
  },
} as const;

export type FxStepType = keyof typeof FX_STEPS;

export const MESH_STEPS = {
  "mesh:craters": {
    label: "craters",
    description: "Impact craters: bowl depression + raised rim + ejecta blanket (geometry)",
    color: "accent",
    params: {
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
    },
  },
  "mesh:boulders": {
    label: "boulders",
    description: "Surface protrusions: irregular raised domes simulating rubble-pile debris",
    color: "accent",
    params: {
      count: 12,
      minSize: 0.02,
      maxSize: 0.08,
      height: 0.6,
      roughness: 0.4,
      smoothing: 1,
      avoidOverlap: true,
      seed: 1,
    },
  },
  "mesh:ridges": {
    label: "ridges",
    description: "Linear ridges or grooves along great-circle arcs (Vesta, Eros)",
    color: "accent",
    params: {
      count: 4,
      height: 0.08,
      width: 0.15,
      length: 0.8,
      irregularity: 0.3,
      mode: "ridge",
      avoidOverlap: false,
      seed: 1,
    },
  },
  "mesh:fissures": {
    label: "fissures",
    description: "Branching thermal fracture cracks cut into the mesh surface",
    color: "accent",
    params: {
      count: 5,
      depth: 0.02,
      width: 0.04,
      length: 0.5,
      branching: 0.3,
      jaggedness: 0.4,
      avoidOverlap: true,
      seed: 1,
    },
  },
  "mesh:layers": {
    label: "layers",
    description: "Stratification / terracing: radial bands with alternating displacement (67P)",
    color: "accent",
    params: {
      layers: 5,
      displacement: 0.02,
      noise: 0.3,
      sharpness: 0.5,
      seed: 1,
    },
  },
  "mesh:rocks": {
    label: "rocks",
    description: "Procedural 3D rock objects scattered across the surface (real geometry, not displacement)",
    color: "accent",
    params: {
      count: 20,
      minSize: 0.02,
      maxSize: 0.08,
      roughness: 0.5,
      detail: 2,
      embedDepth: 0.35,
      templates: 5,
      avoidOverlap: true,
      seed: 1,
    },
  },
  "mesh:pits": {
    label: "pits",
    description: "Degassing pits: flat-bottomed cylindrical depressions with steep walls (67P style)",
    color: "accent",
    params: {
      count: 50,
      minSize: 0.01,
      maxSize: 0.06,
      depth: 0.15,
      wallSteepness: 0.7,
      seed: 1,
    },
  },
  "mesh:erosion": {
    label: "erosion",
    description: "Curvature-driven erosion: smooths peaks, sharpens valleys (micrometeorite weathering)",
    color: "accent",
    params: {
      intensity: 0.3,
      passes: 2,
      curvatureBias: 0.5,
      seed: 1,
    },
  },
  "mesh:facets": {
    label: "facets",
    description: "Planar faceting: flattens surface regions into diamond-like faces (Bennu style)",
    color: "accent",
    params: {
      count: 8,
      size: 0.3,
      flatness: 0.7,
      seed: 1,
    },
  },
} as const;

export type MeshStepType = keyof typeof MESH_STEPS;

export type RandomMode = "full" | "any-preset" | "M-type" | "C-type" | "S-type" | "Ice" | "Dwarf" | "Rubble" | "Comet" | "Shard";

export interface FullPreset {
  name: string;
  description: string;
  sourceType: SourceType;
  baseMesh: string;
  createParams: Record<string, number | string | boolean>;
  steps: Array<{ tool: string; params: Record<string, number | string | boolean> }>;
}

export const FULL_PRESETS: FullPreset[] = [
  {
    name: "M-type (Metallic)",
    description: "Smooth, reflective metallic surface with fissures and craters",
    sourceType: "create",
    baseMesh: "icosahedron0.obj",
    createParams: { nodes: 70, gaussianNodes: 44, walkNodes: 44, roundness: 0.4, seed: 772211 },
    steps: [
      { tool: "rockdetail", params: { depth: 6, subdivisionMode: "-4", interpolation: "-spl", basePerturbation: 0.1, baseExponent: 0.5, normalPerturbation: 0.1, normalExponent: 0.5, normalBias: 0, sphereForce: false, gaussianRandom: true, clampEdges: false, seed: 772211 } },
      { tool: "rocksmooth", params: { passes: 3, tension: 0, normals: true, grow: 0 } },
      { tool: "mesh:fissures", params: { count: 5, depth: 0.02, width: 0.04, length: 0.5, branching: 0.3, jaggedness: 0.4, avoidOverlap: true, seed: 772211 } },
      { tool: "mesh:craters", params: { count: 9, minSize: 0.03, maxSize: 0.35, depthRatio: 0.25, rimHeight: 0.06, rimWidth: 0.25, ejectaExtent: 0.4, degradation: 0.3, sizeExponent: 1.8, avoidOverlap: true, spacing: 0.8, seed: 772211 } },
      { tool: "mesh:boulders", params: { count: 12, minSize: 0.02, maxSize: 0.08, height: 0.6, roughness: 0.4, smoothing: 1, avoidOverlap: true, seed: 772211 } },
      { tool: "fx:material", params: { baseColor: "#a8a0a0", roughness: 0.35, metalness: 0.4, texture: "acg_rock_black_smooth", applyTint: true, colorVariation: 0.4, colorVariationScale: 3 } },
      { tool: "fx:ao", params: { aoStrength: 0.4, aoRadius: 0.5 } },
      { tool: "fx:weathering", params: { weatherAmount: 0.2, weatherTint: "#4a3828", directionBias: 0.4 } },
      { tool: "fx:features", params: { featureIntensity: 0.7, craterShading: 1, craterTint: "#3a3a48", boulderShading: 1, boulderTint: "#908888", ridgeShading: 1, ridgeTint: "#9a9080", fissureShading: 1, fissureTint: "#454560", layerShading: 1, layerTint: "#888080", normalStrength: 1 } },
    ],
  },
  {
    name: "C-type (Carbonaceous)",
    description: "Dark, rough, irregular surface with craters and boulders (Bennu, Ryugu)",
    sourceType: "create",
    baseMesh: "icosahedron0.obj",
    createParams: { nodes: 70, gaussianNodes: 44, walkNodes: 44, roundness: 0.4, seed: 115494 },
    steps: [
      { tool: "rockdetail", params: { depth: 6, subdivisionMode: "-4", interpolation: "-spl", basePerturbation: 0.1, baseExponent: 0.5, normalPerturbation: 0.1, normalExponent: 0.5, normalBias: 0, sphereForce: false, gaussianRandom: true, clampEdges: false, seed: 115494 } },
      { tool: "rocksmooth", params: { passes: 3, tension: 0, normals: true, grow: 0 } },
      { tool: "rockconvert", params: { scaleX: 1, scaleY: 1.61, scaleZ: 1.91, translateX: 0, translateY: 0, translateZ: 0 } },
      { tool: "mesh:fissures", params: { count: 5, depth: 0.02, width: 0.04, length: 0.5, branching: 0.3, jaggedness: 0.4, avoidOverlap: true, seed: 115494 } },
      { tool: "mesh:craters", params: { count: 9, minSize: 0.03, maxSize: 0.35, depthRatio: 0.25, rimHeight: 0.06, rimWidth: 0.25, ejectaExtent: 0.4, degradation: 0.3, sizeExponent: 1.8, avoidOverlap: true, spacing: 0.8, seed: 115494 } },
      { tool: "mesh:boulders", params: { count: 12, minSize: 0.02, maxSize: 0.08, height: 0.6, roughness: 0.4, smoothing: 1, avoidOverlap: true, seed: 115494 } },
      { tool: "mesh:rocks", params: { count: 15, minSize: 0.01, maxSize: 0.05, roughness: 0.5, detail: 2, embedDepth: 0.35, templates: 5, avoidOverlap: true, seed: 115494 } },
      { tool: "mesh:pits", params: { count: 40, minSize: 0.008, maxSize: 0.04, depth: 0.12, wallSteepness: 0.7, seed: 115494 } },
      { tool: "fx:material", params: { baseColor: "#807068", roughness: 0.85, metalness: 0.08, texture: "acg_rock_dark_rough", applyTint: true, colorVariation: 0.4, colorVariationScale: 4.5 } },
      { tool: "fx:dust", params: { dustAmount: 0.15, dustColor: "#585048" } },
      { tool: "fx:ao", params: { aoStrength: 0.5, aoRadius: 0.5 } },
      { tool: "fx:weathering", params: { weatherAmount: 0.25, weatherTint: "#2a1a15", directionBias: 0.3 } },
      { tool: "fx:features", params: { featureIntensity: 0.7, craterShading: 1, craterTint: "#483c38", boulderShading: 1, boulderTint: "#887c70", ridgeShading: 1, ridgeTint: "#807060", fissureShading: 1, fissureTint: "#504848", layerShading: 1, layerTint: "#787068", normalStrength: 1 } },
    ],
  },
  {
    name: "S-type (Silicate)",
    description: "Light-colored, moderately rough silicate surface (Itokawa, Eros)",
    sourceType: "create",
    baseMesh: "icosahedron0.obj",
    createParams: { nodes: 70, gaussianNodes: 44, walkNodes: 44, roundness: 0.4, seed: 115494 },
    steps: [
      { tool: "rockdetail", params: { depth: 6, subdivisionMode: "-4", interpolation: "-mid", basePerturbation: 0.1, baseExponent: 0.5, normalPerturbation: 0.1, normalExponent: 0.5, normalBias: 0, sphereForce: false, gaussianRandom: true, clampEdges: false, seed: 115494 } },
      { tool: "rocksmooth", params: { passes: 3, tension: 0, normals: true, grow: 0 } },
      { tool: "mesh:fissures", params: { count: 5, depth: 0.02, width: 0.04, length: 0.5, branching: 0.3, jaggedness: 0.4, avoidOverlap: true, seed: 115494 } },
      { tool: "mesh:craters", params: { count: 9, minSize: 0.03, maxSize: 0.35, depthRatio: 0.25, rimHeight: 0.06, rimWidth: 0.25, ejectaExtent: 0.4, degradation: 0.3, sizeExponent: 1.8, avoidOverlap: true, spacing: 0.8, seed: 115494 } },
      { tool: "mesh:boulders", params: { count: 12, minSize: 0.02, maxSize: 0.08, height: 0.6, roughness: 0.4, smoothing: 1, avoidOverlap: true, seed: 115494 } },
      { tool: "mesh:layers", params: { layers: 4, displacement: 0.015, noise: 0.4, sharpness: 0.35, seed: 115494 } },
      { tool: "mesh:erosion", params: { intensity: 0.3, passes: 2, curvatureBias: 0.5, seed: 115494 } },
      { tool: "fx:material", params: { baseColor: "#d0c4b4", roughness: 0.92, metalness: 0.23, texture: "acg_rock_desert_orange", applyTint: true, colorVariation: 0.5, colorVariationScale: 2.5 } },
      { tool: "fx:ao", params: { aoStrength: 0.4, aoRadius: 0.5 } },
      { tool: "fx:weathering", params: { weatherAmount: 0.35, weatherTint: "#4a3020", directionBias: 0.4 } },
      { tool: "fx:features", params: { featureIntensity: 0.7, craterShading: 1, craterTint: "#5a5048", boulderShading: 1, boulderTint: "#a09080", ridgeShading: 1, ridgeTint: "#9a9080", fissureShading: 1, fissureTint: "#585050", layerShading: 1, layerTint: "#908880", normalStrength: 1 } },
    ],
  },
  {
    name: "Ice",
    description: "Icy body: translucent with subsurface scattering, layered surface",
    sourceType: "sample",
    baseMesh: "icosahedron0.obj",
    createParams: { nodes: 12, gaussianNodes: 0, walkNodes: 0, roundness: 0, seed: 1 },
    steps: [
      { tool: "rockdetail", params: { depth: 6, subdivisionMode: "-4", interpolation: "-spl", basePerturbation: 0.209, baseExponent: 0.5, normalPerturbation: 0.322, normalExponent: 0.32, normalBias: 0, sphereForce: false, gaussianRandom: false, clampEdges: false, seed: 935515 } },
      { tool: "rocksmooth", params: { passes: 6, tension: 0, normals: true, grow: 0 } },
      { tool: "mesh:boulders", params: { count: 10, minSize: 0.024, maxSize: 0.104, height: 0.656, roughness: 0.241, smoothing: 1.117, avoidOverlap: true, seed: 935515 } },
      { tool: "mesh:ridges", params: { count: 4, height: 0.045, width: 0.184, length: 0.798, irregularity: 0.2, mode: "ridge", avoidOverlap: false, seed: 935515 } },
      { tool: "mesh:layers", params: { layers: 4, displacement: 0.016, noise: 0.358, sharpness: 0.29, seed: 935515 } },
      { tool: "fx:material", params: { baseColor: "#a0b8c8", roughness: 0.3, metalness: 0, texture: "acg_ice_frozen", applyTint: true, colorVariation: 0.328, colorVariationScale: 2 } },
      { tool: "fx:subsurface", params: { subsurface: 0.612 } },
      { tool: "fx:frost", params: { frostAmount: 0.6, frostColor: "#d0e8ff", frostBias: 0.6 } },
      { tool: "fx:ao", params: { aoStrength: 0.3, aoRadius: 0.5 } },
    ],
  },
  {
    name: "Dwarf (Planet)",
    description: "Round dwarf planet: sphere-forced shape with craters, ridges, boulders (Ceres, Vesta)",
    sourceType: "create",
    baseMesh: "icosahedron0.obj",
    createParams: { nodes: 86, gaussianNodes: 44, walkNodes: 44, roundness: 0.4, seed: 304710 },
    steps: [
      { tool: "rockdetail", params: { depth: 6, subdivisionMode: "-4", interpolation: "-mid", basePerturbation: 0.12, baseExponent: 0.5, normalPerturbation: 0.13, normalExponent: 0.5, normalBias: 0, sphereForce: true, gaussianRandom: true, clampEdges: false, seed: 304710 } },
      { tool: "rocksmooth", params: { passes: 3, tension: 0, normals: true, grow: 0 } },
      { tool: "mesh:craters", params: { count: 8, minSize: 0.025, maxSize: 0.3, depthRatio: 0.25, rimHeight: 0.06, rimWidth: 0.25, ejectaExtent: 0.4, degradation: 0.3, sizeExponent: 1.8, avoidOverlap: true, spacing: 0.8, seed: 304710 } },
      { tool: "mesh:ridges", params: { count: 2, height: 0.06, width: 0.2, length: 1.2, irregularity: 0.25, mode: "ridge", avoidOverlap: false, seed: 304710 } },
      { tool: "mesh:boulders", params: { count: 18, minSize: 0.015, maxSize: 0.1, height: 0.5, roughness: 0.4, smoothing: 1, avoidOverlap: true, seed: 304710 } },
      { tool: "mesh:rocks", params: { count: 12, minSize: 0.01, maxSize: 0.04, roughness: 0.4, detail: 2, embedDepth: 0.4, templates: 4, avoidOverlap: true, seed: 304710 } },
      { tool: "mesh:layers", params: { layers: 5, displacement: 0.018, noise: 0.35, sharpness: 0.4, seed: 304710 } },
      { tool: "mesh:erosion", params: { intensity: 0.2, passes: 2, curvatureBias: 0.5, seed: 304710 } },
      { tool: "fx:material", params: { baseColor: "#8a8a90", roughness: 1, metalness: 0.17, texture: "acg_rock_grey_layers", applyTint: true, colorVariation: 0.6, colorVariationScale: 2.3 } },
      { tool: "fx:dust", params: { dustAmount: 0.2, dustColor: "#3a3530" } },
      { tool: "fx:ao", params: { aoStrength: 0.5, aoRadius: 0.5 } },
      { tool: "fx:weathering", params: { weatherAmount: 0.3, weatherTint: "#3a2520", directionBias: 0.5 } },
      { tool: "fx:features", params: { featureIntensity: 0.5, craterShading: 1, craterTint: "#5a5048", boulderShading: 1, boulderTint: "#a09080", ridgeShading: 1, ridgeTint: "#9a9080", fissureShading: 1, fissureTint: "#585050", layerShading: 1, layerTint: "#908880", normalStrength: 1 } },
    ],
  },
  {
    name: "Rubble (Pile)",
    description: "Loose rubble-pile aggregate: rough surface covered in boulders (extreme Bennu/Ryugu)",
    sourceType: "create",
    baseMesh: "icosahedron0.obj",
    createParams: { nodes: 40, gaussianNodes: 20, walkNodes: 0, roundness: 0.15, seed: 558923 },
    steps: [
      { tool: "rockdetail", params: { depth: 5, subdivisionMode: "-4", interpolation: "-mid", basePerturbation: 0.25, baseExponent: 0.6, normalPerturbation: 0.2, normalExponent: 0.4, normalBias: 0, sphereForce: false, gaussianRandom: true, clampEdges: false, seed: 558923 } },
      { tool: "rocksmooth", params: { passes: 1, tension: 0, normals: true, grow: 0 } },
      { tool: "mesh:boulders", params: { count: 35, minSize: 0.025, maxSize: 0.12, height: 0.8, roughness: 0.6, smoothing: 0.5, avoidOverlap: true, seed: 558923 } },
      { tool: "mesh:rocks", params: { count: 25, minSize: 0.015, maxSize: 0.07, roughness: 0.6, detail: 2, embedDepth: 0.3, templates: 6, avoidOverlap: true, seed: 558923 } },
      { tool: "mesh:craters", params: { count: 4, minSize: 0.02, maxSize: 0.15, depthRatio: 0.15, rimHeight: 0.03, rimWidth: 0.2, ejectaExtent: 0.3, degradation: 0.7, sizeExponent: 2, avoidOverlap: true, spacing: 1, seed: 558923 } },
      { tool: "fx:material", params: { baseColor: "#5a5550", roughness: 0.95, metalness: 0.05, texture: "acg_rock_eroded_grey", applyTint: true, colorVariation: 0.3, colorVariationScale: 3 } },
      { tool: "fx:dust", params: { dustAmount: 0.3, dustColor: "#3a3530" } },
      { tool: "fx:ao", params: { aoStrength: 0.4, aoRadius: 0.5 } },
      { tool: "fx:features", params: { featureIntensity: 0.8, craterShading: 0.6, craterTint: "#484040", boulderShading: 1, boulderTint: "#7a7570", ridgeShading: 1, ridgeTint: "#706860", fissureShading: 1, fissureTint: "#3a3a40", layerShading: 1, layerTint: "#686060", normalStrength: 1.2 } },
    ],
  },
  {
    name: "Comet (Nucleus)",
    description: "Dark comet nucleus: layered terrain with deep fissures and dust (67P style)",
    sourceType: "create",
    baseMesh: "icosahedron0.obj",
    createParams: { nodes: 50, gaussianNodes: 30, walkNodes: 20, roundness: 0.2, seed: 671342 },
    steps: [
      { tool: "rockdetail", params: { depth: 5, subdivisionMode: "-4", interpolation: "-mid", basePerturbation: 0.18, baseExponent: 0.5, normalPerturbation: 0.15, normalExponent: 0.5, normalBias: 0, sphereForce: false, gaussianRandom: true, clampEdges: false, seed: 671342 } },
      { tool: "rocksmooth", params: { passes: 2, tension: 0, normals: true, grow: 0 } },
      { tool: "rockconvert", params: { scaleX: 1, scaleY: 1.8, scaleZ: 1.2, translateX: 0, translateY: 0, translateZ: 0 } },
      { tool: "mesh:fissures", params: { count: 8, depth: 0.025, width: 0.05, length: 0.6, branching: 0.5, jaggedness: 0.5, avoidOverlap: true, seed: 671342 } },
      { tool: "mesh:layers", params: { layers: 6, displacement: 0.025, noise: 0.4, sharpness: 0.6, seed: 671342 } },
      { tool: "mesh:craters", params: { count: 5, minSize: 0.03, maxSize: 0.2, depthRatio: 0.2, rimHeight: 0.04, rimWidth: 0.3, ejectaExtent: 0.3, degradation: 0.6, sizeExponent: 2, avoidOverlap: true, spacing: 0.8, seed: 671342 } },
      { tool: "fx:material", params: { baseColor: "#2a2a28", roughness: 0.9, metalness: 0.03, texture: "acg_rock_dark_cliff", applyTint: true, colorVariation: 0.2, colorVariationScale: 4 } },
      { tool: "mesh:pits", params: { count: 50, minSize: 0.01, maxSize: 0.05, depth: 0.15, wallSteepness: 0.8, seed: 671342 } },
      { tool: "fx:dust", params: { dustAmount: 0.4, dustColor: "#1a1815" } },
      { tool: "fx:frost", params: { frostAmount: 0.15, frostColor: "#c0d8e8", frostBias: 0.7 } },
      { tool: "fx:ao", params: { aoStrength: 0.4, aoRadius: 0.5 } },
      { tool: "fx:emission", params: { emissionColor: "#40ff80", emissionIntensity: 0.15, emissionPattern: "spots" } },
      { tool: "fx:features", params: { featureIntensity: 0.6, craterShading: 0.7, craterTint: "#201a18", boulderShading: 0.5, boulderTint: "#4a4540", ridgeShading: 0.5, ridgeTint: "#3a3530", fissureShading: 1, fissureTint: "#151515", layerShading: 1, layerTint: "#353028", normalStrength: 1.3 } },
    ],
  },
  {
    name: "Shard (Fragment)",
    description: "Angular fresh fragment: sharp edges, minimal weathering, metallic sheen",
    sourceType: "create",
    baseMesh: "icosahedron0.obj",
    createParams: { nodes: 18, gaussianNodes: 0, walkNodes: 0, roundness: 0.05, seed: 429061 },
    steps: [
      { tool: "rockdetail", params: { depth: 5, subdivisionMode: "-3", interpolation: "-mid", basePerturbation: 0.15, baseExponent: 0.7, normalPerturbation: 0.08, normalExponent: 0.3, normalBias: 0, sphereForce: false, gaussianRandom: false, clampEdges: false, seed: 429061 } },
      { tool: "rocksmooth", params: { passes: 1, tension: 0, normals: true, grow: 0 } },
      { tool: "mesh:craters", params: { count: 3, minSize: 0.02, maxSize: 0.1, depthRatio: 0.15, rimHeight: 0.03, rimWidth: 0.2, ejectaExtent: 0.2, degradation: 0.1, sizeExponent: 2, avoidOverlap: true, spacing: 1, seed: 429061 } },
      { tool: "mesh:facets", params: { count: 5, size: 0.4, flatness: 0.7, seed: 429061 } },
      { tool: "fx:material", params: { baseColor: "#a0a0a8", roughness: 0.4, metalness: 0.5, texture: "acg_rock_black_cave", applyTint: true, colorVariation: 0.25, colorVariationScale: 2 } },
      { tool: "fx:ao", params: { aoStrength: 0.3, aoRadius: 0.5 } },
      { tool: "fx:emission", params: { emissionColor: "#6080ff", emissionIntensity: 0.3, emissionPattern: "veins" } },
      { tool: "fx:features", params: { featureIntensity: 0.4, craterShading: 0.8, craterTint: "#505058", boulderShading: 1, boulderTint: "#909098", ridgeShading: 1, ridgeTint: "#8a8a90", fissureShading: 1, fissureTint: "#404048", layerShading: 1, layerTint: "#808088", normalStrength: 0.8 } },
    ],
  },
];

export type CollectedShaderParams = AsteroidMaterialParams;

const SHADER_DEFAULTS: CollectedShaderParams = { ...DEFAULT_ASTEROID_MATERIAL_PARAMS };

interface StudioState {
  tools: ToolDefinition[];
  samples: string[];

  sourceType: SourceType;
  baseMesh: string;
  createParams: Record<string, number | string | boolean>;

  steps: PipelineStep[];

  isGenerating: boolean;
  generationProgress: { step: number; total: number; tool: string } | null;
  abortGeneration: (() => void) | null;
  instantGenerate: boolean;
  autoLoadOnStart: boolean;
  meshModVersion: number;
  error: string | null;
  currentMeshId: string | null;
  currentMeshObj: string | null;
  currentInfo: MeshInfo | null;
  lastStderr: string | null;
  lastCliArgs: Record<string, string[]>;

  journal: JournalEntry[];

  wireframe: boolean;
  autoRotate: boolean;
  showGrid: boolean;

  lights: LightSource[];
  background: BackgroundConfig;
  lastCaptureResolution: [number, number] | null;

  rendererRef: unknown;
  sceneRef: unknown;
  cameraRef: unknown;

  viewMode: "globe" | "surface";
  terrainMeshObj: string | null;
  terrainInfo: MeshInfo | null;
  isGeneratingTerrain: boolean;
  terrainStateKey: string | null;

  collapsedSteps: Record<string, boolean>;

  setTools: (tools: ToolDefinition[]) => void;
  setSamples: (samples: string[]) => void;
  setSourceType: (type: SourceType) => void;
  setBaseMesh: (mesh: string) => void;
  setCreateParam: (name: string, value: number | string | boolean) => void;
  addStep: (tool: string) => void;
  removeStep: (id: string) => void;
  moveStep: (id: string, direction: "up" | "down") => void;
  updateStepParam: (stepId: string, paramName: string, value: number | string | boolean) => void;
  setGenerating: (v: boolean) => void;
  setGenerationProgress: (p: { step: number; total: number; tool: string } | null) => void;
  setAbortGeneration: (fn: (() => void) | null) => void;
  setInstantGenerate: (v: boolean) => void;
  setAutoLoadOnStart: (v: boolean) => void;
  bumpMeshModVersion: () => void;
  setError: (e: string | null) => void;
  setMeshResult: (id: string, obj: string, info: MeshInfo, stderr: string, cliArgs: Record<string, string[]>) => void;
  addJournalEntry: (entry: JournalEntry) => void;
  removeJournalEntry: (id: string) => void;
  loadFromJournal: (entry: JournalEntry) => void;
  setWireframe: (v: boolean) => void;
  setAutoRotate: (v: boolean) => void;
  setShowGrid: (v: boolean) => void;

  setLights: (lights: LightSource[]) => void;
  addLight: () => void;
  removeLight: (id: string) => void;
  updateLight: (id: string, changes: Partial<LightSource>) => void;
  toggleLight: (id: string) => void;

  setBackground: (changes: Partial<BackgroundConfig>) => void;
  loadScenePreset: (preset: ScenePreset) => void;

  setRendererRefs: (gl: unknown, scene: unknown, camera: unknown) => void;

  setViewMode: (mode: "globe" | "surface") => void;
  setTerrainResult: (obj: string, info: MeshInfo, stateKey: string) => void;
  setGeneratingTerrain: (v: boolean) => void;
  deriveTerrainParams: () => HeightmapParams;
  clearPipeline: () => void;
  toggleStepCollapsed: (id: string) => void;
  toggleStepEnabled: (id: string) => void;
  getAvailableTools: () => ToolDefinition[];
  getPipelineSteps: () => PipelineStep[];
  addFxStep: (type: FxStepType) => void;
  hasFxStep: (type: FxStepType) => boolean;
  addMeshStep: (type: MeshStepType) => void;
  hasMeshStep: (type: MeshStepType) => boolean;
  collectShaderParams: () => CollectedShaderParams;
  getModifiedMeshData: () => MeshData | null;
  getModifiedMeshObj: () => string | null;
  hasFxSteps: () => boolean;
  loadPreset: (preset: FullPreset) => void;
  clearJournal: () => void;
  randomizePipeline: (mode?: RandomMode) => void;
  importPipelineConfig: (config: { sourceType: string; baseMesh: string; createParams: Record<string, number | string | boolean>; steps: Array<{ tool: string; params: Record<string, number | string | boolean>; enabled?: boolean }>; scene?: { lights: Array<Record<string, unknown>>; background: Record<string, unknown> } }) => void;
  exportPipelineConfig: () => { version: 1; sourceType: string; baseMesh: string; createParams: Record<string, number | string | boolean>; steps: Array<{ tool: string; params: Record<string, number | string | boolean>; enabled?: boolean }>; scene: { lights: Array<Record<string, unknown>>; background: Record<string, unknown> } };
}

let stepCounter = 0;

function loadJournal(): JournalEntry[] {
  try {
    const stored = localStorage.getItem("rocktools-journal");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveJournal(journal: JournalEntry[]) {
  localStorage.setItem("rocktools-journal", JSON.stringify(journal));
}

interface DisplaySettings {
  wireframe: boolean;
  autoRotate: boolean;
  showGrid: boolean;
  instantGenerate: boolean;
  autoLoadOnStart: boolean;
  lightIntensity?: number;
  lights: LightSource[];
  background: BackgroundConfig;
}

const DISPLAY_DEFAULTS: DisplaySettings = {
  wireframe: false,
  autoRotate: true,
  showGrid: true,
  instantGenerate: true,
  autoLoadOnStart: false,
  lights: DEFAULT_LIGHTS,
  background: DEFAULT_BACKGROUND,
};

function loadDisplaySettings(): DisplaySettings {
  try {
    const s = localStorage.getItem("rocktools-display");
    if (!s) return DISPLAY_DEFAULTS;
    const parsed = JSON.parse(s);
    const result = { ...DISPLAY_DEFAULTS, ...parsed };
    // Backward compat: migrate old lightIntensity to per-light intensity
    if (parsed.lightIntensity !== undefined && !parsed.lights) {
      const mult = parsed.lightIntensity as number;
      result.lights = DEFAULT_LIGHTS.map((l) => ({ ...l, intensity: l.intensity * mult }));
    }
    if (!result.lights) result.lights = DEFAULT_LIGHTS;
    result.background = { ...DEFAULT_BACKGROUND, ...(parsed.background || {}) };
    return result;
  } catch {
    return DISPLAY_DEFAULTS;
  }
}

function saveDisplaySettings(settings: Partial<DisplaySettings>) {
  const current = loadDisplaySettings();
  const merged = { ...current, ...settings };
  if (merged.background) {
    merged.background = { ...merged.background, hdriCustomUrl: null, hdriCustomName: null };
  }
  localStorage.setItem("rocktools-display", JSON.stringify(merged));
}

const TRANSFORM_TOOLS = ["rockdetail", "rocksmooth", "rockconvert", "rocktrim"];

const _ds = loadDisplaySettings();

export const useStudioStore = create<StudioState>((set, get) => ({
  tools: TOOL_DEFINITIONS,
  samples: SAMPLE_MESHES,
  sourceType: "sample",
  baseMesh: "icosahedron0.obj",
  createParams: { nodes: 12, gaussianNodes: 0, walkNodes: 0, roundness: 0.0, seed: 1 },
  steps: [],
  isGenerating: false,
  generationProgress: null,
  abortGeneration: null,
  instantGenerate: _ds.instantGenerate,
  autoLoadOnStart: _ds.autoLoadOnStart,
  meshModVersion: 0,
  error: null,
  currentMeshId: null,
  currentMeshObj: null,
  currentInfo: null,
  lastStderr: null,
  lastCliArgs: {},
  journal: loadJournal(),
  wireframe: _ds.wireframe,
  autoRotate: _ds.autoRotate,
  showGrid: _ds.showGrid,
  lights: _ds.lights,
  background: _ds.background,
  lastCaptureResolution: null,
  rendererRef: null,
  sceneRef: null,
  cameraRef: null,
  viewMode: "globe",
  terrainMeshObj: null,
  terrainInfo: null,
  isGeneratingTerrain: false,
  terrainStateKey: null,
  collapsedSteps: { source: true },

  setTools: (tools) => set({ tools }),
  setSamples: (samples) => set({ samples }),
  setSourceType: (sourceType) => set({ sourceType }),
  setBaseMesh: (baseMesh) => set({ baseMesh }),

  setCreateParam: (name, value) => {
    set({ createParams: { ...get().createParams, [name]: value } });
  },

  addStep: (tool) => {
    if (tool === "rockcreate") return;
    if (tool.startsWith("fx:")) return;
    if (get().steps.some((s) => s.tool === tool)) return;
    const toolDef = get().tools.find((t) => t.name === tool);
    if (!toolDef) return;

    const defaults: Record<string, number | string | boolean> = {};
    for (const p of toolDef.params) {
      if (p.default !== undefined) defaults[p.name] = p.default;
    }

    const step: PipelineStep = {
      id: `step_${++stepCounter}`,
      tool,
      params: defaults,
    };
    set({ steps: [...get().steps, step] });
  },

  removeStep: (id) => set({ steps: get().steps.filter((s) => s.id !== id) }),

  moveStep: (id, direction) => {
    const steps = [...get().steps];
    const idx = steps.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= steps.length) return;
    const category = (t: string) => t.startsWith("fx:") ? "fx" : t.startsWith("mesh:") ? "mesh" : "transform";
    if (category(steps[idx]!.tool) !== category(steps[swap]!.tool)) return;
    [steps[idx], steps[swap]] = [steps[swap]!, steps[idx]!];
    set({ steps });
  },

  updateStepParam: (stepId, paramName, value) => {
    set({
      steps: get().steps.map((s) =>
        s.id === stepId ? { ...s, params: { ...s.params, [paramName]: value } } : s,
      ),
    });
  },

  setGenerating: (isGenerating) => set({ isGenerating }),
  setGenerationProgress: (generationProgress) => set({ generationProgress }),
  setAbortGeneration: (abortGeneration) => set({ abortGeneration }),
  setInstantGenerate: (instantGenerate) => {
    set({ instantGenerate });
    saveDisplaySettings({ instantGenerate });
  },
  setAutoLoadOnStart: (autoLoadOnStart) => {
    set({ autoLoadOnStart });
    saveDisplaySettings({ autoLoadOnStart });
  },
  bumpMeshModVersion: () => set((s) => ({ meshModVersion: s.meshModVersion + 1 })),
  setError: (error) => set({ error }),

  setMeshResult: (id, obj, info, stderr, cliArgs) =>
    set({ currentMeshId: id, currentMeshObj: obj, currentInfo: info, lastStderr: stderr, lastCliArgs: cliArgs }),

  addJournalEntry: (entry) => {
    const journal = [entry, ...get().journal].slice(0, 100);
    saveJournal(journal);
    set({ journal });
  },

  removeJournalEntry: (id) => {
    const journal = get().journal.filter((e) => e.id !== id);
    saveJournal(journal);
    set({ journal });
  },

  loadFromJournal: (entry) => {
    const firstStep = entry.steps[0];
    if (firstStep?.tool === "rockcreate") {
      set({
        sourceType: "create",
        createParams: { ...firstStep.params },
        steps: entry.steps.slice(1),
        baseMesh: entry.baseMesh,
      });
    } else {
      set({
        sourceType: "sample",
        steps: entry.steps,
        baseMesh: entry.baseMesh,
      });
    }
  },

  setWireframe: (wireframe) => {
    set({ wireframe });
    saveDisplaySettings({ wireframe });
  },
  setAutoRotate: (autoRotate) => {
    set({ autoRotate });
    saveDisplaySettings({ autoRotate });
  },
  setShowGrid: (showGrid) => {
    set({ showGrid });
    saveDisplaySettings({ showGrid });
  },

  setLights: (lights) => {
    set({ lights });
    saveDisplaySettings({ lights });
  },
  addLight: () => {
    const { lights } = get();
    if (lights.length >= MAX_LIGHTS) return;
    const id = `light_${Date.now()}`;
    const newLight: LightSource = {
      id, type: "directional", enabled: true, color: "#ffffff",
      intensity: 1.0, azimuth: 0, elevation: 45, distance: 5, castShadow: false,
    };
    const updated = [...lights, newLight];
    set({ lights: updated });
    saveDisplaySettings({ lights: updated });
  },
  removeLight: (id) => {
    const updated = get().lights.filter((l) => l.id !== id);
    set({ lights: updated });
    saveDisplaySettings({ lights: updated });
  },
  updateLight: (id, changes) => {
    const updated = get().lights.map((l) => l.id === id ? { ...l, ...changes } : l);
    set({ lights: updated });
    saveDisplaySettings({ lights: updated });
  },
  toggleLight: (id) => {
    const updated = get().lights.map((l) => l.id === id ? { ...l, enabled: !l.enabled } : l);
    set({ lights: updated });
    saveDisplaySettings({ lights: updated });
  },

  setBackground: (changes) => {
    const background = { ...get().background, ...changes };
    set({ background });
    saveDisplaySettings({ background });
  },
  loadScenePreset: (preset) => {
    const lights = preset.lights.map((l) => ({ ...l }));
    const background = { ...preset.background };
    set({ lights, background });
    saveDisplaySettings({ lights, background });
  },

  setRendererRefs: (gl, scene, camera) => {
    set({ rendererRef: gl, sceneRef: scene, cameraRef: camera });
  },

  setViewMode: (viewMode) => set({ viewMode }),
  setTerrainResult: (obj, info, stateKey) => set({ terrainMeshObj: obj, terrainInfo: info, terrainStateKey: stateKey }),
  setGeneratingTerrain: (isGeneratingTerrain) => set({ isGeneratingTerrain }),

  deriveTerrainParams: () => {
    const { steps, createParams } = get();
    const detail = steps.find((s) => s.tool === "rockdetail");
    const np = Number(detail?.params.normalPerturbation ?? 0.2);
    const ne = Number(detail?.params.normalExponent ?? 0.5);
    const depth = Number(detail?.params.depth ?? 4);
    const bp = Number(detail?.params.basePerturbation ?? 0.1);
    return {
      scale: (3.0 + np * 4.0) * 256,
      octaves: Math.min(depth, 6),
      amplitude: Math.max(0.1, Math.min(1.0, np * 2.0)),
      lacunarity: 1.8 + bp * 0.5,
      persistence: 0.3 + ne * 0.3,
      resolution: 256,
    };
  },

  clearPipeline: () => set({ steps: [], error: null }),

  toggleStepCollapsed: (id) => {
    const collapsed = { ...get().collapsedSteps };
    collapsed[id] = !collapsed[id];
    set({ collapsedSteps: collapsed });
  },

  toggleStepEnabled: (id) => {
    set({ steps: get().steps.map((s) =>
      s.id === id ? { ...s, enabled: s.enabled === false ? true : false } : s
    ) });
  },

  getAvailableTools: () => {
    return get().tools.filter((t) => TRANSFORM_TOOLS.includes(t.name));
  },

  getPipelineSteps: () => {
    const { sourceType, createParams, steps } = get();
    const rockSteps = steps.filter((s) => !s.tool.startsWith("fx:") && !s.tool.startsWith("mesh:") && s.enabled !== false);
    if (sourceType === "create") {
      return [{ id: "source_create", tool: "rockcreate", params: createParams }, ...rockSteps];
    }
    return rockSteps;
  },

  addFxStep: (type) => {
    if (get().steps.some((s) => s.tool === type)) return;
    const def = FX_STEPS[type];
    const step: PipelineStep = {
      id: `fx_${type}_${++stepCounter}`,
      tool: type,
      params: { ...def.params } as Record<string, number | string | boolean>,
    };
    set({ steps: [...get().steps, step] });
  },

  hasFxStep: (type) => get().steps.some((s) => s.tool === type),

  addMeshStep: (type) => {
    if (get().steps.some((s) => s.tool === type)) return;
    const def = MESH_STEPS[type];
    const step: PipelineStep = {
      id: `mesh_${type}_${++stepCounter}`,
      tool: type,
      params: { ...def.params } as Record<string, number | string | boolean>,
    };
    // Insert mesh steps before fx steps
    const nonFx = get().steps.filter((s) => !s.tool.startsWith("fx:"));
    const fx = get().steps.filter((s) => s.tool.startsWith("fx:"));
    set({ steps: [...nonFx, step, ...fx] });
  },

  hasMeshStep: (type) => get().steps.some((s) => s.tool === type),

  hasFxSteps: () => get().steps.some((s) => s.tool.startsWith("fx:")),

  collectShaderParams: () => {
    const { steps } = get();
    const result = { ...SHADER_DEFAULTS };
    for (const step of steps) {
      if (!step.tool.startsWith("fx:") || step.enabled === false) continue;
      for (const [key, val] of Object.entries(step.params)) {
        (result as Record<string, number | string | boolean>)[key] = val;
      }
    }
    return result;
  },

  getModifiedMeshData: () => {
    const { currentMeshObj, steps } = get();
    if (!currentMeshObj) return null;
    let meshData = parseOBJToMeshData(currentMeshObj);
    const meshSteps = steps.filter((s) => s.tool.startsWith("mesh:") && s.enabled !== false);
    for (const step of meshSteps) {
      const modifier = MESH_MODIFIER_MAP[step.tool];
      if (modifier) meshData = modifier.apply(meshData, step.params);
    }
    return meshData;
  },

  getModifiedMeshObj: () => {
    const meshData = get().getModifiedMeshData();
    if (!meshData) return null;
    return meshDataToOBJ(meshData);
  },

  loadPreset: (preset) => {
    const steps = preset.steps.map((s) => ({
      id: `preset_${++stepCounter}`,
      tool: s.tool,
      params: { ...s.params },
    }));
    const collapsedSteps: Record<string, boolean> = { source: true };
    for (const s of steps) collapsedSteps[s.id] = true;
    set({
      sourceType: preset.sourceType,
      baseMesh: preset.baseMesh,
      createParams: { ...preset.createParams },
      steps,
      collapsedSteps,
    });
  },

  clearJournal: () => {
    saveJournal([]);
    set({ journal: [] });
  },

  randomizePipeline: (mode?: RandomMode) => {
    const { samples, instantGenerate } = get();
    if (instantGenerate) set({ instantGenerate: false });
    set({ steps: [], currentMeshObj: null, currentMeshId: null, currentInfo: null, lastStderr: null, lastCliArgs: {} });

    const seed = Math.floor(Math.random() * 999999) + 1;
    const rand = () => Math.random();
    const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
    const randFloat = (min: number, max: number) => min + rand() * (max - min);
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

    const textureChoices = TEXTURE_LIST.filter((t) => t !== "none");
    const randTexture = () => rand() > 0.2 ? pick([...textureChoices]) : "none";
    const colors = ["#878787", "#7b7a6f", "#d7d5c6", "#a0b8c8", "#3d3530", "#7a6b5a", "#8a8a90", "#5a4a3a", "#6b6050"];

    // ── Preset-based randomization ─────────────────────────────────
    const varyNum = (v: number | string | boolean, lo: number, hi: number) =>
      typeof v === "number" ? v * randFloat(lo, hi) : v;

    function fromPreset(preset: FullPreset) {
      const steps = preset.steps.map((s) => {
        const p = { ...s.params } as Record<string, number | string | boolean>;
        if (p.seed !== undefined) p.seed = seed;

        if (s.tool === "fx:material") {
          const tex = randTexture();
          p.texture = tex;
          p.applyTint = tex !== "none";
          p.baseColor = pick(colors);
          p.roughness = clamp(varyNum(p.roughness, 0.8, 1.2) as number, 0, 1);
          p.metalness = clamp(varyNum(p.metalness, 0.6, 1.4) as number, 0, 1);
          p.colorVariation = clamp(varyNum(p.colorVariation, 0.6, 1.5) as number, 0.05, 1);
          p.colorVariationScale = clamp(varyNum(p.colorVariationScale, 0.7, 1.4) as number, 0.5, 10);
        }

        if (s.tool.startsWith("mesh:")) {
          if (typeof p.count === "number") p.count = Math.max(1, Math.round(p.count * randFloat(0.5, 1.5)));
          for (const k of ["minSize", "maxSize", "height", "width", "length", "depth", "displacement"]) {
            if (typeof p[k] === "number") p[k] = Math.max(0.001, (p[k] as number) * randFloat(0.7, 1.3));
          }
        }

        if (s.tool === "rockdetail") {
          p.basePerturbation = (p.basePerturbation as number) * randFloat(0.7, 1.4);
          p.normalPerturbation = (p.normalPerturbation as number) * randFloat(0.7, 1.4);
        }

        if (s.tool === "rocksmooth") {
          p.passes = Math.max(1, (p.passes as number) + randInt(-1, 2));
        }

        if (s.tool === "fx:dust") p.dustAmount = clamp(varyNum(p.dustAmount, 0.5, 1.5) as number, 0, 1);
        if (s.tool === "fx:veins") {
          p.veinIntensity = clamp(varyNum(p.veinIntensity, 0.5, 1.5) as number, 0, 1);
          p.veinScale = clamp(varyNum(p.veinScale, 0.7, 1.4) as number, 1, 12);
        }
        if (s.tool === "fx:subsurface") p.subsurface = clamp(varyNum(p.subsurface, 0.7, 1.3) as number, 0, 1);
        if (s.tool === "fx:ao") {
          p.aoStrength = clamp(varyNum(p.aoStrength, 0.7, 1.3) as number, 0, 1);
          p.aoRadius = clamp(varyNum(p.aoRadius, 0.7, 1.3) as number, 0, 1);
        }
        if (s.tool === "fx:frost") {
          p.frostAmount = clamp(varyNum(p.frostAmount, 0.5, 1.5) as number, 0, 1);
          p.frostBias = clamp(varyNum(p.frostBias, 0.7, 1.3) as number, 0, 1);
        }
        if (s.tool === "fx:weathering") {
          p.weatherAmount = clamp(varyNum(p.weatherAmount, 0.5, 1.5) as number, 0, 1);
          p.directionBias = clamp(varyNum(p.directionBias, 0.7, 1.3) as number, 0, 1);
        }
        if (s.tool === "fx:emission") {
          p.emissionIntensity = clamp(varyNum(p.emissionIntensity, 0.5, 1.5) as number, 0, 2);
        }
        if (s.tool === "fx:features") {
          p.featureIntensity = clamp(varyNum(p.featureIntensity, 0.7, 1.3) as number, 0.1, 1);
          p.normalStrength = clamp(varyNum(p.normalStrength, 0.7, 1.4) as number, 0.3, 2);
        }

        return { id: `rand_${++stepCounter}`, tool: s.tool, params: p };
      });

      const cp = { ...preset.createParams } as Record<string, number | string | boolean>;
      if (preset.sourceType === "create") {
        cp.seed = seed;
        cp.nodes = Math.max(8, Math.round((cp.nodes as number) * randFloat(0.7, 1.3)));
        cp.roundness = clamp((cp.roundness as number) * randFloat(0.7, 1.3), 0, 1);
      }

      const collapsed: Record<string, boolean> = { source: true };
      for (const s of steps) collapsed[s.id] = true;
      set({ sourceType: preset.sourceType, baseMesh: preset.baseMesh, createParams: cp, steps, collapsedSteps: collapsed });
    }

    // ── Full random ────────────────────────────────────────────────
    function fullRandom() {
      const useCreate = rand() > 0.3;
      let sourceType: SourceType;
      let baseMesh: string;
      let createParams: Record<string, number | string | boolean>;

      if (useCreate) {
        sourceType = "create";
        baseMesh = samples.length > 0 ? pick(samples) : "icosahedron0.obj";
        createParams = {
          nodes: randInt(25, 80), // Organic shape base (increased min from 8 to 25)
          gaussianNodes: rand() > 0.4 ? randInt(0, 50) : 0,
          walkNodes: rand() > 0.5 ? randInt(0, 50) : 0,
          roundness: randFloat(0.1, 0.65), // Ensures natural, irregular but structured shape
          seed,
        };
      } else {
        sourceType = "sample";
        baseMesh = samples.length > 0 ? pick(samples) : "icosahedron0.obj";
        createParams = { nodes: 12, gaussianNodes: 0, walkNodes: 0, roundness: 0, seed: 1 };
      }

      const allSteps: PipelineStep[] = [];

      allSteps.push({
        id: `rand_${++stepCounter}`,
        tool: "rockdetail",
        params: {
          depth: randInt(5, 7), // Guaranteed high-fidelity detail level (5 to 7 instead of 3 to 7)
          subdivisionMode: pick(["-4", "-3"]),
          interpolation: pick(["-spl", "-mid"]),
          basePerturbation: randFloat(0.08, 0.25), // Healthy amount of structural noise
          baseExponent: randFloat(0.35, 0.85),
          normalPerturbation: randFloat(0.08, 0.28), // Crisp protrusions, prevents mesh self-intersection explosion
          normalExponent: randFloat(0.3, 0.7),
          normalBias: rand() > 0.6 ? randFloat(-0.12, 0.12) : 0,
          sphereForce: rand() > 0.6,
          gaussianRandom: rand() > 0.4,
          clampEdges: false,
          seed,
        },
      });

      if (rand() > 0.15) {
        allSteps.push({
          id: `rand_${++stepCounter}`,
          tool: "rocksmooth",
          params: {
            passes: randInt(1, 4), // Limited maximum passes to prevent the model from looking like a melted liquid potato
            tension: rand() > 0.7 ? randFloat(0, 1) : 0,
            normals: true,
            grow: rand() > 0.85 ? randFloat(-0.02, 0.02) : 0,
          },
        });
      }

      if (rand() > 0.8) {
        allSteps.push({
          id: `rand_${++stepCounter}`,
          tool: "rockconvert",
          params: {
            scaleX: randFloat(0.8, 1.2),
            scaleY: randFloat(0.9, 1.7), // Moderate stretch range for realistic elongated asteroids
            scaleZ: randFloat(0.9, 1.7),
            translateX: 0, translateY: 0, translateZ: 0,
          },
        });
      }

      const meshTypes: MeshStepType[] = ["mesh:craters", "mesh:boulders", "mesh:rocks", "mesh:ridges", "mesh:fissures", "mesh:layers", "mesh:pits", "mesh:erosion", "mesh:facets"];
      const numMeshMods = randInt(2, 4); // Always apply at least 2 layers of features for a rich, interesting surface
      const shuffled = [...meshTypes].sort(() => rand() - 0.5).slice(0, numMeshMods);
      for (const type of shuffled) {
        const def = MESH_STEPS[type];
        const params = { ...def.params } as Record<string, number | string | boolean>;
        params.seed = seed;
        for (const [k, v] of Object.entries(params)) {
          if (typeof v === "number" && k !== "seed") {
            params[k] = Math.max(0, (v as number) * randFloat(0.4, 1.8));
          }
        }
        allSteps.push({ id: `rand_mesh_${++stepCounter}`, tool: type, params });
      }

      const tex = randTexture();
      const isMetal = rand() > 0.75;
      const isIce = !isMetal && rand() > 0.8;

      let roughness = randFloat(0.7, 0.95);
      let metalness = randFloat(0.05, 0.2);
      if (isMetal) {
        roughness = randFloat(0.2, 0.45); // Reflective metal
        metalness = randFloat(0.5, 0.85); // High iron-nickel factor
      } else if (isIce) {
        roughness = randFloat(0.15, 0.35); // Glossy ice
        metalness = 0;
      }

      allSteps.push({
        id: `rand_fx_${++stepCounter}`,
        tool: "fx:material",
        params: {
          baseColor: pick(colors),
          roughness,
          metalness,
          texture: tex,
          applyTint: tex !== "none",
          colorVariation: randFloat(0.15, 0.6), // Visually rich albedo patterns
          colorVariationScale: randFloat(1.5, 5),
        },
      });

      if (rand() > 0.15) { // High probability of details shading to pop features
        allSteps.push({
          id: `rand_fx_${++stepCounter}`,
          tool: "fx:features",
          params: {
            featureIntensity: randFloat(0.55, 1),
            craterShading: randFloat(0.6, 1), craterTint: pick(["#151515", "#3a3020", "#483c38"]),
            boulderShading: randFloat(0.6, 1), boulderTint: pick(["#8a8a7a", "#6a6a5a", "#a0a090"]),
            ridgeShading: randFloat(0.6, 1), ridgeTint: pick(["#9a9080", "#7a7060", "#b0a090"]),
            fissureShading: randFloat(0.7, 1), fissureTint: pick(["#202028", "#151520", "#303038"]),
            layerShading: randFloat(0.6, 1), layerTint: pick(["#686860", "#55554e", "#808078"]),
            normalStrength: randFloat(0.8, 1.8), // Reinforces detail textures in 3D viewport
          },
        });
      }

      if (rand() > 0.65) {
        allSteps.push({
          id: `rand_fx_${++stepCounter}`,
          tool: "fx:dust",
          params: {
            dustAmount: randFloat(0.1, 0.4),
            dustColor: pick(["#2a2420", "#3a3020", "#1a1a15"]),
          },
        });
      }

      if (rand() > 0.55) {
        allSteps.push({
          id: `rand_fx_${++stepCounter}`,
          tool: "fx:veins",
          params: {
            veinIntensity: randFloat(0.1, 0.5),
            veinScale: randFloat(1.5, 8),
            veinColor: pick(["#8a7a60", "#d0e8f0", "#b0a080", "#6a6a80"]),
          },
        });
      }

      if (isIce || rand() > 0.8) {
        allSteps.push({
          id: `rand_fx_${++stepCounter}`,
          tool: "fx:subsurface",
          params: { subsurface: isIce ? randFloat(0.4, 0.8) : randFloat(0.2, 0.7) },
        });
      }

      if (rand() > 0.35) { // Always apply a decent amount of AO to accentuate valleys
        allSteps.push({
          id: `rand_fx_${++stepCounter}`,
          tool: "fx:ao",
          params: { aoStrength: randFloat(0.35, 0.75), aoRadius: randFloat(0.3, 0.75) },
        });
      }

      if (rand() > 0.85) {
        allSteps.push({
          id: `rand_fx_${++stepCounter}`,
          tool: "fx:frost",
          params: { frostAmount: randFloat(0.1, 0.5), frostColor: pick(["#d0e8ff", "#a0c8e0", "#e0f0ff"]), frostBias: randFloat(0.2, 0.8) },
        });
      }

      if (rand() > 0.7) {
        allSteps.push({
          id: `rand_fx_${++stepCounter}`,
          tool: "fx:weathering",
          params: { weatherAmount: randFloat(0.15, 0.5), weatherTint: pick(["#3a2820", "#4a3020", "#2a1a18"]), directionBias: randFloat(0.2, 0.8) },
        });
      }

      if (rand() > 0.9) {
        allSteps.push({
          id: `rand_fx_${++stepCounter}`,
          tool: "fx:emission",
          params: { emissionColor: pick(["#ff6030", "#40ff80", "#6080ff", "#ff4040"]), emissionIntensity: randFloat(0.2, 1.0), emissionPattern: pick(["spots", "veins", "patches"]) },
        });
      }

      const collapsed: Record<string, boolean> = { source: true };
      for (const s of allSteps) collapsed[s.id] = true;
      set({ sourceType, baseMesh, createParams, steps: allSteps, collapsedSteps: collapsed });
    }

    // ── Dispatch by mode ───────────────────────────────────────────
    if (!mode) {
      if (rand() < 0.25) fromPreset(pick(FULL_PRESETS));
      else fullRandom();
    } else if (mode === "full") {
      fullRandom();
    } else if (mode === "any-preset") {
      fromPreset(pick(FULL_PRESETS));
    } else {
      const preset = FULL_PRESETS.find((p) => p.name.startsWith(mode));
      if (preset) fromPreset(preset);
      else fullRandom();
    }

    if (instantGenerate) set({ instantGenerate: true });
  },

  importPipelineConfig: (config) => {
    const steps: PipelineStep[] = config.steps.map((s) => ({
      id: `import_${++stepCounter}`,
      tool: s.tool,
      params: { ...s.params },
      ...(s.enabled === false ? { enabled: false } : {}),
    }));
    const collapsedSteps: Record<string, boolean> = { source: true };
    for (const s of steps) collapsedSteps[s.id] = true;
    const updates: Partial<StudioState> = {
      sourceType: (config.sourceType || "create") as SourceType,
      baseMesh: config.baseMesh || "icosahedron0.obj",
      createParams: { ...config.createParams },
      steps,
      collapsedSteps,
    };
    if (config.scene) {
      if (Array.isArray(config.scene.lights) && config.scene.lights.length > 0) {
        updates.lights = config.scene.lights as unknown as LightSource[];
        saveDisplaySettings({ lights: updates.lights! });
      }
      if (config.scene.background) {
        updates.background = { ...DEFAULT_BACKGROUND, ...config.scene.background } as BackgroundConfig;
        saveDisplaySettings({ background: updates.background! });
      }
    }
    set(updates);
  },

  exportPipelineConfig: () => {
    const { sourceType, baseMesh, createParams, steps, lights, background } = get();
    return {
      version: 1 as const,
      sourceType,
      baseMesh,
      createParams: { ...createParams },
      steps: steps.map((s) => ({ tool: s.tool, params: { ...s.params }, ...(s.enabled === false ? { enabled: false } : {}) })),
      scene: {
        lights: lights.map((l) => ({ ...l })) as Array<Record<string, unknown>>,
        background: { ...background, hdriCustomUrl: undefined, hdriCustomName: undefined } as Record<string, unknown>,
      },
    };
  },
}));
