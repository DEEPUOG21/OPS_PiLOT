import { useData } from "../hooks/workspace";
import type { Performance } from "../types";
import {
  PageTitle,
  Stat,
  Panel,
  LoadState,
  Badge,
  Empty,
} from "../components/ui";
import { TraceTable } from "../components/TraceTable";
import { Bars } from "../components/charts";
import { ms, pct, num } from "../utils/format";

export function PerformancePage() {
  const { data, error, loading } = useData<Performance>(
    "/analytics/performance",
  );
  return (
    <>
      <PageTitle
        title="Find the bottleneck."
        description="Measured latency, failure rates, and the operations slowing down your application."
      />
      <LoadState loading={loading} error={error}>
        {data && (
          <>
            <div className="stats-grid five">
              <Stat
                label="P50 latency"
                value={ms(data.p50_ms)}
                detail="At least 2 executions required"
              />
              <Stat
                label="P95 latency"
                value={ms(data.p95_ms)}
                detail="At least 20 executions required"
              />
              <Stat
                label="P99 latency"
                value={ms(data.p99_ms)}
                detail="At least 100 executions required"
              />
              <Stat
                label="Error rate"
                value={pct(data.error_rate)}
                detail={`${data.sample_count} measured executions`}
              />
              <Stat
                label="Timeout rate"
                value={pct(data.timeout_rate)}
                detail="Explicit timeout telemetry"
              />
            </div>
            <div className="chart-grid">
              <Panel
                title="Latency distribution"
                subtitle="End-to-end duration · number of executions"
              >
                {data.sample_count ? (
                  <Bars
                    data={data.distribution.map((d) => ({
                      name: d.bucket,
                      count: d.count,
                    }))}
                    dataKey="count"
                  />
                ) : (
                  <Empty />
                )}
              </Panel>
              <Panel
                title="Slowest operations"
                subtitle="Average elapsed time per operation · inclusive spans"
              >
                {data.breakdown.length ? (
                  <Bars
                    horizontal
                    data={data.breakdown
                      .slice(0, 6)
                      .map((d) => ({
                        name: d.name.replace(" Agent", ""),
                        latency_ms: Number(d.avg_ms.toFixed(2)),
                      }))}
                    dataKey="latency_ms"
                  />
                ) : (
                  <Empty />
                )}
              </Panel>
            </div>
            <Panel
              title="Operation breakdown"
              subtitle="Nested operation durations overlap; do not add them together"
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Operation</th>
                      <th>Type</th>
                      <th>Executions</th>
                      <th>Average latency</th>
                      <th>Maximum latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.breakdown.map((b) => (
                      <tr key={b.kind + b.name}>
                        <td>{b.name}</td>
                        <td>
                          <Badge>{b.kind}</Badge>
                        </td>
                        <td>{num(b.count)}</td>
                        <td className="mono">{ms(b.avg_ms)}</td>
                        <td className="mono">{ms(b.max_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            <Panel
              title="Slowest executions"
              subtitle="Open a trace to find the critical operation"
            >
              <TraceTable traces={data.slowest} />
            </Panel>
          </>
        )}
      </LoadState>
    </>
  );
}
