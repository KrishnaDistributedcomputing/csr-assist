export interface DocumentRecord {
  id: number;
  relative_path: string;
  name: string;
  extension: string;
  size_bytes: number;
  status: "pending" | "processing" | "ready" | "error" | "unsupported";
  error?: string;
  chunk_count: number;
  key_fact_count: number;
  indexed_at?: string;
}

export interface OnlineDocumentRecord {
  document_id: number;
  name: string;
  relative_path: string;
  source_url?: string;
}

export interface Source {
  document_id: number;
  chunk_id: number;
  name: string;
  relative_path: string;
  location: string;
  text: string;
  extraction: "native" | "ocr" | "structured";
  channel?: "offline" | "online";
  source_url?: string;
}

export interface SearchResponse {
  query: string;
  source: "offline" | "online";
  results: Source[];
}

export interface ModelRecord {
  id: string;
  provider:
    | "Microsoft"
    | "Meta"
    | "Alibaba"
    | "Google"
    | "Hugging Face"
    | "Azure AI Foundry";
  name: string;
  installed: boolean;
  available: boolean;
  active: boolean;
  input_cost_per_million: number | null;
  output_cost_per_million: number | null;
  pricing_note: string;
}

export interface AzureServiceRecord {
  name: string;
  resource: string;
  region: string;
  sku: string;
  billing_basis: string;
}

export interface ChatResponse {
  state: "answered" | "insufficient-evidence" | "model-missing";
  text: string;
  model: string;
  citations: Array<{
    number: number;
    document_id: number;
    chunk_id: number;
    name: string;
    location: string;
  }>;
  sources: Source[];
  cached: boolean;
  history_id: number;
  notice?: string;
}

export interface ScanStatus {
  id: string;
  state: "idle" | "running" | "completed" | "completed-errors";
  discovered: number;
  processed: number;
  unchanged: number;
  removed: number;
  errors: number;
}

export interface DeploymentInfo {
  read_only_demo: boolean;
  online_available: boolean;
  online_model: string;
  online_models: ModelRecord[];
  azure_region: string;
  azure_services: AzureServiceRecord[];
  token_pricing_as_of: string;
}

export interface HistoryEntry {
  id: number;
  kind: "search" | "chat";
  query: string;
  response_text?: string;
  response_state?: string;
  model?: string;
  sources: Source[];
  created_at: string;
}

export interface UsageDashboard {
  totals: {
    requests: number;
    cache_hits: number;
    cache_hit_rate: number;
    prompt_tokens: number;
    output_tokens: number;
    total_tokens: number;
    avg_latency_ms: number;
  };
  by_model: Array<{
    model: string;
    mode: string;
    requests: number;
    prompt_tokens: number;
    output_tokens: number;
    avg_latency_ms: number;
  }>;
  daily: Array<{
    date: string;
    requests: number;
    tokens: number;
    cache_hits: number;
  }>;
  key_facts: number;
  cached_answers: number;
  corpus_revision: number;
  feedback: {
    total: number;
    good: number;
    bad: number;
  };
}

export interface SecurityOverview {
  configured: boolean;
  state: "healthy" | "degraded" | "not-configured";
  workspace: {
    name: string;
    resource_group: string;
    region: string;
  };
  lookback_hours: number;
  summary: {
    open_incidents: number;
    high_severity_incidents: number;
    active_analytic_rules: number;
    telemetry_events: number;
  };
  telemetry: {
    events: number;
    errors: number;
    warnings: number;
    rate_limits: number;
    identity_failures: number;
    console_events: number;
    system_events: number;
    unique_revisions: number;
    unique_replicas: number;
    failed_scale_events: number;
    error_rate_percent: number;
    last_event_at: string;
  };
  telemetry_trend: Array<{
    time: string;
    events: number;
    errors: number;
  }>;
  top_signals: Array<{
    signal: string;
    count: number;
  }>;
  incident_metrics: {
    total: number;
    unassigned: number;
    by_severity: Record<string, number>;
    by_status: Record<string, number>;
  };
  detection_metrics: {
    total: number;
    enabled: number;
    disabled: number;
    by_severity: Record<string, number>;
    tactics: string[];
  };
  incidents: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    created_at: string;
    updated_at: string;
    owner: string;
  }>;
  analytic_rules: Array<{
    id: string;
    name: string;
    severity: string;
    enabled: boolean;
    tactics: string[];
    query_frequency: string;
  }>;
  errors: string[];
  refreshed_at: string;
}
