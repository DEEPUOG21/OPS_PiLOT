import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="error" role="alert">
          <h3>This view could not render</h3>
          <p>
            Reload the workspace to retry. Check the backend connection if the
            problem continues.
          </p>
          <button className="button" onClick={() => window.location.reload()}>
            Reload workspace
          </button>
        </div>
      );
    return this.props.children;
  }
}
