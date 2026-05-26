export const ASTEROID_TEXTURE_LIST = [
  "none",
  "voronoi_gray",
  "voronoi_brown",
  "voronoi_rounded",
  "cellular_brown",
  "cellular_cracked",
  "granular_rock",
  "marble_dark",
  "marble_streaked",
  "marble_blue",
  "layered_brown",
  "rusty_iron",
  "weathered_rust",
  "pitted_red",
  "weathered_lichen",
  "olive_noise",
  "acg_rock_black_cave",
  "acg_rock_dark_cliff",
  "acg_rock_dark_rough",
  "acg_rock_desert_orange",
  "acg_rock_eroded_grey",
  "acg_rock_black_smooth",
  "acg_rock_grey_smooth",
  "acg_rock_grey_layers",
  "acg_rock_grey_rough",
  "acg_ice_frozen",
  "acg_lava_bright",
  "acg_lava_dark",
] as const;

export type AsteroidTextureId = (typeof ASTEROID_TEXTURE_LIST)[number];

export interface AsteroidMaterialParams {
  baseColor: string;
  roughness: number;
  metalness: number;
  texture: string;
  applyTint: boolean;
  colorVariation: number;
  colorVariationScale: number;
  dustAmount: number;
  dustColor: string;
  veinIntensity: number;
  veinScale: number;
  veinColor: string;
  subsurface: number;
  featureIntensity: number;
  craterShading: number;
  craterTint: string;
  boulderShading: number;
  boulderTint: string;
  ridgeShading: number;
  ridgeTint: string;
  fissureShading: number;
  fissureTint: string;
  layerShading: number;
  layerTint: string;
  normalStrength: number;
  aoStrength: number;
  aoRadius: number;
  frostAmount: number;
  frostColor: string;
  frostBias: number;
  weatherAmount: number;
  weatherTint: string;
  directionBias: number;
  emissionColor: string;
  emissionIntensity: number;
  emissionPattern: string;
}

export const DEFAULT_ASTEROID_MATERIAL_PARAMS: AsteroidMaterialParams = {
  baseColor: "#8a8a7a",
  roughness: 0.85,
  metalness: 0.1,
  texture: "none",
  applyTint: false,
  colorVariation: 0.0,
  colorVariationScale: 2.5,
  dustAmount: 0.0,
  dustColor: "#2a2420",
  veinIntensity: 0.0,
  veinScale: 3.0,
  veinColor: "#8a7a60",
  subsurface: 0.0,
  featureIntensity: 0.0,
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
  aoStrength: 0.0,
  aoRadius: 0.5,
  frostAmount: 0.0,
  frostColor: "#d0e8ff",
  frostBias: 0.5,
  weatherAmount: 0.0,
  weatherTint: "#3a2820",
  directionBias: 0.5,
  emissionColor: "#ff6030",
  emissionIntensity: 0.0,
  emissionPattern: "spots",
};

export interface AsteroidMaterialAsset {
  shaderFamily: "asteroid-material";
  shaderVersion: "v1";
  material: AsteroidMaterialParams;
  textures?: {
    diffuse?: string;
    normal?: string;
  };
}
