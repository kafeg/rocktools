import { craterModifier } from "./craterModifier";
import { boulderModifier } from "./boulderModifier";
import { erosionModifier } from "./erosionModifier";
import { facetModifier } from "./facetModifier";
import { fissureModifier } from "./fissureModifier";
import { layerModifier } from "./layerModifier";
import { pitModifier } from "./pitModifier";
import { ridgeModifier } from "./ridgeModifier";
import { rockModifier } from "./rockModifier";
import type { MeshData } from "./meshModifiers";

export const MESH_MODIFIER_MAP: Record<string, { apply: (mesh: MeshData, params: Record<string, number | string | boolean>) => MeshData }> = {
  "mesh:craters": craterModifier,
  "mesh:boulders": boulderModifier,
  "mesh:erosion": erosionModifier,
  "mesh:facets": facetModifier,
  "mesh:fissures": fissureModifier,
  "mesh:layers": layerModifier,
  "mesh:pits": pitModifier,
  "mesh:ridges": ridgeModifier,
  "mesh:rocks": rockModifier,
};
