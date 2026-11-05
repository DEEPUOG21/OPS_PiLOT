import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  Download,
  ChevronDown,
  ChevronRight,
  Workflow,
  Bot,
  Wrench,
  Database,
  MessageSquare,
  Clock,
  ClipboardCheck,
} from "lucide-react";
import { useData, useWorkspace } from "../hooks/workspace";
import type { TraceDetail, Span } from "../types";
import {
  PageTitle,
  Stat,
  Panel,
  LoadState,
  Status,
  Badge,
} from "../components/ui";
import { date, ms, money, num } from "../utils/format";

const icons: Record<string, typeof Bot> = {
  agent: Bot,
  llm: MessageSquare,
  tool: Wrench,
  retrieval: Database,
};
function tree(spans: Span[], collapsed: Set<string>) {
  const lookup = new Set(spans.map((s) => s.id)),
    seen = new Set<string>(),
    result: { span: Span; depth: number; children: boolean }[] = [];
  function visit(span: Span, depth: number) {
    if (seen.has(span.id)) return;
    seen.add(span.id);
    const children = spans.filter((s) => s.parent_id === span.id);
    result.push({ span, depth, children: !!children.length });
    if (!collapsed.has(span.id)) children.forEach((s) => visit(s, depth + 1));
    else {
      const mark = (id: string) => {
        spans
          .filter((s) => s.parent_id === id && !seen.has(s.id))
          .forEach((s) => {
            seen.add(s.id);
            mark(s.id);
          });
      };
      mark(span.id);
    }
  }
  spans
    .filter((s) => !s.parent_id || !lookup.has(s.parent_id))
    .forEach((s) => visit(s, 0));
  spans.filter((s) => !seen.has(s.id)).forEach((s) => visit(s, 0));
  return result;
}
export function TraceDetailPage() {
  const { id } = useParams(),
    { data, error, loading } = useData<TraceDetail>(`/traces/${id}`),
    { notify } = useWorkspace();
  const [selectedId, setSelectedId] = useState(""),
    [collapsed, setCollapsed] = useState(new Set<string>()),
    [tab, setTab] = useState("Overview");
  const selected =
      data?.spans.find((s) => s.id === selectedId) ||
      data?.spans.find((s) => s.kind === "llm") ||
      data?.spans[0],
    slowest = data?.spans
      .filter((s) => s.kind !== "agent")
      .reduce<
        Span | undefined
      >((a, s) => (!a || s.duration_ms > a.duration_ms ? s : a), undefined);
  async function copy() {
    try {
      await navigator.clipboard.writeText(id || "");
      notify("Trace ID copied");
    } catch {
      notify("Clipboard unavailable. Select the trace ID to copy it.");
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `opspilot-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function toggle(sid: string) {
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }
  return (
    <>
      <Link className="back-link" to="/traces">
        <ArrowLeft size={14} />
        All executions
      </Link>
      <PageTitle
        eyebrow="TRACE EXPLORER"
        title="Inside the execution"
        description="Inspect the complete agent workflow, captured inputs, and timing."
        actions={
          <>
            <button className="button" onClick={copy}>
              <Copy size={14} />
              Copy ID
            </button>
            <button className="button" disabled={!data} onClick={download}>
              <Download size={14} />
              Export JSON
            </button>
          </>
        }
      />
      <LoadState loading={loading} error={error}>
        {data && (
          <>
            <div className="trace-heading">
              <div>
                <Workflow size={19} />
                <strong>{data.name}</strong>
                <Status status={data.status} />
                <Badge tone={data.mode === "mock" ? "amber" : "violet"}>
                  {data.mode}
                </Badge>
              </div>
              <span className="muted">{date(data.timestamp)}</span>
            </div>
            <div className="trace-id mono">
              {data.id} <span> / {data.project_id}</span>
            </div>
            <div className="stats-grid">
              <Stat
                label="Execution latency"
                value={ms(data.duration_ms)}
                icon={<Clock size={16} />}
              />
              <Stat label="Captured spans" value={data.span_count} />
              <Stat
                label="Token usage"
                value={num(data.total_tokens)}
                detail={
                  data.mode === "mock"
                    ? "Simulated mock token units"
                    : "Captured provider usage"
                }
              />
              <Stat
                label="Estimated cost"
                value={money(data.estimated_cost)}
                detail={`Provider cost: ${money(data.provider_cost)}`}
              />
            </div>
            <div className="trace-workbench">
              <Panel
                title="Execution waterfall"
                subtitle="Click a span to inspect its captured data"
                action={<Badge>{data.span_count} spans</Badge>}
              >
                <div className="waterfall-ruler">
                  <span>Operation</span>
                  <div>
                    <span>0 ms</span>
                    <span>{ms(data.duration_ms / 2)}</span>
                    <span>{ms(data.duration_ms)}</span>
                  </div>
                </div>
                <div className="waterfall-body">
                  {tree(data.spans, collapsed).map(
                    ({ span: s, depth, children }) => {
                      const Icon = icons[s.kind] || Workflow;
                      return (
                        <div
                          key={s.id}
                          className={`waterfall-row ${selected?.id === s.id ? "waterfall-selected" : ""} ${s.status !== "ok" ? "waterfall-error" : ""}`}
                        >
                          <div
                            className="span-name"
                            style={{ paddingLeft: 12 + depth * 17 }}
                          >
                            <button
                              className="collapse-button"
                              disabled={!children}
                              aria-label={
                                collapsed.has(s.id)
                                  ? "Expand span"
                                  : "Collapse span"
                              }
                              onClick={() => toggle(s.id)}
                            >
                              {children ? (
                                collapsed.has(s.id) ? (
                                  <ChevronRight size={12} />
                                ) : (
                                  <ChevronDown size={12} />
                                )
                              ) : (
                                <span />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setSelectedId(s.id);
                                setTab("Overview");
                              }}
                              title={s.name}
                            >
                              <Icon size={13} />
                              <span>{s.name}</span>
                              {slowest?.id === s.id && (
                                <Badge tone="amber">slowest</Badge>
                              )}
                            </button>
                          </div>
                          <button
                            className="span-timing"
                            aria-label={`Inspect ${s.name}`}
                            onClick={() => setSelectedId(s.id)}
                          >
                            <span
                              className={`timeline-bar timeline-${s.kind} ${s.status !== "ok" ? "timeline-failed" : ""}`}
                              style={{
                                left: `${(s.offset_ms / Math.max(data.duration_ms, 0.001)) * 100}%`,
                                width: `${Math.max(0.6, (s.duration_ms / Math.max(data.duration_ms, 0.001)) * 100)}%`,
                              }}
                            />
                            <span className="timing-value">
                              {ms(s.duration_ms)}
                            </span>
                          </button>
                        </div>
                      );
                    },
                  )}
                </div>
                <div className="waterfall-legend">
                  <span>
                    <i className="legend-agent" />
                    Agent
                  </span>
                  <span>
                    <i className="legend-llm" />
                    LLM
                  </span>
                  <span>
                    <i className="legend-tool" />
                    Tool
                  </span>
                  <span>
                    <i className="legend-retrieval" />
                    Retrieval
                  </span>
                </div>
              </Panel>
              <section className="panel span-inspector">
                {selected && (
                  <>
                    <div className="panel-heading">
                      <div>
                        <div className="eyebrow">SPAN DETAILS</div>
                        <h2>{selected.name}</h2>
                      </div>
                      <Badge>{selected.kind}</Badge>
                    </div>
                    <div className="tabs">
                      {["Overview", "Input / output", "Events"].map((t) => (
                        <button
                          key={t}
                          className={t === tab ? "active" : ""}
                          onClick={() => setTab(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <div className="inspector-content">
                      {tab === "Overview" && (
                        <>
                          <dl className="detail-list">
                            <div>
                              <dt>Status</dt>
                              <dd>
                                <Status status={selected.status} />
                              </dd>
                            </div>
                            <div>
                              <dt>Duration</dt>
                              <dd>{ms(selected.duration_ms)}</dd>
                            </div>
                            <div>
                              <dt>Model</dt>
                              <dd>{selected.model || "Not captured"}</dd>
                            </div>
                            <div>
                              <dt>Input / output units</dt>
                              <dd>
                                {num(selected.input_tokens)} /{" "}
                                {num(selected.output_tokens)}
                              </dd>
                            </div>
                            <div>
                              <dt>Estimated cost</dt>
                              <dd>{money(selected.estimated_cost)}</dd>
                            </div>
                            <div>
                              <dt>Provider cost</dt>
                              <dd>{money(selected.provider_cost)}</dd>
                            </div>
                            <div>
                              <dt>Span ID</dt>
                              <dd className="mono">{selected.id}</dd>
                            </div>
                            <div>
                              <dt>Parent ID</dt>
                              <dd className="mono">
                                {selected.parent_id || "Root"}
                              </dd>
                            </div>
                          </dl>
                          {selected.status_message && (
                            <div className="error-text error-block">
                              {selected.status_message}
                            </div>
                          )}
                          <details>
                            <summary>All captured attributes</summary>
                            <pre>
                              {JSON.stringify(selected.attributes, null, 2)}
                            </pre>
                          </details>
                        </>
                      )}
                      {tab === "Input / output" && (
                        <>
                          {Object.entries(selected.attributes)
                            .filter(
                              ([k]) =>
                                [
                                  "input",
                                  "output",
                                  "context",
                                  "question",
                                  "reference",
                                  "messages",
                                ].some((w) => k.includes(w)) &&
                                !k.includes("tokens"),
                            )
                            .map(([key, val]) => (
                              <div className="captured-field" key={key}>
                                <h3>{key}</h3>
                                <pre>
                                  {typeof val === "string"
                                    ? val
                                    : JSON.stringify(val, null, 2)}
                                </pre>
                              </div>
                            ))}
                          {!Object.keys(selected.attributes).some((k) =>
                            /input|output|context|question|messages/.test(k),
                          ) && (
                            <p className="muted">
                              No inputs or outputs captured for this span.
                            </p>
                          )}
                        </>
                      )}
                      {tab === "Events" && (
                        <pre>
                          {selected.events.length
                            ? JSON.stringify(selected.events, null, 2)
                            : "No events recorded for this span."}
                        </pre>
                      )}
                    </div>
                  </>
                )}
              </section>
            </div>
            <Panel
              title="Trace evaluations"
              subtitle="Stored quality assessments for this execution"
              action={
                <Link className="button" to={`/evaluations?trace_id=${id}`}>
                  <ClipboardCheck size={14} />
                  Run evaluation
                </Link>
              }
            >
              {data.evaluations.length ? (
                <div className="evaluation-inline">
                  {data.evaluations.map((e) => (
                    <div key={e.id}>
                      <Badge tone="violet">
                        {e.method.replaceAll("_", " ")}
                      </Badge>
                      <div className="score-chips">
                        {Object.entries(e.scores).map(([key, value]) => (
                          <span title={e.explanations[key]} key={key}>
                            {key.replaceAll("_", " ")}
                            <strong>
                              {value == null ? "N/A" : value.toFixed(2)}
                            </strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="panel-padding muted">
                  No evaluation stored. Captured LLM output is required.
                </p>
              )}
            </Panel>
          </>
        )}
      </LoadState>
    </>
  );
}
