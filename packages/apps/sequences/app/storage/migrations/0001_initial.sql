-- sequences 0001_initial. Applied once by the Nex app-store migrator
-- (scripts/postgres-app-store-migrate.ts) as sequences_owner, inside one transaction, with
-- search_path pinned to the sequences schema, so names are unqualified. The migrator records the
-- file's SHA-256 in sequences.schema_migrations: never edit this file after it is applied; add 0002.
-- Grants to sequences_app mirror the permission-contract capability for this store.
--
-- These are business plan and send-decision records, not a queue, attempt ledger or effect
-- ledger: every queue entry, attempt, retry and provider authorization is a Nex Job, Run or
-- Effect. Addresses are never stored: people are entry ids and sha256 hashes only (HR-21).
-- No column is named kind (NX-P17).

CREATE TABLE health (
  id TEXT PRIMARY KEY CHECK (id = 'singleton'),
  last_tick_at TIMESTAMPTZ,
  last_tick_run_id TEXT,
  ticks BIGINT NOT NULL DEFAULT 0,
  last_probe_slot TEXT,
  last_probe_run_id TEXT,
  last_notify_at TIMESTAMPTZ,
  last_ops_reach_at TIMESTAMPTZ,
  last_ops_reach_ok BOOLEAN,
  last_drand_reach_at TIMESTAMPTZ,
  last_drand_reach_ok BOOLEAN,
  alert_delivery TEXT NOT NULL DEFAULT 'deadman' CHECK (alert_delivery IN ('deadman', 'smtp'))
);

INSERT INTO health (id) VALUES ('singleton');

-- The six fixed job definitions as the hooks last ensured them: the tick reads ids from here
-- (it holds no jobs.list), and an old-revision delayed Run is found by comparing revision ids.
CREATE TABLE runtime_jobs (
  name TEXT PRIMARY KEY CHECK (name LIKE 'sequences.%'),
  job_id TEXT NOT NULL,
  revision_id TEXT,
  status TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE definitions (
  name TEXT NOT NULL,
  revision INT NOT NULL CHECK (revision >= 1),
  definition_sha256 TEXT NOT NULL UNIQUE CHECK (definition_sha256 ~ '^[0-9a-f]{64}$'),
  body JSONB NOT NULL,
  yaml_sha256 TEXT NOT NULL CHECK (yaml_sha256 ~ '^[0-9a-f]{64}$'),
  source_commit TEXT NOT NULL,
  approved_copy JSONB NOT NULL DEFAULT '[]',
  registered_by TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (name, revision)
);

CREATE TABLE series (
  id TEXT PRIMARY KEY,
  definition_name TEXT NOT NULL,
  definition_revision INT NOT NULL,
  series_file_sha256 TEXT NOT NULL,
  body JSONB NOT NULL,
  plan JSONB NOT NULL,
  plan_sha256 TEXT NOT NULL CHECK (plan_sha256 ~ '^[0-9a-f]{64}$'),
  state TEXT NOT NULL CHECK (state IN ('draft', 'awaiting_ok', 'observing', 'active', 'paused', 'done')),
  send_switch BOOLEAN NOT NULL DEFAULT false,
  prize_scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (definition_name, definition_revision) REFERENCES definitions (name, revision)
);

CREATE TABLE instances (
  series_id TEXT NOT NULL REFERENCES series (id),
  id TEXT NOT NULL,
  params JSONB NOT NULL,
  PRIMARY KEY (series_id, id)
);

CREATE TABLE step_instances (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  series_id TEXT NOT NULL REFERENCES series (id),
  instance_id TEXT NOT NULL,
  parent_id TEXT REFERENCES step_instances (id),
  item_key TEXT,
  step_id TEXT NOT NULL,
  step_do TEXT NOT NULL,
  owner TEXT NOT NULL CHECK (owner IN ('engine', 'review_sender', 'mac', 'task')),
  mode TEXT NOT NULL CHECK (mode IN ('live', 'shadow', 'observe', 'adopted')),
  state TEXT NOT NULL CHECK (state IN ('planned', 'waiting', 'held', 'running', 'verifying', 'done', 'short', 'skipped', 'cancelled', 'adopted', 'observing')),
  waiting_because TEXT,
  hold_code TEXT,
  run_state TEXT NOT NULL DEFAULT 'none' CHECK (run_state IN ('none', 'accepting', 'accepted', 'claimed', 'finished')),
  due_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  not_before TIMESTAMPTZ,
  not_after TIMESTAMPTZ,
  window_from TIMESTAMPTZ,
  window_to TIMESTAMPTZ,
  copy_valid_from TIMESTAMPTZ,
  copy_valid_until TIMESTAMPTZ,
  depends_on TEXT[] NOT NULL DEFAULT '{}',
  nex_run_id TEXT,
  attempt_no INT NOT NULL DEFAULT 0,
  inputs_sha256 TEXT,
  plan_sha256 TEXT NOT NULL,
  expected JSONB,
  target JSONB,
  work JSONB NOT NULL DEFAULT '[]',
  result JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_id, item_key)
);
CREATE INDEX step_instances_series_idx ON step_instances (series_id, due_at);

-- One row per engine Run of one step phase (o1/o2 observe reads, s0/s1/c shadow Runs). run_key
-- is the Nex idempotency key: seq:<series>:<instance>:<step>:<phase>:a<n>.
CREATE TABLE step_runs (
  run_key TEXT PRIMARY KEY,
  step_instance_id TEXT NOT NULL REFERENCES step_instances (id),
  phase TEXT NOT NULL,
  attempt_no INT NOT NULL CHECK (attempt_no >= 1),
  job_name TEXT NOT NULL,
  available_at TIMESTAMPTZ,
  nex_run_id TEXT,
  job_revision_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('accepting', 'accepted', 'claimed', 'cancelled', 'finished')),
  accepting_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  detail JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX step_runs_step_idx ON step_runs (step_instance_id, phase);

CREATE TABLE step_events (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  series_id TEXT,
  step_instance_id TEXT,
  actor TEXT NOT NULL,
  event TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX step_events_series_idx ON step_events (series_id, id);

-- Hashes and counts only, never addresses.
CREATE TABLE source_snapshots (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  params JSONB NOT NULL,
  as_of TIMESTAMPTZ NOT NULL,
  sha256 TEXT NOT NULL,
  local_sha256 TEXT NOT NULL,
  count INT NOT NULL,
  body JSONB,
  step_instance_id TEXT,
  phase TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fetched_by TEXT NOT NULL
);
CREATE INDEX source_snapshots_step_idx ON source_snapshots (step_instance_id, phase);

CREATE TABLE import_bundles (
  bundle_sha256 TEXT PRIMARY KEY CHECK (bundle_sha256 ~ '^[0-9a-f]{64}$'),
  contract TEXT NOT NULL,
  series_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('full', 'drawing')),
  files JSONB NOT NULL,
  team_hashes TEXT[] NOT NULL DEFAULT '{}',
  validation JSONB NOT NULL,
  result JSONB NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT NOT NULL
);

CREATE TABLE drawings (
  prize_scope TEXT NOT NULL,
  night DATE NOT NULL,
  drawing_no INT NOT NULL CHECK (drawing_no >= 1),
  mode TEXT NOT NULL CHECK (mode IN ('adopted', 'shadow', 'live')),
  series_id TEXT,
  step_instance_id TEXT,
  commit_body JSONB NOT NULL,
  entry_list_sha256 TEXT NOT NULL,
  entries INT NOT NULL,
  drand_chain TEXT,
  drand_round BIGINT,
  drand_randomness TEXT,
  beacon_check TEXT CHECK (beacon_check IN ('ok', 'mismatch', 'unknown')),
  winners TEXT[] NOT NULL DEFAULT '{}',
  alternates TEXT[] NOT NULL DEFAULT '{}',
  promoted JSONB NOT NULL DEFAULT '[]',
  free_hashes TEXT[] NOT NULL DEFAULT '{}',
  method TEXT,
  committed_at TIMESTAMPTZ,
  source_file_sha256 TEXT,
  replay JSONB,
  compare JSONB,
  PRIMARY KEY (prize_scope, night, drawing_no, mode)
);

CREATE TABLE drawing_entries (
  prize_scope TEXT NOT NULL,
  night DATE NOT NULL,
  drawing_no INT NOT NULL,
  mode TEXT NOT NULL,
  entry_id TEXT NOT NULL CHECK (entry_id ~ '^e_[0-9a-f]{16}$'),
  address_sha256 TEXT NOT NULL CHECK (address_sha256 ~ '^[0-9a-f]{64}$'),
  basis TEXT[] NOT NULL,
  PRIMARY KEY (prize_scope, night, drawing_no, mode, entry_id)
);

-- The one-prize ledger: rows are only ever inserted (a promotion adds a 'promoted' row). Who holds
-- a prize now is these rows minus the ones a drawing's `promoted` list replaced.
CREATE TABLE winners (
  prize_scope TEXT NOT NULL,
  recipient_hash TEXT NOT NULL CHECK (recipient_hash ~ '^[0-9a-f]{64}$'),
  entry_id TEXT NOT NULL,
  night DATE NOT NULL,
  drawing_no INT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('winner', 'promoted')),
  at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (prize_scope, recipient_hash),
  UNIQUE (prize_scope, entry_id)
);

CREATE TABLE provider_campaigns (
  id TEXT PRIMARY KEY,
  campaign_id TEXT,
  campaign_id_prefix TEXT,
  name TEXT,                     -- null for a resend whose exact name was never recorded
  resend_no INT NOT NULL DEFAULT 0,
  want INT,
  overrides JSONB,
  list_id TEXT,
  template TEXT,
  status TEXT,
  sent_at TIMESTAMPTZ,
  list_exact INT,
  received INT,
  received_read_at TIMESTAMPTZ,
  resend_of TEXT,
  trust TEXT NOT NULL CHECK (trust IN ('aggregate', 'early_read', 'untrusted', 'log_only')),
  step_instance_id TEXT,
  source TEXT NOT NULL
);

CREATE TABLE send_decisions (
  send_id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL,
  step_instance_id TEXT NOT NULL,
  message TEXT NOT NULL,
  resend_no INT NOT NULL DEFAULT 0,
  recipient_hash TEXT NOT NULL CHECK (recipient_hash ~ '^[0-9a-f]{64}$'),
  contact_ref TEXT,
  shard_no INT,
  status TEXT NOT NULL CHECK (status IN ('planned', 'posting', 'accepted', 'refused', 'opted_out', 'outcome_unknown', 'delivered', 'bounced', 'dropped', 'unconfirmed', 'adopted')),
  delivery_receipt_kind TEXT NOT NULL CHECK (delivery_receipt_kind IN ('per_person', 'campaign_only', 'none')),
  copy_sha256 TEXT,
  flow_id TEXT,
  campaign_id TEXT,
  posted_at TIMESTAMPTZ,
  receipt_at TIMESTAMPTZ,
  UNIQUE (step_instance_id, recipient_hash),
  UNIQUE (series_id, message, recipient_hash, resend_no)
);

CREATE SEQUENCE alert_serial;

CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  rule TEXT NOT NULL,
  subject_ref TEXT NOT NULL,
  incident_id TEXT,
  immediate BOOLEAN NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('open', 'taken', 'told', 'resolved')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_delivered_at TIMESTAMPTZ,
  deliveries INT NOT NULL DEFAULT 0,
  fix_by TIMESTAMPTZ,
  told_at TIMESTAMPTZ,
  told_by TEXT,
  resolved_at TIMESTAMPTZ,
  rendered TEXT,
  detail JSONB NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX alerts_open_dedupe ON alerts (rule, subject_ref) WHERE state <> 'resolved';

CREATE TABLE incidents (
  id TEXT PRIMARY KEY,
  root TEXT NOT NULL,
  state TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE item_leases (
  item_ref TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  until TIMESTAMPTZ NOT NULL,
  eta TIMESTAMPTZ,
  note TEXT
);

CREATE TABLE relays (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  by TEXT NOT NULL,
  refs TEXT[] NOT NULL,
  note TEXT NOT NULL,
  asked TEXT
);

GRANT SELECT, UPDATE ON health TO sequences_app;
-- Append-only by grant: definitions, import bundles, step events and relays are never updated.
GRANT SELECT, INSERT ON definitions, import_bundles, step_events, relays TO sequences_app;
GRANT SELECT, INSERT, UPDATE ON runtime_jobs, series, instances, step_instances, step_runs, source_snapshots, drawings,
  drawing_entries, provider_campaigns, send_decisions, alerts, incidents TO sequences_app;
-- Ledger rows are never updated or deleted.
GRANT SELECT, INSERT ON winners TO sequences_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON item_leases TO sequences_app;
GRANT USAGE ON SEQUENCE step_events_id_seq, relays_id_seq, alert_serial TO sequences_app;
