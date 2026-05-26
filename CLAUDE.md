# Rocktools Studio

Procedural asteroid/rock mesh generator. Fork of Mark J. Stock's rocktools (C CLI toolkit).
We work on the **web application** (`studio/`), not the C code or WASM binaries.

## What this is

Browser-based procedural asteroid/rock mesh generator. Fork of Mark J. Stock's rocktools
C toolkit, compiled to WASM and wrapped in a modern web app with additional mesh modifiers
and GPU shader effects. Deployed at https://kafeg.github.io/rocktools/

## Rules

- **Do NOT modify C source files** (*.c, *.h) — this is a fork, C code belongs to upstream
- **Do NOT modify `wasm/`** — pre-built WASM binaries, rebuilt via `build-wasm.sh` + Docker
- Communication language: Russian

## Stack

- TypeScript (strict), React 18, Three.js + React Three Fiber
- Vite, Zustand 5, Tailwind CSS 3, Vitest
- WASM (Emscripten-compiled C tools running in browser via Web Workers)

## Project structure

```
rocktools/
  *.c, *.h              # C source (DO NOT EDIT)
  wasm/                  # Pre-built WASM binaries (DO NOT EDIT)
  samples/               # Base mesh OBJ files (icosahedron0, tetra0, cube0, hex0, plate0)
  studio/                # Web application (THIS IS WHAT WE WORK ON)
    client/              # Vite + React app
      src/
        components/      # React UI components
        hooks/           # useApi.ts — WASM pipeline execution (Web Worker + fallback)
        stores/          # useStudioStore.ts — Zustand state (pipeline, mesh, presets, FX)
        utils/           # Mesh modifiers, export, parsing, PRNG
        wasm/            # Worker types + pipeline worker
        toolDefinitions.ts  # WASM tool param definitions (rockcreate, rockdetail, etc.)
        types.ts         # Core types (ToolDefinition, PipelineStep, MeshInfo, JournalEntry)
        App.tsx          # Root layout: left pipeline + center 3D + right info/help
      public/
        wasm/            # WASM binaries served to browser
        samples/         # Base mesh OBJ files
    cli/                 # Node CLI for headless GLB export
    tests/               # Vitest unit tests
```

## Architecture: 3-tier pipeline

```
SOURCE → TRANSFORM* → MESH MODIFIER* → SHADER EFFECT*
```

### 1. WASM Tools (source + transforms)
Compiled C programs running in-browser via Emscripten. Executed in a Web Worker
(`hooks/useApi.ts` → `wasm/pipeline.worker.ts`) with 30s timeout and main-thread fallback.

- `rockcreate` — generate initial convex hull from random points (SOURCE)
- `rockdetail` — recursive subdivision + perturbation (TRANSFORM)
- `rocksmooth` — Laplacian smoothing (TRANSFORM)
- `rockconvert` — scale/translate (TRANSFORM)
- `rocktrim` — coordinate-bound triangle removal (TRANSFORM)

Tool definitions: `toolDefinitions.ts`. Pipeline steps stored in Zustand store.

### 2. Mesh Modifiers (client-side JS)
Vertex displacement applied after WASM pipeline. Each modifier in `utils/`:

- `craterModifier.ts` — impact craters with rim + ejecta
- `boulderModifier.ts` — surface protrusions
- `ridgeModifier.ts` — linear ridges/grooves
- `fissureModifier.ts` — branching fracture cracks
- `layerModifier.ts` — stratification bands

Registry: `utils/modifierMap.ts`. Heightmap tracking: `utils/heightmap.ts`.
Feature data (which vertices belong to which feature) passed to shaders.

### 3. Shader Effects (GPU)
Custom PBR material (`components/AsteroidMaterial.tsx`) with per-feature shading:

- `fx:material` — base PBR (color, roughness, metalness, color variation)
- `fx:dust` — regolith accumulation in concavities
- `fx:veins` — mineral vein network via noise
- `fx:subsurface` — SSS for translucent materials
- `fx:features` — per-modifier tint/shading (crater, boulder, ridge, fissure, layer)

Definitions: `stores/useStudioStore.ts` (`MESH_STEPS`, `FX_STEPS`).

## Key components

| File | Role |
|------|------|
| `App.tsx` | 3-column layout: PipelineEditor / Viewer3D / InfoPanel+HelpPage |
| `PipelineEditor.tsx` | Left panel: pipeline steps, presets, add/remove tools |
| `Viewer3D.tsx` | Center: Three.js canvas with OrbitControls, wrapped in ErrorBoundary |
| `InfoPanel.tsx` | Right panel (INFO tab): mesh stats, CLI args, export (GLB/params/share) |
| `HelpPage.tsx` | Right panel (HELP tab): full parameter reference for all pipeline stages |
| `useStudioStore.ts` | Central Zustand store: pipeline state, mesh data, modifiers, FX params |
| `useApi.ts` | WASM execution: Web Worker with timeout, abort, main-thread fallback |
| `export.ts` | GLB export with GPU texture baking, pipeline config save/load/share URL |

## Dev commands

```bash
cd studio/client
npm run dev          # Vite dev server (HMR)
npm run build        # TypeScript check + production build
npm test             # Vitest (3 test files, 18 tests)
```

## Design tokens

Tailwind uses `space-*` prefix for colors (defined in `tailwind.config.js`):
- `space-bg`, `space-panel`, `space-border`, `space-text`, `space-dim`
- `space-accent` (cyan-blue), `space-warm` (orange), `space-success`, `space-danger`

## Export

- **GLB**: bakes procedural shader to albedo texture via offscreen render, packages mesh + texture
- **Params JSON**: full pipeline config (tools + modifiers + FX) for save/load
- **Share URL**: base64-encoded pipeline config in URL hash
- Auto texture resolution based on triangle count (`recommendTextureResolution`)
