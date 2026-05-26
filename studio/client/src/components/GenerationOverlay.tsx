import { useStudioStore } from "../stores/useStudioStore";

export default function GenerationOverlay() {
  const progress = useStudioStore((s) => s.generationProgress);
  const abort = useStudioStore((s) => s.abortGeneration);

  const label = progress
    ? `${progress.tool} (${progress.step}/${progress.total})`
    : "Preparing...";

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
      <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-lg bg-space-panel border border-space-border">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-space-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-space-text">Generating mesh...</span>
        </div>
        <span className="text-[11px] text-space-dim font-mono">{label}</span>
        {abort && (
          <button
            onClick={abort}
            className="mt-1 px-3 py-1 text-[11px] rounded bg-space-danger/20 text-space-danger
                       hover:bg-space-danger/30 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
