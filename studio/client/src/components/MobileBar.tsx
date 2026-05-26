import { type FullPreset, type RandomMode } from "../stores/useStudioStore";
import RandomMenu from "./RandomMenu";
import GenerateMenu from "./GenerateMenu";

interface MobileBarProps {
  onPreset: (preset: FullPreset) => void;
  onRandom: (mode: RandomMode) => void;
  onGenerate: () => void;
  onOpenPanel: (panel: "pipeline" | "journal" | "info" | "scene") => void;
  isGenerating: boolean;
}

export default function MobileBar({ onPreset, onRandom, onGenerate, onOpenPanel, isGenerating }: MobileBarProps) {
  return (
    <div className="bg-space-panel/95 backdrop-blur-md border-t border-space-border pb-[env(safe-area-inset-bottom)]">
      {/* Action row */}
      <div className="flex gap-2 px-3 py-3">
        <RandomMenu
          onRandomize={onRandom}
          disabled={isGenerating}
          variant="mobile"
        />
        <GenerateMenu
          onGenerate={onGenerate}
          onPreset={(preset) => { onPreset(preset); onGenerate(); }}
          disabled={isGenerating}
          variant="mobile"
        />
        <button
          onClick={() => onOpenPanel("pipeline")}
          className="w-12 py-3 rounded-xl text-sm transition-all flex items-center justify-center
                     bg-space-border/30 text-space-dim active:bg-space-border/50"
          aria-label="Open pipeline editor"
        >
          <svg viewBox="0 0 16 16" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.4">
            <line x1="2" y1="4" x2="14" y2="4" />
            <line x1="2" y1="8" x2="14" y2="8" />
            <line x1="2" y1="12" x2="14" y2="12" />
            <circle cx="5" cy="4" r="1.2" fill="currentColor" />
            <circle cx="10" cy="8" r="1.2" fill="currentColor" />
            <circle cx="7" cy="12" r="1.2" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={() => onOpenPanel("info")}
          className="w-12 py-3 rounded-xl text-sm transition-all flex items-center justify-center
                     bg-space-border/30 text-space-dim active:bg-space-border/50"
          aria-label="Open info panel"
        >
          <svg viewBox="0 0 16 16" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="8" cy="8" r="6" />
            <line x1="8" y1="7" x2="8" y2="12" />
            <circle cx="8" cy="4.5" r="0.5" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
