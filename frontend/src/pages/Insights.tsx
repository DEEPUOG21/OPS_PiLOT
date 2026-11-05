import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Lightbulb,
  ArrowUpRight,
  RefreshCw,
  Check,
  Search,
} from "lucide-react";
import { useData, useWorkspace } from "../hooks/workspace";
import { post } from "../services/api";
import type { Insight } from "../types";
import { PageTitle, Stat, LoadState, Badge, Empty } from "../components/ui";
import { label } from "../utils/format";

export function InsightsPage() {
  const { data, error, loading } = useData<{ items: Insight[] }>("/insights"),
    { source, refresh, notify } = useWorkspace(),
    [filter, setFilter] = useState("open"),
    [busy, setBusy] = useState(false);
  const items =
    data?.items.filter((i) => filter === "all" || i.status === filter) || [];
  async function update(i: Insight, status: string) {
    try {
      await post(`/insights/${i.id}/resolve`, { status });
      refresh();
      notify(`Insight marked ${label(status).toLowerCase()}.`);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function scan() {
    setBusy(true);
    try {
      const r = await post<{ created: number }>(
        `/insights/refresh?source=${source}`,
      );
      refresh();
      notify(`${r.created} new insights supported by telemetry.`);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Turn telemetry into a next step."
        description="Evidence-backed recommendations to improve cost, latency, reliability, and quality."
        actions={
          <button
            className="button"
            disabled={busy}
            onClick={() => void scan()}
          >
            <RefreshCw size={14} className={busy ? "spin" : ""} />
            Analyze traces
          </button>
        }
      />
      <LoadState loading={loading} error={error}>
        <div className="stats-grid three">
          <Stat
            label="Open insights"
            value={data?.items.filter((i) => i.status === "open").length || 0}
            icon={<Lightbulb size={16} />}
          />
          <Stat
            label="Under review"
            value={
              data?.items.filter((i) => i.status === "under_review").length || 0
            }
            icon={<Search size={16} />}
          />
          <Stat
            label="Resolved"
            value={
              data?.items.filter((i) => i.status === "resolved").length || 0
            }
            icon={<Check size={16} />}
          />
        </div>
        <div className="insight-filter">
          {["open", "under_review", "resolved", "dismissed", "all"].map((f) => (
            <button
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
              key={f}
            >
              {label(f)}
            </button>
          ))}
        </div>
        {items.length ? (
          <div className="insight-grid">
            {items.map((i) => (
              <article className="insight-card" key={i.id}>
                <div className="insight-meta">
                  <Badge tone={i.severity === "high" ? "red" : "amber"}>
                    {i.severity} priority
                  </Badge>
                  <Badge>{i.category}</Badge>
                  <span>#{i.id}</span>
                </div>
                <h2>{i.title}</h2>
                {i.agent && <div className="insight-agent">{i.agent}</div>}
                <p>{i.explanation}</p>
                <div className="evidence">
                  <h3>SUPPORTING EVIDENCE</h3>
                  <pre>{JSON.stringify(i.evidence, null, 2)}</pre>
                  <Link className="text-link" to={`/traces/${i.trace_id}`}>
                    Inspect affected trace <ArrowUpRight size={13} />
                  </Link>
                </div>
                <div className="recommendation">
                  <Lightbulb size={16} />
                  <div>
                    <h3>Recommended action</h3>
                    <p>{i.action}</p>
                  </div>
                </div>
                <div className="insight-actions">
                  <span>
                    Expected impact: <strong>{i.category}</strong>
                  </span>
                  <select
                    aria-label={`Status for ${i.title}`}
                    value={i.status}
                    onChange={(e) => void update(i, e.target.value)}
                  >
                    {["open", "under_review", "resolved", "dismissed"].map(
                      (s) => (
                        <option key={s} value={s}>
                          {label(s)}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title={
              filter === "open" ? "No open insights" : "No matching insights"
            }
            description="Insufficient data for new recommendations, or all matching insights have been reviewed. Analyze traces after collecting more executions."
          />
        )}
      </LoadState>
    </>
  );
}
