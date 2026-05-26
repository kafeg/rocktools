import type { ToolDefinition } from "./types";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "rockcreate",
    description: "Create initial rock shape by wrapping a convex hull around randomly generated points",
    binary: "rockcreate",
    acceptsInput: false,
    producesOutput: true,
    params: [
      { name: "nodes", flag: "-n", type: "integer", description: "Number of random nodes within a unit cube", default: 12, min: 4, max: 1000 },
      { name: "gaussianNodes", flag: "-g", type: "integer", description: "Number of nodes using Gaussian distribution", default: 0, min: 0, max: 1000 },
      { name: "walkNodes", flag: "-w", type: "integer", description: "Number of nodes along a random walk", default: 0, min: 0, max: 1000 },
      { name: "roundness", flag: "-r", type: "number", description: "Relative roundness. <1 = more variety, >1 = closer to sphere", default: 0.0, min: 0, max: 10, step: 0.1 },
      { name: "seed", flag: "-s", type: "integer", description: "Random seed", default: 1, min: 1, max: 999999 },
    ],
  },
  {
    name: "rockdetail",
    description: "Recursively subdivide and perturb mesh triangles to add detail/roughness",
    binary: "rockdetail",
    acceptsInput: true,
    producesOutput: true,
    params: [
      { name: "depth", flag: "-d", type: "integer", description: "Recursion depth (each level = 4x triangles)", default: 4, min: 1, max: 8 },
      { name: "subdivisionMode", flag: "-4", type: "select", description: "Subdivision scheme", default: "-4", options: ["-4", "-3"] },
      { name: "interpolation", flag: "-spl", type: "select", description: "Node placement interpolation method", default: "-spl", options: ["-spl", "-mid"] },
      { name: "basePerturbation", flag: "-b", type: "number", description: "Base perturbation: movement in surface plane", default: 0.1, min: 0, max: 1.0, step: 0.01 },
      { name: "baseExponent", flag: "-be", type: "number", description: "Base exponent: <1 more uniform, >1 rougher", default: 0.5, min: 0.1, max: 3.0, step: 0.1 },
      { name: "normalPerturbation", flag: "-n", type: "number", description: "Normal perturbation: movement normal to surface", default: 0.1, min: 0, max: 1.0, step: 0.01 },
      { name: "normalExponent", flag: "-ne", type: "number", description: "Normal exponent: <1 smoother, >1 makes spikes", default: 0.5, min: 0.1, max: 3.0, step: 0.1 },
      { name: "normalBias", flag: "-nb", type: "number", description: "Normal bias: positive = more bubbly surface", default: 0.0, min: -1.0, max: 1.0, step: 0.05 },
      { name: "sphereForce", flag: "-sph", type: "boolean", description: "Force shape toward sphere at every level", default: false },
      { name: "gaussianRandom", flag: "-gr", type: "boolean", description: "Use Gaussian random numbers for perturbations", default: false },
      { name: "clampEdges", flag: "-ce", type: "boolean", description: "Clamp open edges to maintain straight lines", default: false },
      { name: "seed", flag: "-se", type: "integer", description: "Random seed", default: 1, min: 1, max: 999999 },
    ],
  },
  {
    name: "rocksmooth",
    description: "Smooth mesh using Laplacian filter",
    binary: "rocksmooth",
    acceptsInput: true,
    producesOutput: true,
    params: [
      { name: "passes", flag: "-s", type: "integer", description: "Number of Laplace smoothing passes", default: 3, min: 1, max: 100 },
      { name: "tension", flag: "-t", type: "number", description: "Surface tension smoothing coefficient", default: 0, min: 0, max: 10, step: 0.1 },
      { name: "normals", flag: "-n", type: "boolean", description: "Calculate and output surface normals", default: true },
      { name: "grow", flag: "-grow", type: "number", description: "Grow/shrink surface in normal direction", default: 0, min: -1.0, max: 1.0, step: 0.01 },
    ],
  },
  {
    name: "rockconvert",
    description: "Convert format with optional scale/translate transformations",
    binary: "rockconvert",
    acceptsInput: true,
    producesOutput: true,
    params: [
      { name: "scaleX", flag: "-sx", type: "number", description: "Scale X", default: 1.0, min: 0.01, max: 100, step: 0.1 },
      { name: "scaleY", flag: "-sy", type: "number", description: "Scale Y", default: 1.0, min: 0.01, max: 100, step: 0.1 },
      { name: "scaleZ", flag: "-sz", type: "number", description: "Scale Z", default: 1.0, min: 0.01, max: 100, step: 0.1 },
      { name: "translateX", flag: "-tx", type: "number", description: "Translate X", default: 0, min: -10, max: 10, step: 0.1 },
      { name: "translateY", flag: "-ty", type: "number", description: "Translate Y", default: 0, min: -10, max: 10, step: 0.1 },
      { name: "translateZ", flag: "-tz", type: "number", description: "Translate Z", default: 0, min: -10, max: 10, step: 0.1 },
    ],
  },
  {
    name: "rocktrim",
    description: "Selectively remove triangles based on coordinate bounds",
    binary: "rocktrim",
    acceptsInput: true,
    producesOutput: true,
    params: [
      { name: "minX", flag: "-x", type: "number", description: "Trim below this X value", default: 0, min: -10, max: 10, step: 0.1 },
      { name: "maxX", flag: "+x", type: "number", description: "Trim above this X value", default: 0, min: -10, max: 10, step: 0.1 },
      { name: "smooth", flag: "-s", type: "boolean", description: "Smooth trimming (interpolate edge crossings)", default: true },
    ],
  },
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

export const SAMPLE_MESHES = [
  "icosahedron0.obj",
  "tetra0.obj",
  "cube0.obj",
  "hex0.obj",
  "plate0.obj",
];
