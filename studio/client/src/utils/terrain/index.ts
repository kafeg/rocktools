/**
 * Terrain generation library — pure, deterministic, no React/Three deps.
 *
 * Public entry point for both the studio UI and the headless CLI / game runtime.
 * A fixed asteroid (style.asteroidSeed) yields unlimited reproducible surface
 * variants by varying only `surfaceSeed`.
 */

export * from "./noise";
export * from "./terrainField";
export * from "./terrainStyle";
export * from "./terrainScatter";
export * from "./terrainMeta";
export * from "./generateTerrain";
