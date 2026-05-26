import { useRef } from "react";
import { useStudioStore, type BackgroundMode, type HdriResolution, HDRI_LIST, HDRI_RESOLUTIONS } from "../stores/useStudioStore";

const MODES: { value: BackgroundMode; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "starfield", label: "Stars" },
  { value: "hdri", label: "HDRI" },
  { value: "transparent", label: "Alpha" },
];

export default function BackgroundPicker() {
  const bg = useStudioStore((s) => s.background);
  const { setBackground } = useStudioStore();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".exr") && !ext.endsWith(".hdr")) return;
    const url = URL.createObjectURL(file);
    setBackground({ hdriCustomUrl: url, hdriCustomName: file.name, hdriId: null });
    e.target.value = "";
  }

  function clearCustomHdri() {
    if (bg.hdriCustomUrl) URL.revokeObjectURL(bg.hdriCustomUrl);
    setBackground({ hdriCustomUrl: null, hdriCustomName: null });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setBackground({ mode: m.value })}
            className={`flex-1 py-1 text-[10px] uppercase tracking-wider rounded transition-colors ${
              bg.mode === m.value
                ? "bg-space-accent/20 text-space-accent"
                : "text-space-dim/60 hover:text-space-dim"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {(bg.mode === "solid" || bg.mode === "starfield") && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-space-dim w-12 shrink-0">Color</span>
          <input
            type="color"
            value={bg.solidColor}
            onChange={(e) => setBackground({ solidColor: e.target.value })}
            className="w-6 h-5 rounded border-0 cursor-pointer bg-transparent"
          />
          <span className="text-space-dim/50 font-mono text-[10px]">{bg.solidColor}</span>
        </div>
      )}

      {bg.mode === "starfield" && (
        <>
          <SliderRow label="Density" value={bg.starfieldDensity} min={500} max={5000} step={100}
            onChange={(v) => setBackground({ starfieldDensity: v })} />
          <ToggleRow label="Dust" value={bg.showDust}
            onChange={(v) => setBackground({ showDust: v })} />
        </>
      )}

      {bg.mode === "hdri" && (
        <>
          <div className="space-y-1">
            {HDRI_LIST.map((h) => (
              <button
                key={h.id}
                onClick={() => setBackground({ hdriId: h.id, hdriCustomUrl: null, hdriCustomName: null })}
                className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                  bg.hdriId === h.id && !bg.hdriCustomUrl
                    ? "bg-space-accent/15 text-space-accent"
                    : "text-space-dim/70 hover:text-space-text hover:bg-space-panel/50"
                }`}
              >
                {h.name}
                <span className="text-[10px] text-space-dim/40 ml-1">{h.category}</span>
              </button>
            ))}
          </div>

          {bg.hdriCustomUrl && bg.hdriCustomName ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="flex-1 text-space-accent truncate">{bg.hdriCustomName}</span>
              <button onClick={clearCustomHdri} className="text-space-dim/50 hover:text-space-danger text-[10px]">
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-1 text-[10px] rounded border border-dashed border-space-border text-space-dim/60 hover:text-space-dim hover:border-space-accent/40 transition-colors"
            >
              Upload .exr / .hdr
            </button>
          )}
          <input ref={fileRef} type="file" accept=".exr,.hdr" onChange={handleFileUpload} className="hidden" />

          {!bg.hdriCustomUrl && (
            <div className="flex items-center gap-2 text-xs">
              <span className="w-16 text-space-dim shrink-0">Quality</span>
              <div className="flex gap-1">
                {HDRI_RESOLUTIONS.map((res) => (
                  <button
                    key={res}
                    onClick={() => setBackground({ hdriResolution: res })}
                    className={`px-2 py-0.5 rounded text-[10px] uppercase transition-colors ${
                      bg.hdriResolution === res
                        ? "bg-space-accent/20 text-space-accent"
                        : "text-space-dim/60 hover:text-space-dim"
                    }`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>
          )}

          <SliderRow label="Scale" value={bg.hdriScale} min={20} max={500} step={10}
            onChange={(v) => setBackground({ hdriScale: v })} />
          <SliderRow label="Intensity" value={bg.hdriIntensity} min={0} max={3} step={0.1}
            onChange={(v) => setBackground({ hdriIntensity: v })} />
          <SliderRow label="Rotation" value={bg.hdriRotation} min={0} max={360} step={5}
            onChange={(v) => setBackground({ hdriRotation: v })} />
        </>
      )}

      {bg.mode === "transparent" && (
        <p className="text-[10px] text-space-dim/50 italic">
          Transparent background. Export as PNG to preserve alpha channel.
        </p>
      )}

      {(bg.mode === "solid" || bg.mode === "hdri") && (
        <ToggleRow label="Dust particles" value={bg.showDust}
          onChange={(v) => setBackground({ showDust: v })} />
      )}
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-space-dim shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-space-accent" />
      <span className="w-10 text-right text-space-dim/50 font-mono text-[10px]">
        {step >= 1 ? value.toFixed(0) : value.toFixed(1)}
      </span>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)}
        className="w-3 h-3 accent-space-accent" />
      <span className={value ? "text-space-text" : "text-space-dim/60"}>{label}</span>
    </label>
  );
}
