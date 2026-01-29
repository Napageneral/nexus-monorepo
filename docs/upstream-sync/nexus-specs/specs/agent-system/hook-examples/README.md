# Hook System Guide

This guide explains how to write hooks for the Nexus event system. Hooks are TypeScript scripts that evaluate events and decide whether to trigger agent actions.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EVENT FLOW                                         │
│                                                                              │
│  Event Sources (Adapters)                                                   │
│  ─────────────────────────                                                  │
│  iMessage, Gmail, Discord, Telegram, WhatsApp, Webhooks, Timers, etc.      │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    MNEMONIC (Event Layer)                            │   │
│  │                                                                      │   │
│  │  • Normalizes all events into unified schema                        │   │
│  │  • Stores in SQLite (events, threads, participants, facets)         │   │
│  │  • Runs background analysis (emotion, entities, topics)             │   │
│  │  • Provides semantic search via embeddings                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    HOOK EVALUATION                                   │   │
│  │                                                                      │   │
│  │  • Every event triggers ALL enabled hooks in parallel               │   │
│  │  • Each hook returns { fire: true/false, routing, context }         │   │
│  │  • Multiple hooks can fire for the same event                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    AGENT BROKER                                      │   │
│  │                                                                      │   │
│  │  • Receives fired hooks with routing instructions                   │   │
│  │  • Assembles context (thread history, system prompt)                │   │
│  │  • Manages queues (steer, followup, collect, debounce)             │   │
│  │  • Executes agent and delivers response                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Hook Context

Every hook receives a `HookContext` with these fields:

```typescript
interface HookContext {
  event: MnemonicEvent;  // The event being evaluated
  dbPath: string;        // Path to Mnemonic SQLite database
  search(query, opts);   // Semantic search (embeddings handled internally)
  llm(prompt, opts);     // LLM call (always gemini-3-flash-preview)
  now: Date;             // Current time
  hook: HookMetadata;    // This hook's metadata
}
```

### `event` — The Event Being Evaluated

```typescript
interface MnemonicEvent {
  id: string;                    // "{adapter}:{source_id}"
  timestamp: number;             // Unix ms
  channel: string;               // "imessage", "gmail", "discord", etc.
  content: string;               // Message content
  direction: 'sent' | 'received';
  thread_id?: string;
  sender_id?: string;
  metadata?: Record<string, any>;
  source_adapter: string;
}
```

### `dbPath` — Direct SQLite Access

Use any SQLite client (better-sqlite3 recommended):

```typescript
import Database from 'better-sqlite3';

const db = new Database(ctx.dbPath, { readonly: true });
const results = db.prepare('SELECT * FROM events WHERE ...').all();
db.close();
```

### `search(query, options)` — Semantic Search

Handles embedding generation internally. Returns event IDs with similarity scores.

```typescript
const results = await search("urgent financial alert", {
  channels: ['gmail'],
  since: Date.now() - 7 * 24 * 60 * 60 * 1000,
  limit: 10
});
// Returns: [{ eventId: "gmail:abc123", score: 0.87 }, ...]
```

### `llm(prompt, options)` — LLM Call

Always uses `gemini-3-flash-preview`. No model choice.

```typescript
// Simple check
const answer = await llm("Is this a 2FA request? Answer yes or no.");

// JSON extraction
const data = await llm("Extract {name, email}. Return JSON.", { json: true });
const parsed = JSON.parse(data);
```

---

## Mnemonic Database Schema

### Events Ledger

```sql
-- Core events
events (
  id TEXT PRIMARY KEY,           -- "{adapter}:{source_id}"
  timestamp INTEGER NOT NULL,
  channel TEXT NOT NULL,         -- "imessage", "gmail", "discord", etc.
  content TEXT,
  content_types TEXT,            -- JSON array
  direction TEXT,                -- "sent", "received"
  thread_id TEXT,
  reply_to TEXT,
  source_adapter TEXT NOT NULL,
  source_id TEXT NOT NULL,
  metadata_json TEXT
)

-- Conversation containers
threads (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  name TEXT,
  is_group INTEGER DEFAULT 0,
  parent_thread_id TEXT
)

-- Who was involved
event_participants (
  event_id TEXT,
  contact_id TEXT,
  role TEXT                      -- "sender", "recipient", "cc", "observer"
)

-- Mutable state
event_state (
  event_id TEXT PRIMARY KEY,
  is_read INTEGER DEFAULT 0,
  is_flagged INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0
)

-- Attachments
attachments (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  filename TEXT,
  mime_type TEXT,
  storage_uri TEXT
)
```

### Identity

```sql
-- People
persons (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL
)

-- Contact methods
contacts (
  id TEXT PRIMARY KEY,
  contact_type TEXT,             -- "phone", "email", "discord", "telegram"
  value TEXT NOT NULL
)

-- Links persons to contacts
person_contact_links (
  person_id TEXT,
  contact_id TEXT,
  confidence REAL DEFAULT 1.0
)
```

### Episodes & Analysis

Events are grouped into episodes for analysis. Facets are extracted insights.

```sql
-- Chunked event groups
episodes (
  id TEXT PRIMARY KEY,
  definition_name TEXT,          -- "time_gap", "thread", "turn_pair"
  channel TEXT,
  thread_id TEXT,
  start_time INTEGER,
  end_time INTEGER,
  event_count INTEGER
)

-- Links episodes to events
episode_events (
  episode_id TEXT,
  event_id TEXT,
  position INTEGER
)

-- Extracted insights
facets (
  id TEXT PRIMARY KEY,
  episode_id TEXT,
  facet_type TEXT,               -- "emotion", "topic", "entity", etc.
  value TEXT,
  confidence REAL,
  metadata_json TEXT
)
```

### Memory Graph

```sql
-- Entities (people, companies, places, etc.)
entities (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  entity_type_id INTEGER
)

-- Relationships with temporal bounds
relationships (
  id TEXT PRIMARY KEY,
  source_entity_id TEXT,
  target_entity_id TEXT,
  relation_type TEXT,            -- "WORKS_AT", "KNOWS", "LIVES_IN"
  fact TEXT,
  valid_at INTEGER,              -- When relationship started
  invalid_at INTEGER             -- When it ended (NULL = still valid)
)
```

### Full-Text Search

```sql
-- FTS5 virtual table for lexical search
events_fts (
  event_id TEXT,
  content TEXT
)

-- Usage:
SELECT event_id, bm25(events_fts) as score
FROM events_fts
WHERE events_fts MATCH 'flight check-in'
ORDER BY score
LIMIT 10;
```

---

## Available Facet Types

Background analysis extracts these facets from episodes:

| facet_type | Example Values | Description |
|------------|---------------|-------------|
| `emotion` | happy, sad, angry, anxious, excited, neutral | Detected emotion |
| `topic` | work, family, health, finance, travel | Conversation topic |
| `entity` | "Tyler Brandt", "Anthropic", "Austin" | Named entities mentioned |
| `sentiment` | positive, negative, neutral | Overall sentiment |
| `urgency` | low, medium, high | Message urgency level |
| `pii` | email, phone, ssn, address | PII types detected |
| `humor` | sarcasm, joke, pun | Humor detected |

### Querying Facets

```sql
-- Find messages in "happy" episodes from Casey
SELECT e.content, f.value as emotion, f.confidence
FROM events e
JOIN event_participants ep ON ep.event_id = e.id
JOIN person_contact_links pcl ON pcl.contact_id = ep.contact_id
JOIN persons p ON p.id = pcl.person_id
JOIN episode_events ee ON ee.event_id = e.id
JOIN facets f ON f.episode_id = ee.episode_id
WHERE p.canonical_name LIKE '%Casey%'
  AND f.facet_type = 'emotion'
  AND f.value LIKE '%happy%'
ORDER BY e.timestamp DESC;
```

---

## Hook Patterns

### Pattern 1: Pure Deterministic (Fastest)

No LLM, no database. Just check event fields.

```typescript
export default async function(ctx: HookContext): Promise<HookResult> {
  const { event } = ctx;
  
  if (event.channel !== 'whatsapp') return { fire: false };
  if (event.sender_id !== '+15551234567') return { fire: false };
  
  return {
    fire: true,
    routing: { agent_id: 'work' },
    context: { include_thread: true }
  };
}
```

### Pattern 2: Database Query

Query Mnemonic for context before deciding.

```typescript
import Database from 'better-sqlite3';

export default async function(ctx: HookContext): Promise<HookResult> {
  const { event, dbPath } = ctx;
  
  const db = new Database(dbPath, { readonly: true });
  
  const sender = db.prepare(`
    SELECT p.canonical_name
    FROM event_participants ep
    JOIN person_contact_links pcl ON pcl.contact_id = ep.contact_id
    JOIN persons p ON p.id = pcl.person_id
    WHERE ep.event_id = ? AND ep.role = 'sender'
  `).get(event.id);
  
  db.close();
  
  if (!sender?.canonical_name.includes('Mom')) return { fire: false };
  
  return { fire: true, routing: { agent_id: 'helper' } };
}
```

### Pattern 3: LLM Classification

Use LLM for fuzzy matching.

```typescript
export default async function(ctx: HookContext): Promise<HookResult> {
  const { event, llm } = ctx;
  
  // Fast exit before LLM call
  if (event.content.length < 10) return { fire: false };
  
  const response = await llm(`Is this asking for help? Answer yes or no.
Message: "${event.content}"`);
  
  if (response.trim().toLowerCase() !== 'yes') return { fire: false };
  
  return { fire: true, routing: { agent_id: 'helper' } };
}
```

### Pattern 4: Semantic Search

Find related events using embeddings.

```typescript
export default async function(ctx: HookContext): Promise<HookResult> {
  const { event, search, dbPath } = ctx;
  
  // Find similar past messages
  const similar = await search(event.content, {
    channels: [event.channel],
    since: Date.now() - 24 * 60 * 60 * 1000,
    limit: 5
  });
  
  if (similar.length === 0 || similar[0].score < 0.8) {
    return { fire: false };
  }
  
  // Get full event details
  const db = new Database(dbPath, { readonly: true });
  const events = db.prepare(`
    SELECT * FROM events WHERE id IN (${similar.map(() => '?').join(',')})
  `).all(...similar.map(s => s.eventId));
  db.close();
  
  // ... use events for context
}
```

### Pattern 5: Time-Based (Scheduled)

Fire based on elapsed time. Timer tick events (1/minute) ensure evaluation.

```typescript
export default async function(ctx: HookContext): Promise<HookResult> {
  const { now, hook } = ctx;
  
  const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
  const lastFired = hook.last_triggered || hook.created_at;
  
  if (now.getTime() - lastFired < INTERVAL_MS) {
    return { fire: false };
  }
  
  return { fire: true, context: { prompt: 'HEARTBEAT' } };
}
```

### Pattern 6: One-Shot (Self-Disabling)

Fire once then disable.

```typescript
/**
 * @mode one-shot
 */
export default async function(ctx: HookContext): Promise<HookResult> {
  const { now } = ctx;
  
  const DEADLINE = new Date("2026-01-28T03:00:00-06:00");
  
  if (now < DEADLINE) return { fire: false };
  
  return {
    fire: true,
    context: { prompt: 'Deadline reached!' },
    disable_hook: true  // Won't run again
  };
}
```

---

## Hook Result

```typescript
interface HookResult {
  fire: boolean;  // Required: should this trigger an agent?
  
  routing?: {
    mode: 'persona' | 'session' | 'thread';
    target?: string;      // Session key or thread ID
    agent_id?: string;    // Specific agent to invoke
    queue_mode?: string;  // steer, followup, collect, etc.
  };
  
  context?: {
    prompt?: string;      // Custom instruction for the agent
    extracted?: any;      // Data to pass to agent
    include_thread?: boolean;
  };
  
  disable_hook?: boolean; // Self-disable after this run
}
```

---

## Examples

See the other files in this folder:

| File | Pattern | Complexity |
|------|---------|------------|
| `default-dm-routing.ts` | Pure deterministic | Simplest |
| `work-whatsapp-routing.ts` | Pure deterministic | Simple |
| `heartbeat.ts` | Time-based | Simple |
| `stripe-high-value.ts` | Webhook filtering | Medium |
| `mom-2fa-helper.ts` | DB + LLM | Medium |
| `casey-safety-check.ts` | DB + LLM + one-shot | Complex |
| `flight-checkin.ts` | Hybrid all patterns | Complex |

---

## Tips

1. **Exit early** — Check cheap conditions (channel, sender) before expensive ones (DB, LLM)
2. **Use SQL for precision** — The database has rich data; use it
3. **Use search() for fuzzy** — When you need semantic matching
4. **LLM for classification** — When rules would be too complex
5. **Keep prompts simple** — The LLM is fast and capable; don't overthink
6. **One hook, one job** — Multiple hooks can fire; keep them focused
