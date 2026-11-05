import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Play,
  GitCompareArrows,
  LoaderCircle,
  Download,
  FileText,
} from "lucide-react";
import { useData, useWorkspace } from "../hooks/workspace";
import { post } from "../services/api";
import type { Prompt, Dataset, Experiment, Settings, Source } from "../types";
import {
  PageTitle,
  Panel,
  LoadState,
  Modal,
  Badge,
  Empty,
} from "../components/ui";
import { money, ms, num, pct, date } from "../utils/format";
import { DatasetLibrary } from "../components/DatasetLibrary";

const metrics = [
  ["answer_relevance", "Answer relevance", pct],
  ["faithfulness", "Faithfulness", pct],
  ["context_relevance", "Context relevance", pct],
  ["correctness", "Reference correctness", pct],
  ["latency_ms", "Measured latency", ms],
  ["tokens", "Token units / request", num],
  ["estimated_cost", "Est. cost / request", money],
] as const;
export function PromptsPage() {
  const { data, error, loading } = useData<{ items: Prompt[] }>("/prompts"),
    { data: datasets } = useData<{ items: Dataset[] }>("/datasets"),
    { data: experiments } = useData<{ items: Experiment[] }>("/experiments"),
    { data: settings } = useData<Settings>("/settings"),
    { refresh, notify, setSource } = useWorkspace();
  const [promptId, setPromptId] = useState(0),
    [newPrompt, setNewPrompt] = useState(false),
    [newVersion, setNewVersion] = useState(false),
    [name, setName] = useState(""),
    [content, setContent] = useState(""),
    [k, setK] = useState(2),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState(""),
    [a, setA] = useState(0),
    [b, setB] = useState(0),
    [datasetId, setDatasetId] = useState(0),
    [provider, setProvider] = useState(false);
  const prompt = data?.items.find((p) => p.id === promptId) || data?.items[0],
    versions = prompt?.versions || [],
    left = versions.find((v) => v.id === a) || versions[0],
    right = versions.find((v) => v.id === b) || versions[1] || versions[0];
  const { data: diff } = useData<{
    diff: string;
    retrieval_k: { before: number; after: number };
  }>(`/prompts/diff/${left?.id || 1}/${right?.id || 2}`);
  async function create() {
    setBusy(true);
    setErr("");
    try {
      if (newPrompt) {
        const p = await post<Prompt>("/prompts", { name });
        setPromptId(p.id);
        setNewPrompt(false);
      } else {
        await post(`/prompts/${prompt?.id}/versions`, {
          content,
          retrieval_k: k,
        });
        setNewVersion(false);
      }
      refresh();
      notify("Prompt saved.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    setBusy(true);
    setErr("");
    try {
      const report = await post<{ source: Source }>("/experiments/run", {
        name: `${prompt?.name} · v${left?.version} vs v${right?.version}`,
        dataset_id: datasetId || datasets?.items[0]?.id,
        version_ids: [left?.id, right?.id],
        provider,
      });
      setSource(report.source);
      refresh();
      notify(
        "Paired experiment complete. Comparison uses actual stored executions.",
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function exportReport(report: Experiment) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `opspilot-experiment-${report.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageTitle
        title="A better prompt starts with evidence."
        description="Version your prompts and compare measured results on the same reference dataset."
        actions={
          <button
            className="button"
            onClick={() => {
              setNewPrompt(true);
              setErr("");
            }}
          >
            <Plus size={14} />
            New prompt
          </button>
        }
      />
      <LoadState loading={loading} error={error}>
        {prompt ? (
          <>
            <div className="prompt-workspace">
              <Panel
                title="Prompt library"
                subtitle={`${data?.items.length} prompts`}
              >
                <div className="prompt-library">
                  {data?.items.map((p) => (
                    <button
                      key={p.id}
                      className={p.id === prompt.id ? "active" : ""}
                      onClick={() => {
                        setPromptId(p.id);
                        setA(0);
                        setB(0);
                      }}
                    >
                      <FileText size={17} />
                      <span>
                        {p.name}
                        <small>{p.versions.length} versions</small>
                      </span>
                    </button>
                  ))}
                </div>
              </Panel>
              <Panel
                title={prompt.name}
                subtitle={
                  prompt.description || "Versioned support instructions"
                }
                action={
                  <button
                    className="button small"
                    onClick={() => {
                      setContent(right?.content || "");
                      setNewVersion(true);
                      setErr("");
                    }}
                  >
                    <Plus size={13} />
                    Add version
                  </button>
                }
              >
                <div className="version-cards">
                  {versions.map((v) => (
                    <article key={v.id}>
                      <div>
                        <Badge tone="violet">Version {v.version}</Badge>
                        <small>{date(v.created_at)}</small>
                      </div>
                      <p>{v.content}</p>
                      <span className="muted">
                        Retrieval window · {v.retrieval_k} documents
                      </span>
                    </article>
                  ))}
                </div>
                {!versions.length && (
                  <Empty
                    title="Add your first version"
                    description="Save prompt text and a retrieval window to start an experiment."
                  />
                )}
              </Panel>
            </div>
            <DatasetLibrary
              datasets={datasets?.items || []}
              selectedId={datasetId || datasets?.items[0]?.id || 0}
              onSelect={setDatasetId}
            />
            <Panel
              title="Compare prompt versions"
              subtitle="Same dataset. Measured execution. No assumed improvements."
              action={<GitCompareArrows size={19} className="muted" />}
            >
              <div className="experiment-controls">
                <label>
                  Baseline
                  <select
                    value={left?.id || ""}
                    onChange={(e) => setA(Number(e.target.value))}
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        Version {v.version}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="versus">vs</span>
                <label>
                  Candidate
                  <select
                    value={right?.id || ""}
                    onChange={(e) => setB(Number(e.target.value))}
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        Version {v.version}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Evaluation dataset
                  <select
                    value={datasetId || datasets?.items[0]?.id || ""}
                    onChange={(e) => setDatasetId(Number(e.target.value))}
                  >
                    {datasets?.items.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button primary"
                  disabled={busy || !left || !right || left.id === right.id}
                  onClick={() => void run()}
                >
                  {busy ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <Play size={14} />
                  )}{" "}
                  {busy ? "Running comparison…" : "Run experiment"}
                </button>
              </div>
              <div className="panel-padding">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={provider}
                    disabled={!settings?.provider_configured}
                    onChange={(e) => setProvider(e.target.checked)}
                  />
                  Use configured provider{" "}
                  {settings?.provider_configured ? "" : "(key unavailable)"}
                </label>
                <p className="muted text-small">
                  {provider
                    ? "Uses your provider for every dataset case. Quality is evaluated with a labeled lexical heuristic."
                    : "Mock comparisons measure local workflow runtime and simulated token usage. They do not predict provider latency or quality."}
                </p>
                {err && !newPrompt && !newVersion && (
                  <p className="error-text">{err}</p>
                )}
                <details>
                  <summary>Review prompt changes</summary>
                  <pre className="diff">
                    {diff?.diff ||
                      "Select two versions to compare their content."}
                  </pre>
                  {diff && (
                    <p className="muted">
                      Retrieved documents: {diff.retrieval_k.before} →{" "}
                      {diff.retrieval_k.after}
                    </p>
                  )}
                </details>
              </div>
            </Panel>
            <div className="section-label">EXPERIMENT HISTORY</div>
            {experiments?.items.length ? (
              experiments.items.map((e) => (
                <Panel
                  key={e.id}
                  title={e.name}
                  subtitle={`${date(e.created_at)} · ${e.status} · ${e.evaluation_method} evaluation`}
                  action={
                    <div className="actions">
                      <Badge tone={e.paired ? "green" : "amber"}>
                        {e.paired ? "Paired dataset" : "Incomplete pairing"}
                      </Badge>
                      <button
                        className="icon-button"
                        aria-label="Download comparison report"
                        onClick={() => exportReport(e)}
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  }
                >
                  <div className="table-wrap">
                    <table className="comparison-table">
                      <thead>
                        <tr>
                          <th>Metric</th>
                          {e.versions.map((v) => (
                            <th key={v.version_id}>
                              Version {v.version}
                              <small>
                                {v.successful}/{v.runs} successful runs
                              </small>
                            </th>
                          ))}
                          {e.versions.length === 2 && <th>Measured change</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.map(([key, title, format]) => {
                          const values = e.versions.map((v) => v[key]);
                          const delta =
                            values.length === 2 &&
                            values[0] != null &&
                            values[1] != null
                              ? values[1] - values[0]
                              : null;
                          const quality = [
                            "answer_relevance",
                            "faithfulness",
                            "context_relevance",
                            "correctness",
                          ].includes(key);
                          return (
                            <tr key={key}>
                              <td>{title}</td>
                              {values.map((v, i) => (
                                <td className="mono" key={i}>
                                  {format(v)}
                                </td>
                              ))}
                              {values.length === 2 && (
                                <td
                                  className={
                                    delta == null || delta === 0
                                      ? "muted"
                                      : (quality ? delta > 0 : delta < 0)
                                        ? "green"
                                        : "amber"
                                  }
                                >
                                  {!e.paired || delta == null
                                    ? "N/A"
                                    : delta === 0
                                      ? "No change"
                                      : `${delta > 0 ? "+" : ""}${quality ? (delta * 100).toFixed(1) + " pp" : key === "latency_ms" ? delta.toFixed(2) + " ms" : key === "estimated_cost" ? "$" + delta.toFixed(6) : delta.toFixed(1) + " units"}`}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <details className="panel-padding">
                    <summary>Inspect underlying traces</summary>
                    <div className="experiment-traces">
                      {e.versions.map((v) => (
                        <div key={v.version_id}>
                          <strong>Version {v.version}</strong>
                          {v.traces.map((t, index) => (
                            <Link
                              className="mono text-link"
                              to={`/traces/${t}`}
                              key={t}
                            >
                              {t.slice(0, 16)} ↗
                              <small className="muted">
                                {v.evaluation_ids?.[index] != null
                                  ? `Evaluation #${v.evaluation_ids[index]}`
                                  : "Evaluation unavailable"}
                              </small>
                            </Link>
                          ))}
                        </div>
                      ))}
                    </div>
                  </details>
                </Panel>
              ))
            ) : (
              <Panel title="No experiments yet">
                <Empty
                  title="Compare your first two versions"
                  description="Run a paired dataset to produce a report from real executions."
                />
              </Panel>
            )}
          </>
        ) : (
          <Empty title="Create a prompt to get started" />
        )}
      </LoadState>
      {(newPrompt || newVersion) && (
        <Modal
          title={newPrompt ? "Create a prompt" : "Add a prompt version"}
          onClose={() => {
            if (!busy) {
              setNewPrompt(false);
              setNewVersion(false);
            }
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            {newPrompt ? (
              <label>
                Prompt name
                <input
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            ) : (
              <>
                <label>
                  Prompt instructions
                  <textarea
                    required
                    minLength={5}
                    maxLength={20000}
                    rows={8}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                </label>
                <label>
                  Retrieval window (documents)
                  <input
                    type="number"
                    required
                    min={1}
                    max={5}
                    value={k}
                    onChange={(e) => setK(Number(e.target.value))}
                  />
                </label>
              </>
            )}
            {err && <p className="error-text">{err}</p>}
            <button className="button primary full" disabled={busy}>
              Save {newPrompt ? "prompt" : "version"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
