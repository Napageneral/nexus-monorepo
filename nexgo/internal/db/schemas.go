package db

// Schema SQL constants for all Nexus ledger databases.
// Each constant contains the full CREATE TABLE / CREATE INDEX / CREATE TRIGGER
// DDL needed to bootstrap that database from scratch.
//
// FTS5 virtual tables and triggers are separated into ftsSchemas so they can
// be conditionally applied only when the fts5 build tag is active.

const schemaEvents = `
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    adapter_id TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL DEFAULT 'message',
    content_type TEXT NOT NULL DEFAULT 'text',
    space_id TEXT NOT NULL DEFAULT '',
    space_name TEXT NOT NULL DEFAULT '',
    container_kind TEXT NOT NULL DEFAULT 'direct',
    container_id TEXT NOT NULL DEFAULT '',
    container_name TEXT NOT NULL DEFAULT '',
    thread_id TEXT NOT NULL DEFAULT '',
    sender_id TEXT NOT NULL DEFAULT '',
    sender_name TEXT NOT NULL DEFAULT '',
    sender_avatar TEXT NOT NULL DEFAULT '',
    receiver_id TEXT NOT NULL DEFAULT '',
    receiver_name TEXT NOT NULL DEFAULT '',
    entity_id TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    processed INTEGER NOT NULL DEFAULT 0,
    timestamp INTEGER NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    reply_to_id TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);

CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_id);
CREATE INDEX IF NOT EXISTS idx_events_container ON events(container_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_adapter ON events(adapter_id);
CREATE INDEX IF NOT EXISTS idx_events_processed ON events(processed);
CREATE INDEX IF NOT EXISTS idx_events_thread ON events(thread_id);
CREATE INDEX IF NOT EXISTS idx_events_sender ON events(sender_id);
CREATE INDEX IF NOT EXISTS idx_events_space ON events(space_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_content_type ON events(content_type);

CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    filename TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL DEFAULT '',
    media_type TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL DEFAULT 0,
    url TEXT NOT NULL DEFAULT '',
    local_path TEXT NOT NULL DEFAULT '',
    content_hash TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_attachments_event ON attachments(event_id);

CREATE TABLE IF NOT EXISTS attachment_interpretations (
    id TEXT PRIMARY KEY,
    attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
    model TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'description',
    content TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_interp_attachment ON attachment_interpretations(attachment_id);
`

const schemaEventsFTS = `
CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
    content,
    sender_name,
    container_name,
    content='events',
    content_rowid='rowid',
    tokenize='porter'
);

CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events BEGIN
    INSERT INTO events_fts(rowid, content, sender_name, container_name)
    VALUES (new.rowid, new.content, new.sender_name, new.container_name);
END;

CREATE TRIGGER IF NOT EXISTS events_ad AFTER DELETE ON events BEGIN
    INSERT INTO events_fts(events_fts, rowid, content, sender_name, container_name)
    VALUES ('delete', old.rowid, old.content, old.sender_name, old.container_name);
END;

CREATE TRIGGER IF NOT EXISTS events_au AFTER UPDATE ON events BEGIN
    INSERT INTO events_fts(events_fts, rowid, content, sender_name, container_name)
    VALUES ('delete', old.rowid, old.content, old.sender_name, old.container_name);
    INSERT INTO events_fts(rowid, content, sender_name, container_name)
    VALUES (new.rowid, new.content, new.sender_name, new.container_name);
END;
`

const schemaAgents = `
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL DEFAULT 'default',
    session_key TEXT NOT NULL,
    adapter_id TEXT NOT NULL DEFAULT '',
    platform TEXT NOT NULL DEFAULT '',
    container_id TEXT NOT NULL DEFAULT '',
    container_kind TEXT NOT NULL DEFAULT 'direct',
    entity_id TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT '',
    persona_path TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    title TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    token_count INTEGER NOT NULL DEFAULT 0,
    turn_count INTEGER NOT NULL DEFAULT 0,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    archived_at INTEGER,
    last_active_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_key ON sessions(session_key);
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_entity ON sessions(entity_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);

CREATE TABLE IF NOT EXISTS turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 0,
    request_id TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    token_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
CREATE INDEX IF NOT EXISTS idx_turns_sequence ON turns(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_turns_request ON turns(request_id);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT 'text',
    token_count INTEGER NOT NULL DEFAULT 0,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_messages_turn ON messages(turn_id);

CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY,
    turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    tool_input TEXT NOT NULL DEFAULT '{}',
    tool_output TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '',
    sequence INTEGER NOT NULL DEFAULT 0,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_turn ON tool_calls(turn_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_calls_status ON tool_calls(status);

CREATE TABLE IF NOT EXISTS compactions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    before_tokens INTEGER NOT NULL DEFAULT 0,
    after_tokens INTEGER NOT NULL DEFAULT 0,
    turns_removed INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_compactions_session ON compactions(session_id);

CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    turn_id TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'file',
    name TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
`

const schemaIdentity = `
CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'person',
    normalized TEXT NOT NULL DEFAULT '',
    is_user INTEGER NOT NULL DEFAULT 0,
    origin TEXT NOT NULL DEFAULT '',
    persona_path TEXT NOT NULL DEFAULT '',
    merged_into TEXT NOT NULL DEFAULT '',
    mention_count INTEGER NOT NULL DEFAULT 0,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
CREATE INDEX IF NOT EXISTS idx_entities_normalized ON entities(normalized);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_is_user ON entities(is_user);
CREATE INDEX IF NOT EXISTS idx_entities_merged ON entities(merged_into);

CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL DEFAULT '',
    adapter_id TEXT NOT NULL DEFAULT '',
    platform TEXT NOT NULL DEFAULT '',
    platform_id TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_contacts_entity ON contacts(entity_id);
CREATE INDEX IF NOT EXISTS idx_contacts_platform ON contacts(adapter_id, platform_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_unique ON contacts(adapter_id, platform, platform_id);

CREATE TABLE IF NOT EXISTS entity_tags (
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    PRIMARY KEY (entity_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_entity_tags_tag ON entity_tags(tag);

CREATE TABLE IF NOT EXISTS entity_links (
    id TEXT PRIMARY KEY,
    source_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relation TEXT NOT NULL DEFAULT '',
    confidence REAL NOT NULL DEFAULT 1.0,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_entity_links_source ON entity_links(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_links_target ON entity_links(target_entity_id);

CREATE TABLE IF NOT EXISTS contact_participants (
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    container_id TEXT NOT NULL,
    last_seen_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    PRIMARY KEY (contact_id, container_id)
);
CREATE INDEX IF NOT EXISTS idx_contact_participants_container ON contact_participants(container_id);
`

const schemaMemory = `
CREATE TABLE IF NOT EXISTS elements (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'observation',
    subtype TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    source_event_id TEXT NOT NULL DEFAULT '',
    source_session_id TEXT NOT NULL DEFAULT '',
    confidence REAL NOT NULL DEFAULT 1.0,
    importance REAL NOT NULL DEFAULT 0.5,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at INTEGER,
    decay_rate REAL NOT NULL DEFAULT 0.01,
    entity_ids TEXT NOT NULL DEFAULT '[]',
    tags TEXT NOT NULL DEFAULT '[]',
    metadata TEXT NOT NULL DEFAULT '{}',
    superseded_by TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_elements_type ON elements(type);
CREATE INDEX IF NOT EXISTS idx_elements_subtype ON elements(subtype);
CREATE INDEX IF NOT EXISTS idx_elements_status ON elements(status);
CREATE INDEX IF NOT EXISTS idx_elements_source ON elements(source);
CREATE INDEX IF NOT EXISTS idx_elements_importance ON elements(importance);
CREATE INDEX IF NOT EXISTS idx_elements_created ON elements(created_at);
CREATE INDEX IF NOT EXISTS idx_elements_updated ON elements(updated_at);

CREATE TABLE IF NOT EXISTS element_entities (
    element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    entity_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'subject',
    PRIMARY KEY (element_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_element_entities_entity ON element_entities(entity_id);

CREATE TABLE IF NOT EXISTS element_links (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    relation TEXT NOT NULL DEFAULT 'related',
    weight REAL NOT NULL DEFAULT 1.0,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_element_links_source ON element_links(source_id);
CREATE INDEX IF NOT EXISTS idx_element_links_target ON element_links(target_id);

CREATE TABLE IF NOT EXISTS sets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'manual',
    description TEXT NOT NULL DEFAULT '',
    query TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_sets_name ON sets(name);
CREATE INDEX IF NOT EXISTS idx_sets_type ON sets(type);

CREATE TABLE IF NOT EXISTS set_members (
    set_id TEXT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
    element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    added_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    PRIMARY KEY (set_id, element_id)
);
CREATE INDEX IF NOT EXISTS idx_set_members_element ON set_members(element_id);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    input TEXT NOT NULL DEFAULT '{}',
    output TEXT NOT NULL DEFAULT '{}',
    error TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    scheduled_at INTEGER,
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

CREATE TABLE IF NOT EXISTS processing_log (
    id TEXT PRIMARY KEY,
    element_id TEXT NOT NULL DEFAULT '',
    job_id TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_processing_log_element ON processing_log(element_id);
CREATE INDEX IF NOT EXISTS idx_processing_log_job ON processing_log(job_id);

CREATE TABLE IF NOT EXISTS review_queue (
    id TEXT PRIMARY KEY,
    element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    review_type TEXT NOT NULL DEFAULT 'new',
    priority REAL NOT NULL DEFAULT 0.5,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewer_notes TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue(status);
CREATE INDEX IF NOT EXISTS idx_review_queue_priority ON review_queue(priority);
CREATE INDEX IF NOT EXISTS idx_review_queue_element ON review_queue(element_id);
`

const schemaMemoryFTS = `
CREATE VIRTUAL TABLE IF NOT EXISTS elements_fts USING fts5(
    content,
    summary,
    content='elements',
    content_rowid='rowid',
    tokenize='porter'
);

CREATE TRIGGER IF NOT EXISTS elements_ai AFTER INSERT ON elements BEGIN
    INSERT INTO elements_fts(rowid, content, summary)
    VALUES (new.rowid, new.content, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS elements_ad AFTER DELETE ON elements BEGIN
    INSERT INTO elements_fts(elements_fts, rowid, content, summary)
    VALUES ('delete', old.rowid, old.content, old.summary);
END;

CREATE TRIGGER IF NOT EXISTS elements_au AFTER UPDATE ON elements BEGIN
    INSERT INTO elements_fts(elements_fts, rowid, content, summary)
    VALUES ('delete', old.rowid, old.content, old.summary);
    INSERT INTO elements_fts(rowid, content, summary)
    VALUES (new.rowid, new.content, new.summary);
END;
`

const schemaEmbeddings = `
CREATE TABLE IF NOT EXISTS embeddings (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL DEFAULT '',
    source_id TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    dimensions INTEGER NOT NULL DEFAULT 0,
    vector BLOB,
    content_hash TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_embeddings_source ON embeddings(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(model);
CREATE INDEX IF NOT EXISTS idx_embeddings_hash ON embeddings(content_hash);
`

const schemaRuntime = `
CREATE TABLE IF NOT EXISTS pipeline_requests (
    id TEXT PRIMARY KEY,
    operation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    sender_id TEXT NOT NULL DEFAULT '',
    receiver_id TEXT NOT NULL DEFAULT '',
    adapter_id TEXT NOT NULL DEFAULT '',
    payload TEXT NOT NULL DEFAULT '{}',
    result TEXT NOT NULL DEFAULT '{}',
    error TEXT NOT NULL DEFAULT '',
    stages TEXT NOT NULL DEFAULT '[]',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pipeline_op ON pipeline_requests(operation);
CREATE INDEX IF NOT EXISTS idx_pipeline_status ON pipeline_requests(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_created ON pipeline_requests(created_at);

CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'rule',
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 0,
    conditions TEXT NOT NULL DEFAULT '{}',
    actions TEXT NOT NULL DEFAULT '{}',
    metadata TEXT NOT NULL DEFAULT '{}',
    invocation_count INTEGER NOT NULL DEFAULT 0,
    last_invoked_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_automations_type ON automations(type);
CREATE INDEX IF NOT EXISTS idx_automations_enabled ON automations(enabled);

CREATE TABLE IF NOT EXISTS grants (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL DEFAULT '',
    resource TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL DEFAULT '',
    effect TEXT NOT NULL DEFAULT 'allow',
    conditions TEXT NOT NULL DEFAULT '{}',
    expires_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_grants_entity ON grants(entity_id);
CREATE INDEX IF NOT EXISTS idx_grants_resource ON grants(resource);

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL DEFAULT '',
    operation TEXT NOT NULL DEFAULT '',
    entity_id TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL DEFAULT '',
    resource TEXT NOT NULL DEFAULT '',
    decision TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_log(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS adapter_state (
    adapter_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'disconnected',
    config TEXT NOT NULL DEFAULT '{}',
    metadata TEXT NOT NULL DEFAULT '{}',
    last_heartbeat_at INTEGER,
    connected_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);

CREATE TABLE IF NOT EXISTS import_jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    source TEXT NOT NULL DEFAULT '',
    progress TEXT NOT NULL DEFAULT '{}',
    error TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_import_status ON import_jobs(status);

CREATE TABLE IF NOT EXISTS hooks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'webhook',
    enabled INTEGER NOT NULL DEFAULT 1,
    config TEXT NOT NULL DEFAULT '{}',
    last_triggered_at INTEGER,
    trigger_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_hooks_type ON hooks(type);
CREATE INDEX IF NOT EXISTS idx_hooks_enabled ON hooks(enabled);

CREATE TABLE IF NOT EXISTS clock_schedules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    cron_expr TEXT NOT NULL DEFAULT '',
    operation TEXT NOT NULL DEFAULT '',
    payload TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at INTEGER,
    next_run_at INTEGER,
    run_count INTEGER NOT NULL DEFAULT 0,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_clock_enabled ON clock_schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_clock_next_run ON clock_schedules(next_run_at);

CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
`

const schemaWork = `
CREATE TABLE IF NOT EXISTS work_items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'task',
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    priority INTEGER NOT NULL DEFAULT 0,
    assignee_entity_id TEXT NOT NULL DEFAULT '',
    parent_id TEXT NOT NULL DEFAULT '',
    sequence_id TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    metadata TEXT NOT NULL DEFAULT '{}',
    due_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_work_items_type ON work_items(type);
CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_work_items_assignee ON work_items(assignee_entity_id);
CREATE INDEX IF NOT EXISTS idx_work_items_parent ON work_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_work_items_sequence ON work_items(sequence_id);
CREATE INDEX IF NOT EXISTS idx_work_items_priority ON work_items(priority);

CREATE TABLE IF NOT EXISTS sequences (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);

CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    definition TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);

CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    workflow_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    metadata TEXT NOT NULL DEFAULT '{}',
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_campaigns_workflow ON campaigns(workflow_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

CREATE TABLE IF NOT EXISTS dependencies (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'blocks',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_deps_source ON dependencies(source_id);
CREATE INDEX IF NOT EXISTS idx_deps_target ON dependencies(target_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deps_unique ON dependencies(source_id, target_id, type);
`

// ledgerSchemas maps database file basenames to their core DDL.
var ledgerSchemas = map[string]string{
	"events":     schemaEvents,
	"agents":     schemaAgents,
	"identity":   schemaIdentity,
	"memory":     schemaMemory,
	"embeddings": schemaEmbeddings,
	"runtime":    schemaRuntime,
	"work":       schemaWork,
}

// ftsSchemas maps database file basenames to their FTS5 DDL.
// These are only applied when FTS5 is available (build tag: fts5).
var ftsSchemas = map[string]string{
	"events": schemaEventsFTS,
	"memory": schemaMemoryFTS,
}
