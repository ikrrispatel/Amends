-- Amends persistence schema. Keep provider payloads out of these tables.
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  contract_json TEXT NOT NULL,
  state_json TEXT,
  plan_json TEXT,
  plan_hash TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  action_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  preconditions_json TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  event_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_actions_run_id ON actions(run_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_run_id ON audit_events(run_id, sequence);
