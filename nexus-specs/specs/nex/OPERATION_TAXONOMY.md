# Nex Operation Taxonomy

**Status:** DESIGN (authoritative target — all tiers documented, pending review)
**Last Updated:** 2026-03-02

---

## Overview

This document is the canonical catalog of every operation the Nex runtime supports. Each operation defines a name, input schema, output schema, IAM metadata, and error cases. This catalog is the single source of truth from which SDKs, CLI commands, and documentation are generated.

See [NEX_ARCHITECTURE_AND_SDK_MODEL.md](./NEX_ARCHITECTURE_AND_SDK_MODEL.md) for how this catalog fits into the 4-layer architecture.

### How to Read This Document

Each operation is documented with:

- **Operation** — The canonical operation name (e.g., `health`, `config.get`)
- **Mode** — `protocol` (handshake/auth), `control` (standard request/response), or `event` (ingestion)
- **Action** — `read`, `write`, `admin`, `approve`, or `pair` (determines IAM permission level)
- **Resource** — The IAM resource string for access control
- **Input** — TypeScript type definition for the request payload
- **Output** — TypeScript type definition for the success response
- **Errors** — Error codes and conditions

### Common Types

```typescript
// All error responses use this shape
type ErrorResponse = {
  code: "INVALID_REQUEST" | "UNAVAILABLE" | "NOT_LINKED" | "NOT_PAIRED" | "AGENT_TIMEOUT";
  message: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
};

// Primitive constraints
type NonEmptyString = string;        // minLength: 1
type SessionLabel = string;          // minLength: 1, maxLength: 64
type EpochMs = number;               // integer, >= 0
```

---

## Tier 1: Core Contract

These operations form the foundational API. Every runtime must support them.

---

### Group 1: Core Runtime (6 operations)

Introspection and monitoring operations.

---

#### `health`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `runtime.health` |

**Input:**
```typescript
{
  probe?: boolean;     // Force live probe of all channels (bypasses cache)
}
```

**Output:**
```typescript
{
  ok: true;
  ts: EpochMs;
  durationMs: number;
  channels: Record<string, {
    accountId: string;
    configured?: boolean;
    linked?: boolean;
    authAgeMs?: number | null;
    probe?: unknown;
    lastProbeAt?: number | null;
    accounts?: Record<string, ChannelAccountHealth>;
  }>;
  channelOrder: string[];
  channelLabels: Record<string, string>;
  defaultAgentId: string;
  agents: Array<{
    agentId: string;
    name?: string;
    isDefault: boolean;
    sessions: SessionHealthSummary;
  }>;
  sessions: SessionHealthSummary;
}

type SessionHealthSummary = {
  path: string;
  count: number;
  recent: Array<{
    key: string;
    updatedAt: number | null;
    age: number | null;
  }>;
};
```

**Errors:** `UNAVAILABLE` — health snapshot build failed.

**Notes:** Cached with refresh interval. Non-probe requests return cached snapshot with `{ cached: true }` metadata.

---

#### `status`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `runtime.status` |

**Input:**
```typescript
{}   // No parameters
```

**Output:**
```typescript
{
  linkChannel?: {
    id: string;
    label: string;
    linked: boolean;
    authAgeMs: number | null;
  };
  channelSummary: string[];
  queuedSystemEvents: string[];
  sessions: {
    paths: string[];
    count: number;
    defaults: {
      model: string | null;
      contextTokens: number | null;
    };
    recent: SessionStatus[];              // Up to 10
    byAgent: Array<{
      agentId: string;
      path: string;
      count: number;
      recent: SessionStatus[];            // Up to 10 per agent
    }>;
  };
}

type SessionStatus = {
  agentId?: string;
  key: string;
  kind: "direct" | "group" | "global" | "unknown";
  sessionId?: string;
  updatedAt: number | null;
  age: number | null;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  elevatedLevel?: string;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens: number | null;
  remainingTokens: number | null;
  percentUsed: number | null;
  model: string | null;
  contextTokens: number | null;
  flags: string[];
};
```

---

#### `logs.tail`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `runtime.logs` |

**Input:**
```typescript
{
  cursor?: number;       // integer >= 0; byte offset to resume from
  limit?: number;        // integer 1..5000; max lines to return (default: 500)
  maxBytes?: number;     // integer 1..1_000_000; max bytes to read (default: 250_000)
}
```

**Output:**
```typescript
{
  file: string;          // Log file path
  cursor: number;        // New byte offset (file size after read)
  size: number;          // Current file size in bytes
  lines: string[];       // Log lines
  truncated?: boolean;   // True if read started after byte 0
  reset?: boolean;       // True if cursor was out of bounds and was reset
}
```

**Errors:** `INVALID_REQUEST` — validation failure. `UNAVAILABLE` — file I/O error.

---

#### `system-presence`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `runtime.presence` |

**Input:**
```typescript
{}   // No parameters
```

**Output:**
```typescript
Array<{
  host?: string;
  ip?: string;
  version?: string;
  platform?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  lastInputSeconds?: number;
  mode?: string;
  reason?: string;
  deviceId?: string;
  roles?: string[];
  scopes?: string[];
  instanceId?: string;
  text: string;
  ts: EpochMs;
}>
```

**Notes:** Sorted by `ts` descending. Pruned of entries older than 5 minutes. Capped at 200 entries.

---

#### `events.stream`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `runtime.bus` |

**Input (HTTP query params):**
```typescript
{
  type?: string;           // Filter to single event type
  types?: string;          // Comma-separated list of event types
}
```

**Output:** Server-Sent Events stream.

```
id: <event.id>
event: <event.type>
data: <JSON payload>
```

Heartbeat every 30 seconds: `event: heartbeat\ndata: {}\n\n`

**HTTP only:** `GET /api/events/stream`. Returns 503 if runtime not ready.

---

#### `apps.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `runtime.apps` |

**Input:**
```typescript
{}   // No parameters
```

**Output:**
```typescript
{
  ok: true;
  items: Array<{
    app_id: string;
    display_name: string;
    entry_path: string;        // e.g., "/app/control/chat"
    api_base: string;          // e.g., "/api/control"
    kind: "static" | "proxy";
    proxy_base_url?: string;   // Only for kind="proxy"
    icon: string;
    order: number;             // Sort order
  }>;
}
```

**Notes:** In hosted mode, each app is IAM-checked against the caller's role/scopes.

---

### Group 2: Auth & Users (11 operations)

Authentication, user management, and API token management.

---

#### `connect`

| Field | Value |
|-------|-------|
| Mode | `protocol` |
| Action | `write` |
| Resource | `auth.connect` |

**Input:** WebSocket handshake — the first message on a new WebSocket connection.

**Output:** Connection established.

**Errors:** Always errors if sent after initial handshake: `"connect is only valid as the first request"`.

**Notes:** WebSocket-only. Not callable as a normal operation.

---

#### `auth.login`

| Field | Value |
|-------|-------|
| Mode | `protocol` |
| Action | `write` |
| Resource | `auth.login` |

**Input:**
```typescript
{
  username: string;     // Trimmed, must be non-empty
  password: string;     // Must be non-empty
}
```

**Output:**
```typescript
{
  ok: true;
  token: string;                   // Bearer token
  token_id: string;                // Token record ID
  entity_id: string;               // Authenticated entity ID
  audience: "control-plane";
  scopes: ["operator.admin"];
  expires_at: EpochMs;             // 30 days from creation
}
```

**Errors:** HTTP 400 — malformed body. HTTP 401 — invalid credentials (generic, no username enumeration). HTTP 404 — hosted mode (disabled).

**Notes:** HTTP-only: `POST /api/auth/login`. Disabled in hosted mode.

---

#### `auth.users.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `auth.users` |

**Input:**
```typescript
{}   // No parameters
```

**Output:**
```typescript
{
  users: Array<{
    entityId: string;
    username: string;
    displayName?: string;
    relationship?: string;       // From "relationship:*" entity tag
    tags?: string[];
    isOwner: boolean;
  }>;
}
```

---

#### `auth.users.create`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `auth.users` |

**Input:**
```typescript
{
  username: string;              // minLength: 1; normalized to lowercase
  password: string;              // minLength: 8
  displayName?: string;
  relationship?: string;         // Stored as "relationship:{value}" entity tag
  tags?: string[];
  entityId?: string;             // Auto-generated if omitted
  isOwner?: boolean;             // Default: false
}
```

**Output:**
```typescript
{
  ok: true;
  user: {
    entityId: string;
    username: string;
    displayName?: string;
    relationship?: string;
    tags?: string[];
    isOwner: boolean;
  };
}
```

**Errors:** `INVALID_REQUEST` — validation failure (password too short, etc.).

---

#### `auth.users.setPassword`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `auth.users.password` |

**Input:**
```typescript
{
  entityId?: string;     // Takes priority; identifies user
  username?: string;     // Fallback; resolved to entityId via contacts table
  password: string;      // minLength: 8
}
```

**Output:**
```typescript
{
  ok: true;
}
```

**Errors:** `INVALID_REQUEST` — neither entityId nor username resolves to a known user.

---

#### `auth.tokens.ingress.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `auth.tokens.ingress` |

**Input:**
```typescript
{
  entityId?: string;
  includeRevoked?: boolean;      // Default: false
  includeExpired?: boolean;      // Default: false
  limit?: number;                // integer 1..1000
  offset?: number;               // integer >= 0
}
```

**Output:**
```typescript
{
  credentials: Array<{
    id: string;
    audience: "ingress";
    entityId: string;
    role: string;
    scopes: string[];
    label: string | null;
    createdAt: EpochMs;
    lastUsedAt: EpochMs | null;
    expiresAt: EpochMs | null;
    revokedAt: EpochMs | null;
  }>;
}
```

---

#### `auth.tokens.ingress.create`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `auth.tokens.ingress` |

**Input:**
```typescript
{
  entityId: string;              // Must reference existing entity
  role?: string;                 // Default: "customer"
  scopes?: string[];             // Default: []
  label?: string | null;
  expiresAt?: EpochMs | null;    // null = no expiry
}
```

**Output:**
```typescript
{
  ok: true;
  credential: IngressCredential;   // Same shape as in list
  token: string;                   // Raw bearer token (only returned at creation)
}
```

**Errors:** `INVALID_REQUEST` — unknown entity ID.

---

#### `auth.tokens.ingress.revoke`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `auth.tokens.ingress` |

**Input:**
```typescript
{
  id: string;            // Token ID to revoke
}
```

**Output:**
```typescript
{
  ok: true;
  revoked: boolean;      // false if already revoked or not found
}
```

---

#### `auth.tokens.ingress.rotate`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `auth.tokens.ingress` |

**Input:**
```typescript
{
  id: string;                    // ID of existing token to rotate
  role?: string;                 // Inherits from previous if omitted
  scopes?: string[];             // Inherits from previous if omitted
  label?: string | null;         // Inherits from previous if omitted
  expiresAt?: EpochMs | null;    // Inherits from previous if omitted
}
```

**Output:**
```typescript
{
  ok: true;
  previousId: string;            // Old token ID
  credential: IngressCredential; // New credential
  token: string;                 // New raw bearer token
}
```

**Errors:** `INVALID_REQUEST` — unknown token, or token already revoked.

**Notes:** Atomic: creates new token + revokes old in one transaction.

---

### Group 3: Config (5 operations)

Runtime configuration management with optimistic concurrency.

---

#### `config.get`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `config` |

**Input:**
```typescript
{}   // No parameters
```

**Output:**
```typescript
{
  path: string;                          // Absolute config file path
  exists: boolean;
  raw: string | null;                    // JSON5 source (redacted)
  parsed: unknown;                       // Parsed object (redacted)
  valid: boolean;
  config: Record<string, unknown>;       // Resolved config (redacted)
  hash?: string;                         // Content hash for concurrency
  issues: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
  legacyIssues: Array<{ path: string; message: string }>;
}
```

**Notes:** Sensitive fields (matching `/token|password|secret|api.?key/i`) are replaced with `"__NEXUS_REDACTED__"`.

---

#### `config.schema`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `config.schema` |

**Input:**
```typescript
{}   // No parameters
```

**Output:**
```typescript
{
  schema: unknown;                       // Full JSON Schema for config
  uiHints: Record<string, {
    label?: string;
    help?: string;
    group?: string;
    order?: number;
    advanced?: boolean;
    sensitive?: boolean;
    placeholder?: string;
    itemTemplate?: unknown;
  }>;
  version: string;
  generatedAt: string;                   // ISO 8601
}
```

---

#### `config.set`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `config` |

**Input:**
```typescript
{
  raw: string;           // minLength: 1; full JSON5 config source
  baseHash?: string;     // Required if config file already exists (optimistic concurrency)
}
```

**Output:**
```typescript
{
  ok: true;
  path: string;
  config: Record<string, unknown>;   // Written config (redacted)
}
```

**Errors:** `INVALID_REQUEST` — JSON5 parse error, validation failure, hash mismatch (conflict), redacted sentinel restoration failure.

---

#### `config.patch`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `config` |

**Input:**
```typescript
{
  raw: string;                   // minLength: 1; JSON5 merge-patch object
  baseHash?: string;             // Optimistic concurrency hash
  sessionKey?: string;           // For restart sentinel
  note?: string;                 // For restart sentinel
  restartDelayMs?: number;       // integer >= 0; delay before restart
}
```

**Output:**
```typescript
{
  ok: true;
  path: string;
  config: Record<string, unknown>;       // Written config (redacted)
  restart: {
    ok: boolean;
    pid: number;
    signal: "SIGUSR1";
    delayMs: number;                     // 0..60_000, default 2000
    reason?: string;
    mode: "emit" | "signal";
  };
  sentinel: {
    path: string | null;
    payload: {
      kind: "config-apply";
      status: "ok";
      ts: EpochMs;
      sessionKey?: string;
      message?: string | null;
    };
  };
}
```

**Errors:** `INVALID_REQUEST` — parse error, existing config invalid, hash mismatch, merged config fails validation.

**Notes:** Triggers runtime restart. `raw` must parse to an object (not array/primitive).

---

#### `config.apply`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `config` |

**Input:**
```typescript
{
  raw: string;                   // minLength: 1; full JSON5 config (replaces entirely)
  baseHash?: string;
  sessionKey?: string;
  note?: string;
  restartDelayMs?: number;       // integer >= 0
}
```

**Output:** Same shape as `config.patch`.

**Notes:** Full replace (not merge-patch). Triggers runtime restart.

---

### Group 4: Chat & Ingress (4 operations)

Event ingestion and chat session interaction.

---

#### `event.ingest`

| Field | Value |
|-------|-------|
| Mode | `event` |
| Action | `write` |
| Resource | `ingress.event` |

This operation dispatches to one of three sub-handlers based on `ingress_type`.

**Input (common):**
```typescript
{
  ingress_type: "chat" | "agent" | "system";
  // ...remaining fields depend on ingress_type
}
```

##### `ingress_type: "chat"`

```typescript
{
  ingress_type: "chat";
  sessionKey: string;
  message: string;                       // Must be non-empty (or have attachments)
  thinking?: string;
  deliver?: boolean;
  attachments?: Array<{
    type?: string;
    mimeType?: string;
    fileName?: string;
    content?: unknown;                   // string or ArrayBufferView
  }>;
  timeoutMs?: number;                    // integer >= 0
  idempotencyKey: string;               // Used as run ID
}
```

**Output:**
```typescript
// Normal:
{ runId: string; status: "started" }

// Duplicate in-flight:
{ runId: string; status: "in_flight" }

// Stop command:
{ ok: true; aborted: boolean; runIds: string[] }

// Error:
{ runId: string; status: "error"; summary: string }
```

##### `ingress_type: "agent"`

```typescript
{
  ingress_type: "agent";
  message: string;
  personaRef?: string;                   // Must be a known agent ID
  to?: string;
  replyTo?: string;
  sessionId?: string;
  sessionKey?: string;
  thinking?: string;
  deliver?: boolean;
  attachments?: Array<{ type?: string; mimeType?: string; fileName?: string; content?: unknown }>;
  platform?: string;                     // Must be a known channel
  replyPlatform?: string;
  accountId?: string;
  replyAccountId?: string;
  threadId?: string;
  groupId?: string;
  groupChannel?: string;
  groupSpace?: string;
  timeout?: number;                      // Seconds
  lane?: string;
  extraSystemPrompt?: string;
  idempotencyKey: string;
  label?: string;                        // 1..64 chars
  spawnedBy?: string;
}
```

**Output (immediate):**
```typescript
{ runId: string; status: "accepted"; acceptedAt: EpochMs }
```

**Output (async final, pushed on WebSocket):**
```typescript
{ runId: string; status: "ok"; summary: string; result: unknown }
// or
{ runId: string; status: "error"; summary: string }
```

**Notes:** Fire-and-forget. Immediate ack, then async execution.

##### `ingress_type: "system"`

```typescript
{
  ingress_type: "system";
  text: string;                          // Required, non-empty
  deviceId?: string;
  instanceId?: string;
  host?: string;
  ip?: string;
  mode?: string;
  version?: string;
  platform?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  lastInputSeconds?: number;
  reason?: string;
  roles?: string[];
  scopes?: string[];
  tags?: string[];
}
```

**Output:**
```typescript
{ ok: true }
```

---

#### `chat.history`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `chat.history` |

**Input:**
```typescript
{
  sessionKey: string;
  limit?: number;          // integer 1..1000; default: 200
}
```

**Output:**
```typescript
{
  sessionKey: string;
  sessionId: string;
  messages: unknown[];                   // Sanitized message objects
  thinkingLevel?: string;
  verboseLevel?: string;
}
```

**Notes:** Messages capped by count (max 1000) and JSON byte size.

---

#### `chat.abort`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `chat` |

**Input:**
```typescript
{
  sessionKey: string;
  runId?: string;          // If omitted, aborts ALL runs for the session
}
```

**Output:**
```typescript
{
  ok: true;
  aborted: boolean;        // True if at least one run was aborted
  runIds: string[];         // IDs of aborted runs
}
```

**Errors:** `INVALID_REQUEST` — runId doesn't match sessionKey.

---

#### `chat.inject`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `chat.inject` |

**Input:**
```typescript
{
  sessionKey: string;
  message: string;           // Assistant message text to inject
  label?: string;            // maxLength: 100
}
```

**Output:**
```typescript
{
  ok: true;
  messageId: string;
}
```

**Notes:** Appends an assistant-role message. Broadcast to all connected clients.

---

### Group 5: Sessions (9 operations)

Session lifecycle management.

---

#### `sessions.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `sessions` |

**Input:**
```typescript
{
  limit?: number;                        // integer >= 1
  activeMinutes?: number;                // integer >= 1
  includeGlobal?: boolean;
  includeUnknown?: boolean;
  includeDerivedTitles?: boolean;
  includeLastMessage?: boolean;
  label?: SessionLabel;
  spawnedBy?: string;
  agentId?: string;
  search?: string;
}
```

**Output:**
```typescript
{
  ts: EpochMs;
  path: string;
  count: number;
  defaults: {
    modelProvider: string | null;
    model: string | null;
    contextTokens: number | null;
  };
  sessions: Array<{
    key: string;
    kind: "direct" | "group" | "global" | "unknown";
    agentId?: string;
    label?: string;
    displayName?: string;
    derivedTitle?: string;
    lastMessagePreview?: string;
    platform?: string;
    subject?: string;
    groupChannel?: string;
    space?: string;
    chatType?: string;
    origin?: string;
    updatedAt: number | null;
    sessionId?: string;
    systemSent?: boolean;
    abortedLastRun?: boolean;
    thinkingLevel?: string;
    verboseLevel?: string;
    reasoningLevel?: string;
    elevatedLevel?: string;
    sendPolicy?: "allow" | "deny";
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    responseUsage?: "on" | "off" | "tokens" | "full";
    modelProvider?: string;
    model?: string;
    contextTokens?: number;
    deliveryContext?: unknown;
    lastPlatform?: string;
    lastTo?: string;
    lastAccountId?: string;
    lastThreadId?: string;
  }>;
}
```

---

#### `sessions.resolve`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `sessions` |

**Input:**
```typescript
{
  key?: string;                // Exactly ONE of key/sessionId/label required
  sessionId?: string;
  label?: SessionLabel;
  agentId?: string;
  spawnedBy?: string;
  includeGlobal?: boolean;
  includeUnknown?: boolean;
}
```

**Output:**
```typescript
{
  ok: true;
  key: string;               // Resolved session key
}
```

**Errors:** `INVALID_REQUEST` — multiple or no selectors provided.

---

#### `sessions.preview`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `sessions.history` |

**Input:**
```typescript
{
  keys: string[];            // minItems: 1; capped at 64 server-side
  limit?: number;            // integer >= 1; default: 12
  maxChars?: number;         // integer >= 20; default: 240
}
```

**Output:**
```typescript
{
  ts: EpochMs;
  previews: Array<{
    key: string;
    status: "ok" | "empty" | "missing" | "error";
    items: Array<{
      role: "user" | "assistant" | "tool" | "system" | "other";
      text: string;
    }>;
  }>;
}
```

---

#### `sessions.import`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `sessions.import` |

**Input:**
```typescript
{
  source: "aix";
  runId?: string;
  mode: "backfill" | "tail";
  personaId?: string;
  idempotencyKey: string;
  items: Array<{                         // 1..256 items
    sourceProvider: string;
    sourceSessionId: string;
    sourceSessionFingerprint: string;
    importedAtMs: EpochMs;
    session: {
      labelHint?: SessionLabel;
      createdAtMs?: EpochMs;
      updatedAtMs?: EpochMs;
      model?: string;
      provider?: string;
      workspacePath?: string;
      project?: string;
      isSubagent?: boolean;
      parentSourceSessionId?: string;
      parentSourceMessageId?: string;
      spawnToolCallId?: string;
      taskDescription?: string;
      taskStatus?: string;
      metadata?: Record<string, unknown>;
    };
    turns: Array<{
      sourceTurnId: string;
      parentSourceTurnId?: string;
      startedAtMs: EpochMs;
      completedAtMs?: EpochMs;
      model?: string;
      provider?: string;
      inputTokens?: number;
      outputTokens?: number;
      cachedInputTokens?: number;
      cacheWriteTokens?: number;
      reasoningTokens?: number;
      totalTokens?: number;
      responseMessageSourceId?: string;
      queryMessageSourceIds?: string[];
      metadata?: Record<string, unknown>;
    }>;
    messages: Array<{
      sourceMessageId: string;
      sourceTurnId?: string;
      role: "user" | "assistant" | "system" | "tool";
      content?: string;
      sequence: number;
      createdAtMs: EpochMs;
      thinking?: string;
      contextJson?: unknown;
      metadataJson?: unknown;
    }>;
    toolCalls?: Array<{
      sourceToolCallId: string;
      sourceTurnId?: string;
      sourceMessageId?: string;
      toolName: string;
      toolNumber?: number;
      paramsJson?: unknown;
      resultJson?: unknown;
      status?: "pending" | "running" | "completed" | "failed";
      spawnedSourceSessionId?: string;
      startedAtMs: EpochMs;
      completedAtMs?: EpochMs;
      sequence: number;
      error?: string;
    }>;
  }>;
}
```

**Output:**
```typescript
{
  ok: true;
  runId: string;
  imported: number;
  upserted: number;
  skipped: number;
  failed: number;
  results: Array<{
    sourceProvider: string;
    sourceSessionId: string;
    sessionLabel?: string;
    status: "imported" | "upserted" | "skipped" | "failed";
    reason?: string;
  }>;
}
```

---

#### `sessions.import.chunk`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `sessions.import` |

**Input:**
```typescript
{
  source: "aix";
  runId?: string;
  mode: "backfill" | "tail";
  personaId?: string;
  idempotencyKey: string;
  uploadId: string;
  chunkIndex: number;            // integer >= 0
  chunkTotal: number;            // integer >= 1
  encoding: "gzip+base64";
  data: string;                  // Compressed + base64-encoded chunk
  sourceProvider: string;
  sourceSessionId: string;
  sourceSessionFingerprint: string;
}
```

**Output:**
```typescript
{
  ok: true;
  runId: string;
  uploadId: string;
  status: "staged" | "completed";
  received: number;
  total: number;
  import?: SessionsImportResponse;   // Present when status is "completed"
}
```

---

#### `sessions.patch`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `sessions` |

**Input:**
```typescript
{
  key: string;
  label?: SessionLabel | null;
  thinkingLevel?: string | null;
  verboseLevel?: string | null;
  reasoningLevel?: string | null;
  responseUsage?: "off" | "tokens" | "full" | "on" | null;
  elevatedLevel?: string | null;
  execHost?: string | null;
  execSecurity?: string | null;
  execAsk?: string | null;
  execNode?: string | null;
  model?: string | null;
  spawnedBy?: string | null;
  sendPolicy?: "allow" | "deny" | null;
  groupActivation?: "mention" | "always" | null;
}
```

**Output:**
```typescript
{
  ok: true;
  path: string;
  key: string;
  entry: { sessionId: string; updatedAt: EpochMs };
  resolved?: { modelProvider?: string; model?: string };
}
```

**Errors:** `INVALID_REQUEST` — session not found.

---

#### `sessions.reset`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `sessions` |

**Input:**
```typescript
{
  key: string;
}
```

**Output:**
```typescript
{
  ok: true;
  key: string;
  entry: { sessionId: string; updatedAt: EpochMs };
}
```

---

#### `sessions.delete`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `sessions` |

**Input:**
```typescript
{
  key: string;
  deleteTranscript?: boolean;    // Legacy, ignored
}
```

**Output:**
```typescript
{
  ok: true;
  key: string;
  deleted: boolean;              // false if session not found
  archived: string[];            // Always empty in ledger mode
}
```

**Notes:** Aborts active runs, clears queues, marks session as deleted.

---

#### `sessions.compact`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `sessions.compaction` |

**Input:**
```typescript
{
  key: string;
  maxLines?: number;             // Legacy, ignored
}
```

**Output:**
```typescript
{
  ok: true;
  key: string;
  compacted: false;              // Always false — compaction is ledger-managed
  reason: "compaction is ledger-managed per turn";
}
```

---

### Group 6: Agents (9 operations)

Agent persona management and file access.

---

#### `agents.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `agents` |

**Input:**
```typescript
{}   // No parameters
```

**Output:**
```typescript
{
  defaultId: string;
  mainKey: string;
  scope: "per-sender" | "global";
  agents: Array<{
    id: string;
    name?: string;
    identity?: {
      name?: string;
      theme?: string;
      emoji?: string;
      avatar?: string;
      avatarUrl?: string;
    };
  }>;
}
```

---

#### `agents.create`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `agents` |

**Input:**
```typescript
{
  name: string;
  workspace: string;             // Filesystem path
  emoji?: string;
  avatar?: string;
}
```

**Output:**
```typescript
{
  ok: true;
  agentId: string;               // Normalized ID
  name: string;
  workspace: string;             // Resolved path
}
```

**Errors:** `INVALID_REQUEST` — reserved agent ID, agent already exists.

**Notes:** Creates workspace directory with bootstrap files.

---

#### `agents.update`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `agents` |

**Input:**
```typescript
{
  agentId: string;
  name?: string;
  workspace?: string;
  model?: string;
  avatar?: string;
}
```

**Output:**
```typescript
{
  ok: true;
  agentId: string;
}
```

**Errors:** `INVALID_REQUEST` — agent not found.

---

#### `agents.delete`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `agents` |

**Input:**
```typescript
{
  agentId: string;
  deleteFiles?: boolean;         // Default: true
}
```

**Output:**
```typescript
{
  ok: true;
  agentId: string;
}
```

**Errors:** `INVALID_REQUEST` — default agent cannot be deleted, agent not found.

---

#### `agents.files.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `agents.files` |

**Input:**
```typescript
{
  agentId: string;
}
```

**Output:**
```typescript
{
  agentId: string;
  workspace: string;
  files: Array<{
    name: string;                // One of: AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md,
                                 //         USER.md, BOOTSTRAP.md, MEMORY.md, MEMORY.yaml
    path: string;                // Absolute path
    missing: boolean;
    size?: number;               // Present if !missing
    updatedAtMs?: EpochMs;       // Present if !missing
  }>;
}
```

---

#### `agents.files.get`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `agents.files` |

**Input:**
```typescript
{
  agentId: string;
  name: string;                  // Must be a known file name (see agents.files.list)
}
```

**Output:**
```typescript
{
  agentId: string;
  workspace: string;
  file: {
    name: string;
    path: string;
    missing: boolean;
    size?: number;
    updatedAtMs?: EpochMs;
    content?: string;            // UTF-8 content, present if !missing
  };
}
```

---

#### `agents.files.set`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `agents.files` |

**Input:**
```typescript
{
  agentId: string;
  name: string;                  // Must be a known file name
  content: string;               // New content (can be empty)
}
```

**Output:**
```typescript
{
  ok: true;
  agentId: string;
  workspace: string;
  file: {
    name: string;
    path: string;
    missing: false;
    size?: number;
    updatedAtMs?: EpochMs;
    content: string;
  };
}
```

---

#### `agent.identity.get`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `agents.identity` |

**Input:**
```typescript
{
  agentId?: string;
  sessionKey?: string;           // Derive agent from session
}
```

**Output:**
```typescript
{
  agentId: string;
  name?: string;
  avatar?: string;               // URL or data URI
  emoji?: string;
}
```

**Errors:** `INVALID_REQUEST` — agentId/sessionKey persona mismatch.

---

#### `agent.wait`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `agents.runs` |

**Input:**
```typescript
{
  runId: string;
  timeoutMs?: number;            // integer >= 0; default: 30000
}
```

**Output:**
```typescript
// On completion:
{
  runId: string;
  status: string;                // "ok", "error", "failed", "denied"
  startedAt?: EpochMs;
  endedAt?: EpochMs;
  error?: string;
}

// On timeout:
{
  runId: string;
  status: "timeout";
}
```

---

### Group 7: Memory Review (11 operations)

Read-only inspection of the memory system's processed data.

---

#### `memory.review.runs.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `memory.review` |

**Input:**
```typescript
{
  limit?: number;                // Default: 100, max: 500
  offset?: number;               // Default: 0
  platform?: string;
  status?: string;
}
```

**Output:**
```typescript
{
  limit: number;
  offset: number;
  runs: Array<{
    id: string;
    platform: string | null;
    from_time: number | null;
    from_time_iso: string | null;
    to_time: number | null;
    to_time_iso: string | null;
    total_episodes: number;
    status: string;
    started_at: EpochMs;
    started_at_iso: string | null;
    completed_at: EpochMs | null;
    completed_at_iso: string | null;
    created_at: EpochMs;
    created_at_iso: string | null;
    counts: { pending: number; in_progress: number; completed: number; failed: number };
    facts_created: number;
    entities_created: number;
  }>;
}
```

---

#### `memory.review.run.get`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `memory.review` |

**Input:**
```typescript
{
  run_id: string;
}
```

**Output:**
```typescript
{
  run: MemoryReviewRun;          // Same shape as runs.list entry
}
```

**Errors:** `INVALID_REQUEST` — run not found.

---

#### `memory.review.run.episodes.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `memory.review` |

**Input:**
```typescript
{
  run_id: string;
}
```

**Output:**
```typescript
{
  run: MemoryReviewRun;
  episodes: Array<{
    id: string;
    run_id: string;
    platform: string | null;
    thread_id: string | null;
    event_count: number;
    token_estimate: number;
    status: string;
    facts_created: number;
    entities_created: number;
    started_at: EpochMs | null;
    started_at_iso: string | null;
    completed_at: EpochMs | null;
    completed_at_iso: string | null;
    error_message: string | null;
  }>;
}
```

---

#### `memory.review.episode.get`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `memory.review` |

**Input:**
```typescript
{
  episode_id: string;
}
```

**Output:**
```typescript
{
  episode: MemoryReviewEpisode;
  timeline: Array<{
    event_id: string;
    platform: string;
    thread_id: string | null;
    reply_to_event_id: string | null;
    sender_id: string;
    timestamp: EpochMs;
    timestamp_iso: string | null;
    content_type: string;
    content: string;
    attachments: Array<{
      id: string;
      source_attachment_id: string | null;
      filename: string | null;
      mime_type: string | null;
      media_type: string | null;
      size_bytes: number | null;
      local_path: string | null;
      url: string | null;
      metadata: Record<string, unknown> | null;
    }>;
  }>;
}
```

---

#### `memory.review.episode.outputs.get`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `memory.review` |

**Input:**
```typescript
{
  episode_id: string;
}
```

**Output:**
```typescript
{
  episode_id: string;
  facts: MemoryFact[];
  entities: MemoryEntity[];
  fact_entities: Array<{ fact_id: string; entity_id: string }>;
  observations: MemoryObservation[];
  observation_facts: Array<{ analysis_run_id: string; fact_id: string; linked_at: EpochMs; linked_at_iso: string | null }>;
  causal_links: Array<{ id: string; from_fact_id: string; to_fact_id: string; strength: number; created_at: EpochMs; created_at_iso: string | null }>;
}
```

---

#### `memory.review.entity.get`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `memory.review` |

**Input:**
```typescript
{
  entity_id: string;
}
```

**Output:**
```typescript
{
  entity: MemoryEntity;
  linked_facts: MemoryFact[];
  linked_observations: MemoryObservation[];
  fact_links: Array<{ fact_id: string; entity_id: string }>;
}
```

---

#### `memory.review.fact.get`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `memory.review` |

**Input:**
```typescript
{
  fact_id: string;
}
```

**Output:**
```typescript
{
  fact: MemoryFact;
  source_episode: MemoryReviewEpisode | null;
  source_event: MemoryEvent | null;
  entities: MemoryEntity[];
  fact_links: Array<{ fact_id: string; entity_id: string }>;
  observations: MemoryObservation[];
  observation_facts: Array<{ analysis_run_id: string; fact_id: string; linked_at: EpochMs; linked_at_iso: string | null }>;
  causal_in: Array<{ id: string; from_fact_id: string; to_fact_id: string; strength: number; created_at: EpochMs; created_at_iso: string | null; related_fact_text: string }>;
  causal_out: Array<{ id: string; from_fact_id: string; to_fact_id: string; strength: number; created_at: EpochMs; created_at_iso: string | null; related_fact_text: string }>;
}
```

---

#### `memory.review.observation.get`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `memory.review` |

**Input:**
```typescript
{
  observation_id: string;
}
```

**Output:**
```typescript
{
  observation: MemoryObservation;
  head_observation_id: string;
  version_chain: MemoryObservation[];
  supporting_facts: MemoryFact[];
  supporting_entities: MemoryEntity[];
  source_episode: MemoryReviewEpisode | null;
}
```

---

#### `memory.review.quality.summary`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `memory.review` |

**Input:**
```typescript
{
  run_id?: string;               // Scope to a backfill run
}
```

**Output:**
```typescript
{
  scope: { mode: "run" | "global"; run_id: string | null };
  buckets: {
    unconsolidated_facts: QualityBucket;
    facts_missing_source_episode_id: QualityBucket;
    facts_without_entities: QualityBucket;
    entities_unknown_or_identifier_like: QualityBucket;
    stale_observations_recently_touched: QualityBucket;
    episodes_failed: QualityBucket;
  };
}

type QualityBucket = {
  key: string;
  label: string;
  description: string;
  count: number;
};
```

---

#### `memory.review.quality.items.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `memory.review` |

**Input:**
```typescript
{
  bucket: string;                // One of the 6 quality bucket keys
  run_id?: string;
  limit?: number;                // Default: 100, max: 500
  offset?: number;               // Default: 0
}
```

**Output:**
```typescript
{
  bucket: string;
  scope: { mode: "run" | "global"; run_id: string | null };
  limit: number;
  offset: number;
  total: number;
  items: Array<{
    id: string;                  // "{bucket}:{record_id}"
    bucket: string;
    record_type: "fact" | "entity" | "episode" | "observation";
    record_id: string;
    primary_text: string;
    secondary_text: string | null;
    run_id: string | null;
    status: string;
    timestamp: EpochMs | null;
    timestamp_iso: string | null;
  }>;
}
```

---

#### `memory.review.search`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `memory.review` |

**Input:**
```typescript
{
  query?: string;                // Search text; empty returns all
  type?: "all" | "facts" | "entities" | "observations";   // Default: "all"
  limit?: number;                // Default: 50, max: 200
}
```

**Output:**
```typescript
{
  query: string;
  type: "all" | "facts" | "entities" | "observations";
  limit: number;
  facts: MemoryFact[];                   // Present for "all" or "facts"
  entities: MemoryEntity[];              // Present for "all" or "entities"
  observations: MemoryObservation[];     // Present for "all" or "observations"
}
```

---

## Shared Memory Types

Used across memory.review operations:

```typescript
type MemoryFact = {
  id: string;
  text: string;
  context: string | null;
  as_of: EpochMs;
  as_of_iso: string | null;
  ingested_at: EpochMs;
  ingested_at_iso: string | null;
  source_episode_id: string | null;
  source_event_id: string | null;
  is_consolidated: boolean;
};

type MemoryEntity = {
  id: string;
  name: string;
  type: string | null;
  normalized: string | null;
  is_user: boolean;
  mention_count: number;
  first_seen: EpochMs | null;
  first_seen_iso: string | null;
  last_seen: EpochMs | null;
  last_seen_iso: string | null;
  created_at: EpochMs;
  created_at_iso: string | null;
  updated_at: EpochMs;
  updated_at_iso: string | null;
};

type MemoryObservation = {
  id: string;
  episode_id: string | null;
  parent_id?: string | null;
  status: string;
  output_text: string | null;
  created_at: EpochMs;
  created_at_iso: string | null;
  started_at: EpochMs | null;
  started_at_iso: string | null;
  completed_at: EpochMs | null;
  completed_at_iso: string | null;
  is_stale: boolean;
};

type MemoryEvent = {
  event_id: string;
  platform: string;
  thread_id: string | null;
  reply_to_event_id: string | null;
  sender_id: string;
  timestamp: EpochMs;
  timestamp_iso: string | null;
  content_type: string;
  content: string;
  attachments: Array<{
    id: string;
    source_attachment_id: string | null;
    filename: string | null;
    mime_type: string | null;
    media_type: string | null;
    size_bytes: number | null;
    local_path: string | null;
    url: string | null;
    metadata: Record<string, unknown> | null;
  }>;
};
```

---

## Tier 2: Platform Capabilities

Adapter management, delivery, and scheduled operations.

---

### Group 8: Adapter Connections (12 operations)

Connection lifecycle management for adapters. Handles credential storage, OAuth flows, and connection testing. Most operations delegate to the adapter binary for info/health checks.

---

#### `adapter.connections.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `adapter.connections` |

**Input:**
```typescript
{}   // No parameters
```

**Output:**
```typescript
{
  adapters: Array<{
    adapter: string;
    name: string;
    status: "connected" | "disconnected" | "error" | "expired";
    authMethod: "oauth2" | "api_key" | "file_upload" | "custom_flow" | null;
    auth?: unknown;
    account: string | null;
    lastSync: EpochMs | null;
    error: string | null;
    metadata?: Record<string, unknown>;
  }>;
}
```

**Notes:** Per-adapter errors are caught gracefully and represented as entries with `status: "error"`. Delegates to adapter binary for `adapter.info` and `adapter.health`.

---

#### `adapter.connections.status`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `adapter.connections` |

**Input:**
```typescript
{
  adapter: string;
}
```

**Output:** Single `AdapterConnectionEntry` (same shape as list items).

---

#### `adapter.connections.oauth.start`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `pair` |
| Resource | `adapter.connections.oauth` |

**Input:**
```typescript
{
  adapter: string;
  methodIndex?: number;          // integer >= 0; selects which auth method
  redirectBaseUrl?: string;
}
```

**Output:**
```typescript
{
  redirectUrl: string;           // Full OAuth authorization URL
  state: string;                 // UUID state token
  expiresAt: EpochMs;           // 10-minute TTL
}
```

**Errors:** `UNAVAILABLE` — adapter doesn't support OAuth, missing client metadata, platform credential fetch fails.

---

#### `adapter.connections.oauth.complete`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `pair` |
| Resource | `adapter.connections.oauth` |

**Input:**
```typescript
{
  adapter: string;
  code: string;                  // OAuth authorization code
  state: string;                 // Must match pending flow state token
}
```

**Output:**
```typescript
{
  status: string;                // "connected"
  account: string;               // Derived from token response
  service: string;
}
```

**Errors:** `UNAVAILABLE` — invalid/expired state token, adapter mismatch, token exchange failure.

---

#### `adapter.connections.apikey.save`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `adapter.connections.credentials` |

**Input:**
```typescript
{
  adapter: string;
  methodIndex?: number;          // integer >= 0
  account?: string;
  fields: Record<string, string>;  // Key-value credential fields
}
```

**Output:**
```typescript
{
  status: string;                // "connected" | "error" | "expired"
  account: string;
  service: string;
  error?: string;                // Present when status != "connected"
}
```

**Notes:** Validates required fields from adapter auth manifest. Health-checks the credential; rolls back on failure.

---

#### `adapter.connections.upload`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `adapter.connections.upload` |

**Input:**
```typescript
{
  adapter: string;
  fileName: string;              // Original filename
  filePath: string;              // Absolute path to uploaded file
}
```

**Output:**
```typescript
{
  status: string;                // "imported"
  preview: {
    rows: number;
    columns: string[];
    dateRange: null;
  };
}
```

**Errors:** `UNAVAILABLE` — adapter doesn't support file_upload, file not found, file type not in accept list.

---

#### `adapter.connections.custom.start`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `pair` |
| Resource | `adapter.connections.custom` |

**Input:**
```typescript
{
  adapter: string;
  methodIndex?: number;
  account?: string;
  payload?: Record<string, unknown>;
}
```

**Output:**
```typescript
{
  status: "pending" | "requires_input" | "completed" | "failed" | "cancelled";
  sessionId?: string;
  account?: string;
  service?: string;
  message?: string;
  instructions?: string;
  fields?: Array<{
    name: string;
    label: string;
    type: "secret" | "text" | "select";
    required: boolean;
    placeholder?: string;
    options?: Array<{ label: string; value: string }>;
  }>;
  secretFieldsPresent?: boolean;
  metadata?: Record<string, unknown>;
}
```

---

#### `adapter.connections.custom.submit`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `pair` |
| Resource | `adapter.connections.custom` |

**Input:**
```typescript
{
  adapter: string;
  sessionId: string;             // Must match existing pending flow
  account?: string;
  payload?: Record<string, unknown>;
}
```

**Output:** Same shape as `custom.start`.

---

#### `adapter.connections.custom.status`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `adapter.connections.custom` |

**Input:**
```typescript
{
  adapter: string;
  sessionId: string;
  account?: string;
}
```

**Output:** Same shape as `custom.start`. Falls back to persisted state if adapter doesn't implement `adapter.setup.status`.

---

#### `adapter.connections.custom.cancel`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `pair` |
| Resource | `adapter.connections.custom` |

**Input:**
```typescript
{
  adapter: string;
  sessionId: string;
  account?: string;
}
```

**Output:**
```typescript
{
  status: "cancelled";
  sessionId: string;
  account: string;
  service: string;
}
```

**Notes:** Best-effort cancel to adapter binary. Failure is silently ignored.

---

#### `adapter.connections.test`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `adapter.connections` |

**Input:**
```typescript
{
  adapter: string;
  account?: string;
}
```

**Output:**
```typescript
{
  ok: boolean;
  latency: number;               // ms
  account: string;
  error?: string | null;         // Present when ok=false
}
```

**Notes:** Delegates to adapter binary `adapter.health`. Latency measured directly.

---

#### `adapter.connections.disconnect`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `adapter.connections` |

**Input:**
```typescript
{
  adapter: string;
  account?: string;
}
```

**Output:**
```typescript
{
  status: "disconnected";
  account?: string;
  service?: string;
}
```

**Notes:** Stops monitor, removes credentials, removes connection record. No delegation to adapter binary.

---

### Group 9: Adapter Capabilities (17 operations)

Direct adapter binary operations and delivery. Most are passthrough to the adapter binary.

---

#### `adapter.info`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `adapter.info` |

**Input:**
```typescript
{
  adapter: string;
}
```

**Output:**
```typescript
{
  platform: string;
  name: string;
  version: string;
  operations: string[];          // Supported operation IDs
  credential_service?: string;
  multi_account: boolean;
  platform_capabilities: {
    text_limit?: number;
    supports_markdown?: boolean;
    supports_threads?: boolean;
    supports_reactions?: boolean;
    supports_streaming?: boolean;
    supports_edit?: boolean;
    supports_delete?: boolean;
    max_message_length?: number;
    max_attachments?: number;
    [key: string]: unknown;
  };
  auth?: {
    methods: Array<{
      type: "oauth2" | "api_key" | "file_upload" | "custom_flow";
      label: string;
      icon: string;
      service?: string;
      scopes?: string[];
      fields?: Array<{ name: string; label: string; type: "secret" | "text" | "select"; required: boolean }>;
      accept?: string[];
    }>;
    setupGuide?: string;
  };
}
```

---

#### `adapter.health`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `adapter.health` |

**Input:**
```typescript
{
  adapter: string;
  account: string;
}
```

**Output:**
```typescript
{
  connected: boolean;
  account: string;
  last_event_at?: EpochMs;
  error?: string;
  details?: Record<string, unknown>;
}
```

---

#### `adapter.accounts.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `adapter.accounts` |

**Input:**
```typescript
{
  adapter: string;
}
```

**Output:**
```typescript
{
  accounts: Array<{
    id: string;
    display_name?: string;
    credential_ref?: string;
    status: "ready" | "active" | "error";
  }>;
}
```

---

#### `adapter.monitor.start`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `adapter.monitor` |

**Input:**
```typescript
{
  adapter: string;
  account: string;
}
```

**Output:**
```typescript
{ started: true }
```

---

#### `adapter.monitor.stop`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `adapter.monitor` |

**Input:**
```typescript
{
  adapter: string;
  account: string;
}
```

**Output:**
```typescript
{ stopped: true }
```

---

#### `adapter.control.start`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `adapter.control` |

**Input:**
```typescript
{
  adapter: string;
  account: string;
}
```

**Output:** Opaque result from adapter binary.

---

#### `adapter.setup.start`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `pair` |
| Resource | `adapter.setup` |

**Input:**
```typescript
{
  adapter: string;
  account?: string;
  sessionId?: string;
  payload?: Record<string, unknown>;
}
```

**Output:**
```typescript
{
  status: "pending" | "requires_input" | "completed" | "failed" | "cancelled";
  session_id?: string;
  account?: string;
  service?: string;
  message?: string;
  instructions?: string;
  fields?: unknown[];
  metadata?: Record<string, unknown>;
}
```

---

#### `adapter.setup.submit`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `pair` |
| Resource | `adapter.setup` |

**Input:**
```typescript
{
  adapter: string;
  sessionId: string;
  account?: string;
  payload?: Record<string, unknown>;
}
```

**Output:** Same as `adapter.setup.start`.

---

#### `adapter.setup.status`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `adapter.setup` |

**Input:**
```typescript
{
  adapter: string;
  sessionId: string;
  account?: string;
}
```

**Output:** Same as `adapter.setup.start`.

---

#### `adapter.setup.cancel`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `pair` |
| Resource | `adapter.setup` |

**Input:**
```typescript
{
  adapter: string;
  sessionId: string;
  account?: string;
}
```

**Output:** Same as `adapter.setup.start`.

---

#### `delivery.send`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `delivery.send` |

**Input:**
```typescript
{
  account: string;
  to: string;                    // Recipient identifier
  text: string;                  // Message content
  adapter?: string;              // Direct adapter routing
  platform?: string;             // Resolved via adapterManager
  thread_id?: string;
  reply_to_id?: string;
}
```

**Output:**
```typescript
{
  success: boolean;
  message_ids: string[];
  chunks_sent: number;
  streamed: false;
  error?: string;
}
```

**Notes:** Routes via `adapter` + `account` directly, or resolves via `platform` + `account`.

---

#### `delivery.stream`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `delivery.stream` |

**Input:**
```typescript
{
  adapter: string;
  account: string;
  to: string;
  text?: string;
  thread_id?: string;
  reply_to_id?: string;
  runId?: string;
  sessionLabel?: string;
  events?: Array<Record<string, unknown>>;
}
```

**Output:** Adapter-specific streaming result.

---

#### `delivery.react`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `delivery.react` |

**Not implemented.** Always returns `UNAVAILABLE: "delivery.react not implemented"`.

---

#### `delivery.edit`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `delivery.edit` |

**Not implemented.** Always returns `UNAVAILABLE: "delivery.edit not implemented"`.

---

#### `delivery.delete`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `delivery.delete` |

**Not implemented.** Always returns `UNAVAILABLE: "delivery.delete not implemented"`.

---

#### `delivery.poll`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `delivery.poll` |

**Not implemented.** Always returns `UNAVAILABLE: "delivery.poll not implemented"`.

---

#### `event.backfill`

| Field | Value |
|-------|-------|
| Mode | `event` |
| Action | `write` |
| Resource | `ingress.backfill` |

**Input:**
```typescript
{
  adapter: string;
  account: string;
  since: string;                 // ISO date string or similar
  maxEvents?: number;            // Positive number; caps events processed
}
```

**Output:**
```typescript
{
  processed: number;
  failed: number;
}
```

**Notes:** Adapter emits JSONL event lines. Runtime processes each event via `nex.processEvent()` up to `maxEvents`.

---

### Group 10: Clock/Cron (8 operations)

Scheduled operation dispatch. Manages cron jobs that fire operations on a timer.

---

#### Shared Cron Types

```typescript
type CronSchedule =
  | { kind: "at"; at: string }                                    // ISO-8601 timestamp
  | { kind: "every"; everyMs: number; anchorMs?: number }         // everyMs >= 1
  | { kind: "cron"; expr: string; tz?: string };                  // Cron expression

type CronPayload =
  | { kind: "systemEvent"; text: string }
  | {
      kind: "agentTurn";
      message: string;
      model?: string;
      thinking?: string;
      timeoutSeconds?: number;           // integer >= 1
      allowUnsafeExternalContent?: boolean;
      deliver?: boolean;
      to?: string;
      bestEffortDeliver?: boolean;
    };

type CronDelivery = {
  mode: "none" | "announce";
  platform?: string;
  to?: string;
  bestEffort?: boolean;
};

type CronJob = {
  id: string;
  agentId?: string;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  createdAtMs: EpochMs;
  updatedAtMs: EpochMs;
  schedule: CronSchedule;
  sessionTarget: "main" | "isolated";
  wakeMode: "queued" | "now";
  payload: CronPayload;
  delivery?: CronDelivery;
  state: {
    nextRunAtMs?: EpochMs;
    runningAtMs?: EpochMs;
    lastRunAtMs?: EpochMs;
    lastStatus?: "ok" | "error" | "skipped";
    lastError?: string;
    lastDurationMs?: number;
    consecutiveErrors?: number;
  };
};
```

---

#### `clock.schedule.wake`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `clock.schedule` |

**Input:**
```typescript
{
  mode: "now" | "queued";
  text: string;                  // Non-empty
}
```

**Output:**
```typescript
{ ok: true }
```

---

#### `clock.schedule.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `clock.schedule` |

**Input:**
```typescript
{
  includeDisabled?: boolean;     // Default: false
}
```

**Output:**
```typescript
{
  jobs: CronJob[];               // Sorted by state.nextRunAtMs ascending
}
```

---

#### `clock.schedule.status`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `clock.schedule` |

**Input:**
```typescript
{}   // No parameters
```

**Output:**
```typescript
{
  enabled: boolean;
  storePath: string;
  jobs: number;                  // Total job count
  nextWakeAtMs: EpochMs | null;
}
```

---

#### `clock.schedule.create`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `clock.schedule` |

**Input:**
```typescript
{
  name: string;
  agentId?: string | null;
  description?: string;
  enabled?: boolean;                     // Default: true
  deleteAfterRun?: boolean;              // Default: true for kind:"at"
  schedule: CronSchedule;
  sessionTarget: "main" | "isolated";    // Default varies by payload.kind
  wakeMode: "queued" | "now";            // Default: "now"
  payload: CronPayload;
  delivery?: CronDelivery;              // Default: {mode:"announce"} for isolated agentTurn
}
```

**Output:** `CronJob` — the created job with generated ID and computed state.

**Errors:** `INVALID_REQUEST` — validation failure. For `kind: "at"` schedules: timestamp must be valid ISO-8601, not more than 1 minute in the past, not more than 10 years in the future.

**Notes:** Extensive input normalization: envelope unwrapping, `atMs` to ISO conversion, `kind` inference, case-insensitive kind matching, legacy field migration to `delivery` block.

---

#### `clock.schedule.update`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `clock.schedule` |

**Input:**
```typescript
{
  id: string;                            // Job ID (also accepts `jobId`)
  patch: {
    name?: string;
    agentId?: string | null;
    description?: string;
    enabled?: boolean;
    deleteAfterRun?: boolean;
    schedule?: CronSchedule;
    sessionTarget?: "main" | "isolated";
    wakeMode?: "queued" | "now";
    payload?: CronPayload;               // Partial — fields are optional
    delivery?: CronDelivery;             // Partial
    state?: Partial<CronJob["state"]>;
  };
}
```

**Output:** `CronJob` — the updated job.

**Errors:** `INVALID_REQUEST` — missing ID, validation failure, timestamp validation failure. Throws if job not found.

---

#### `clock.schedule.remove`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `clock.schedule` |

**Input:**
```typescript
{
  id: string;                    // Also accepts `jobId`
}
```

**Output:**
```typescript
{
  ok: boolean;
  removed: boolean;              // True if job was found and deleted
}
```

---

#### `clock.schedule.run`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `clock.schedule` |

**Input:**
```typescript
{
  id: string;                    // Also accepts `jobId`
  mode?: "due" | "force";       // Default: "force"
}
```

**Output:**
```typescript
{ ok: true; ran: true }
| { ok: true; ran: false; reason: "already-running" }
| { ok: true; ran: false; reason: "not-due" }
```

---

#### `clock.schedule.runs`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `clock.schedule` |

**Input:**
```typescript
{
  id: string;                    // Also accepts `jobId`
  limit?: number;                // integer 1..5000; default: 200
}
```

**Output:**
```typescript
{
  entries: Array<{
    ts: EpochMs;
    jobId: string;
    action: "finished";
    status?: "ok" | "error" | "skipped";
    error?: string;
    summary?: string;
    sessionId?: string;
    sessionKey?: string;
    runAtMs?: EpochMs;
    durationMs?: number;
    nextRunAtMs?: EpochMs;
  }>;
}
```

---

## Tier 3: Supporting Systems

These operations support access control, model management, usage analytics, skills, and device pairing.

---

### Group 11: ACL Approvals (5 operations)

Permission request/approval workflow. Agents request permission via `acl.approval.request`, operators manage via the `acl.requests.*` operations.

---

#### `acl.requests.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `approve` |
| Resource | `acl.requests` |

**Input:**
```typescript
{
  status?: "pending" | "approved" | "denied" | "expired";
  requesterId?: string;
  includeExpired?: boolean;
  limit?: number;              // integer, >= 1
  offset?: number;             // integer, >= 0
}
```

**Output:**
```typescript
{
  requests: AclPermissionRequest[];
}
```

---

#### `acl.requests.show`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `approve` |
| Resource | `acl.requests` |

**Input:**
```typescript
{
  id: string;                  // Required
}
```

**Output:**
```typescript
{
  request: AclPermissionRequest;
}
```

**Errors:** `INVALID_REQUEST` — unknown request id.

---

#### `acl.requests.approve`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `approve` |
| Resource | `acl.requests` |

**Input:**
```typescript
{
  id: string;                  // Required
  mode?: "once" | "day" | "forever";
  responder?: string;
  responseChannel?: string;
  reason?: string;
  platform?: string;
  session?: string;
}
```

**Output:**
```typescript
{
  ok: true;
  request: AclPermissionRequest;
  grantId?: string | null;
}
```

**Side effects:** Broadcasts `acl.approval.resolved` event.

**Errors:** `INVALID_REQUEST` — unknown request id, request already resolved, invalid mode.

---

#### `acl.requests.deny`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `approve` |
| Resource | `acl.requests` |

**Input:**
```typescript
{
  id: string;                  // Required
  responder?: string;
  responseChannel?: string;
}
```

**Output:**
```typescript
{
  ok: true;
  request: AclPermissionRequest;
}
```

**Side effects:** Broadcasts `acl.approval.resolved` event.

**Errors:** `INVALID_REQUEST` — unknown request id, not pending.

---

#### `acl.approval.request`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `approve` |
| Resource | `acl.approvals` |

**Input:**
```typescript
{
  id?: string;                 // Auto-generated UUID if absent
  resources: string[];         // Required, non-empty
  requesterId?: string | null;
  requesterChannel?: string | null;
  kind?: string | null;
  toolName?: string | null;
  toolCallId?: string | null;
  sessionKey?: string | null;
  nexusRequestId?: string | null;
  summary?: string | null;
  reason?: string | null;
  context?: unknown;
  originalMessage?: string | null;
  timeoutMs?: number;          // integer, >= 1; default 120000
}
```

**Output:**
```typescript
{
  id: string;
  decision?: "allow-once" | "allow-always" | "deny" | null;
  createdAtMs: EpochMs;
  expiresAtMs: EpochMs;
}
```

**Side effects:** Broadcasts `acl.approval.requested` event, then blocks until resolution or timeout.

**Errors:** `INVALID_REQUEST` — resources array empty.

---

### Group 12: Models & Usage (6 operations)

Model catalog and usage analytics. Usage operations span token counts, cost tracking, and per-session breakdowns.

---

#### `models.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `models` |

**Input:**
```typescript
{}
```

**Output:**
```typescript
{
  models: Array<{
    id: string;
    name: string;
    provider: string;
    contextWindow?: number;    // integer, >= 1
    reasoning?: boolean;
    input?: Array<"text" | "image">;
  }>;
}
```

---

#### `usage.status`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `usage` |

**Input:**
```typescript
{}
```

**Output:**
```typescript
{
  updatedAt: EpochMs;
  providers: Array<{
    provider: string;          // "anthropic" | "github-copilot" | "google-gemini-cli" | etc.
    displayName: string;
    windows: Array<{
      label: string;
      usedPercent: number;
      resetAt?: EpochMs;
    }>;
    plan?: string;
    error?: string;
  }>;
}
```

---

#### `usage.cost`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `usage` |

**Input:**
```typescript
{
  startDate?: string;          // "YYYY-MM-DD"
  endDate?: string;            // "YYYY-MM-DD"
  days?: number;               // Fallback: last 30 days
}
```

**Output:**
```typescript
{
  updatedAt: EpochMs;
  days: number;
  daily: CostUsageDailyEntry[];
  totals: CostUsageTotals;
}
```

---

#### `sessions.usage`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `sessions.usage` |

**Input:**
```typescript
{
  key?: string;                // Specific session key
  startDate?: string;          // "YYYY-MM-DD"
  endDate?: string;            // "YYYY-MM-DD"
  limit?: number;              // integer, >= 1; default 50
  includeContextWeight?: boolean;
}
```

**Output:**
```typescript
{
  updatedAt: EpochMs;
  startDate: string;
  endDate: string;
  sessions: SessionUsageEntry[];
  totals: CostUsageTotals;
  aggregates: SessionsUsageAggregates;
}
```

**Notes:** Large response. The `aggregates` object includes breakdowns by model, provider, agent, channel, plus daily timeseries.

---

#### `sessions.usage.timeseries`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `sessions.usage` |

**Input:**
```typescript
{
  key: string;                 // Required — session key
}
```

**Output:**
```typescript
{
  sessionId?: string;
  points: Array<{
    timestamp: EpochMs;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    cost: number;
    cumulativeTokens: number;
    cumulativeCost: number;
  }>;
}
```

**Errors:** `INVALID_REQUEST` — key required, session not found.

---

#### `sessions.usage.logs`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `sessions.usage` |

**Input:**
```typescript
{
  key: string;                 // Required — session key
  limit?: number;              // Max 1000, default 200
}
```

**Output:**
```typescript
{
  logs: Array<{
    timestamp: EpochMs;
    role: "user" | "assistant" | "tool" | "toolResult";
    content: string;
    tokens?: number;
    cost?: number;
  }>;
}
```

**Errors:** `INVALID_REQUEST` — key required.

---

### Group 13: Skills (3 operations)

Skill dependency management — status checks, installation, and configuration.

---

#### `skills.status`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `skills` |

**Input:**
```typescript
{
  agentId?: string;            // Falls back to default agent
}
```

**Output:**
```typescript
{
  workspaceDir: string;
  managedSkillsDir: string;
  skills: Array<{
    name: string;
    description: string;
    source: string;
    bundled: boolean;
    filePath: string;
    baseDir: string;
    skillKey: string;
    primaryEnv?: string;
    emoji?: string;
    homepage?: string;
    always: boolean;
    disabled: boolean;
    blockedByAllowlist: boolean;
    eligible: boolean;
    requirements: {
      bins: string[];
      anyBins: string[];
      env: string[];
      config: string[];
      os: string[];
    };
    missing: {
      bins: string[];
      anyBins: string[];
      env: string[];
      config: string[];
      os: string[];
    };
    configChecks: Array<{ path: string; value: unknown; satisfied: boolean }>;
    install: Array<{
      id: string;
      kind: "brew" | "node" | "go" | "uv" | "download" | "shell";
      label: string;
      bins: string[];
    }>;
  }>;
}
```

**Errors:** `INVALID_REQUEST` — unknown agent id.

---

#### `skills.install`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `skills` |

**Input:**
```typescript
{
  name: string;                // Required — skill name
  installId: string;           // Required — install option ID from skills.status
  timeoutMs?: number;          // integer, >= 1000
}
```

**Output:**
```typescript
{
  ok: boolean;
  message: string;
  stdout: string;
  stderr: string;
  code: number | null;
  warnings?: string[];
}
```

**Errors:** `UNAVAILABLE` — installation failed.

---

#### `skills.update`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `skills` |

**Input:**
```typescript
{
  skillKey: string;            // Required
  enabled?: boolean;
  apiKey?: string;
  env?: Record<string, string>;
}
```

**Output:**
```typescript
{
  ok: true;
  skillKey: string;
  config: {
    enabled?: boolean;
    apiKey?: string;
    env?: Record<string, string>;
  };
}
```

---

### Group 14: Device Pairing & Host (8 operations)

Device pairing flow (approve/reject), token management, and remote device host invocation.

---

#### `device.pair.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `pair` |
| Resource | `pairing.devices` |

**Input:**
```typescript
{}
```

**Output:**
```typescript
{
  pending: DevicePairingPendingRequest[];
  paired: RedactedPairedDevice[];
}
```

---

#### `device.pair.approve`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `pair` |
| Resource | `pairing.devices` |

**Input:**
```typescript
{
  requestId: string;           // Required
}
```

**Output:**
```typescript
{
  requestId: string;
  device: RedactedPairedDevice;
}
```

**Side effects:** Broadcasts `device.pair.resolved` event. Binds device entity in identity ledger.

**Errors:** `INVALID_REQUEST` — unknown requestId.

---

#### `device.pair.reject`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `pair` |
| Resource | `pairing.devices` |

**Input:**
```typescript
{
  requestId: string;           // Required
}
```

**Output:**
```typescript
{
  requestId: string;
  deviceId: string;
}
```

**Side effects:** Broadcasts `device.pair.resolved` event.

**Errors:** `INVALID_REQUEST` — unknown requestId.

---

#### `device.token.rotate`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `pair` |
| Resource | `pairing.devices.tokens` |

**Input:**
```typescript
{
  deviceId: string;            // Required
  role: string;                // Required
  scopes?: string[];
}
```

**Output:**
```typescript
{
  deviceId: string;
  role: string;
  token: string;               // The new raw token
  scopes: string[];
  rotatedAtMs: EpochMs;
}
```

**Errors:** `INVALID_REQUEST` — unknown deviceId/role.

---

#### `device.token.revoke`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `pair` |
| Resource | `pairing.devices.tokens` |

**Input:**
```typescript
{
  deviceId: string;            // Required
  role: string;                // Required
}
```

**Output:**
```typescript
{
  deviceId: string;
  role: string;
  revokedAtMs: EpochMs;
}
```

**Errors:** `INVALID_REQUEST` — unknown deviceId/role.

---

#### `device.host.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `device.host` |

**Input:**
```typescript
{}
```

**Output:**
```typescript
{
  ts: EpochMs;
  hosts: DeviceHostRecord[];
}
```

**Errors:** `INVALID_REQUEST` — rejects non-empty params.

---

#### `device.host.describe`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `device.host` |

**Input:**
```typescript
{
  endpointId: string;          // Required
}
```

**Output:**
```typescript
{
  ts: EpochMs;
  endpointId: string;
  displayName?: string;
  platform?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  remoteIp?: string;
  caps: string[];
  commands: string[];
  permissions?: Record<string, boolean>;
  paired: boolean;
  connected: boolean;
  source: "adapter-control" | "ws-control" | "paired-device";
  adapter?: string;
  account?: string;
  connectedAtMs?: EpochMs;
  approvedAtMs?: EpochMs;
}
```

**Errors:** `INVALID_REQUEST` — endpointId missing or unknown.

---

#### `device.host.invoke`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `device.host.invoke` |

**Input:**
```typescript
{
  endpointId: string;          // Required
  command: string;             // Required — must be in endpoint's declared commands
  payload?: unknown;
  timeoutMs?: number;
  idempotencyKey?: string;     // Auto-generated UUID if absent
}
```

**Output:**
```typescript
{
  ok: boolean;
  endpointId: string;
  command: string;
  payload?: unknown;
  error: string | null;
  source: "adapter-control" | "ws-control";
}
```

**Errors:** `INVALID_REQUEST` — command not in declared commands. `UNAVAILABLE` — endpoint not connected.

## Tier 4: Extended / App Candidates

These operations are candidates for extraction into standalone apps. They exist in the runtime today but may not belong in the core taxonomy long-term.

---

### Group 15: Work CRM (18 operations)

Task/workflow/campaign engine for agent-driven work management. Strong candidate for app extraction.

---

#### `work.tasks.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `work.tasks` |

**Input:**
```typescript
{
  type?: string;               // Task type filter
}
```

**Output:**
```typescript
{
  tasks: WorkTaskRow[];
}
```

---

#### `work.tasks.create`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `work.tasks` |

**Input:**
```typescript
{
  name: string;                // Required
  id?: string;                 // Defaults to "task:<uuid>"
  description?: string;
  type?: string;
  default_assignee_type?: string;
  default_assignee_id?: string;
  default_priority?: string;
  default_due_offset_ms?: number;
  automation_ref?: string;
  agent_prompt?: string;
  metadata_json?: string | object;
  now?: EpochMs;
}
```

**Output:**
```typescript
{
  task: WorkTaskRow;
}
```

---

#### `work.entities.seed`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `work.entities` |

**Input:**
```typescript
{
  entities: Array<{            // Required, non-empty
    id?: string;               // Defaults to "entity:<uuid>"
    name?: string;             // Defaults to id
    type?: string;             // Defaults to "person"
    normalized?: string;       // Defaults to name.toLowerCase()
    is_user?: boolean;
    mention_count?: number;
    first_seen?: EpochMs;
    last_seen?: EpochMs;
    tags?: string[];
  }>;
  tags?: string[];             // Shared tags applied to all entities
  now?: EpochMs;
  actor?: string;              // Defaults to "operator"
  reason?: string;
}
```

**Output:**
```typescript
{
  entities: Array<{
    id: string;
    name: string;
    type: string;
    tags: string[];
  }>;
  count: number;
  tags_added: number;
}
```

**Errors:** `INVALID_REQUEST` — entities empty or not array.

---

#### `work.workflows.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `work.workflows` |

**Input:**
```typescript
{
  type?: string;
}
```

**Output:**
```typescript
{
  workflows: WorkWorkflowRow[];
}
```

---

#### `work.workflows.create`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `work.workflows` |

**Input:**
```typescript
{
  name: string;                // Required
  id?: string;                 // Defaults to "workflow:<uuid>"
  description?: string;
  type?: string;
  metadata_json?: string | object;
  now?: EpochMs;
  steps?: Array<{
    task_id: string;           // Required per step
    id?: string;               // Defaults to "workflow-step:<uuid>"
    step_order?: number;       // Defaults to index+1
    depends_on_steps?: string[];
    delay_after_ms?: number;
    condition_json?: string | object;
    override_due_offset_ms?: number;
    override_priority?: string;
    override_assignee_type?: string;
    override_assignee_id?: string;
    override_prompt?: string;
    metadata_json?: string | object;
  }>;
}
```

**Output:**
```typescript
{
  workflow: WorkWorkflowRow;
  steps: WorkWorkflowStepRow[];
}
```

**Errors:** `INVALID_REQUEST` — name missing, step missing task_id.

---

#### `work.workflows.instantiate`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `work.workflows` |

**Input:**
```typescript
{
  workflow_id: string;         // Required
  entity_id?: string;
  parent_sequence_id?: string;
  name?: string;
  now?: EpochMs;
}
```

**Output:**
```typescript
{
  sequence: WorkSequenceRow;
  items: WorkItemRow[];
}
```

**Errors:** `INVALID_REQUEST` — workflow_id missing or not found.

---

#### `work.campaigns.instantiate`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `work.campaigns` |

**Input:**
```typescript
{
  workflow_id: string;         // Required
  name: string;                // Required
  entity_filter: string;       // Required — filter tag for identity entities
  now?: EpochMs;
}
```

**Output:**
```typescript
{
  sequence: WorkSequenceRow;   // Campaign parent sequence
  items: WorkItemRow[];        // Per-entity work items
}
```

**Errors:** `INVALID_REQUEST` — required params missing. `UNAVAILABLE` — identity ledger unavailable.

---

#### `work.items.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `work.items` |

**Input:**
```typescript
{
  status?: string;
  entity_id?: string;
  sequence_id?: string;
  task_id?: string;
  assignee_type?: string;
  assignee_id?: string;
}
```

**Output:**
```typescript
{
  items: WorkItemRow[];
}
```

---

#### `work.items.get`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `work.items` |

**Input:**
```typescript
{
  id: string;                  // Required
}
```

**Output:**
```typescript
{
  item: WorkItemRow;
}
```

**Errors:** `INVALID_REQUEST` — id missing or not found.

---

#### `work.items.create`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `work.items` |

**Input:**
```typescript
{
  title: string;               // Required
  id?: string;                 // Defaults to "work:<uuid>"
  task_id?: string;
  description?: string;
  entity_id?: string;
  priority?: string;
  due_at?: EpochMs;
  scheduled_at?: EpochMs;
  sequence_id?: string;
  workflow_step_id?: string;
  sequence_order?: number;
  depends_on_items?: string | string[];
  source?: string;             // Defaults to "manual"
  source_ref?: string;
  source_url?: string;
  recurrence?: string;
  recurrence_source_id?: string;
  status?: string;             // Defaults to "scheduled" if scheduled_at set, else "pending"
  assignee_type?: string;
  assignee_id?: string;
  started_at?: EpochMs;
  completed_at?: EpochMs;
  snoozed_until?: EpochMs;
  metadata_json?: string | object;
  now?: EpochMs;
  actor?: string;              // Defaults to "operator"
  reason?: string;
}
```

**Output:**
```typescript
{
  item: WorkItemRow;
}
```

---

#### `work.items.events.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `work.items.events` |

**Input:**
```typescript
{
  id: string;                  // Required — work item ID
}
```

**Output:**
```typescript
{
  events: WorkItemEventRow[];
}
```

---

#### `work.items.assign`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `work.items` |

**Input:**
```typescript
{
  id: string;                  // Required
  assignee_type?: string;
  assignee_id?: string;
  actor?: string;              // Defaults to "operator"
  now?: EpochMs;
  reason?: string;
}
```

**Output:**
```typescript
{
  item: WorkItemRow;
}
```

---

#### `work.items.snooze`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `work.items` |

**Input:**
```typescript
{
  id: string;                  // Required
  snoozed_until: EpochMs;     // Required
  actor?: string;
  reason?: string;
  now?: EpochMs;
}
```

**Output:**
```typescript
{
  item: WorkItemRow;
}
```

---

#### `work.items.complete`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `work.items` |

**Input:**
```typescript
{
  id: string;                  // Required
  actor?: string;              // Defaults to "operator"
  reason?: string;
  now?: EpochMs;
}
```

**Output:**
```typescript
{
  item: WorkItemRow;
}
```

**Notes:** Also calls `advanceSequence()` to progress parent workflow sequence.

---

#### `work.items.cancel`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `work.items` |

**Input:**
```typescript
{
  id: string;                  // Required
  actor?: string;              // Defaults to "operator"
  reason?: string;
  now?: EpochMs;
}
```

**Output:**
```typescript
{
  item: WorkItemRow;
}
```

---

#### `work.sequences.list`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `work.sequences` |

**Input:**
```typescript
{
  workflow_id?: string;
  entity_id?: string;
  parent_sequence_id?: string;
  status?: string;
  include_items?: boolean;
}
```

**Output:**
```typescript
{
  sequences: WorkSequenceRow[];
  itemsBySequence?: Record<string, WorkItemRow[]>;  // Only if include_items=true
}
```

---

#### `work.sequences.get`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `work.sequences` |

**Input:**
```typescript
{
  id: string;                  // Required
}
```

**Output:**
```typescript
{
  sequence: WorkSequenceRow;
  items: WorkItemRow[];
}
```

**Errors:** `INVALID_REQUEST` — not found.

---

#### `work.dashboard.summary`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `work.dashboard` |

**Input:**
```typescript
{
  now?: EpochMs;               // Defaults to Date.now()
}
```

**Output:**
```typescript
{
  generated_at: EpochMs;
  items: {
    total: number;
    due_now: number;
    overdue: number;
    by_status: Record<string, number>;
    entity_coverage: number;
  };
  sequences: {
    total: number;
    by_status: Record<string, number>;
    campaigns_total: number;
    campaigns_active: number;
    campaigns_completed: number;
  };
}
```

---

### Group 16: Speech / TTS (9 operations)

Text-to-speech, talk mode, and voice wake triggers. Candidate for app extraction.

---

#### `tts.status`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `tts` |

**Input:**
```typescript
{}
```

**Output:**
```typescript
{
  enabled: boolean;
  auto: string;
  provider: string;            // "openai" | "elevenlabs" | "edge"
  fallbackProvider: string | null;
  fallbackProviders: string[];
  prefsPath: string;
  hasOpenAIKey: boolean;
  hasElevenLabsKey: boolean;
  edgeEnabled: boolean;
}
```

---

#### `tts.providers`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `tts` |

**Input:**
```typescript
{}
```

**Output:**
```typescript
{
  providers: Array<{
    id: "openai" | "elevenlabs" | "edge";
    name: string;
    configured: boolean;
    models: string[];
    voices?: string[];         // Only for openai
  }>;
  active: string;
}
```

---

#### `tts.enable`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `tts` |

**Input:**
```typescript
{}
```

**Output:**
```typescript
{
  enabled: true;
}
```

---

#### `tts.disable`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `tts` |

**Input:**
```typescript
{}
```

**Output:**
```typescript
{
  enabled: false;
}
```

---

#### `tts.convert`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `tts` |

**Input:**
```typescript
{
  text: string;                // Required, non-empty
  channel?: string;
}
```

**Output:**
```typescript
{
  audioPath: string;
  provider: string;
  outputFormat: string;
  voiceCompatible: boolean;
}
```

**Errors:** `INVALID_REQUEST` — text empty. `UNAVAILABLE` — conversion failed.

---

#### `tts.setProvider`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `tts` |

**Input:**
```typescript
{
  provider: "openai" | "elevenlabs" | "edge";  // Required
}
```

**Output:**
```typescript
{
  provider: string;
}
```

**Errors:** `INVALID_REQUEST` — invalid provider value.

---

#### `talk.mode`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `talk` |

**Input:**
```typescript
{
  enabled: boolean;            // Required
  phase?: string;
}
```

**Output:**
```typescript
{
  enabled: boolean;
  phase: string | null;
  ts: EpochMs;
}
```

**Side effects:** Broadcasts `talk.mode` event to all connected clients.

**Errors:** `UNAVAILABLE` — webchat-only and no connected mobile node.

---

#### `voicewake.get`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `voicewake` |

**Input:**
```typescript
{}
```

**Output:**
```typescript
{
  triggers: string[];
}
```

---

#### `voicewake.set`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `voicewake` |

**Input:**
```typescript
{
  triggers: string[];          // Required
}
```

**Output:**
```typescript
{
  triggers: string[];          // Normalized saved triggers
}
```

**Side effects:** Broadcasts `voicewake.changed` event.

**Errors:** `INVALID_REQUEST` — triggers not an array.

---

### Group 17: Wizard / Onboarding (4 operations)

Setup wizard — step-by-step onboarding flow. Likely to be redesigned.

---

#### `wizard.start`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `wizard` |

**Input:**
```typescript
{
  mode?: "local" | "remote";
  workspace?: string;
}
```

**Output:**
```typescript
{
  sessionId: string;           // UUID
  done: boolean;
  step?: WizardStep;
  status?: "running" | "done" | "cancelled" | "error";
  error?: string;
}
```

**Errors:** `UNAVAILABLE` — wizard already running.

---

#### `wizard.next`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `wizard` |

**Input:**
```typescript
{
  sessionId: string;           // Required
  answer?: {
    stepId: string;            // Required within answer
    value?: unknown;
  };
}
```

**Output:**
```typescript
{
  done: boolean;
  step?: WizardStep;
  status?: "running" | "done" | "cancelled" | "error";
  error?: string;
}
```

**Errors:** `INVALID_REQUEST` — session not found or not running.

---

#### `wizard.cancel`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `wizard` |

**Input:**
```typescript
{
  sessionId: string;           // Required
}
```

**Output:**
```typescript
{
  status: "running" | "done" | "cancelled" | "error";
  error?: string;
}
```

**Errors:** `INVALID_REQUEST` — session not found.

---

#### `wizard.status`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `wizard` |

**Input:**
```typescript
{
  sessionId: string;           // Required
}
```

**Output:**
```typescript
{
  status: "running" | "done" | "cancelled" | "error";
  error?: string;
}
```

**Notes:** Purges session from memory if no longer running.

**Errors:** `INVALID_REQUEST` — session not found.

---

### Group 18: Browser (1 operation)

Proxied browser control — routes requests to connected browser device host or local browser service.

---

#### `browser.request`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `write` |
| Resource | `browser` |

**Input:**
```typescript
{
  method: "GET" | "POST" | "DELETE";  // Required
  path: string;               // Required
  query?: Record<string, unknown>;
  body?: unknown;
  timeoutMs?: number;
}
```

**Output:** Opaque — depends on the browser sub-route invoked. Proxied through to browser device host or local service.

**Resolution:** Finds connected browser-capable endpoint (adapter-control or WS device host with `browser` cap), proxies via `browser.proxy` command. Falls back to local browser service.

**Errors:** `INVALID_REQUEST` — method/path missing. `UNAVAILABLE` — no browser node or service.

---

### Group 19: Update (1 operation)

Runtime self-update — pulls latest code and schedules restart.

---

#### `update.run`

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `admin` |
| Resource | `runtime.update` |

**Input:**
```typescript
{
  sessionKey?: string;
  note?: string;
  restartDelayMs?: number;     // >= 0
  timeoutMs?: number;          // >= 1
}
```

**Output:**
```typescript
{
  ok: true;
  result: {
    status: "ok" | "error" | "skipped";
    mode: string;              // "git" | "npm" | "unknown"
    root?: string;
    before?: string | null;    // Version before update
    after?: string | null;     // Version after update
    reason?: string | null;
    steps: Array<{
      name: string;
      command: string;
      cwd: string;
      durationMs: number;
      stdoutTail?: string | null;
      stderrTail?: string | null;
      exitCode?: number | null;
    }>;
    durationMs: number;
  };
  restart: {
    scheduled: boolean;
    delayMs: number;
    reason: string;
  };
  sentinel: {
    path: string | null;
    payload: unknown;          // RestartSentinelPayload
  };
}
```

**Side effects:** Runs update process, writes restart sentinel file, schedules SIGUSR1 restart.

---

### Unregistered Handlers

These operations have handler code but are **not** in the static operation taxonomy. They need to be either formally registered or removed.

| Handler | File | Notes |
|---------|------|-------|
| `channels.status` | `server-methods/channels.ts` | Channel plugin status with optional probe |
| `channels.logout` | `server-methods/channels.ts` | Logout from a channel plugin |
| `web.login.start` | `server-methods/web.ts` | Start QR code login flow for web channel |
| `web.login.wait` | `server-methods/web.ts` | Wait for QR code login completion |
| `tools.invoke` | `tools-invoke-http.ts` | HTTP-only tool invocation endpoint |

---

## Shared Types (Tiers 3–4)

```typescript
// --- Tier 3: ACL ---

type AclPermissionRequest = {
  id: string;
  status: "pending" | "approved" | "denied" | "expired";
  createdAtMs: EpochMs;
  expiresAtMs: EpochMs;
  requesterId: string | null;
  requesterChannel: string | null;
  kind: string | null;
  toolName: string | null;
  toolCallId: string | null;
  sessionKey: string | null;
  nexusRequestId: string | null;
  summary: string | null;
  reason: string | null;
  resources: string[];
  context?: unknown;
  responder: string | null;
  responseAtMs: EpochMs | null;
  responseChannel: string | null;
  grantId: string | null;
};

// --- Tier 3: Usage ---

type CostUsageTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  missingCostEntries: number;
};

type CostUsageDailyEntry = CostUsageTotals & { date: string };

type SessionUsageEntry = {
  key: string;
  label?: string;
  sessionId?: string;
  updatedAt?: EpochMs;
  agentId?: string;
  channel?: string;
  chatType?: string;
  origin?: {
    label?: string;
    provider?: string;
    surface?: string;
    chatType?: string;
    from?: string;
    to?: string;
    accountId?: string;
    threadId?: string | number;
  };
  modelOverride?: string;
  providerOverride?: string;
  modelProvider?: string;
  model?: string;
  usage: unknown | null;       // SessionCostSummary
  contextWeight?: unknown | null;
};

type SessionsUsageAggregates = {
  messages: unknown;            // SessionMessageCounts
  tools: unknown;               // SessionToolUsage
  byModel: Array<{ model: string; totals: CostUsageTotals }>;
  byProvider: Array<{ provider: string; totals: CostUsageTotals }>;
  byAgent: Array<{ agentId: string; totals: CostUsageTotals }>;
  byChannel: Array<{ channel: string; totals: CostUsageTotals }>;
  latency?: unknown;
  dailyLatency?: unknown[];
  modelDaily?: unknown[];
  daily: Array<{
    date: string;
    tokens: number;
    cost: number;
    messages: number;
    toolCalls: number;
    errors: number;
  }>;
};

// --- Tier 3: Devices ---

type DevicePairingPendingRequest = {
  requestId: string;
  deviceId: string;
  publicKey: string;
  displayName?: string;
  platform?: string;
  clientId?: string;
  clientMode?: string;
  role?: string;
  roles?: string[];
  scopes?: string[];
  remoteIp?: string;
  silent?: boolean;
  isRepair?: boolean;
  ts: EpochMs;
};

type RedactedPairedDevice = {
  deviceId: string;
  publicKey: string;
  displayName?: string;
  platform?: string;
  clientId?: string;
  clientMode?: string;
  role?: string;
  roles?: string[];
  scopes?: string[];
  remoteIp?: string;
  createdAtMs: EpochMs;
  approvedAtMs: EpochMs;
  tokens?: Array<{
    role: string;
    scopes: string[];
    createdAtMs: EpochMs;
    rotatedAtMs?: EpochMs;
    revokedAtMs?: EpochMs;
    lastUsedAtMs?: EpochMs;
  }>;
};

type DeviceHostRecord = {
  endpointId: string;
  displayName?: string;
  platform?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  remoteIp?: string;
  caps: string[];
  commands: string[];
  permissions?: Record<string, boolean>;
  paired: boolean;
  connected: boolean;
  source: "adapter-control" | "ws-control" | "paired-device";
  adapter?: string;
  account?: string;
  connectedAtMs?: EpochMs;
  approvedAtMs?: EpochMs;
};

// --- Tier 4: Wizard ---

type WizardStep = {
  id: string;
  type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress" | "action";
  title?: string;
  message?: string;
  options?: Array<{
    value: unknown;
    label: string;
    hint?: string;
  }>;
  initialValue?: unknown;
  placeholder?: string;
  sensitive?: boolean;
  executor?: "runtime" | "client";
};

// --- Tier 4: Work CRM ---
// Row types are opaque DB rows. Key fields listed for reference.

type WorkTaskRow = {
  id: string;
  name: string;
  description?: string;
  type?: string;
  default_assignee_type?: string;
  default_assignee_id?: string;
  default_priority?: string;
  default_due_offset_ms?: number;
  automation_ref?: string;
  agent_prompt?: string;
  metadata_json?: string;
  created_at: EpochMs;
  updated_at: EpochMs;
};

type WorkWorkflowRow = {
  id: string;
  name: string;
  description?: string;
  type?: string;
  metadata_json?: string;
  created_at: EpochMs;
  updated_at: EpochMs;
};

type WorkWorkflowStepRow = {
  id: string;
  workflow_id: string;
  task_id: string;
  step_order: number;
  depends_on_steps?: string;
  delay_after_ms?: number;
  condition_json?: string;
  override_due_offset_ms?: number;
  override_priority?: string;
  override_assignee_type?: string;
  override_assignee_id?: string;
  override_prompt?: string;
  metadata_json?: string;
};

type WorkItemRow = {
  id: string;
  title: string;
  task_id?: string;
  description?: string;
  entity_id?: string;
  priority?: string;
  status: string;
  due_at?: EpochMs;
  scheduled_at?: EpochMs;
  sequence_id?: string;
  workflow_step_id?: string;
  sequence_order?: number;
  depends_on_items?: string;
  source?: string;
  source_ref?: string;
  source_url?: string;
  recurrence?: string;
  assignee_type?: string;
  assignee_id?: string;
  started_at?: EpochMs;
  completed_at?: EpochMs;
  snoozed_until?: EpochMs;
  metadata_json?: string;
  created_at: EpochMs;
  updated_at: EpochMs;
};

type WorkItemEventRow = {
  id: string;
  work_item_id: string;
  event_type: string;
  actor?: string;
  reason?: string;
  changes_json?: string;
  created_at: EpochMs;
};

type WorkSequenceRow = {
  id: string;
  workflow_id?: string;
  entity_id?: string;
  parent_sequence_id?: string;
  name?: string;
  status: string;
  created_at: EpochMs;
  updated_at: EpochMs;
};
```

---

## HTTP-Only Operations

These operations are only available via HTTP (not WebSocket):

| Operation | Method | Path |
|-----------|--------|------|
| `auth.login` | POST | `/api/auth/login` |
| `health` | GET | `/health` |
| `events.stream` | GET | `/api/events/stream` |
| `apps.list` | GET | `/api/apps` |
| `tools.invoke` | POST | `/tools/invoke` |

**Note:** Per the architecture spec, the target state is all operations on all surfaces. These HTTP-only mappings are a current implementation detail, not an architectural constraint.

---

## Dynamic Operations

#### `apps.open.<app_id>`

Pattern: `apps.open.[a-z0-9][a-z0-9_-]{0,63}`

Dynamically resolved at runtime. Returns the app's static files or proxied content.

| Field | Value |
|-------|-------|
| Mode | `control` |
| Action | `read` |
| Resource | `apps.<app_id>` |

---

## Operation Count Summary

| Tier | Group | Count | Status |
|------|-------|-------|--------|
| 1 | Core Runtime | 6 | Documented |
| 1 | Auth & Users | 11 | Documented |
| 1 | Config | 5 | Documented |
| 1 | Chat & Ingress | 4 | Documented |
| 1 | Sessions | 9 | Documented |
| 1 | Agents | 9 | Documented |
| 1 | Memory Review | 11 | Documented |
| **1** | **Tier 1 Total** | **55** | **Complete** |
| 2 | Adapter Connections | 12 | Documented |
| 2 | Adapter Capabilities | 17 | Documented |
| 2 | Clock/Cron | 8 | Documented |
| **2** | **Tier 2 Total** | **37** | **Complete** |
| 3 | ACL Approvals | 5 | Documented |
| 3 | Models & Usage | 6 | Documented |
| 3 | Skills | 3 | Documented |
| 3 | Device Pairing & Host | 8 | Documented |
| **3** | **Tier 3 Total** | **22** | **Complete** |
| 4 | Work CRM | 18 | Documented |
| 4 | Speech/TTS | 9 | Documented |
| 4 | Wizard | 4 | Documented |
| 4 | Browser | 1 | Documented |
| 4 | Update | 1 | Documented |
| **4** | **Tier 4 Total** | **33** | **Complete** |
| — | Unregistered handlers | 5 | Needs triage |
| — | GlowBot (extract to app) | ~13 | Remove from core |
| — | **Grand Total (documented)** | **147** | — |
