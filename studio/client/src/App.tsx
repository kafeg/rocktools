import { useState, useEffect, useRef } from "react";
import Viewer3D from "./components/Viewer3D";
import PipelineEditor from "./components/PipelineEditor";
import InfoPanel from "./components/InfoPanel";
import ScenePanel from "./components/ScenePanel";
import Journal from "./components/Journal";
import HelpPage from "./components/HelpPage";
import DisplayToolbar from "./components/DisplayToolbar";
import MobileBar from "./components/MobileBar";
import GenerationOverlay from "./components/GenerationOverlay";
import { useStudioStore, type FullPreset, type RandomMode } from "./stores/useStudioStore";
import { useApi } from "./hooks/useApi";
import { decodeShareUrl } from "./utils/export";

type LeftTab = "pipeline" | "journal";
type RightTab = "info" | "scene" | "help";
type MobilePanel = null | "pipeline" | "journal" | "info" | "scene" | "help";

export default function App() {
  const isGenerating = useStudioStore((s) => s.isGenerating);
  const [leftTab, setLeftTab] = useState<LeftTab>("pipeline");
  const [rightTab, setRightTab] = useState<RightTab>("info");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const { generate } = useApi();
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const shared = decodeShareUrl();
    if (shared) {
      useStudioStore.getState().importPipelineConfig(shared);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      generate();
      return;
    }

    const { journal, loadFromJournal, randomizePipeline, autoLoadOnStart } = useStudioStore.getState();
    if (!autoLoadOnStart) return;
    if (journal.length > 0) {
      loadFromJournal(journal[0]!);
    } else {
      randomizePipeline();
    }
    generate();
  }, [generate]);

  function handleMobilePreset(preset: FullPreset) {
    useStudioStore.getState().loadPreset(preset);
  }

  function handleMobileRandom(mode: RandomMode) {
    useStudioStore.getState().randomizePipeline(mode);
    generate();
  }

  return (
    <div className="h-dvh w-screen flex bg-space-bg">
      {/* Left panel: Pipeline / Journal — hidden on mobile */}
      <div className="hidden md:flex w-80 shrink-0 border-r border-space-border flex-col overflow-hidden">
        <div className="flex border-b border-space-border">
          <button
            onClick={() => setLeftTab("pipeline")}
            className={`flex-1 py-2 text-xs uppercase tracking-wider transition-colors ${
              leftTab === "pipeline"
                ? "text-space-accent border-b-2 border-space-accent"
                : "text-space-dim hover:text-space-text"
            }`}
          >
            Pipeline
          </button>
          <button
            onClick={() => setLeftTab("journal")}
            className={`flex-1 py-2 text-xs uppercase tracking-wider transition-colors ${
              leftTab === "journal"
                ? "text-space-accent border-b-2 border-space-accent"
                : "text-space-dim hover:text-space-text"
            }`}
          >
            Journal
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          {leftTab === "pipeline" ? <PipelineEditor /> : <Journal />}
        </div>
      </div>

      {/* Center: 3D Viewer */}
      <div className="flex-1 min-w-0 relative overflow-hidden">
        <Viewer3D />

        {isGenerating && <GenerationOverlay />}

        <div className="absolute top-3 left-4 pointer-events-none">
          <h1 className="text-lg font-bold tracking-wider text-space-text/80">ROCKTOOLS STUDIO</h1>
          <p className="text-[10px] tracking-widest text-space-dim">ASTEROID GENERATOR</p>
        </div>

        {/* Display toolbar: top-right on mobile (below title), bottom-center on desktop */}
        <div className="absolute top-14 right-2 md:top-auto md:right-auto md:bottom-4 md:left-1/2 md:-translate-x-1/2 z-10">
          <DisplayToolbar />
        </div>

        {/* Mobile: floating bar at bottom */}
        <div className="md:hidden absolute bottom-0 left-0 right-0 z-20">
          <MobileBar
            onPreset={handleMobilePreset}
            onRandom={handleMobileRandom}
            onGenerate={generate}
            onOpenPanel={setMobilePanel}
            isGenerating={isGenerating}
          />
        </div>
      </div>

      {/* Right panel: Info / Help — hidden on mobile */}
      <div className="hidden md:flex w-80 shrink-0 border-l border-space-border flex-col overflow-hidden">
        <div className="flex border-b border-space-border">
          <button
            onClick={() => setRightTab("info")}
            className={`flex-1 py-2 text-xs uppercase tracking-wider transition-colors ${
              rightTab === "info"
                ? "text-space-accent border-b-2 border-space-accent"
                : "text-space-dim hover:text-space-text"
            }`}
          >
            Info
          </button>
          <button
            onClick={() => setRightTab("scene")}
            className={`flex-1 py-2 text-xs uppercase tracking-wider transition-colors ${
              rightTab === "scene"
                ? "text-space-accent border-b-2 border-space-accent"
                : "text-space-dim hover:text-space-text"
            }`}
          >
            Scene
          </button>
          <button
            onClick={() => setRightTab("help")}
            className={`flex-1 py-2 text-xs uppercase tracking-wider transition-colors ${
              rightTab === "help"
                ? "text-space-accent border-b-2 border-space-accent"
                : "text-space-dim hover:text-space-text"
            }`}
          >
            Help
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          {rightTab === "info" ? <InfoPanel /> : rightTab === "scene" ? <ScenePanel /> : <HelpPage />}
        </div>
      </div>

      {/* Mobile slide-up panel overlay */}
      {mobilePanel && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col">
          <div className="flex-1 bg-black/50" onClick={() => setMobilePanel(null)} />
          <div className="h-[75vh] bg-space-bg border-t border-space-border flex flex-col rounded-t-2xl overflow-hidden">
            <div className="flex items-center border-b border-space-border shrink-0">
              {(mobilePanel === "pipeline" || mobilePanel === "journal") ? (
                <>
                  <button
                    onClick={() => setMobilePanel("pipeline")}
                    className={`flex-1 py-2.5 text-xs uppercase tracking-wider transition-colors ${
                      mobilePanel === "pipeline"
                        ? "text-space-accent border-b-2 border-space-accent"
                        : "text-space-dim"
                    }`}
                  >
                    Pipeline
                  </button>
                  <button
                    onClick={() => setMobilePanel("journal")}
                    className={`flex-1 py-2.5 text-xs uppercase tracking-wider transition-colors ${
                      mobilePanel === "journal"
                        ? "text-space-accent border-b-2 border-space-accent"
                        : "text-space-dim"
                    }`}
                  >
                    Journal
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setMobilePanel("info")}
                    className={`flex-1 py-2.5 text-xs uppercase tracking-wider transition-colors ${
                      mobilePanel === "info"
                        ? "text-space-accent border-b-2 border-space-accent"
                        : "text-space-dim"
                    }`}
                  >
                    Info
                  </button>
                  <button
                    onClick={() => setMobilePanel("scene")}
                    className={`flex-1 py-2.5 text-xs uppercase tracking-wider transition-colors ${
                      mobilePanel === "scene"
                        ? "text-space-accent border-b-2 border-space-accent"
                        : "text-space-dim"
                    }`}
                  >
                    Scene
                  </button>
                  <button
                    onClick={() => setMobilePanel("help")}
                    className={`flex-1 py-2.5 text-xs uppercase tracking-wider transition-colors ${
                      mobilePanel === "help"
                        ? "text-space-accent border-b-2 border-space-accent"
                        : "text-space-dim"
                    }`}
                  >
                    Help
                  </button>
                </>
              )}
              <button
                onClick={() => setMobilePanel(null)}
                className="w-10 py-2.5 flex items-center justify-center text-space-dim text-lg shrink-0"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {mobilePanel === "pipeline" && <PipelineEditor />}
              {mobilePanel === "journal" && <Journal />}
              {mobilePanel === "info" && <InfoPanel />}
              {mobilePanel === "scene" && <ScenePanel />}
              {mobilePanel === "help" && <HelpPage />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
