import { useStudioStore } from "../stores/useStudioStore";

export default function Journal() {
  const journal = useStudioStore((s) => s.journal);
  const { loadFromJournal, removeJournalEntry, clearJournal } = useStudioStore();

  if (journal.length === 0) {
    return (
      <div className="p-3 text-center text-space-dim text-xs">
        No generations yet. Results will appear here.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-space-border">
        <h2 className="text-xs uppercase tracking-widest text-space-dim font-semibold">
          Journal ({journal.length})
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {journal.map((entry) => (
          <div
            key={entry.id}
            className="px-3 py-2 border-b border-space-border/50 hover:bg-space-border/10
                       transition-colors group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-space-text">{entry.name}</span>
              <span className="text-[10px] text-space-dim font-mono">{entry.durationMs}ms</span>
            </div>
            <div className="text-[10px] text-space-dim font-mono mb-1.5 leading-relaxed">
              {entry.info.tris.toLocaleString()} tris{" | "}
              {entry.steps.filter((s) => !s.tool.startsWith("fx:")).map((s) => {
                const p = s.params;
                const name = s.tool.replace("rock", "").replace("mesh:", "");
                if (s.tool === "rockdetail") return `detail(d${p.depth} n${Number(p.normalPerturbation).toFixed(2)} ${p.interpolation ?? "-spl"})`;
                if (s.tool === "rocksmooth") return `smooth(${p.passes})`;
                if (s.tool === "rockconvert") return `scale(${Number(p.scaleY).toFixed(1)}x${Number(p.scaleZ).toFixed(1)})`;
                if (s.tool === "mesh:craters") return `craters(${Math.round(Number(p.count))})`;
                if (s.tool === "mesh:boulders") return `boulders(${Math.round(Number(p.count))})`;
                if (s.tool === "mesh:ridges") return `ridges(${Math.round(Number(p.count))})`;
                if (s.tool === "mesh:fissures") return `fissures(${Math.round(Number(p.count))})`;
                if (s.tool === "mesh:layers") return `layers(${Math.round(Number(p.layers))})`;
                return name;
              }).join(" → ")}
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => loadFromJournal(entry)}
                className="px-2 py-0.5 text-[10px] rounded bg-space-accent/20 text-space-accent
                           hover:bg-space-accent/30 transition-colors"
              >
                Load
              </button>
              <button
                onClick={() => removeJournalEntry(entry.id)}
                className="px-2 py-0.5 text-[10px] rounded bg-space-danger/20 text-space-danger
                           hover:bg-space-danger/30 transition-colors ml-auto"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 border-t border-space-border">
        <button
          onClick={clearJournal}
          className="w-full py-1 text-[10px] rounded bg-space-danger/10 text-space-danger
                     hover:bg-space-danger/20 transition-colors"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
