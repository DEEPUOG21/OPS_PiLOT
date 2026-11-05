import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WorkspaceProvider } from "./hooks/workspace";
import { Shell } from "./layouts/Shell";
import { OverviewPage } from "./pages/Overview";
import { TracesPage } from "./pages/Traces";
import { TraceDetailPage } from "./pages/TraceDetail";
import { PerformancePage } from "./pages/Performance";
import { CostsPage } from "./pages/Costs";
import { EvaluationsPage } from "./pages/Evaluations";
import { PromptsPage } from "./pages/Prompts";
import { AgentsPage } from "./pages/Agents";
import { InsightsPage } from "./pages/Insights";
import { SettingsPage } from "./pages/Settings";
import { Empty } from "./components/ui";
import "./styles.css";
import { ErrorBoundary } from "./components/ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <WorkspaceProvider>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<OverviewPage />} />
              <Route path="traces" element={<TracesPage />} />
              <Route path="traces/:id" element={<TraceDetailPage />} />
              <Route path="performance" element={<PerformancePage />} />
              <Route path="costs" element={<CostsPage />} />
              <Route path="evaluations" element={<EvaluationsPage />} />
              <Route path="prompts" element={<PromptsPage />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="insights" element={<InsightsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Empty title="Page not found" />} />
            </Route>
          </Routes>
        </WorkspaceProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
