import { useState } from "react";
import {
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PageTitle, Panel, LoadState } from "../components/ui";
import { TraceTable } from "../components/TraceTable";
import { useData } from "../hooks/workspace";
import type { Trace, Settings } from "../types";

export function TracesPage() {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [model, setModel] = useState(""),
    [kind, setKind] = useState(""),
    [since, setSince] = useState(""),
    [until, setUntil] = useState(""),
    [project, setProject] = useState(""),
    [page, setPage] = useState(1),
    [filters, setFilters] = useState(false);
  const params = new URLSearchParams({
    search,
    status,
    model,
    execution_type: kind,
    project_id: project,
    page: String(page),
    page_size: "15",
  });
  if (since) params.set("since", new Date(since).toISOString());
  if (until) params.set("until", new Date(until + "T23:59:59").toISOString());
  const { data, error, loading } = useData<{ items: Trace[]; total: number }>(
      `/traces?${params}`,
    ),
    { data: settings } = useData<Settings>("/settings");
  const reset = () => setPage(1);
  return (
    <>
      <PageTitle
        title="Trace explorer"
        description="One execution, every detail. Follow agents, models, and tools from start to finish."
      />
      <Panel
        title="Executions"
        subtitle="Search and inspect stored application traces"
        action={
          <button
            className={`button ${filters ? "selected" : ""}`}
            onClick={() => setFilters(!filters)}
          >
            <SlidersHorizontal size={14} />
            Filters
          </button>
        }
      >
        <div className="filter-row">
          <div className="search-input">
            <Search size={16} />
            <input
              aria-label="Search traces"
              placeholder="Search trace ID or execution name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                reset();
              }}
            />
          </div>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              reset();
            }}
          >
            <option value="">All statuses</option>
            <option value="ok">Success</option>
            <option value="error">Error</option>
            <option value="timeout">Timeout</option>
          </select>
        </div>
        {filters && (
          <div className="advanced-filters">
            <label>
              Model
              <input
                placeholder="Exact model name"
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  reset();
                }}
              />
            </label>
            <label>
              Execution type
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  reset();
                }}
              >
                <option value="">All types</option>
                {["workflow", "agent", "llm", "tool", "retrieval", "span"].map(
                  (k) => (
                    <option key={k}>{k}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              Project
              <select
                value={project}
                onChange={(e) => {
                  setProject(e.target.value);
                  reset();
                }}
              >
                <option value="">All projects</option>
                {settings?.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              From
              <input
                type="date"
                value={since}
                onChange={(e) => {
                  setSince(e.target.value);
                  reset();
                }}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={until}
                onChange={(e) => {
                  setUntil(e.target.value);
                  reset();
                }}
              />
            </label>
          </div>
        )}
        <LoadState loading={loading} error={error}>
          <TraceTable traces={data?.items || []} />
        </LoadState>
        <div className="pagination">
          <span>
            {data?.total || 0} executions · Page {page}
          </span>
          <div>
            <button
              className="button small"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={14} />
              Previous
            </button>
            <button
              className="button small"
              disabled={!data || page * 15 >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </Panel>
    </>
  );
}
