# Rocktools Studio

Browser-based procedural asteroid and rock mesh generator. Built on [rocktools](https://github.com/markstock/rocktools) by Mark J. Stock — a C toolkit for creating and manipulating triangular meshes — compiled to WebAssembly for fully client-side generation.

**[Live Demo](https://kafeg.github.io/rocktools/)** · [Original rocktools](https://markjstock.org/rocktools/) · [GitHub](https://github.com/kafeg/rocktools)

## What it does

Rocktools Studio generates detailed 3D asteroid and rock meshes entirely in the browser. It chains together multiple processing stages — from convex hull generation through recursive subdivision, geometric mesh modifiers, and GPU shader effects — to produce export-ready models with no backend required.

Everything runs client-side: WASM tools in Web Workers, mesh modifiers in JavaScript, and shader effects on the GPU.

## Pipeline

Generation follows a three-stage pipeline:

### 1. Shape Generation (WASM)

Original C rocktools compiled to WebAssembly via Emscripten, executed in a Web Worker with main-thread fallback:

- **rockcreate** — initial convex hull from random point distributions
- **rockdetail** — recursive subdivision with configurable perturbation and interpolation
- **rocksmooth** — Laplacian mesh smoothing
- **rockconvert** — scale and translate
- **rocktrim** — coordinate-bound triangle removal

### 2. Mesh Modifiers (JavaScript)

Client-side vertex displacement applied after the WASM stage:

- **Craters** — impact depressions with raised rim, ejecta blanket, and degradation
- **Boulders** — surface protrusions simulating rubble-pile debris
- **Ridges** — linear ridges or grooves along great-circle arcs
- **Fissures** — branching thermal fracture cracks
- **Layers** — stratification bands with alternating displacement

### 3. Shader Effects (GPU)

Custom PBR material with real-time per-feature shading:

- **Material** — base color, roughness, metalness, procedural textures, color variation
- **Dust** — regolith accumulation in surface concavities
- **Veins** — mineral vein networks via noise
- **Subsurface** — scattering for translucent materials (ice bodies)
- **Features** — per-modifier tinting and normal strength

## Presets

Eight built-in presets covering common asteroid and small-body types:

| Preset | Description |
|--------|-------------|
| M-type (Metallic) | Smooth, reflective metallic surface with fissures and craters |
| C-type (Carbonaceous) | Dark, rough, irregular surface (Bennu, Ryugu) |
| S-type (Silicate) | Light-colored silicate surface (Itokawa, Eros) |
| Ice | Translucent icy body with subsurface scattering |
| Dwarf (Planet) | Round sphere-forced body with craters and ridges (Ceres, Vesta) |
| Rubble (Pile) | Loose rubble-pile aggregate covered in boulders |
| Comet (Nucleus) | Dark elongated body with fissures and layered terrain (67P style) |
| Shard (Fragment) | Angular fresh fragment with sharp edges and metallic sheen |

Each preset can be further randomized via the split-button Random menu, either per-type or fully random.

## Export

- **GLB** — mesh with GPU-baked albedo texture (auto / 1K / 2K resolution)
- **Pipeline JSON** — full parameter config for save, load, and reproducibility
- **Share URL** — base64-encoded pipeline in URL hash for one-click sharing

## Running locally

```bash
cd studio/client
npm install
npm run dev
```

Fully client-side — no backend required.

## Headless CLI export

```bash
cd studio/cli
npx tsx export-glb.ts --config @pipeline.json --output asteroid.glb [--resolution 2048]
```

Puppeteer-based headless export for batch generation. Also available as a Docker image.

## Tech stack

- **WASM** — Emscripten-compiled C rocktools (Web Worker with 30s timeout + main-thread fallback)
- **Frontend** — React 18, TypeScript (strict), Vite
- **3D** — Three.js via react-three-fiber, custom GLSL shaders
- **State** — Zustand 5
- **Styling** — Tailwind CSS 3
- **Tests** — Vitest

## Project structure

```
rocktools/
  *.c, *.h              # Original C source (Mark J. Stock, upstream)
  wasm/                  # Pre-built WASM binaries (Emscripten)
  samples/               # Base mesh OBJ files (icosahedron, cube, tetra, hex, plate)
  studio/
    client/              # Vite + React web application
      src/
        components/      # React UI (PipelineEditor, Viewer3D, InfoPanel, ...)
        hooks/           # useApi — WASM pipeline execution
        stores/          # Zustand state (pipeline, mesh, presets, FX)
        utils/           # Mesh modifiers, export, validation, PRNG
        wasm/            # Worker types + pipeline worker
    cli/                 # Headless GLB export via Puppeteer
    tests/               # Vitest unit tests
```

## Credits

This project is a fork of [rocktools](https://github.com/markstock/rocktools) by [Mark J. Stock](https://markjstock.org/rocktools/) — a C toolkit for creating and manipulating triangular meshes, originally started in 1999. The original C tools are compiled to WebAssembly and wrapped in a modern web application with additional mesh modifiers, GPU shader effects, and a visual pipeline editor.

Original rocktools is licensed under the [GNU General Public License v2](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
