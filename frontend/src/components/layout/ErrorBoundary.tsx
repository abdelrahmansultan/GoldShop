import { Component, type ReactNode } from "react";
import i18n from "../../i18n";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card mx-auto mt-10 max-w-lg p-6 text-center">
        <div className="text-lg font-bold text-red-700">{i18n.t("errors.generic")}</div>
        <p className="mt-2 font-mono text-xs text-slate-500">{this.state.error.message}</p>
        <button type="button" className="mt-4 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white" onClick={() => this.setState({ error: null })}>{i18n.t("common.refresh")}</button>
      </div>
    );
  }
}
