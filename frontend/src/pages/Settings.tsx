import { useState } from "react";
import { Copy, Plus, KeyRound, ShieldCheck, Terminal } from "lucide-react";
import { useData, useWorkspace } from "../hooks/workspace";
import { post } from "../services/api";
import type { Settings } from "../types";
import { PageTitle, Panel, LoadState, Badge } from "../components/ui";
import { date } from "../utils/format";

const snippet = `from opspilot_sdk import OpsPilot\n\nsdk = OpsPilot(project="my-ai-app")\nwith sdk.span("Support agent", kind="agent"):\n    with sdk.span("Model call", kind="llm", **{\n        "gen_ai.request.model": "your-model",\n        "gen_ai.usage.input_tokens": 120,\n        "gen_ai.usage.output_tokens": 40,\n    }):\n        pass  # Replace with your application call\nsdk.close()`;
export function SettingsPage() {
  const { data, error, loading } = useData<Settings>("/settings"),
    { refresh, notify } = useWorkspace(),
    [model, setModel] = useState(""),
    [input, setInput] = useState(""),
    [output, setOutput] = useState(""),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState("");
  async function save() {
    setBusy(true);
    try {
      await post("/settings/pricing", {
        model_id: model,
        input_per_million: Number(input),
        output_per_million: Number(output),
      });
      setModel("");
      setInput("");
      setOutput("");
      refresh();
      notify(
        "Pricing saved. New spans will use these rates; existing estimates retain their pricing snapshot.",
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      notify("Instrumentation example copied");
    } catch {
      notify("Clipboard unavailable. Select the example to copy it.");
    }
  }
  return (
    <>
      <PageTitle
        title="Make it your workspace."
        description="Connect your application, configure pricing, and understand data provenance."
      />
      <Panel
        title="Workspace access"
        subtitle="Use an OpsPilot ingestion key only when server authentication is enabled"
        action={<KeyRound size={18} className="muted" />}
      >
        <form
          className="access-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (key) sessionStorage.setItem("opspilot-access-key", key);
            else sessionStorage.removeItem("opspilot-access-key");
            refresh();
            notify(
              key
                ? "Workspace access key set for this browser session."
                : "Workspace access key cleared.",
            );
          }}
        >
          <label>
            OpsPilot API access key
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter the server’s OPSPILOT_API_KEY"
            />
          </label>
          <button className="button" type="submit">
            Apply session key
          </button>
        </form>
        <p className="muted panel-padding text-small">
          Provider keys belong in the server environment. The workspace key is
          stored only in session storage.
        </p>
      </Panel>
      <LoadState loading={loading} error={error}>
        {data && (
          <>
            <div className="chart-grid">
              <Panel
                title="Model provider"
                subtitle="Server-side configuration"
                action={<ShieldCheck size={18} className="green" />}
              >
                <dl className="detail-list panel-padding">
                  <div>
                    <dt>Provider</dt>
                    <dd>OpenAI-compatible API</dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>{data.provider_model}</dd>
                  </div>
                  <div>
                    <dt>API key</dt>
                    <dd>
                      <Badge
                        tone={data.provider_configured ? "green" : "amber"}
                      >
                        {data.provider_configured
                          ? "Configured"
                          : "Not configured"}
                      </Badge>
                    </dd>
                  </div>
                  <div>
                    <dt>Workspace auth</dt>
                    <dd>
                      {data.auth_enabled ? "Enabled" : "Disabled · local use"}
                    </dd>
                  </div>
                </dl>
                <p className="panel-padding muted text-small">
                  Set OPENAI_API_KEY, OPENAI_MODEL, and optionally
                  OPENAI_BASE_URL in .env, then restart the backend. Provider
                  credentials are never returned by this API.
                </p>
              </Panel>
              <Panel
                title="About demo data"
                subtitle="Clear boundaries for an honest demo"
              >
                <div className="panel-padding prose">
                  <p>
                    Demo traces come from executed LangGraph workflows with
                    deterministic mock responses. Runtime is measured. Fault
                    scenarios inject real delays and exceptions.
                  </p>
                  <p>
                    Mock token units use a regex tokenizer and mock pricing is
                    illustrative. They are not provider usage or charges.
                    Heuristic scores are lexical review signals.
                  </p>
                  <p>
                    Provider and externally collected executions appear under{" "}
                    <strong>Collected data</strong>. Missing usage, prices, or
                    references appear as N/A.
                  </p>
                </div>
              </Panel>
            </div>
            <Panel
              title="Connect an application"
              subtitle="OpenTelemetry-native ingestion · OTLP HTTP JSON or protobuf"
              action={
                <button className="button small" onClick={copy}>
                  <Copy size={13} />
                  Copy example
                </button>
              }
            >
              <div className="instrumentation">
                <div>
                  <div className="endpoint">
                    <Badge tone="green">POST</Badge>
                    <code>http://localhost:8001{data.ingestion_path}</code>
                  </div>
                  <p className="muted">
                    Install the reusable SDK from the repository, then
                    instrument your model, agent, retrieval, and tool
                    operations.
                  </p>
                  <pre className="install-command">
                    <Terminal size={14} />
                    pip install ./instrumentation
                  </pre>
                  <p className="muted text-small">
                    Capture only data you intend to store. Prompts and outputs
                    may contain sensitive information. The example numbers
                    should be replaced with usage from your provider response.
                  </p>
                </div>
                <pre>{snippet}</pre>
              </div>
            </Panel>
            <Panel
              title="Model pricing"
              subtitle="USD per 1 million token units · new rates apply to future spans"
            >
              <form
                className="pricing-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <label>
                  Model identifier
                  <input
                    required
                    maxLength={120}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="gpt-4o-mini"
                  />
                </label>
                <label>
                  Input / 1M
                  <input
                    required
                    type="number"
                    min="0"
                    max="100000"
                    step="any"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <label>
                  Output / 1M
                  <input
                    required
                    type="number"
                    min="0"
                    max="100000"
                    step="any"
                    value={output}
                    onChange={(e) => setOutput(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <button className="button" disabled={busy}>
                  <Plus size={14} />
                  Save rate
                </button>
              </form>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Input / 1M</th>
                      <th>Output / 1M</th>
                      <th>Effective from</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pricing.map((p) => (
                      <tr key={p.id}>
                        <td className="mono">{p.model_id}</td>
                        <td>${p.input_per_million}</td>
                        <td>${p.output_per_million}</td>
                        <td>{date(p.effective_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </LoadState>
    </>
  );
}
