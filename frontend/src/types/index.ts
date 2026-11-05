export type Source = "demo" | "collected";
export interface Trace {
  id: string;
  name: string;
  project_id: string;
  source: Source;
  mode: string;
  status: string;
  execution_type: string;
  timestamp: string;
  duration_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost: number | null;
  provider_cost: number | null;
  models: string[];
  span_count: number;
  priced_spans: number;
  usage_spans: number;
}
export interface Span {
  id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  status: string;
  status_message: string;
  model: string | null;
  offset_ms: number;
  duration_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost: number | null;
  provider_cost: number | null;
  attributes: Record<string, unknown>;
  events: unknown[];
}
export interface Evaluation {
  id: number;
  trace_id: string;
  method: string;
  scores: Record<string, number | null>;
  explanations: Record<string, string>;
  criteria: string;
  created_at: string;
}
export interface TraceDetail extends Trace {
  spans: Span[];
  evaluations: Evaluation[];
}
export interface Insight {
  id: number;
  trace_id: string;
  rule: string;
  agent: string | null;
  title: string;
  severity: string;
  category: string;
  evidence: Record<string, unknown>;
  explanation: string;
  action: string;
  status: string;
  created_at: string;
}
export interface Trend {
  date: string;
  traces: number;
  latency_ms: number;
  tokens: number | null;
  estimated_cost: number | null;
  errors: number;
}
export interface Overview {
  source: Source;
  total_traces: number;
  successful: number;
  failed: number;
  avg_latency_ms: number | null;
  total_tokens: number | null;
  estimated_cost: number | null;
  provider_cost: number | null;
  cost_coverage: { priced_spans: number; usage_spans: number };
  quality_by_method: Record<string, number>;
  evaluated_traces: number;
  trend: Trend[];
  recent_traces: Trace[];
}
export interface Performance {
  sample_count: number;
  p50_ms: number | null;
  p95_ms: number | null;
  p99_ms: number | null;
  error_rate: number | null;
  timeout_rate: number | null;
  breakdown: {
    kind: string;
    name: string;
    count: number;
    avg_ms: number;
    max_ms: number;
  }[];
  distribution: { bucket: string; count: number }[];
  slowest: Trace[];
}
export interface CostGroup {
  name: string;
  calls: number;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost: number | null;
  provider_cost: number | null;
  priced_calls: number;
}
export interface Costs {
  by_model: CostGroup[];
  by_agent: CostGroup[];
  prompts: CostGroup[];
  expensive: Trace[];
}
export interface Agent {
  name: string;
  executions: number;
  failures: number;
  success_rate: number;
  avg_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost: number | null;
}
export interface Agents {
  agents: Agent[];
  edges: { parent: string; child: string; count: number }[];
  workflow_completion_rate: number | null;
}
export interface PromptVersion {
  id: number;
  prompt_id: number;
  version: number;
  content: string;
  retrieval_k: number;
  created_at: string;
}
export interface Prompt {
  id: number;
  name: string;
  description: string;
  versions: PromptVersion[];
}
export interface Dataset {
  id: number;
  name: string;
  records: { id: number; question: string; reference: string }[];
}
export interface Experiment {
  id: number;
  name: string;
  source: Source;
  status: string;
  paired: boolean;
  evaluation_method: string;
  created_at: string;
  versions: {
    version_id: number;
    version: number;
    runs: number;
    successful: number;
    latency_ms: number | null;
    tokens: number | null;
    estimated_cost: number | null;
    answer_relevance: number | null;
    faithfulness: number | null;
    context_relevance: number | null;
    correctness: number | null;
    traces: string[];
    evaluation_ids: (number | null)[];
  }[];
}
export interface Settings {
  showcase_mode?: boolean;
  provider_configured: boolean;
  provider_model: string;
  auth_enabled: boolean;
  pricing: {
    id: number;
    model_id: string;
    input_per_million: number;
    output_per_million: number;
    effective_at: string;
  }[];
  projects: { id: string; name: string }[];
  ingestion_path: string;
}
