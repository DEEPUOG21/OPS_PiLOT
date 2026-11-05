import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { WorkspaceProvider } from "../hooks/workspace";
import { TracesPage } from "../pages/Traces";
import { TraceDetailPage } from "../pages/TraceDetail";
import { InsightsPage } from "../pages/Insights";
import { PromptsPage } from "../pages/Prompts";
import { RunWorkflow } from "../components/RunWorkflow";
import { SettingsPage } from "../pages/Settings";
import { AgentGraph } from "../components/AgentGraph";

const trace = {
  id: "a".repeat(32),
  name: "Customer Support",
  mode: "mock",
  source: "demo",
  status: "ok",
  project_id: "support",
  timestamp: "2026-11-05T12:00:00Z",
  duration_ms: 200,
  total_tokens: 100,
  estimated_cost: 0.0001,
  provider_cost: null,
  models: ["mock-support-v1"],
  span_count: 2,
  priced_spans: 1,
  usage_spans: 1,
};
const settings = {
  provider_configured: false,
  provider_model: "mock-support-v1",
  pricing: [],
  projects: [],
  ingestion_path: "/api/otlp/v1/traces",
  auth_enabled: false,
};
function mockApi(routes: Record<string, unknown>) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = String(input),
        path = url.split("?")[0];
      const data =
        routes[`${init?.method || "GET"} ${path}`] ?? routes[path] ?? {};
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
}
function mount(element: React.ReactNode, path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WorkspaceProvider>{element}</WorkspaceProvider>
    </MemoryRouter>,
  );
}

describe("dashboard interactions", () => {
  it("shows captured agent edges including cycles and selects a node", () => {
    const onSelect = vi.fn();
    const agent = (name: string) => ({
      name,
      executions: 2,
      failures: 0,
      success_rate: 1,
      avg_ms: 10,
      input_tokens: null,
      output_tokens: null,
      estimated_cost: null,
    });
    render(
      <AgentGraph
        data={{
          agents: [agent("Root"), agent("Middle"), agent("Leaf")],
          edges: [
            { parent: "Root", child: "Middle", count: 2 },
            { parent: "Middle", child: "Leaf", count: 2 },
            { parent: "Leaf", child: "Middle", count: 1 },
          ],
          workflow_completion_rate: 1,
        }}
        selected=""
        onSelect={onSelect}
      />,
    );
    expect(
      screen.getByText("Root → Middle: 2 observed relationships"),
    ).toBeTruthy();
    expect(
      screen.getByText("Leaf → Middle: 1 observed relationships"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Leaf/ }));
    expect(onSelect).toHaveBeenCalledWith("Leaf");
  });
  it("sends trace search and status filters to the API", async () => {
    const fetch = mockApi({
      "/api/traces": { items: [trace], total: 1 },
      "/api/settings": settings,
    });
    mount(<TracesPage />);
    await screen.findByText("Customer Support");
    fireEvent.change(screen.getByLabelText("Search traces"), {
      target: { value: "aaaa" },
    });
    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "error" },
    });
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url]) =>
            String(url).includes("search=aaaa") &&
            String(url).includes("status=error"),
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByText("Filters"));
    expect(screen.getByText("Execution type")).toBeTruthy();
  });
  it("selects spans, exposes exception events, and collapses the tree", async () => {
    const root = {
      id: "root",
      parent_id: null,
      name: "Supervisor",
      kind: "agent",
      status: "ok",
      status_message: "",
      model: null,
      offset_ms: 0,
      duration_ms: 200,
      input_tokens: null,
      output_tokens: null,
      estimated_cost: null,
      provider_cost: null,
      attributes: {},
      events: [],
    };
    const child = {
      ...root,
      id: "child",
      parent_id: "root",
      name: "Model call",
      kind: "llm",
      duration_ms: 100,
      events: [{ name: "exception", message: "test failure" }],
      attributes: { "gen_ai.output.messages": "Captured answer" },
    };
    mockApi({
      [`/api/traces/${trace.id}`]: {
        ...trace,
        spans: [root, child],
        evaluations: [],
      },
    });
    mount(
      <Routes>
        <Route path="/traces/:id" element={<TraceDetailPage />} />
      </Routes>,
      `/traces/${trace.id}`,
    );
    await screen.findByText("Execution waterfall");
    fireEvent.click(screen.getByRole("button", { name: "Input / output" }));
    expect(screen.getByText("Captured answer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Events" }));
    expect(screen.getByText(/test failure/)).toBeTruthy();
    fireEvent.click(
      screen
        .getAllByLabelText("Collapse span")
        .find((b) => !(b as HTMLButtonElement).disabled)!,
    );
    expect(
      screen.queryByRole("button", { name: "Inspect Model call" }),
    ).toBeNull();
  });
  it("persists an insight status change", async () => {
    const insight = {
      id: 1,
      title: "Repeated tool calls",
      severity: "medium",
      category: "reliability",
      status: "open",
      trace_id: trace.id,
      evidence: { calls: 3 },
      explanation: "Three identical inputs",
      action: "Review stopping conditions",
    };
    const fetch = mockApi({ "/api/insights": { items: [insight] } });
    mount(<InsightsPage />);
    await screen.findByText("Repeated tool calls");
    fireEvent.change(screen.getByLabelText("Status for Repeated tool calls"), {
      target: { value: "resolved" },
    });
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url, init]) =>
            String(url).includes("/insights/1/resolve") &&
            init?.body === JSON.stringify({ status: "resolved" }),
        ),
      ).toBe(true),
    );
  });
  it("runs a paired prompt experiment with selected version IDs", async () => {
    const fetch = mockApi({
      "/api/prompts": {
        items: [
          {
            id: 1,
            name: "Support",
            description: "Grounding",
            versions: [
              {
                id: 11,
                version: 1,
                content: "Original prompt",
                retrieval_k: 5,
                created_at: trace.timestamp,
              },
              {
                id: 12,
                version: 2,
                content: "Optimized prompt",
                retrieval_k: 2,
                created_at: trace.timestamp,
              },
            ],
          },
        ],
      },
      "/api/prompts/diff/1/2": {
        diff: "",
        retrieval_k: { before: 5, after: 2 },
      },
      "/api/prompts/diff/11/12": {
        diff: "-Original\n+Optimized",
        retrieval_k: { before: 5, after: 2 },
      },
      "/api/datasets": { items: [{ id: 1, name: "References", records: [] }] },
      "/api/experiments": { items: [] },
      "/api/settings": settings,
      "POST /api/experiments/run": { source: "demo" },
    });
    mount(<PromptsPage />);
    await screen.findByText("Compare prompt versions");
    fireEvent.click(screen.getByRole("button", { name: "Run experiment" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url, init]) =>
            url === "/api/experiments/run" &&
            JSON.parse(String(init?.body)).version_ids.join(",") === "11,12",
        ),
      ).toBe(true),
    );
  });
  it("runs a mock scenario and navigates to its stored trace", async () => {
    const fetch = mockApi({
      "/api/settings": settings,
      "POST /api/demo/run": { trace_id: trace.id, source: "demo", error: null },
    });
    mount(
      <Routes>
        <Route path="/" element={<RunWorkflow />} />
        <Route path="/traces/:id" element={<p>Stored trace detail</p>} />
      </Routes>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run workflow" }));
    fireEvent.change(screen.getByLabelText("Scenario"), {
      target: { value: "failed_tool" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run and open trace" }));
    await screen.findByText("Stored trace detail");
    expect(
      fetch.mock.calls.some(
        ([url, init]) =>
          url === "/api/demo/run" &&
          JSON.parse(String(init?.body)).scenario === "failed_tool",
      ),
    ).toBe(true);
  });
  it("saves validated model pricing through the settings API", async () => {
    const fetch = mockApi({ "/api/settings": settings });
    mount(<SettingsPage />);
    await screen.findByText("Model pricing");
    fireEvent.change(screen.getByLabelText("Model identifier"), {
      target: { value: "custom-model" },
    });
    fireEvent.change(screen.getByLabelText("Input / 1M"), {
      target: { value: "0.3" },
    });
    fireEvent.change(screen.getByLabelText("Output / 1M"), {
      target: { value: "1.2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save rate" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url, init]) =>
            url === "/api/settings/pricing" &&
            JSON.parse(String(init?.body)).input_per_million === 0.3,
        ),
      ).toBe(true),
    );
  });
});
