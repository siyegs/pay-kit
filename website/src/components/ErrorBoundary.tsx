import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-oxide/30 bg-oxide/10">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e37d55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Something went wrong</h1>
          <p className="max-w-md text-muted">An unexpected error occurred. Please try refreshing the page.</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-foreground px-5 text-sm font-bold text-surface transition hover:bg-brand"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
