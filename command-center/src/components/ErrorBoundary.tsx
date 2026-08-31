import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { failed: boolean; reference: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, reference: "" };

  static getDerivedStateFromError(): State {
    return {
      failed: true,
      reference: `UI-${Date.now().toString(36).toUpperCase()}`,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("GridNexus UI failure", {
      error,
      componentStack: info.componentStack,
      reference: this.state.reference,
    });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32, background: "#f4f7fb" }}>
        <section role="alert" style={{ maxWidth: 560, padding: 32, background: "white", border: "1px solid #dce3ee", borderRadius: 18, boxShadow: "0 18px 60px rgba(18, 35, 64, .12)" }}>
          <div style={{ color: "#116466", fontSize: 13, fontWeight: 700, letterSpacing: ".08em" }}>GRIDNEXUS RECOVERY</div>
          <h1 style={{ margin: "12px 0 8px", color: "#13223a" }}>This view could not be displayed safely.</h1>
          <p style={{ color: "#53627a", lineHeight: 1.6 }}>
            Your session is still intact. Reload the interface to reconnect to the live services.
          </p>
          <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 18, padding: "11px 18px", border: 0, borderRadius: 10, color: "white", background: "#116466", cursor: "pointer", fontWeight: 700 }}>
            Reload GridNexus
          </button>
          <div style={{ marginTop: 16, color: "#7a8799", fontSize: 12 }}>Reference: {this.state.reference}</div>
        </section>
      </main>
    );
  }
}
