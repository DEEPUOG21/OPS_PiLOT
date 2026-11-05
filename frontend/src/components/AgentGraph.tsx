import { Bot } from "lucide-react";
import type { Agents } from "../types";
import { ms } from "../utils/format";

export function AgentGraph({
  data,
  selected,
  onSelect,
}: {
  data: Agents;
  selected: string;
  onSelect: (name: string) => void;
}) {
  const targets = new Set(data.edges.map((e) => e.child));
  const levels = new Map<string, number>();
  const queue = data.agents
    .filter((a) => !targets.has(a.name))
    .map((a) => a.name);
  queue.forEach((name) => levels.set(name, 0));
  for (let i = 0; i < queue.length; i++) {
    const parent = queue[i];
    for (const edge of data.edges.filter((e) => e.parent === parent)) {
      if (!levels.has(edge.child)) {
        levels.set(edge.child, (levels.get(parent) || 0) + 1);
        queue.push(edge.child);
      }
    }
  }
  // Cycles and disconnected nodes remain visible; edges still show the actual relationships.
  data.agents.forEach((a) => {
    if (!levels.has(a.name)) levels.set(a.name, 0);
  });
  const rows = Array.from(new Set(levels.values()))
    .sort((a, b) => a - b)
    .map((level) => data.agents.filter((a) => levels.get(a.name) === level));
  const width = Math.max(540, ...rows.map((r) => r.length * 230 + 30)),
    height = rows.length * 115 + 45;
  const positions = new Map<string, { x: number; y: number }>();
  rows.forEach((row, index) =>
    row.forEach((agent, column) =>
      positions.set(agent.name, {
        x: (width - row.length * 230) / 2 + column * 230 + 15,
        y: index * 115 + 20,
      }),
    ),
  );
  return (
    <div className="graph-viewport">
      <div className="graph-canvas" style={{ width, height }}>
        <svg
          width={width}
          height={height}
          className="graph-edges"
          aria-label="Observed agent relationships"
        >
          <defs>
            <marker
              id="agent-arrow"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <path d="M0 0 L7 3.5 L0 7" fill="#8a6ba2" />
            </marker>
          </defs>
          {data.edges.map((edge) => {
            const a = positions.get(edge.parent),
              b = positions.get(edge.child);
            if (!a || !b) return null;
            const x = a.x + 100,
              y = a.y + 63,
              tx = b.x + 100,
              ty = b.y;
            const path =
              edge.parent === edge.child
                ? `M${a.x + 195} ${a.y + 20} C${a.x + 230} ${a.y - 25},${a.x + 230} ${a.y + 90},${a.x + 195} ${a.y + 45}`
                : a.y === b.y
                  ? `M${a.x + 100} ${a.y + 63} Q${(a.x + b.x) / 2 + 100} ${a.y + 110} ${b.x + 100} ${b.y + 63}`
                  : `M${x} ${y} C${x} ${(y + ty) / 2},${tx} ${(y + ty) / 2},${tx} ${ty - 4}`;
            return (
              <path
                key={`${edge.parent}-${edge.child}`}
                d={path}
                fill="none"
                stroke="#6b527e"
                strokeWidth={1.5}
                markerEnd="url(#agent-arrow)"
              >
                <title>{`${edge.parent} → ${edge.child}: ${edge.count} observed relationships`}</title>
              </path>
            );
          })}
        </svg>
        {data.agents.map((agent) => {
          const pos = positions.get(agent.name)!;
          return (
            <button
              key={agent.name}
              className={`graph-node agent-node ${selected === agent.name ? "active" : ""}`}
              style={{ left: pos.x, top: pos.y }}
              onClick={() => onSelect(agent.name)}
              title={agent.name}
            >
              <Bot size={17} />
              <span>
                {agent.name
                  .replace("Customer Support · ", "")
                  .replace(" Agent", "")}
                <small>
                  {agent.executions} executions · {ms(agent.avg_ms)}
                </small>
              </span>
              <i
                className={`agent-health ${agent.failures ? "has-errors" : ""}`}
              />
            </button>
          );
        })}
      </div>
      <p className="graph-caption">
        {data.edges.length
          ? `${data.edges.length} observed directed relationships. Hover an edge for its execution count. Scroll to explore larger graphs.`
          : "No parent-child relationships captured. Nodes represent observed agents."}
      </p>
    </div>
  );
}
