import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: string | null;
}

export default class CanvasErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : "Unknown rendering error";
    return { error: message };
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-space-bg">
          <div className="max-w-md p-6 rounded-lg bg-space-panel border border-red-500/40 text-center space-y-3">
            <div className="text-red-400 text-sm font-medium uppercase tracking-wider">
              Rendering Error
            </div>
            <p className="text-space-dim text-xs leading-relaxed">
              {this.state.error}
            </p>
            <p className="text-space-dim text-[10px]">
              This may be caused by a WebGL context loss, shader compilation failure,
              or invalid mesh data.
            </p>
            <button
              onClick={this.handleRetry}
              className="mt-2 px-4 py-1.5 text-xs rounded border border-space-accent text-space-accent hover:bg-space-accent/10 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
