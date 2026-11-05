import { Link } from "react-router-dom";
import {
  GitBranch,
  Timer,
  Coins,
  ArrowUpRight,
  Lightbulb,
  CheckCircle2,
  Zap,
  ChevronRight,
} from "lucide-react";
import { useData, useWorkspace } from "../hooks/workspace";
import type { Overview, Insight } from "../types";
import {
  PageTitle,
  Stat,
  Panel,
  LoadState,
  Empty,
  Badge,
} from "../components/ui";
import { TraceTable } from "../components/TraceTable";
import { TrendChart, Bars } from "../components/charts";
import { ms, num, money, pct } from "../utils/format";

export function OverviewPage() {
  const { data, error, loading } = useData<Overview>("/analytics/overview"),
    { data: insights } = useData<{ items: Insight[] }>("/insights"),
    { source } = useWorkspace();
  const open = insights?.items.filter((i) => i.status === "open") || [],
    recent = [...(data?.recent_traces || [])].reverse();
  return (
    <>
      <PageTitle
        title="Every execution. A clearer picture."
        description="Monitor performance, understand quality, and find what to improve."
        actions={
          <span className="subtle-label">
            <span className="connection-dot" />
            All stored executions
          </span>
        }
      />
      <LoadState loading={loading} error={error}>
        {data && (
          <>
            <div className="stats-grid">
              <Stat
                label="Total executions"
                value={num(data.total_traces)}
                icon={<GitBranch size={17} />}
                detail={
                  <>
                    <span className="green">
                      {num(data.successful)} successful
                    </span>
                    <span className="detail-divider">·</span>
                    {data.failed} failed
                  </>
                }
              />
              <Stat
                label="Average latency"
                value={ms(data.avg_latency_ms)}
                icon={<Timer size={17} />}
                detail="End-to-end wall clock time"
              />
              <Stat
                label="Total token usage"
                value={num(data.total_tokens)}
                icon={<Zap size={17} />}
                detail={
                  source === "demo"
                    ? "Simulated mock token units"
                    : "Sum of captured token usage"
                }
              />
              <Stat
                label="Estimated spend"
                value={money(data.estimated_cost)}
                icon={<Coins size={17} />}
                accent
                detail={`${data.cost_coverage.priced_spans}/${data.cost_coverage.usage_spans} usage spans priced · USD`}
              />
            </div>
            <div className="chart-grid">
              <Panel
                title="Execution performance"
                subtitle="Latency across recent executions"
                action={
                  <span className="chart-legend">
                    <i />
                    Duration (ms)
                  </span>
                }
              >
                {recent.length ? (
                  <TrendChart
                    data={recent.map((t, i) => ({
                      name: `Run ${i + 1}`,
                      latency_ms: Number(t.duration_ms.toFixed(2)),
                    }))}
                    dataKey="latency_ms"
                  />
                ) : (
                  <Empty />
                )}
                <div className="chart-summary">
                  <span>
                    <span className="green-dot" />
                    {pct(
                      data.total_traces
                        ? data.successful / data.total_traces
                        : null,
                    )}{" "}
                    success rate
                  </span>
                  <Link to="/performance">
                    Explore performance <ArrowUpRight size={13} />
                  </Link>
                </div>
              </Panel>
              <Panel
                title="Token consumption"
                subtitle={
                  source === "demo"
                    ? "Simulated units by recent execution"
                    : "Captured tokens by recent execution"
                }
                action={<Badge>Input + output</Badge>}
              >
                {recent.length ? (
                  <Bars
                    data={recent.map((t, i) => ({
                      name: `Run ${i + 1}`,
                      tokens: t.total_tokens,
                    }))}
                    dataKey="tokens"
                  />
                ) : (
                  <Empty />
                )}
                <div className="chart-summary">
                  <span>Unavailable usage appears as a gap</span>
                  <Link to="/costs">
                    Cost breakdown <ArrowUpRight size={13} />
                  </Link>
                </div>
              </Panel>
            </div>
            <div className="intelligence-strip">
              <div className="intelligence-icon">
                <Lightbulb size={21} />
              </div>
              <div>
                <div className="intelligence-heading">
                  A little less guesswork. A lot more insight.{" "}
                  <Badge tone="violet">Optimization intelligence</Badge>
                </div>
                <p>
                  {open.length
                    ? `${open.length} evidence-backed signals across your executions. Start with the ones that matter most.`
                    : "Run different scenarios to discover evidence-backed optimization opportunities."}
                </p>
              </div>
              <Link className="button" to="/insights">
                Explore insights <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="overview-bottom">
              <Panel
                title="Recent executions"
                subtitle="Follow the full path from request to response"
                action={
                  <Link className="text-link" to="/traces">
                    View all traces <ArrowUpRight size={14} />
                  </Link>
                }
              >
                <TraceTable traces={data.recent_traces.slice(0, 5)} compact />
              </Panel>
              <Panel
                title="Workspace signals"
                subtitle="Quality and reliability at a glance"
              >
                <div className="quality-signal">
                  <span className="signal-icon">
                    <CheckCircle2 size={19} />
                  </span>
                  <div>
                    <span>Answer relevance</span>
                    <strong>{pct(data.quality_by_method.heuristic)}</strong>
                    <small>
                      Heuristic · {data.evaluated_traces} evaluated traces
                    </small>
                  </div>
                </div>
                <div className="signal-list">
                  {open.slice(0, 3).map((i) => (
                    <Link to="/insights" key={i.id}>
                      <span className={`severity-dot ${i.severity}`} />
                      <div>
                        <strong>{i.title}</strong>
                        <small>
                          {i.category} · {i.severity} priority
                        </small>
                      </div>
                      <ChevronRight size={14} />
                    </Link>
                  ))}
                  {!open.length && (
                    <p className="muted signal-empty">
                      No open optimization signals.
                    </p>
                  )}
                </div>
                <Link to="/evaluations" className="signal-footer">
                  View quality evaluations <ArrowUpRight size={14} />
                </Link>
              </Panel>
            </div>
          </>
        )}
      </LoadState>
    </>
  );
}
