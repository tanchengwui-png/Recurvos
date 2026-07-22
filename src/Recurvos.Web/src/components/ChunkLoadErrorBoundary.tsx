import { Component, type ErrorInfo, type ReactNode } from "react";

const RELOAD_KEY = "recurvos:chunk-load-reload";

function isChunkLoadError(error: Error) {
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(error.message);
}

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ChunkLoadErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    if (!isChunkLoadError(error) || sessionStorage.getItem(RELOAD_KEY)) {
      return;
    }

    sessionStorage.setItem(RELOAD_KEY, "true");
    window.location.reload();
  }

  private reload = () => {
    sessionStorage.removeItem(RELOAD_KEY);
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    if (!isChunkLoadError(this.state.error)) {
      throw this.state.error;
    }

    return (
      <div className="page">
        <section className="card">
          <h1>Unable to load this page</h1>
          <p className="muted">The connection was interrupted while loading part of the application.</p>
          <button type="button" className="button button-primary" onClick={this.reload}>Reload page</button>
        </section>
      </div>
    );
  }
}
