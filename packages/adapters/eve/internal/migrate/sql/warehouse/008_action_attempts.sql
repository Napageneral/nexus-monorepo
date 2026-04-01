CREATE TABLE IF NOT EXISTS action_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id TEXT NOT NULL UNIQUE,
    connection_id TEXT NOT NULL,
    edge_id TEXT,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    request_json TEXT NOT NULL,
    response_json TEXT,
    error_message TEXT,
    target_record_id TEXT,
    target_thread_id TEXT,
    target_message_guid TEXT,
    metadata_json TEXT,
    dispatched_at INTEGER,
    confirmed_at INTEGER,
    failed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_action_attempts_connection_id ON action_attempts(connection_id);
CREATE INDEX IF NOT EXISTS idx_action_attempts_status ON action_attempts(status);
CREATE INDEX IF NOT EXISTS idx_action_attempts_action ON action_attempts(action);
CREATE INDEX IF NOT EXISTS idx_action_attempts_created_at ON action_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_action_attempts_updated_at ON action_attempts(updated_at);
CREATE INDEX IF NOT EXISTS idx_action_attempts_edge_id ON action_attempts(edge_id);
