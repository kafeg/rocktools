import { TOOL_DEFINITIONS } from "../toolDefinitions";
import { FX_STEPS, MESH_STEPS } from "../stores/useStudioStore";
import type { ToolDefinition } from "../types";

// ── Descriptions for mesh modifier params (not in store defs) ───────

const MESH_PARAM_DESC: Record<string, Record<string, string>> = {
  "mesh:craters": {
    count: "Number of impact craters to generate",
    minSize: "Minimum crater radius (fraction of mesh)",
    maxSize: "Maximum crater radius (fraction of mesh)",
    depthRatio: "Bowl depth relative to crater diameter",
    rimHeight: "Height of raised crater rim",
    rimWidth: "Width of raised rim as fraction of radius",
    ejectaExtent: "Extent of ejecta blanket around rim",
    degradation: "Weathering: 0 = pristine, 1 = heavily eroded",
    sizeExponent: "Power-law exponent for size distribution (higher = more small craters)",
    avoidOverlap: "Prevent craters from overlapping each other",
    spacing: "Minimum spacing between crater centers (multiplier)",
    seed: "Random seed for placement",
  },
  "mesh:boulders": {
    count: "Number of boulders to place",
    minSize: "Minimum boulder radius",
    maxSize: "Maximum boulder radius",
    height: "Protrusion height relative to radius",
    roughness: "Angular roughness of boulder shape (8-lobe modulation)",
    smoothing: "Smoothing passes on boulder boundary",
    avoidOverlap: "Prevent boulders from overlapping",
    seed: "Random seed for placement",
  },
  "mesh:ridges": {
    count: "Number of ridge/groove arcs",
    height: "Ridge height (or groove depth)",
    width: "Cross-section width of ridge/groove",
    length: "Arc length as fraction of great circle",
    irregularity: "Noise on ridge path and cross-section",
    mode: "\"ridge\" (raised) or \"groove\" (sunken)",
    avoidOverlap: "Prevent ridges from crossing",
    seed: "Random seed",
  },
  "mesh:fissures": {
    count: "Number of primary fracture cracks",
    depth: "V-shaped cross-section depth",
    width: "Crack opening width",
    length: "Primary crack length (fraction of surface)",
    branching: "Probability of spawning side-branches",
    jaggedness: "Path irregularity (random-walk step noise)",
    avoidOverlap: "Prevent cracks from crossing each other",
    seed: "Random seed",
  },
  "mesh:layers": {
    layers: "Number of stratification bands",
    displacement: "Amplitude of in/out displacement per band",
    noise: "FBM noise perturbation of band boundaries",
    sharpness: "Transition sharpness: 0 = smooth blend, 1 = hard step",
    seed: "Random seed",
  },
  "mesh:pits": {
    count: "Number of degassing pits",
    minSize: "Minimum pit diameter (fraction of mesh)",
    maxSize: "Maximum pit diameter (fraction of mesh)",
    depth: "Pit depth relative to diameter",
    wallSteepness: "Wall angle: 0 = gentle slope, 1 = near-vertical",
    seed: "Random seed",
  },
  "mesh:erosion": {
    intensity: "Erosion displacement magnitude per pass",
    passes: "Number of erosion iterations (1–5)",
    curvatureBias: "0 = symmetric erosion, 1 = preserve concavities",
    seed: "Random seed",
  },
  "mesh:facets": {
    count: "Number of planar facets to create",
    size: "Facet radius (fraction of mesh radius)",
    flatness: "Projection strength: 0 = none, 1 = fully flat",
    seed: "Random seed",
  },
  "mesh:rocks": {
    count: "Number of rock objects to scatter",
    minSize: "Minimum rock size (fraction of mesh radius)",
    maxSize: "Maximum rock size (fraction of mesh radius)",
    roughness: "Rock shape irregularity (0 = smooth, 1 = jagged)",
    detail: "Subdivision levels (1 = low poly, 3 = smooth)",
    embedDepth: "How deep rocks sit in surface (0 = on top, 0.8 = mostly buried)",
    templates: "Number of unique rock shapes to generate",
    seed: "Random seed",
  },
};

const FX_PARAM_DESC: Record<string, Record<string, string>> = {
  "fx:material": {
    baseColor: "Base albedo color (hex)",
    roughness: "PBR roughness (0 = mirror, 1 = matte)",
    metalness: "PBR metalness (0 = dielectric, 1 = metal)",
    texture: "Triplanar-projected surface texture (none = pure color)",
    applyTint: "Multiply texture by base color as tint overlay",
    colorVariation: "Amplitude of procedural color noise",
    colorVariationScale: "Spatial scale of color noise pattern",
  },
  "fx:dust": {
    dustAmount: "Dust accumulation intensity (0-1)",
    dustColor: "Regolith/dust color (hex)",
  },
  "fx:veins": {
    veinIntensity: "Vein visibility strength (0-1)",
    veinScale: "Noise scale for vein network pattern",
    veinColor: "Mineral vein color (hex)",
  },
  "fx:subsurface": {
    subsurface: "Subsurface scattering strength (0-1)",
  },
  "fx:features": {
    featureIntensity: "Global feature shading multiplier",
    craterShading: "Crater floor/rim shading strength",
    craterTint: "Crater interior tint color",
    boulderShading: "Boulder surface shading strength",
    boulderTint: "Boulder surface tint color",
    ridgeShading: "Ridge shading strength",
    ridgeTint: "Ridge surface tint color",
    fissureShading: "Fissure interior shading strength",
    fissureTint: "Fissure interior tint color",
    layerShading: "Layer band shading strength",
    layerTint: "Layer band tint color",
    normalStrength: "Normal map detail intensity",
  },
  "fx:ao": {
    aoStrength: "Ambient occlusion darkening intensity (0–1)",
    aoRadius: "AO sampling radius: larger = broader shadows (0–1)",
  },
  "fx:frost": {
    frostAmount: "Frost coverage intensity (0–1)",
    frostColor: "Frost color (hex)",
    frostBias: "0 = exposure-based, 1 = concavity-based placement",
  },
  "fx:weathering": {
    weatherAmount: "Weathering intensity on exposed surfaces (0–1)",
    weatherTint: "Weathering darkening/color shift (hex)",
    directionBias: "0 = curvature-based, 1 = directional (solar wind)",
  },
  "fx:emission": {
    emissionColor: "Emission glow color (hex)",
    emissionIntensity: "Emission brightness (0–2)",
    emissionPattern: "Distribution pattern: spots, veins, or patches",
  },
};

// ── Compact param display components ────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const cls: Record<string, string> = {
    number: "text-blue-400",
    integer: "text-blue-400",
    boolean: "text-green-400",
    select: "text-purple-400",
    color: "text-yellow-400",
  };
  return <span className={`font-mono ${cls[type] ?? "text-space-dim"}`}>{type}</span>;
}

function WasmToolSection({ tool, role }: { tool: ToolDefinition; role: string }) {
  return (
    <div className="bg-space-bg/50 rounded p-2.5 border border-space-border/50">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] font-semibold text-space-text">{tool.name}</span>
        <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded ${
          role === "Source" ? "bg-space-accent/15 text-space-accent" : "bg-space-warm/15 text-space-warm"
        }`}>{role}</span>
      </div>
      <p className="text-[10px] text-space-dim mb-2">{tool.description}</p>
      <div className="space-y-1">
        {tool.params.map((p) => {
          const range = p.min != null && p.max != null
            ? p.step ? `${p.min}..${p.max}, step ${p.step}` : `${p.min}..${p.max}`
            : p.options ? p.options.join(" | ") : "";
          return (
            <div key={p.name} className="text-[10px] leading-snug">
              <div className="flex items-baseline gap-1 flex-wrap">
                <span className="font-mono text-space-text font-medium">{p.name}</span>
                <TypeBadge type={p.type} />
                {range && <span className="text-space-dim/60">({range})</span>}
                <span className="text-space-dim/40">def: {String(p.default)}</span>
              </div>
              {p.description && (
                <div className="text-space-dim pl-2 mt-px">{p.description}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MeshFxSection({ id, step, role, descMap }: {
  id: string;
  step: { label: string; description: string; params: Record<string, unknown> };
  role: string;
  descMap: Record<string, string> | undefined;
}) {
  const params = Object.entries(step.params);
  return (
    <div className="bg-space-bg/50 rounded p-2.5 border border-space-border/50">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] font-semibold text-space-text">{step.label}</span>
        <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded ${
          role === "Mesh" ? "bg-space-accent/15 text-space-accent" : "bg-space-warm/15 text-space-warm"
        }`}>{role}</span>
        <span className="text-[9px] text-space-dim/40 font-mono">{id}</span>
      </div>
      <p className="text-[10px] text-space-dim mb-2">{step.description}</p>
      <div className="space-y-1">
        {params.map(([name, val]) => {
          const type = typeof val === "boolean" ? "boolean" : typeof val === "string" ? (String(val).startsWith("#") ? "color" : "select") : "number";
          const desc = descMap?.[name];
          return (
            <div key={name} className="text-[10px] leading-snug">
              <div className="flex items-baseline gap-1 flex-wrap">
                <span className="font-mono text-space-text font-medium">{name}</span>
                <TypeBadge type={type} />
                <span className="text-space-dim/40">def: {String(val)}</span>
              </div>
              {desc && (
                <div className="text-space-dim pl-2 mt-px">{desc}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export default function HelpPage() {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-4 py-3 border-b border-space-border">
        <h2 className="text-sm uppercase tracking-widest text-space-text font-semibold">Help</h2>
      </div>

      <div className="px-4 py-3 space-y-5 text-[12px] text-space-text leading-relaxed">
        {/* Pipeline schema */}
        <section>
          <h3 className="text-[11px] uppercase tracking-wider text-space-accent font-semibold mb-2">
            Pipeline Schema
          </h3>
          <div className="bg-space-bg rounded-lg p-3 border border-space-border font-mono text-[11px]">
            <div className="mt-1">
              <span className="text-space-accent">SOURCE</span>
              <span className="text-space-dim">{" → "}</span>
              <span className="text-space-warm">TRANSFORM</span>
              <span className="text-space-dim">{"* → "}</span>
              <span className="text-space-accent">MESH</span>
              <span className="text-space-dim">{"* → "}</span>
              <span className="text-space-warm">EFFECT</span>
              <span className="text-space-dim">*</span>
            </div>
          </div>
        </section>

        {/* WASM Tools */}
        <section>
          <h3 className="text-[11px] uppercase tracking-wider text-space-accent font-semibold mb-2">
            WASM Tools
          </h3>
          <div className="space-y-2">
            {TOOL_DEFINITIONS.map((tool) => (
              <WasmToolSection
                key={tool.name}
                tool={tool}
                role={tool.acceptsInput ? "Transform" : "Source"}
              />
            ))}
          </div>
        </section>

        {/* Mesh modifiers */}
        <section>
          <h3 className="text-[11px] uppercase tracking-wider text-space-accent font-semibold mb-2">
            Mesh Modifiers
          </h3>
          <p className="text-space-dim text-[10px] mb-2">
            Client-side vertex displacement with collision avoidance. Feature data is passed to shaders.
          </p>
          <div className="space-y-2">
            {Object.entries(MESH_STEPS).map(([id, step]) => (
              <MeshFxSection key={id} id={id} step={step} role="Mesh" descMap={MESH_PARAM_DESC[id]} />
            ))}
          </div>
        </section>

        {/* Shader effects */}
        <section>
          <h3 className="text-[11px] uppercase tracking-wider text-space-warm font-semibold mb-2">
            Shader Effects
          </h3>
          <p className="text-space-dim text-[10px] mb-2">
            GPU-side material effects. Geometry-aware: reads mesh modifier data for contextual shading.
          </p>
          <div className="space-y-2">
            {Object.entries(FX_STEPS).map(([id, step]) => (
              <MeshFxSection key={id} id={id} step={step} role="Effect" descMap={FX_PARAM_DESC[id]} />
            ))}
          </div>
        </section>

        {/* Base meshes */}
        <section>
          <h3 className="text-[11px] uppercase tracking-wider text-space-accent font-semibold mb-2">
            Base Meshes
          </h3>
          <div className="space-y-1 text-[11px]">
            <div><span className="text-space-text font-medium">icosahedron0.obj</span> <span className="text-space-dim">-- 20 faces, general-purpose starting shape</span></div>
            <div><span className="text-space-text font-medium">tetra0.obj</span> <span className="text-space-dim">-- 4 faces, tetrahedron for angular shapes</span></div>
            <div><span className="text-space-text font-medium">cube0.obj</span> <span className="text-space-dim">-- 12 faces, cube for blocky rocks</span></div>
            <div><span className="text-space-text font-medium">hex0.obj</span> <span className="text-space-dim">-- hexagonal prism base</span></div>
            <div><span className="text-space-text font-medium">plate0.obj</span> <span className="text-space-dim">-- flat plate, for flat/pancake asteroids</span></div>
          </div>
        </section>

        {/* Presets */}
        <section>
          <h3 className="text-[11px] uppercase tracking-wider text-space-accent font-semibold mb-2">
            Presets
          </h3>
          <p className="text-space-dim text-[10px]">
            Full presets configure all pipeline steps at once. Available via the top dropdown or mobile bar.
            Each preset defines source, transforms, mesh modifiers, and shaders tuned for a specific
            asteroid class (C-type, S-type, M-type, ice body, rubble pile).
          </p>
        </section>
      </div>
    </div>
  );
}
