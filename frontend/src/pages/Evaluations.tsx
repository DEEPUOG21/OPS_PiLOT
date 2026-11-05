import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Play, LoaderCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useData, useWorkspace } from "../hooks/workspace";
import { post } from "../services/api";
import type { Evaluation, Trace, Settings } from "../types";
import {
  PageTitle,
  Panel,
  LoadState,
  Modal,
  Badge,
  Empty,
} from "../components/ui";
import { date, label, pct } from "../utils/format";

export function EvaluationsPage() {
  const [params] = useSearchParams(),
    [open, setOpen] = useState(!!params.get("trace_id")),
    [traceId, setTraceId] = useState(params.get("trace_id") || ""),
    [method, setMethod] = useState("heuristic"),
    [criteria, setCriteria] = useState(""),
    [reference, setReference] = useState(""),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState(""),
    [expanded, setExpanded] = useState<number | null>(null),
    [page, setPage] = useState(1);
  const { data, error, loading } = useData<{
      items: Evaluation[];
      total: number;
    }>(`/evaluations?page=${page}`),
    { data: traces } = useData<{ items: Trace[] }>("/traces?page_size=100"),
    { data: settings } = useData<Settings>("/settings"),
    { refresh, notify } = useWorkspace();
  async function run() {
    setBusy(true);
    setErr("");
    try {
      await post("/evaluations/run", {
        trace_id: traceId,
        method,
        criteria,
        ...(reference ? { reference } : {}),
      });
      setOpen(false);
      refresh();
      notify("Evaluation stored and linked to the trace.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Quality you can inspect."
        description="Evaluate answers, review grounding, and understand how each score was calculated."
        actions={
          <button className="button" onClick={() => setOpen(true)}>
            <Play size={14} />
            Run evaluation
          </button>
        }
      />
      <div className="notice">
        Heuristic scores measure lexical overlap. They cannot establish factual
        correctness or definitively detect hallucinations. LLM judge scores are
        stored separately.
      </div>
      <Panel
        title="Evaluation records"
        subtitle="Expand a record for score explanations and custom criteria"
      >
        <LoadState loading={loading} error={error}>
          {data?.items.length ? (
            <div className="evaluation-list">
              {data.items.map((e) => (
                <div className="evaluation-record" key={e.id}>
                  <button
                    className="evaluation-summary"
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  >
                    {expanded === e.id ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                    <div>
                      <strong>Evaluation #{e.id}</strong>
                      <small>{date(e.created_at)}</small>
                    </div>
                    <Badge tone="violet">{label(e.method)}</Badge>
                    <span className="quality-metric">
                      <small>Relevance</small>
                      {pct(e.scores.answer_relevance)}
                    </span>
                    <span className="quality-metric">
                      <small>Faithfulness</small>
                      {pct(e.scores.faithfulness)}
                    </span>
                  </button>
                  {expanded === e.id && (
                    <div className="evaluation-expanded">
                      <Link
                        className="text-link mono"
                        to={`/traces/${e.trace_id}`}
                      >
                        {e.trace_id} ↗
                      </Link>
                      {e.criteria && <p>Custom criteria: {e.criteria}</p>}
                      {Object.entries(e.scores).map(([k, v]) => (
                        <div className="evaluation-dimension" key={k}>
                          <div>
                            <strong>{label(k)}</strong>
                            <p>
                              {e.explanations[k] || "No explanation supplied."}
                            </p>
                          </div>
                          <span className="mono">{pct(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No evaluations yet"
              description="Capture a response, then run a heuristic or configured LLM judge evaluation."
            />
          )}
        </LoadState>
        <div className="pagination">
          <span>
            {data?.total || 0} evaluations · Page {page}
          </span>
          <div>
            <button
              className="button small"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              className="button small"
              disabled={!data || page * 30 >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </Panel>
      {open && (
        <Modal
          title="Evaluate a captured response"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <label>
              Trace
              <select
                required
                value={traceId}
                onChange={(e) => setTraceId(e.target.value)}
              >
                <option value="">Select an execution</option>
                {traces?.items
                  .filter((t) => t.status === "ok")
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id.slice(0, 12)} · {t.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Evaluator
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="heuristic">
                  Deterministic heuristic · lexical overlap
                </option>
                <option
                  disabled={!settings?.provider_configured}
                  value="llm_judge"
                >
                  LLM judge{" "}
                  {settings?.provider_configured
                    ? ""
                    : "· provider key required"}
                </option>
              </select>
            </label>
            <label>
              Reference answer (optional)
              <textarea
                value={reference}
                maxLength={10000}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Enables reference-answer correctness scoring"
              />
            </label>
            <label>
              Custom criteria (optional)
              <input
                value={criteria}
                maxLength={2000}
                onChange={(e) => setCriteria(e.target.value)}
                placeholder={
                  method === "heuristic"
                    ? "Required terms, e.g. refund 30 days"
                    : "Describe the judging criteria"
                }
              />
            </label>
            {err && <p className="error-text">{err}</p>}
            <button className="button primary full" disabled={busy || !traceId}>
              {busy && <LoaderCircle className="spin" size={16} />}{" "}
              {busy ? "Evaluating…" : "Run evaluation"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
