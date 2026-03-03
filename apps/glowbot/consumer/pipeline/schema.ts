export const GLOWBOT_LEDGER_TABLES = {
  metricsDaily: "metrics_daily",
  funnelSnapshots: "funnel_snapshots",
  peerBenchmarks: "peer_benchmarks",
  recommendations: "recommendations",
  pipelineRuns: "pipeline_runs",
  pipelineSchedulerState: "pipeline_scheduler_state",
  modelingSeries: "modeling_series",
  adapterCredentials: "adapter_credentials",
} as const;

export const GLOWBOT_LEDGER_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS metrics_daily (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  metadata_key TEXT DEFAULT '',
  metadata TEXT,
  synced_at INTEGER NOT NULL,
  UNIQUE(date, adapter_id, metric_name, metadata_key)
);

CREATE INDEX IF NOT EXISTS idx_metrics_date ON metrics_daily(date);
CREATE INDEX IF NOT EXISTS idx_metrics_adapter ON metrics_daily(adapter_id, date);
CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics_daily(metric_name, date);

CREATE TABLE IF NOT EXISTS funnel_snapshots (
  id TEXT PRIMARY KEY,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  step_name TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  step_value REAL NOT NULL,
  prev_step_value REAL,
  conversion_rate REAL,
  peer_median REAL,
  delta_vs_peer REAL,
  source_breakdown TEXT,
  computed_at INTEGER NOT NULL,
  UNIQUE(period_start, period_end, step_name)
);

CREATE TABLE IF NOT EXISTS peer_benchmarks (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL,
  clinic_profile TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  peer_median REAL NOT NULL,
  peer_p25 REAL,
  peer_p75 REAL,
  sample_size INTEGER,
  source TEXT NOT NULL DEFAULT 'peer_network',
  received_at INTEGER NOT NULL,
  UNIQUE(period, clinic_profile, metric_name)
);

CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  title TEXT NOT NULL,
  delta_value REAL,
  delta_unit TEXT,
  description TEXT NOT NULL,
  confidence TEXT NOT NULL,
  category TEXT NOT NULL,
  reasoning TEXT,
  action_data TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  phase1_started_at INTEGER,
  phase1_completed_at INTEGER,
  phase2_started_at INTEGER,
  phase2_completed_at INTEGER,
  metrics_computed INTEGER,
  recommendations_generated INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pipeline_scheduler_state (
  id TEXT PRIMARY KEY,
  next_run_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS modeling_series (
  id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  period_label TEXT NOT NULL,
  period_start TEXT NOT NULL,
  your_value REAL NOT NULL,
  peer_median REAL,
  peer_band_low REAL,
  peer_band_high REAL,
  computed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS adapter_credentials (
  id TEXT PRIMARY KEY,
  adapter_id TEXT NOT NULL,
  auth_method TEXT NOT NULL,
  status TEXT NOT NULL,
  credentials_encrypted TEXT,
  metadata TEXT,
  last_validated_at INTEGER,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`.trim();
