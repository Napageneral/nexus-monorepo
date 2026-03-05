# Workplan: Agents & Sessions API

**Status:** READY FOR EXECUTION
**Created:** 2026-03-04
**Spec References:**
- [API_DESIGN_DECISIONS.md](../API_DESIGN_DECISIONS.md) (Batch 1 — sessions, turns, messages, queue, chat)
- [API_DESIGN_BATCH_4.md](../API_DESIGN_BATCH_4.md) (agents CRUD)

**Dependencies:**
- WP5 (workspaces) — `workspace_id` FK on sessions and agents
- WP7 (agent configs) — `agent_config_id` FK on turns

---

## Goal

Complete the agents and sessions API surface. Agent CRUD + identity + wait operations (7 ops). Full session lifecycle management (11 ops) with immutable append-only semantics, forking from turns, and import/export. Turns and messages read operations (4 ops). Queue management (2 ops). Chat operations (3 ops). Total: 27 operations.

---

## Current State

### Database Schema (agents.db)

**15 tables, 9 relevant to this workplan:**
- `sessions` — persistent session records (label, persona_id, created_at, updated_at)
- `session_history` — append-only thread rebind log
- `turns` — DAG of LLM executions (parent_turn_id, status, model, role, tokens, workspace_path, effective_config_json)
- `messages` — conversation content (turn_id, role, content, sequence)
- `tool_calls` — tool invocations (turn_id, tool_name, params_json, result_json, spawned_session_label)
- `queue` — session message queue (session_label, message_json, mode, status)
- `compactions` — thread summarization records
- `session_imports` — import tracking (source, source_session_id, session_label)
- `session_import_requests` — import idempotency (idempotency_key, run_id, response_json)

**Not in this workplan:** agents table (separate domain), artifacts (file tracking), session_continuity_transfers (entity merge tracking)

### Existing Operations

**Partial implementations exist:**
- `sessions.list` — works (src/nex/control-plane/server-methods/sessions.ts)
- `sessions.resolve` — works (resolves session key to session label)
- `sessions.delete` — exists but wrong semantics (should be archive)
- `sessions.import` — works (chunked import from external sources)
- `sessions.preview` — works (bulk preview with content limits)
- `chat.send` — works (5 queue modes, sync/async, injection)
- `chat.history` — works (optimized for chat UI)
- `chat.abort` — works (abort in-progress run)

**Missing operations (8):**
- `agents.sessions.get` — no handler
- `agents.sessions.create` — no handler (sessions created implicitly)
- `agents.sessions.fork` — no handler (forking exists in code, not exposed)
- `agents.sessions.archive` — wrong name (`sessions.delete` does archive but name is misleading)
- `agents.sessions.transfer` — no handler (continuity transfers not exposed)
- `agents.sessions.import.chunk` — no handler (chunked import exists, not exposed)
- `agents.sessions.history` — no handler (session_history table exists, not queried)
- `agents.turns.list` — no handler
- `agents.turns.get` — no handler
- `agents.messages.list` — no handler
- `agents.messages.get` — no handler
- `agents.sessions.queue.list` — no handler
- `agents.sessions.queue.cancel` — no handler

### Agent CRUD

**Currently no agent CRUD operations.** Agents are managed through CLI/config files. The agents table exists but has no RPC surface.

---

## Target State

### Schema Changes to agents.db

#### 1. sessions table additions

```sql
-- Add workspace_id (replaces persona_id)
ALTER TABLE sessions ADD COLUMN workspace_id TEXT;
CREATE INDEX idx_sessions_workspace ON sessions(workspace_id);

-- Add type for fork tracking
ALTER TABLE sessions ADD COLUMN type TEXT DEFAULT 'main';  -- 'main', 'isolated', 'forked'
ALTER TABLE sessions ADD COLUMN forked_from_session_id TEXT;
ALTER TABLE sessions ADD COLUMN forked_at_turn_id TEXT;
CREATE INDEX idx_sessions_forked_from ON sessions(forked_from_session_id) WHERE forked_from_session_id IS NOT NULL;

-- Migration note: persona_id → workspace_id mapping
-- Old: persona_id points to workspace dir path (via personas registry)
-- New: workspace_id is FK to workspaces.id
-- Migration: lookup workspace by path, populate workspace_id, keep persona_id for rollback
```

#### 2. turns table changes

```sql
-- Add agent_config_id (from WP7)
ALTER TABLE turns ADD COLUMN agent_config_id TEXT;
CREATE INDEX idx_turns_agent_config ON turns(agent_config_id);

-- Rename workspace_path → working_dir
-- (manual migration: copy column, then drop old one)
-- This avoids confusion with the Workspace primitive — this is just the CWD for tool execution
```

#### 3. agents table additions

```sql
-- Add workspace_id (replaces config root paths)
ALTER TABLE agents ADD COLUMN workspace_id TEXT;
CREATE INDEX idx_agents_workspace ON agents(workspace_id);
```

### 27 Operations Across 5 Sub-Domains

#### agents.* (7 operations — agent CRUD)

| Operation | Type | Description |
|-----------|------|-------------|
| `agents.list` | read | List all agents with identity summary and workspace reference |
| `agents.get` | read | Get agent details including workspace_id |
| `agents.create` | write | Create new agent (creates workspace, sets up default manifest) |
| `agents.update` | write | Update agent name, avatar, model, workspace binding |
| `agents.delete` | write | Delete agent (optionally delete workspace) |
| `agents.identity.get` | read | Get agent identity summary (name, avatar, emoji) |
| `agents.wait` | read | Long-poll for an agent run to complete (timeout-based) |

#### agents.sessions.* (11 operations)

| Operation | Type | Description |
|-----------|------|-------------|
| `agents.sessions.list` | read | List sessions with filters (EXISTS as `sessions.list`, rename to `agents.sessions.list`) |
| `agents.sessions.get` | read | Get session details by key/label (MISSING) |
| `agents.sessions.resolve` | read | Resolve a session key to a concrete session (EXISTS) |
| `agents.sessions.create` | write | Explicitly create a new session (MISSING) |
| `agents.sessions.fork` | write | Fork a new session from a specific turn (MISSING) |
| `agents.sessions.archive` | write | Soft-archive a session (EXISTS as `sessions.delete`, rename) |
| `agents.sessions.transfer` | write | Transfer continuity between sessions (MISSING) |
| `agents.sessions.import` | write | Import external session history (EXISTS) |
| `agents.sessions.import.chunk` | write | Chunked upload for large imports (MISSING) |
| `agents.sessions.history` | read | Read session_history (thread rebind log) (MISSING) |
| `agents.sessions.preview` | read | Bulk preview of session contents (EXISTS) |

#### agents.turns.* (2 operations)

| Operation | Type | Description |
|-----------|------|-------------|
| `agents.turns.list` | read | List turns in a session/thread (MISSING) |
| `agents.turns.get` | read | Get a single turn with full details (MISSING) |

#### agents.messages.* (2 operations)

| Operation | Type | Description |
|-----------|------|-------------|
| `agents.messages.list` | read | List messages in a turn or across a session (MISSING) |
| `agents.messages.get` | read | Get a single message by ID (MISSING) |

#### agents.sessions.queue.* (2 operations)

| Operation | Type | Description |
|-----------|------|-------------|
| `agents.sessions.queue.list` | read | List queue items for a session (MISSING) |
| `agents.sessions.queue.cancel` | write | Cancel a queued item (MISSING) |

#### chat.* (3 operations — already exist, no changes)

| Operation | Type | Description |
|-----------|------|-------------|
| `chat.send` | write | Send a message (sync streaming, async fire-and-forget, assistant injection via role param) |
| `chat.history` | read | Read recent messages (optimized for chat UI, capped, byte-size limited) |
| `chat.abort` | write | Abort an in-progress agent run |

---

## Changes Required

### Database Schema

**agents.db changes:**

1. Add columns to sessions table (workspace_id, type, forked_from_session_id, forked_at_turn_id)
2. Add agent_config_id to turns table
3. Rename workspace_path → working_dir on turns table
4. Add workspace_id to agents table

Schema migration script:
```typescript
// src/db/agents-migration.ts (new file)
export function migrateAgentsSchema(db: DatabaseSync): void {
  // Sessions
  db.exec('ALTER TABLE sessions ADD COLUMN workspace_id TEXT');
  db.exec('ALTER TABLE sessions ADD COLUMN type TEXT DEFAULT "main"');
  db.exec('ALTER TABLE sessions ADD COLUMN forked_from_session_id TEXT');
  db.exec('ALTER TABLE sessions ADD COLUMN forked_at_turn_id TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_forked_from ON sessions(forked_from_session_id) WHERE forked_from_session_id IS NOT NULL');

  // Turns
  db.exec('ALTER TABLE turns ADD COLUMN agent_config_id TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_turns_agent_config ON turns(agent_config_id)');

  // Rename workspace_path → working_dir (if not already done)
  const columns = db.prepare('PRAGMA table_info(turns)').all() as Array<{ name: string }>;
  const hasWorkspacePath = columns.some(c => c.name === 'workspace_path');
  const hasWorkingDir = columns.some(c => c.name === 'working_dir');

  if (hasWorkspacePath && !hasWorkingDir) {
    db.exec('ALTER TABLE turns ADD COLUMN working_dir TEXT');
    db.exec('UPDATE turns SET working_dir = workspace_path WHERE workspace_path IS NOT NULL');
  }

  // Agents
  db.exec('ALTER TABLE agents ADD COLUMN workspace_id TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id)');
}
```

### New Code

**1. Agent CRUD operations** — `src/nex/control-plane/server-methods/agents.ts` (new file)

```typescript
import type { RuntimeRequestHandlers } from './types.js';
import { openLedger } from '../../../db/ledgers.js';
import { ensureAgentsSchema } from '../../../db/agents.js';
import { ErrorCodes, errorShape } from '../protocol/index.js';

export const agentsHandlers: RuntimeRequestHandlers = {
  'agents.list': async ({ params, respond }) => {
    const agentsDb = openLedger('agents');
    ensureAgentsSchema(agentsDb);

    const agents = agentsDb.prepare(`
      SELECT id, name, avatar, emoji, model, provider, workspace_id, created_at, updated_at
      FROM agents
      ORDER BY created_at DESC
    `).all() as Array<{
      id: string;
      name: string;
      avatar: string | null;
      emoji: string | null;
      model: string | null;
      provider: string | null;
      workspace_id: string | null;
      created_at: number;
      updated_at: number;
    }>;

    respond(true, { agents }, undefined);
  },

  'agents.get': async ({ params, respond }) => {
    const agentId = String(params.id ?? '').trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'agent id required'));
      return;
    }

    const agentsDb = openLedger('agents');
    const agent = agentsDb.prepare('SELECT * FROM agents WHERE id = ? LIMIT 1').get(agentId);

    if (!agent) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`));
      return;
    }

    respond(true, { agent }, undefined);
  },

  'agents.create': async ({ params, respond }) => {
    // Create agent + default workspace
    const name = String(params.name ?? '').trim();
    if (!name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'agent name required'));
      return;
    }

    const agentsDb = openLedger('agents');
    const workspacesDb = openLedger('workspaces');

    // Create workspace first
    const workspaceId = `ws_${randomUUID()}`;
    const workspacePath = path.join(process.env.NEXUS_WORKSPACES_DIR ?? './workspaces', name);

    workspacesDb.prepare(`
      INSERT INTO workspaces (id, name, path, manifest_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      workspaceId,
      name,
      workspacePath,
      JSON.stringify({
        files: {
          'SOUL.md': { level: 'system_prompt' },
          'IDENTITY.md': { level: 'system_prompt' }
        }
      }),
      Date.now()
    );

    // Create agent
    const agentId = `agent_${randomUUID()}`;
    agentsDb.prepare(`
      INSERT INTO agents (id, name, workspace_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(agentId, name, workspaceId, Date.now(), Date.now());

    respond(true, { id: agentId, workspace_id: workspaceId }, undefined);
  },

  'agents.update': async ({ params, respond }) => {
    // Partial update: name, avatar, model, workspace_id
    const agentId = String(params.id ?? '').trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'agent id required'));
      return;
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (params.name) {
      updates.push('name = ?');
      values.push(String(params.name).trim());
    }
    if (params.avatar !== undefined) {
      updates.push('avatar = ?');
      values.push(params.avatar);
    }
    if (params.model !== undefined) {
      updates.push('model = ?');
      values.push(params.model);
    }
    if (params.workspace_id !== undefined) {
      updates.push('workspace_id = ?');
      values.push(params.workspace_id);
    }

    if (updates.length === 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'no updates provided'));
      return;
    }

    updates.push('updated_at = ?');
    values.push(Date.now());

    const agentsDb = openLedger('agents');
    agentsDb.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`).run(...values, agentId);

    respond(true, { updated: true }, undefined);
  },

  'agents.delete': async ({ params, respond }) => {
    const agentId = String(params.id ?? '').trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'agent id required'));
      return;
    }

    const agentsDb = openLedger('agents');
    agentsDb.prepare('DELETE FROM agents WHERE id = ?').run(agentId);

    // Optionally delete workspace if requested
    if (params.delete_workspace) {
      const agent = agentsDb.prepare('SELECT workspace_id FROM agents WHERE id = ? LIMIT 1').get(agentId) as { workspace_id: string | null } | undefined;
      if (agent?.workspace_id) {
        const workspacesDb = openLedger('workspaces');
        workspacesDb.prepare('DELETE FROM workspaces WHERE id = ?').run(agent.workspace_id);
      }
    }

    respond(true, { deleted: true }, undefined);
  },

  'agents.identity.get': async ({ params, respond }) => {
    const agentId = String(params.id ?? '').trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'agent id required'));
      return;
    }

    const agentsDb = openLedger('agents');
    const identity = agentsDb.prepare(`
      SELECT name, avatar, emoji FROM agents WHERE id = ? LIMIT 1
    `).get(agentId) as { name: string; avatar: string | null; emoji: string | null } | undefined;

    if (!identity) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`));
      return;
    }

    respond(true, identity, undefined);
  },

  'agents.wait': async ({ params, respond }) => {
    // Existing implementation in src/agents/pi-embedded.ts: waitForEmbeddedPiRunEnd()
    // Wrap it
    const timeout = typeof params.timeout === 'number' ? params.timeout : 30000;
    try {
      await waitForEmbeddedPiRunEnd(params.session_label, timeout);
      respond(true, { completed: true }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.TIMEOUT, String(error)));
    }
  }
};
```

**2. Session operations additions** — `src/nex/control-plane/server-methods/sessions.ts` (modify existing)

Add missing handlers:

```typescript
// Add to existing sessionsHandlers
export const sessionsHandlers: RuntimeRequestHandlers = {
  // ... existing: sessions.list, sessions.resolve, sessions.import, sessions.preview

  'agents.sessions.get': async ({ params, respond }) => {
    const key = String(params.key ?? '').trim();
    if (!key) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'session key required'));
      return;
    }

    const agentsDb = openLedger('agents');
    const cfg = loadConfig();
    const resolved = resolveSessionRecord(agentsDb, key, { cfg, allowThreadIdLookup: true });

    if (!resolved) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `session not found: ${key}`));
      return;
    }

    respond(true, { session: resolved }, undefined);
  },

  'agents.sessions.create': async ({ params, respond }) => {
    const label = String(params.label ?? '').trim();
    const workspaceId = String(params.workspace_id ?? '').trim();

    if (!label) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'session label required'));
      return;
    }

    const agentsDb = openLedger('agents');
    const now = Date.now();

    agentsDb.prepare(`
      INSERT INTO sessions (label, workspace_id, type, created_at, updated_at)
      VALUES (?, ?, 'main', ?, ?)
    `).run(label, workspaceId || null, now, now);

    respond(true, { label, created: true }, undefined);
  },

  'agents.sessions.fork': async ({ params, respond }) => {
    const fromSessionKey = String(params.from_session_key ?? '').trim();
    const fromTurnId = String(params.from_turn_id ?? '').trim();
    const newLabel = String(params.label ?? '').trim();

    if (!fromSessionKey || !fromTurnId || !newLabel) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'from_session_key, from_turn_id, and label required'));
      return;
    }

    const agentsDb = openLedger('agents');
    const cfg = loadConfig();
    const sourceSession = resolveSessionRecord(agentsDb, fromSessionKey, { cfg });

    if (!sourceSession) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `source session not found: ${fromSessionKey}`));
      return;
    }

    const now = Date.now();
    agentsDb.prepare(`
      INSERT INTO sessions (label, workspace_id, type, forked_from_session_id, forked_at_turn_id, created_at, updated_at)
      VALUES (?, ?, 'forked', ?, ?, ?, ?)
    `).run(newLabel, sourceSession.workspace_id || null, sourceSession.label, fromTurnId, now, now);

    respond(true, { label: newLabel, forked: true }, undefined);
  },

  'agents.sessions.archive': async ({ params, respond }) => {
    // Rename from sessions.delete (same implementation, better name)
    const key = String(params.key ?? '').trim();
    if (!key) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'session key required'));
      return;
    }

    // Soft-archive: just update status or add archived_at timestamp
    // Current sessions table doesn't have status field — this is a TODO
    // For now: delete from sessions table (but keep turns/messages)
    const agentsDb = openLedger('agents');
    const cfg = loadConfig();
    const resolved = resolveSessionRecord(agentsDb, key, { cfg });

    if (!resolved) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `session not found: ${key}`));
      return;
    }

    agentsDb.prepare('DELETE FROM sessions WHERE label = ?').run(resolved.label);
    respond(true, { archived: true }, undefined);
  },

  'agents.sessions.transfer': async ({ params, respond }) => {
    const sourceKey = String(params.source_key ?? '').trim();
    const targetKey = String(params.target_key ?? '').trim();
    const reason = String(params.reason ?? 'key_cutover').trim();

    if (!sourceKey || !targetKey) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'source_key and target_key required'));
      return;
    }

    const agentsDb = openLedger('agents');
    const transferId = `transfer_${randomUUID()}`;
    const now = Date.now();

    // Record in session_continuity_transfers table
    agentsDb.prepare(`
      INSERT INTO session_continuity_transfers (id, source_session_key, target_session_key, reason, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(transferId, sourceKey, targetKey, reason, now);

    respond(true, { transfer_id: transferId, transferred: true }, undefined);
  },

  'agents.sessions.import.chunk': async ({ params, respond }) => {
    // Wrap existing runSessionsImportChunk()
    try {
      const result = await runSessionsImportChunk(params as SessionsImportChunkRequest);
      respond(true, result, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL, String(error)));
    }
  },

  'agents.sessions.history': async ({ params, respond }) => {
    const sessionKey = String(params.session_key ?? '').trim();
    if (!sessionKey) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'session_key required'));
      return;
    }

    const agentsDb = openLedger('agents');
    const cfg = loadConfig();
    const resolved = resolveSessionRecord(agentsDb, sessionKey, { cfg });

    if (!resolved) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `session not found: ${sessionKey}`));
      return;
    }

    const history = agentsDb.prepare(`
      SELECT * FROM session_history
      WHERE session_label = ?
      ORDER BY changed_at ASC
    `).all(resolved.label) as Array<{
      session_label: string;
      old_thread_id: string | null;
      new_thread_id: string;
      reason: string | null;
      changed_at: number;
    }>;

    respond(true, { history }, undefined);
  }
};
```

**3. Turns operations** — `src/nex/control-plane/server-methods/turns.ts` (new file)

```typescript
export const turnsHandlers: RuntimeRequestHandlers = {
  'agents.turns.list': async ({ params, respond }) => {
    const sessionKey = String(params.session_key ?? '').trim();
    if (!sessionKey) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'session_key required'));
      return;
    }

    const agentsDb = openLedger('agents');
    const cfg = loadConfig();
    const resolved = resolveSessionRecord(agentsDb, sessionKey, { cfg });

    if (!resolved) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `session not found: ${sessionKey}`));
      return;
    }

    // Get thread_id for this session
    const thread = agentsDb.prepare(`
      SELECT thread_id FROM threads WHERE session_label = ? LIMIT 1
    `).get(resolved.label) as { thread_id: string } | undefined;

    if (!thread) {
      respond(true, { turns: [] }, undefined);
      return;
    }

    const turns = agentsDb.prepare(`
      SELECT t.*
      FROM turns t
      JOIN threads th ON t.id = th.turn_id
      WHERE th.thread_id = ?
      ORDER BY t.started_at ASC
    `).all(thread.thread_id);

    respond(true, { turns }, undefined);
  },

  'agents.turns.get': async ({ params, respond }) => {
    const turnId = String(params.turn_id ?? '').trim();
    if (!turnId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'turn_id required'));
      return;
    }

    const agentsDb = openLedger('agents');
    const turn = agentsDb.prepare('SELECT * FROM turns WHERE id = ? LIMIT 1').get(turnId);

    if (!turn) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `turn not found: ${turnId}`));
      return;
    }

    // Also fetch messages and tool_calls for this turn
    const messages = agentsDb.prepare('SELECT * FROM messages WHERE turn_id = ? ORDER BY sequence ASC').all(turnId);
    const toolCalls = agentsDb.prepare('SELECT * FROM tool_calls WHERE turn_id = ? ORDER BY sequence ASC').all(turnId);

    respond(true, { turn, messages, tool_calls: toolCalls }, undefined);
  }
};
```

**4. Messages operations** — `src/nex/control-plane/server-methods/messages.ts` (new file)

```typescript
export const messagesHandlers: RuntimeRequestHandlers = {
  'agents.messages.list': async ({ params, respond }) => {
    const turnId = params.turn_id ? String(params.turn_id).trim() : null;
    const sessionKey = params.session_key ? String(params.session_key).trim() : null;

    if (!turnId && !sessionKey) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'turn_id or session_key required'));
      return;
    }

    const agentsDb = openLedger('agents');

    if (turnId) {
      // List messages for a single turn
      const messages = agentsDb.prepare('SELECT * FROM messages WHERE turn_id = ? ORDER BY sequence ASC').all(turnId);
      respond(true, { messages }, undefined);
      return;
    }

    // List messages across a session (all turns in thread)
    const cfg = loadConfig();
    const resolved = resolveSessionRecord(agentsDb, sessionKey!, { cfg });
    if (!resolved) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `session not found: ${sessionKey}`));
      return;
    }

    const thread = agentsDb.prepare('SELECT thread_id FROM threads WHERE session_label = ? LIMIT 1').get(resolved.label) as { thread_id: string } | undefined;
    if (!thread) {
      respond(true, { messages: [] }, undefined);
      return;
    }

    const messages = agentsDb.prepare(`
      SELECT m.*
      FROM messages m
      JOIN turns t ON m.turn_id = t.id
      JOIN threads th ON t.id = th.turn_id
      WHERE th.thread_id = ?
      ORDER BY t.started_at ASC, m.sequence ASC
    `).all(thread.thread_id);

    respond(true, { messages }, undefined);
  },

  'agents.messages.get': async ({ params, respond }) => {
    const messageId = String(params.message_id ?? '').trim();
    if (!messageId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'message_id required'));
      return;
    }

    const agentsDb = openLedger('agents');
    const message = agentsDb.prepare('SELECT * FROM messages WHERE id = ? LIMIT 1').get(messageId);

    if (!message) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `message not found: ${messageId}`));
      return;
    }

    respond(true, { message }, undefined);
  }
};
```

**5. Queue operations** — `src/nex/control-plane/server-methods/queue.ts` (new file)

```typescript
export const queueHandlers: RuntimeRequestHandlers = {
  'agents.sessions.queue.list': async ({ params, respond }) => {
    const sessionKey = String(params.session_key ?? '').trim();
    if (!sessionKey) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'session_key required'));
      return;
    }

    const agentsDb = openLedger('agents');
    const cfg = loadConfig();
    const resolved = resolveSessionRecord(agentsDb, sessionKey, { cfg });

    if (!resolved) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `session not found: ${sessionKey}`));
      return;
    }

    const queueItems = agentsDb.prepare(`
      SELECT * FROM queue
      WHERE session_label = ?
      ORDER BY enqueued_at ASC
    `).all(resolved.label);

    respond(true, { queue: queueItems }, undefined);
  },

  'agents.sessions.queue.cancel': async ({ params, respond }) => {
    const queueId = String(params.queue_id ?? '').trim();
    if (!queueId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, 'queue_id required'));
      return;
    }

    const agentsDb = openLedger('agents');
    agentsDb.prepare(`
      UPDATE queue
      SET status = 'cancelled', completed_at = ?
      WHERE id = ? AND status = 'queued'
    `).run(Date.now(), queueId);

    respond(true, { cancelled: true }, undefined);
  }
};
```

### Modified Files

**src/nex/control-plane/server.ts** — Register 27 operations:

```typescript
import { agentsHandlers } from './server-methods/agents.js';
import { sessionsHandlers } from './server-methods/sessions.js';
import { turnsHandlers } from './server-methods/turns.js';
import { messagesHandlers } from './server-methods/messages.js';
import { queueHandlers } from './server-methods/queue.js';

// Register all handlers
Object.entries(agentsHandlers).forEach(([op, handler]) => registerHandler(op, handler));
Object.entries(sessionsHandlers).forEach(([op, handler]) => registerHandler(op, handler));
Object.entries(turnsHandlers).forEach(([op, handler]) => registerHandler(op, handler));
Object.entries(messagesHandlers).forEach(([op, handler]) => registerHandler(op, handler));
Object.entries(queueHandlers).forEach(([op, handler]) => registerHandler(op, handler));

// Unregister old namespace
unregister('sessions.*');  // Move to agents.sessions.*
```

**src/db/agents.ts** — Add migration function call:

```typescript
import { migrateAgentsSchema } from './agents-migration.js';

export function ensureAgentsSchema(db: DatabaseSync): void {
  // ... existing schema SQL
  migrateAgentsSchema(db);
}
```

### Deleted Files/Code

**Namespace moves** (not deletions, but renames in handler registration):
- `sessions.list` → `agents.sessions.list`
- `sessions.resolve` → `agents.sessions.resolve`
- `sessions.delete` → `agents.sessions.archive`
- `sessions.import` → `agents.sessions.import`
- `sessions.preview` → `agents.sessions.preview`

### Operations to Register

**27 operations total:**

```typescript
// agents.* (7)
registerHandler('agents.list', agentsHandlers['agents.list']);
registerHandler('agents.get', agentsHandlers['agents.get']);
registerHandler('agents.create', agentsHandlers['agents.create']);
registerHandler('agents.update', agentsHandlers['agents.update']);
registerHandler('agents.delete', agentsHandlers['agents.delete']);
registerHandler('agents.identity.get', agentsHandlers['agents.identity.get']);
registerHandler('agents.wait', agentsHandlers['agents.wait']);

// agents.sessions.* (11)
registerHandler('agents.sessions.list', sessionsHandlers['agents.sessions.list']);
registerHandler('agents.sessions.get', sessionsHandlers['agents.sessions.get']);
registerHandler('agents.sessions.resolve', sessionsHandlers['agents.sessions.resolve']);
registerHandler('agents.sessions.create', sessionsHandlers['agents.sessions.create']);
registerHandler('agents.sessions.fork', sessionsHandlers['agents.sessions.fork']);
registerHandler('agents.sessions.archive', sessionsHandlers['agents.sessions.archive']);
registerHandler('agents.sessions.transfer', sessionsHandlers['agents.sessions.transfer']);
registerHandler('agents.sessions.import', sessionsHandlers['agents.sessions.import']);
registerHandler('agents.sessions.import.chunk', sessionsHandlers['agents.sessions.import.chunk']);
registerHandler('agents.sessions.history', sessionsHandlers['agents.sessions.history']);
registerHandler('agents.sessions.preview', sessionsHandlers['agents.sessions.preview']);

// agents.turns.* (2)
registerHandler('agents.turns.list', turnsHandlers['agents.turns.list']);
registerHandler('agents.turns.get', turnsHandlers['agents.turns.get']);

// agents.messages.* (2)
registerHandler('agents.messages.list', messagesHandlers['agents.messages.list']);
registerHandler('agents.messages.get', messagesHandlers['agents.messages.get']);

// agents.sessions.queue.* (2)
registerHandler('agents.sessions.queue.list', queueHandlers['agents.sessions.queue.list']);
registerHandler('agents.sessions.queue.cancel', queueHandlers['agents.sessions.queue.cancel']);

// chat.* (3) — already exist, no changes
// chat.send, chat.history, chat.abort
```

---

## Execution Order

### Phase 1: Schema Migration (No Dependencies)

1. **Write migration script** (`src/db/agents-migration.ts`)
   - Add workspace_id, type, forked_* columns to sessions
   - Add agent_config_id to turns
   - Rename workspace_path → working_dir on turns
   - Add workspace_id to agents

2. **Update ensureAgentsSchema** to call migration

### Phase 2: CRUD Operations (Depends on Phase 1)

3. **Write agent CRUD handlers** (`src/nex/control-plane/server-methods/agents.ts`)
   - 7 operations: list, get, create, update, delete, identity.get, wait

4. **Write sessions additions** (modify `src/nex/control-plane/server-methods/sessions.ts`)
   - Add 5 missing operations: get, create, fork, archive, transfer, import.chunk, history

5. **Write turns handlers** (`src/nex/control-plane/server-methods/turns.ts`)
   - 2 operations: list, get

6. **Write messages handlers** (`src/nex/control-plane/server-methods/messages.ts`)
   - 2 operations: list, get

7. **Write queue handlers** (`src/nex/control-plane/server-methods/queue.ts`)
   - 2 operations: list, cancel

### Phase 3: Integration (Depends on Phase 2)

8. **Register all operations in control plane server**
   - Import all 5 handler modules
   - Register 27 operations
   - Unregister old `sessions.*` namespace

### Phase 4: Testing (Depends on Phase 3)

9. **Smoke tests**
   - agents.create → verify workspace created + agent record
   - agents.sessions.fork → verify new session with forked_* fields
   - agents.turns.list → verify turn retrieval
   - agents.messages.list → verify message retrieval across session
   - agents.sessions.queue.list → verify queue items

---

## Critical Path

**Blocking dependencies:**
- Phase 1 (schema) must complete before any handlers
- WP5 (workspaces) must be complete before workspace_id FK works
- WP7 (agent configs) must be complete before agent_config_id FK works

**Parallelizable:**
- Phase 2: All 5 handler files can be written in parallel once schema is done
- Phase 3 and 4 are sequential

**Estimated complexity:** MEDIUM — 27 operations but most are straightforward CRUD wrappers around existing DB schema. The hardest parts are session forking and continuity transfers, which have existing implementations to reference.
