# Session Management Reference

**Status:** REFERENCE DOCUMENT  
**Source:** OpenClaw (`src/sessions/`, `src/config/sessions/`)  
**Last Updated:** 2026-02-04

---

## Overview

This document covers OpenClaw's session management system:
- Session key formats and parsing
- SessionEntry structure and storage
- Session labels for human-readable identification
- DM scoping modes for session isolation
- Send policy resolution

For subagent sessions and queue management, see `UPSTREAM_AGENT_SYSTEM.md`.

---

## Session Key Format

### Structure

Session keys encode channel, chat type, and identifiers in a hierarchical format:

```
<channel>:<chatType>:<identifier>[:<modifier>:<value>]

Examples:
- telegram:dm:123456789                    # Direct message on Telegram
- discord:group:guild-id:channel:chan-id  # Discord channel in a guild
- slack:channel:C12345:thread:ts123       # Slack thread
- agent:main:telegram:dm:123456789        # Agent-scoped session
- agent:main:subagent:research-task       # Spawned subagent
```

### Agent-Scoped Keys

Most session keys are agent-scoped:

```
agent:{agentId}:{rest}

Examples:
- agent:main:main                         # Main session for "main" agent
- agent:main:dm:tyler                     # Per-peer DM for "main" agent
- agent:atlas:telegram:group:123          # Group session for "atlas" agent
```

### Key Parsing

```typescript
// src/sessions/session-key-utils.ts

type ParsedAgentSessionKey = {
  agentId: string;
  rest: string;
};

// Parse agent-scoped keys
function parseAgentSessionKey(sessionKey: string): ParsedAgentSessionKey | null {
  // "agent:main:telegram:dm:123" → { agentId: "main", rest: "telegram:dm:123" }
}

// Check if session is a spawned subagent
function isSubagentSessionKey(sessionKey: string): boolean {
  // Returns true if key matches:
  // - "subagent:..." (legacy)
  // - "agent:*:subagent:..." (current)
}

// Check if session is an ACP (Agent Communication Protocol) session
function isAcpSessionKey(sessionKey: string): boolean;

// Get parent session for threaded conversations
function resolveThreadParentSessionKey(sessionKey: string): string | null {
  // "agent:main:telegram:group:123:thread:456" → "agent:main:telegram:group:123"
}
```

### Thread Markers

Keys with `:thread:` or `:topic:` indicate threaded conversations within a parent context.

---

## Session Key Building

### Main Session Key

```typescript
// src/routing/session-key.ts

function buildAgentMainSessionKey(params: {
  agentId: string;
  mainKey?: string;
}): string {
  // Default: "agent:{agentId}:main"
}
```

### Peer Session Key

```typescript
function buildAgentPeerSessionKey(params: {
  agentId: string;
  mainKey?: string;
  channel: string;
  peerKind?: "dm" | "group" | "channel" | null;
  peerId?: string | null;
  identityLinks?: Record<string, string[]>;
  dmScope?: "main" | "per-peer" | "per-channel-peer";
}): string {
  // Routing depends on dmScope and peerKind
}
```

### DM Routing by Scope

| DM Scope | Session Key Pattern | Description |
|----------|---------------------|-------------|
| `main` | `agent:{agentId}:main` | All DMs collapse to main session |
| `per-peer` | `agent:{agentId}:dm:{peerId}` | Isolated per peer identity |
| `per-channel-peer` | `agent:{agentId}:{channel}:dm:{peerId}` | Isolated per channel+peer |

### Group Routing

Groups always get isolated sessions:

```
agent:{agentId}:{channel}:group:{groupId}

Examples:
- agent:main:telegram:group:-1001234567890
- agent:main:discord:group:guild:channel
```

---

## Session Entry

### Type Definition

```typescript
// src/config/sessions/types.ts

type SessionEntry = {
  // Identity
  sessionId: string;                    // Current transcript UUID
  updatedAt: number;                    // Last activity timestamp
  sessionFile?: string;                 // Optional explicit transcript path
  spawnedBy?: string;                   // Parent session (for sandbox scoping)
  
  // Origin tracking
  channel?: string;
  chatType?: SessionChatType;           // "dm" | "group" | "channel"
  groupId?: string;
  origin?: SessionOrigin;
  deliveryContext?: DeliveryContext;
  
  // State
  systemSent?: boolean;                 // Whether system prompt was sent
  abortedLastRun?: boolean;             // Whether last run was aborted
  
  // Model Selection
  providerOverride?: string;
  modelOverride?: string;
  authProfileOverride?: string;
  authProfileOverrideSource?: "auto" | "user";
  authProfileOverrideCompactionCount?: number;
  
  // Directive Overrides
  thinkingLevel?: string;               // "off" | "low" | "medium" | "high" | "xhigh"
  verboseLevel?: string;                // "off" | "on" | "full"
  reasoningLevel?: string;              // "off" | "on" | "reasoning"
  elevatedLevel?: string;               // "off" | "on" | "ask" | "full"
  
  // Exec Overrides
  execHost?: string;
  execSecurity?: string;
  execAsk?: string;
  execNode?: string;
  
  // Group Settings
  groupActivation?: "mention" | "always";
  groupActivationNeedsSystemIntro?: boolean;
  sendPolicy?: "allow" | "deny";
  
  // Queue Settings (per-session override)
  queueMode?: QueueMode;
  queueDebounceMs?: number;
  queueCap?: number;
  queueDrop?: QueueDropPolicy;
  
  // Token Counters
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  contextTokens?: number;
  modelProvider?: string;
  model?: string;
  
  // Compaction Tracking
  compactionCount?: number;
  memoryFlushAt?: number;
  memoryFlushCompactionCount?: number;
  
  // UI/Labeling
  label?: string;
  displayName?: string;
  subject?: string;
  groupChannel?: string;
  space?: string;
  
  // Delivery Context (for routing replies)
  lastChannel?: SessionChannelId;
  lastTo?: string;
  lastAccountId?: string;
  lastThreadId?: string | number;
  
  // Heartbeat Deduplication
  lastHeartbeatText?: string;
  lastHeartbeatSentAt?: number;
  
  // Snapshots
  skillsSnapshot?: SessionSkillSnapshot;
  systemPromptReport?: SessionSystemPromptReport;
  
  // CLI Session IDs
  cliSessionIds?: Record<string, string>;
  claudeCliSessionId?: string;           // Legacy
  responseUsage?: "on" | "off" | "tokens" | "full";
};
```

### Storage

Session entries are stored in `sessions.json`:

```
~/.openclaw/agents/<agentId>/sessions/
├── sessions.json              # Key → SessionEntry mapping
├── <sessionId>.jsonl          # Transcript files
├── <sessionId>-topic-<threadId>.jsonl  # Telegram topic transcripts
└── <sessionId>.jsonl.bak      # Compaction backup
```

---

## Session Labels

Human-readable labels for session identification:

```typescript
// src/sessions/session-label.ts

const SESSION_LABEL_MAX_LENGTH = 64;

type ParsedSessionLabel = 
  | { ok: true; label: string } 
  | { ok: false; error: string };

function parseSessionLabel(raw: unknown): ParsedSessionLabel;
```

Labels are used for:
- Subagent task identification
- UI display names
- Session reference in agent tools

---

## DM Scoping Modes

### Configuration

```yaml
session:
  dmScope: "per-peer"  # "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer"
```

### Mode Comparison

| Mode | Behavior | Session Key |
|------|----------|-------------|
| `main` | All DMs share one session | `agent:main:main` |
| `per-peer` | Isolated by peer identity | `agent:main:dm:{canonicalPeerId}` |
| `per-channel-peer` | Isolated by channel + peer | `agent:main:{channel}:dm:{peerId}` |
| `per-account-channel-peer` | Isolated by account + channel + peer | `agent:main:{accountId}:{channel}:dm:{peerId}` |

### Identity Links

Map platform identities to canonical peer IDs for cross-platform session continuity:

```yaml
session:
  identityLinks:
    tyler:
      - telegram:123456789
      - discord:987654321
      - whatsapp:+17072876731
    casey:
      - telegram:111222333
      - imessage:casey@example.com
```

With `dmScope: "per-peer"`, messages from any linked identity route to the same session.

---

## Send Policy

Controls whether an agent can send messages to a session:

```typescript
// src/sessions/send-policy.ts

type SessionSendPolicyDecision = "allow" | "deny";

function resolveSendPolicy(params: {
  cfg: OpenClawConfig;
  entry?: SessionEntry;
  sessionKey?: string;
  channel?: string;
  chatType?: SessionChatType;
}): SessionSendPolicyDecision;
```

### Resolution Order

1. Session entry override (`entry.sendPolicy`)
2. Config rules matching channel/chatType/keyPrefix
3. Config default fallback
4. System default: `"allow"`

### Configuration

```yaml
session:
  sendPolicy:
    default: allow
    rules:
      - match:
          chatType: group
          channel: discord
        action: deny
      - match:
          keyPrefix: "telegram:dm:"
        action: allow
```

---

## Session Lifecycle States

OpenClaw uses implicit session states (no explicit enum):

| State | Description | Indicators |
|-------|-------------|------------|
| **New** | SessionId assigned, no transcript | `sessionFile` doesn't exist |
| **Active** | Messages being exchanged | Recent `updatedAt` |
| **Idle** | No recent activity | Old `updatedAt` |
| **Reset** | New sessionId assigned | New transcript file |

### Reset Triggers

- **Explicit:** `/new`, `/reset` commands
- **Daily:** Configurable time (default 4:00 AM local)
- **Idle:** `session.reset.idleMinutes` (default 60 minutes)

### Reset Configuration

```yaml
session:
  reset:
    mode: daily        # "daily" | "idle"
    atHour: 4          # Reset at 4am local time
    idleMinutes: 480   # Or after 8 hours idle
  
  resetByType:
    dm: { mode: idle, idleMinutes: 1440 }
    group: { mode: daily, atHour: 4 }
    thread: { mode: idle, idleMinutes: 60 }
  
  resetByChannel:
    discord: { mode: idle, idleMinutes: 10080 }
```

---

## Transcript Events

Sessions emit events for transcript updates:

```typescript
// src/sessions/transcript-events.ts

function onSessionTranscriptUpdate(
  listener: (update: { sessionFile: string }) => void
): () => void;

function emitSessionTranscriptUpdate(sessionFile: string): void;
```

Used for:
- Hot-reload of session state
- UI synchronization
- Plugin notifications

---

## Level and Model Overrides

### Verbose Level

```typescript
type VerboseLevel = "on" | "off";

function parseVerboseOverride(raw: unknown): 
  | { ok: true; value: VerboseLevel | null } 
  | { ok: false; error: string };

function applyVerboseOverride(
  entry: SessionEntry, 
  level: VerboseLevel | null | undefined
): void;
```

### Model Override

```typescript
type ModelOverrideSelection = {
  provider: string;
  model: string;
  isDefault?: boolean;
};

function applyModelOverrideToSessionEntry(params: {
  entry: SessionEntry;
  selection: ModelOverrideSelection;
  profileOverride?: string;
  profileOverrideSource?: "auto" | "user";
}): { updated: boolean };
```

---

## Nexus Mapping

| OpenClaw | Nexus Broker |
|----------|--------------|
| Session key | Session label |
| `sessions.json` | `sessions` table in Agents Ledger |
| `SessionEntry` | Session row + current_turn_id pointer |
| JSONL transcript | `turns` + `messages` tables |
| `spawnedBy` | Agent-to-agent via turn tree |
| `compactionCount` | Compaction turns in turn tree |

---

## Key Files

| File | Purpose |
|------|---------|
| `src/sessions/session-key-utils.ts` | Key parsing utilities |
| `src/sessions/session-label.ts` | Label parsing/validation |
| `src/sessions/send-policy.ts` | Send policy resolution |
| `src/config/sessions/types.ts` | SessionEntry type |
| `src/config/sessions/store.ts` | sessions.json I/O |
| `src/routing/session-key.ts` | Key building functions |

---

*This document covers OpenClaw session management for Nexus Broker reference.*
