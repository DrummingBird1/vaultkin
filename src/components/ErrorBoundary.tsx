/**
 * @file src/components/ErrorBoundary.tsx
 * Catch-all crash handler. Renders a recoverable UI instead of a blank
 * screen when any child throws during render.
 */
import React from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  reload = (): void => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-(--bg-base)">
        <div className="max-w-md sv-card text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-xl font-semibold text-(--text-primary) mb-2">Something went wrong</h2>
          <p className="text-sm text-(--text-secondary) mb-4">
            SecureVault hit an unexpected error. Your vault is encrypted on disk — nothing was lost.
          </p>
          <pre className="text-[11px] text-start text-(--text-tertiary) bg-(--bg-elevated) p-3 rounded-lg mb-4 overflow-auto max-h-32">
            {this.state.error.message}
          </pre>
          <div className="flex gap-3 justify-center">
            <button onClick={this.reset} className="sv-btn-secondary px-4">
              Try again
            </button>
            <button onClick={this.reload} className="sv-btn-primary   px-4">
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
