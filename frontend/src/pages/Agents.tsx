import { useState } from "react";
import { Bot, Workflow, ChevronRight } from "lucide-react";
import { AgentGraph } from "../components/AgentGraph";
import { useData } from "../hooks/workspace";
import type { Agents } from "../types";
import {
  PageTitle,
  Panel,
  Stat,
  LoadState,
  Empty,
  Badge,
} from "../components/ui";
import { ms, money, pct, num } from "../utils/format";

export function AgentsPage() {
  const { data, error, loading } = useData<Agents>("/analytics/agents"),
    [selected, setSelected] = useState("");
  const active = data?.agents.find((a) => a.name === selected);
  return (
    <>
      <PageTitle
        title="Understand the team behind the answer."
        description="Follow agent relationships, inspect handoffs, and measure each agent’s contribution."
      />
      <LoadState loading={loading} error={error}>
        {data?.agents.length ? (
          <>
            <div className="stats-grid three">
              <Stat
                label="Observed agents"
                value={data.agents.length}
                icon={<Bot size={16} />}
              />
              <Stat
                label="Agent executions"
                value={num(data.agents.reduce((a, b) => a + b.executions, 0))}
                icon={<Workflow size={16} />}
              />
              <Stat
                label="Workflow completion"
                value={pct(data.workflow_completion_rate)}
                detail="Executions with no recorded error"
              />
            </div>
            <Panel
              title="Agent execution graph"
              subtitle="Relationships derived from captured parent-child spans · click an agent"
            >
              <AgentGraph
                data={data}
                selected={selected}
                onSelect={setSelected}
              />
              {active && (
                <div className="agent-selection">
                  <div>
                    <Badge tone="violet">Selected agent</Badge>
                    <h3>{active.name}</h3>
                  </div>
                  <span>
                    Success <strong>{pct(active.success_rate)}</strong>
                  </span>
                  <span>
                    Avg. latency <strong>{ms(active.avg_ms)}</strong>
                  </span>
                  <span>
                    Estimated cost{" "}
                    <strong>{money(active.estimated_cost)}</strong>
                  </span>
                </div>
              )}
            </Panel>
            <Panel
              title="Agent performance"
              subtitle="Click an agent to highlight it in the graph"
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Executions</th>
                      <th>Success rate</th>
                      <th>Avg. latency</th>
                      <th>Input / output tokens</th>
                      <th>Est. cost</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.agents.map((a) => (
                      <tr
                        key={a.name}
                        className={a.name === selected ? "selected-row" : ""}
                      >
                        <td>
                          <button
                            className="table-button"
                            onClick={() => setSelected(a.name)}
                          >
                            <Bot size={15} />
                            {a.name}
                          </button>
                        </td>
                        <td>{a.executions}</td>
                        <td>
                          <span className={a.failures ? "amber" : "green"}>
                            {pct(a.success_rate)}
                          </span>
                        </td>
                        <td className="mono">{ms(a.avg_ms)}</td>
                        <td className="mono">
                          {num(a.input_tokens)} / {num(a.output_tokens)}
                        </td>
                        <td className="mono">{money(a.estimated_cost)}</td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={`Inspect ${a.name}`}
                            onClick={() => setSelected(a.name)}
                          >
                            <ChevronRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            <div className="notice">
              Repeated tool calls, deep execution chains, and explicitly
              reported handoff failures appear in Optimization insights.
              Parent-child relationships alone do not prove a failed handoff.
            </div>
          </>
        ) : (
          <Empty
            title="No agents observed"
            description="Instrument agent spans with opspilot.kind=agent to see their relationships."
          />
        )}
      </LoadState>
    </>
  );
}
