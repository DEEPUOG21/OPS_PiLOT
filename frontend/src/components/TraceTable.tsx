import { Link } from "react-router-dom";
import { ChevronRight, GitBranch } from "lucide-react";
import type { Trace } from "../types";
import { date, money, ms, num } from "../utils/format";
import { Status, Empty, Badge } from "./ui";

export function TraceTable({
  traces,
  compact = false,
}: {
  traces: Trace[];
  compact?: boolean;
}) {
  if (!traces.length) return <Empty />;
  return (
    <div className="table-wrap">
      <table className="trace-table">
        <thead>
          <tr>
            <th>Execution</th>
            <th>Status</th>
            <th>Model</th>
            <th>Latency</th>
            <th>Tokens</th>
            <th>Est. cost</th>
            {!compact && <th>Started</th>}
            <th>
              <span className="sr-only">Open trace</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {traces.map((t) => (
            <tr key={t.id}>
              <td>
                <Link className="trace-name" to={`/traces/${t.id}`}>
                  <span className="table-icon">
                    <GitBranch size={15} />
                  </span>
                  <span>
                    <strong>{t.name.replace(" · Supervisor Agent", "")}</strong>
                    <small className="mono">
                      {t.id.slice(0, 16)}{" "}
                      <Badge tone={t.mode === "mock" ? "amber" : "neutral"}>
                        {t.mode}
                      </Badge>
                    </small>
                  </span>
                </Link>
              </td>
              <td>
                <Status status={t.status} />
              </td>
              <td>
                <span className="model-name">
                  {t.models.join(", ") || "Not captured"}
                </span>
              </td>
              <td className="mono">{ms(t.duration_ms)}</td>
              <td className="mono">{num(t.total_tokens)}</td>
              <td className="mono">{money(t.estimated_cost)}</td>
              {!compact && (
                <td className="muted nowrap">{date(t.timestamp)}</td>
              )}
              <td>
                <Link
                  aria-label={`Inspect trace ${t.id}`}
                  to={`/traces/${t.id}`}
                  className="row-arrow"
                >
                  <ChevronRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
