import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, LoaderCircle } from "lucide-react";
import { Modal } from "./ui";
import { post } from "../services/api";
import { useData, useWorkspace } from "../hooks/workspace";
import type { Settings, Source } from "../types";
import { label } from "../utils/format";

export function RunWorkflow() {
  const [open, setOpen] = useState(false),
    [question, setQuestion] = useState("How do I request a refund?"),
    [scenario, setScenario] = useState("successful"),
    [provider, setProvider] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { data: settings } = useData<Settings>("/settings"),
    { setSource, refresh, notify } = useWorkspace(),
    navigate = useNavigate();
  async function run() {
    setBusy(true);
    setError("");
    try {
      const r = await post<{
        trace_id: string;
        source: Source;
        error: string | null;
      }>("/demo/run", { question, scenario, provider });
      setSource(r.source);
      refresh();
      setOpen(false);
      navigate(`/traces/${r.trace_id}`);
      notify(
        r.error
          ? "Workflow failure captured. Open the failed span to inspect the exception."
          : "Workflow complete. Trace and evaluation stored.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="button primary" onClick={() => setOpen(true)}>
        <Play size={14} fill="currentColor" />
        Run workflow
      </button>
      {open && (
        <Modal
          title="Run the support workflow"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p className="muted">
            Execute the instrumented LangGraph pipeline and inspect its
            telemetry.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <label>
              Customer question
              <textarea
                required
                minLength={3}
                maxLength={4000}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </label>
            <label>
              Scenario
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
              >
                {[
                  "successful",
                  "rag_success",
                  "slow_retrieval",
                  "failed_tool",
                  "high_tokens",
                  "repeated_tool",
                  "low_quality",
                ].map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={provider}
                disabled={!settings?.provider_configured}
                onChange={(e) => setProvider(e.target.checked)}
              />
              Use configured provider{" "}
              {settings?.provider_configured
                ? ""
                : "(no provider key configured)"}
            </label>
            <div className="notice">
              {provider
                ? "Provider execution: real API usage. Results appear in Collected data."
                : "Deterministic mock: measured runtime, simulated token units and illustrative cost. Results appear in Demo data."}
            </div>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Play size={15} />
              )}{" "}
              {busy ? "Executing workflow…" : "Run and open trace"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
