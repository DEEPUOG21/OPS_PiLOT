import { useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import {
  Activity,
  LayoutDashboard,
  GitBranch,
  Gauge,
  Coins,
  ClipboardCheck,
  FlaskConical,
  Workflow,
  Lightbulb,
  Settings,
  ChevronsUpDown,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  Menu,
  X,
  Terminal,
  Command,
  ArrowUpRight,
} from "lucide-react";
import { useWorkspace } from "../hooks/workspace";
import { useData } from "../hooks/workspace";
import type { Settings as WorkspaceSettings } from "../types";
import { RunWorkflow } from "../components/RunWorkflow";

const nav = [
  ["/", "Overview", LayoutDashboard],
  ["/traces", "Trace explorer", GitBranch],
  ["/performance", "Performance", Gauge],
  ["/costs", "Cost intelligence", Coins],
  ["/evaluations", "Evaluations", ClipboardCheck],
  ["/prompts", "Prompts & experiments", FlaskConical],
  ["/agents", "Agent intelligence", Workflow],
  ["/insights", "Optimization insights", Lightbulb],
] as const;
export function Shell() {
  const { data: workspaceSettings } = useData<WorkspaceSettings>("/settings");
  const { source, setSource, refresh } = useWorkspace(),
    [mobile, setMobile] = useState(false),
    location = useLocation();
  const current =
    nav.find(([url]) =>
      url === "/"
        ? location.pathname === "/"
        : location.pathname.startsWith(url),
    )?.[1] || "Settings";
  return (
    <div className="app">
      <aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Activity size={22} />
          </span>
          OpsPilot<span className="brand-tag">BETA</span>
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X />
        </button>
        <div className="workspace-switch">
          <span className="workspace-avatar">S</span>
          <div>
            <strong>Support workspace</strong>
            <small>Local development</small>
          </div>
          <ChevronsUpDown size={14} />
        </div>
        <div className="nav-section">OBSERVABILITY</div>
        <nav>
          {nav.slice(0, 4).map(([url, name, Icon]) => (
            <NavLink
              end={url === "/"}
              to={url}
              key={url}
              onClick={() => setMobile(false)}
            >
              <Icon size={17} />
              {name}
              {url === "/traces" && <span className="nav-key">T</span>}
            </NavLink>
          ))}
          <div className="nav-section">INTELLIGENCE</div>
          {nav.slice(4).map(([url, name, Icon]) => (
            <NavLink to={url} key={url} onClick={() => setMobile(false)}>
              <Icon size={17} />
              {name}
              {url === "/insights" && <span className="nav-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sdk-card">
            <span>
              <Terminal size={15} />
              Built for your stack
            </span>
            <p>
              Bring your own application.
              <br />
              Follow every execution.
            </p>
            <Link to="/settings">
              Connect with OpenTelemetry <ArrowUpRight size={14} />
            </Link>
          </div>
          <NavLink to="/settings">
            <Settings size={17} />
            Settings
          </NavLink>
          <a href="/docs" target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            API documentation
          </a>
          <div className="sidebar-footer">
            <span className="connection-dot" />
            SQLite workspace<span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={19} />
            </button>
            <Command size={16} />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{current}</strong>
          </div>
          <div className="topbar-right">
            <span className="environment">
              <span className="connection-dot" />
              {workspaceSettings?.showcase_mode ? "Public demo" : "Development"}
            </span>
            <span className="avatar">SP</span>
          </div>
        </header>
        <main>
          <div
            className={`source-banner ${source === "collected" ? "source-collected" : ""}`}
          >
            <div>
              <span className="banner-dot" />
              <strong>
                {source === "demo" ? "Demo workspace" : "Collected telemetry"}
              </strong>
              <span>
                {source === "demo"
                  ? workspaceSettings?.showcase_mode
                    ? "Interactive mock demo. Changes reset when the service restarts."
                    : "Real workflow timings. Mock responses and simulated usage."
                  : "Your instrumented executions. Missing metrics stay unavailable."}
              </span>
            </div>
            <Link to="/settings">
              {source === "demo" ? "About this data" : "Instrumentation setup"}{" "}
              <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="workspace-toolbar">
            <span className="live-label">
              <span className="connection-dot" /> Stored execution data
            </span>
            <div>
              <select
                aria-label="Data source"
                value={source}
                onChange={(e) =>
                  setSource(e.target.value as "demo" | "collected")
                }
              >
                <option value="demo">Demo data</option>
                <option value="collected">Collected data</option>
              </select>
              <button
                className="icon-button"
                title="Refresh data"
                aria-label="Refresh data"
                onClick={refresh}
              >
                <RefreshCw size={15} />
              </button>
              <RunWorkflow />
            </div>
          </div>
          <Outlet />
        </main>
        <footer className="main-footer">
          <span>
            <Activity size={12} /> OpsPilot · Understand every execution.
          </span>
          <span>
            OpenTelemetry native <i /> Local workspace
          </span>
        </footer>
      </div>
    </div>
  );
}
