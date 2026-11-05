import { useData, useWorkspace } from "../hooks/workspace";
import type { Costs, Overview, CostGroup } from "../types";
import { PageTitle, Panel, Stat, LoadState, Empty } from "../components/ui";
import { Bars, TrendChart } from "../components/charts";
import { TraceTable } from "../components/TraceTable";
import { money, num } from "../utils/format";

function CostTable({ items }: { items: CostGroup[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Model / agent</th>
            <th>Calls</th>
            <th>Input tokens</th>
            <th>Output tokens</th>
            <th>Est. cost</th>
            <th>Provider cost</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.name}>
              <td>{i.name}</td>
              <td>{i.calls}</td>
              <td className="mono">{num(i.input_tokens)}</td>
              <td className="mono">{num(i.output_tokens)}</td>
              <td className="mono">{money(i.estimated_cost)}</td>
              <td className="mono">{money(i.provider_cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function CostsPage() {
  const { data, error, loading } = useData<Costs>("/analytics/costs"),
    { data: overview } = useData<Overview>("/analytics/overview"),
    { source } = useWorkspace();
  return (
    <>
      <PageTitle
        title="Know where every token goes."
        description="Understand model spending and find expensive prompts without confusing estimates with charges."
      />
      <div className="notice">
        {source === "demo"
          ? "Demo usage is simulated. Pricing for mock-support-v1 is illustrative."
          : "Estimates use configured rates at ingestion. Provider charges appear only when explicitly reported."}{" "}
        Missing or partially captured costs are not treated as zero.
      </div>
      <LoadState loading={loading} error={error}>
        {data && (
          <>
            <div className="stats-grid">
              <Stat
                label="Estimated total"
                value={money(overview?.estimated_cost)}
                detail="Configured pricing · USD"
                accent
              />
              <Stat
                label="Provider-reported cost"
                value={money(overview?.provider_cost)}
                detail="Only explicitly captured charges"
              />
              <Stat
                label="Cost per execution"
                value={money(
                  overview?.estimated_cost != null && overview.total_traces
                    ? overview.estimated_cost / overview.total_traces
                    : null,
                )}
                detail="Known estimated spend / all executions"
              />
              <Stat
                label="Captured tokens"
                value={num(overview?.total_tokens)}
                detail={
                  source === "demo"
                    ? "Simulated mock token units"
                    : "Available input + output usage"
                }
              />
            </div>
            <div className="chart-grid">
              <Panel
                title="Daily estimated spend"
                subtitle="Stored usage valued using pricing snapshots (USD)"
              >
                {overview?.trend.length ? (
                  <TrendChart
                    data={overview.trend.map((t) => ({
                      name: t.date,
                      estimated_cost: t.estimated_cost,
                    }))}
                    dataKey="estimated_cost"
                  />
                ) : (
                  <Empty />
                )}
              </Panel>
              <Panel title="Model spending" subtitle="Estimated cost · USD">
                {data.by_model.length ? (
                  <Bars
                    data={data.by_model.map((m) => ({
                      name: m.name,
                      estimated_cost: m.estimated_cost,
                    }))}
                    dataKey="estimated_cost"
                  />
                ) : (
                  <Empty />
                )}
              </Panel>
            </div>
            <Panel
              title="Spending by model"
              subtitle="Provider and estimated costs are separate values"
            >
              <CostTable items={data.by_model} />
            </Panel>
            <Panel
              title="Spending by agent"
              subtitle="Model usage attributed to the nearest owning agent"
            >
              <CostTable items={data.by_agent} />
            </Panel>
            <Panel
              title="Most expensive executions"
              subtitle="Ranked by captured estimated cost"
            >
              <TraceTable traces={data.expensive} />
            </Panel>
            <Panel
              title="Most expensive captured prompts"
              subtitle="Grouped by exact captured prompt text · estimated USD"
            >
              {data.prompts.length ? (
                <div className="prompt-cost-list">
                  {data.prompts.map((p, i) => (
                    <details key={i}>
                      <summary>
                        <span>
                          Captured prompt {i + 1} · {p.calls} calls
                        </span>
                        <strong className="mono">
                          {money(p.estimated_cost)}
                        </strong>
                      </summary>
                      <pre>{p.name}</pre>
                    </details>
                  ))}
                </div>
              ) : (
                <Empty title="No prompts captured" />
              )}
            </Panel>
          </>
        )}
      </LoadState>
    </>
  );
}
