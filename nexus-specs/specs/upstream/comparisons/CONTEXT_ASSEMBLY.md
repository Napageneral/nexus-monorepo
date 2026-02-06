# Context Assembly Comparison

**Status:** COMPARISON DOCUMENT  
**Last Updated:** 2026-02-04

---

## Summary

Both OpenClaw and Nexus build context before each agent execution, but they approach it differently:

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Assembly model** | File concatenation | Structured layers |
| **History source** | JSONL transcript file | SQLite via Agents Ledger |
| **Semantic context** | None | Cortex-derived layer |
| **Execution engine** | pi-coding-agent | pi-coding-agent (same) |
| **Bootstrap** | Head/tail truncation | Per-layer budgets |

**Key insight:** Nexus adds intentionality to *what* context goes *where*, and Cortex enables context retrieval that OpenClaw simply can't do. But both systems hand off to the same pi-coding-agent for actual execution.

---

## OpenClaw: File-Based Assembly

OpenClaw's context assembly is **concatenative** — it loads files, applies truncation, and builds one big system prompt.

### Assembly Flow

```
1. Resolve Workspace
   └── workspaceDir, agentDir from config/session

2. Load Bootstrap Files
   └── AGENTS.md, identity files, workspace rules
   └── Apply head/tail truncation (20K char limit)

3. Load Skills
   └── buildWorkspaceSkillSnapshot()
   └── Generate skills prompt section

4. Build System Prompt
   └── Combine: runtime info + identity + skills + bootstrap

5. Load Session History
   └── Read JSONL transcript
   └── Apply compaction summaries if present

6. Prepare Tools
   └── createOpenClawCodingTools()

7. Add Event Message
   └── User prompt + media/context
```

### Bootstrap Truncation

Large bootstrap files get head/tail truncated:

```typescript
const DEFAULT_BOOTSTRAP_MAX_CHARS = 20_000;
const BOOTSTRAP_HEAD_RATIO = 0.7;  // Keep 70% from start
const BOOTSTRAP_TAIL_RATIO = 0.2;  // Keep 20% from end

// Result: beginning + "[... content truncated ...]" + end
```

### History from JSONL

OpenClaw stores session history in `.jsonl` transcript files:

```json
{"type": "session", "id": "uuid", "timestamp": "...", "cwd": "/path"}
{"type": "message", "role": "user", "content": [...]}
{"type": "message", "role": "assistant", "content": [...]}
{"type": "compaction", "summary": "...", "firstKeptEntryId": "..."}
```

When compaction happens, old entries are archived to `.bak` files.

### What OpenClaw Does Well

- Simple, predictable model
- Easy to debug (read the transcript files)
- Compaction summaries preserve context across resets

### What OpenClaw Can't Do

- **No semantic retrieval** — Can't find relevant past context by meaning
- **No queryable history** — JSONL must be parsed, not queried
- **Linear context only** — Everything is concatenated in order

**Reference:** `specs/runtime/broker/upstream/CONTEXT_ASSEMBLY.md`

---

## Nexus: Layered Assembly

Nexus assembles context in **structured layers**, each with clear purpose and token budget.

### The Five Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     CONTEXT ASSEMBLY                             │
│                                                                  │
│  Layer 1: WORKSPACE                                             │
│    └── AGENTS.md, identity files, workspace rules               │
│                                                                  │
│  Layer 2: PERSONA                                               │
│    └── SOUL.md, IDENTITY.md, permissions                        │
│                                                                  │
│  Layer 3: SESSION                                               │
│    └── History from Agents Ledger (SQLite)                      │
│    └── Thread ancestry, compaction summaries                    │
│                                                                  │
│  Layer 4: CORTEX                                                │
│    └── Semantically relevant context                            │
│    └── Episodes, facets, entities                               │
│                                                                  │
│  Layer 5: EVENT                                                 │
│    └── Triggering event, hook injections                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Layer 1: Workspace

**What:** System-level behavior and workspace configuration.

**Contents:**
- `AGENTS.md` — Primary behavior rules
- Workspace-level identity files
- Nexus CLI context (capabilities, skills)

**Purpose:** Establishes *what kind of system* the agent operates in.

---

### Layer 2: Persona

**What:** Agent identity and constraints.

**Contents:**
- `SOUL.md` — Personality, values, boundaries
- `IDENTITY.md` — Name, emoji, vibe
- Permissions and safety constraints
- Default model configuration

**Purpose:** Establishes *who the agent is*.

---

### Layer 3: Session

**What:** Conversation history from the Agents Ledger.

**Contents:**
- Thread ancestry (parent turns → current turn)
- Previous messages in the conversation
- Compaction summaries if present

**Source:** SQLite database, not JSONL files.

**Key difference from OpenClaw:**
```sql
-- Nexus: Query history directly
SELECT * FROM turns 
WHERE thread_id = ? 
ORDER BY sequence ASC;

-- OpenClaw: Parse entire JSONL file
```

**Purpose:** Establishes *what's been said*.

---

### Layer 4: Cortex

**What:** Semantically relevant context the agent didn't explicitly ask for.

**Contents:**
- Episodes related to current topic
- Entities mentioned in the event
- Facets (topics, patterns) that apply
- Semantic search results

**How it works:**
1. Event content is analyzed
2. Cortex is queried for related context
3. Results are filtered by identity/permissions
4. Relevant context is injected before event

**Purpose:** Establishes *what the agent should know*.

---

### Layer 5: Event

**What:** The triggering message and runtime context.

**Contents:**
- The actual user message or trigger
- Hook-injected context (from pipeline)
- Extracted metadata (entities, intent)
- Channel-specific formatting hints

**Purpose:** Establishes *what's being asked*.

---

## What Cortex Adds

Cortex is the fundamental capability gap between OpenClaw and Nexus.

### OpenClaw's Limitation

OpenClaw can only include context that is:
1. Explicitly in the session history
2. In bootstrap files
3. Injected by hooks at runtime

If the agent discussed something 10 sessions ago, that context is **gone** (unless manually persisted to files).

### Cortex's Capability

Cortex maintains a **derived layer** of structured context:

```
┌─────────────────────────────────────────────────────────────────┐
│                         CORTEX                                   │
│                                                                  │
│  Episodes          Facets              Entities                 │
│  ─────────         ──────              ────────                 │
│  Past interactions Topics discussed   People, places, things   │
│  What happened     User preferences   Referenced concepts       │
│  Key decisions     Recurring themes   Project entities          │
│                                                                  │
│  ↓                 ↓                  ↓                         │
│                                                                  │
│  Semantic Query: "What's relevant to this event?"               │
│                                                                  │
│  ↓                                                              │
│                                                                  │
│  Injected Context: Relevant episodes, entities, facets          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Example

**User message:** "What was that thing we discussed about caching last month?"

| System | What Happens |
|--------|--------------|
| **OpenClaw** | Agent has no idea unless it's in current session or a file |
| **Nexus** | Cortex retrieves episodes about caching, injects relevant context |

---

## Same pi-coding-agent Underneath

Despite the differences in context assembly, both systems use **the same execution engine**:

```
OpenClaw Context Assembly    →  pi-coding-agent  →  Tool execution
        ↓                              ↑
Nexus Context Assembly       →         ↑
```

### What pi-coding-agent Does

- Executes against Anthropic/OpenAI APIs
- Handles tool calls and responses
- Manages multi-turn execution loops
- Applies thinking/reasoning hints

### What the Broker Does Differently

Nexus Broker adds layers *before* handing off to pi-agent:
1. **Structured context** — Layers instead of concatenation
2. **Cortex injection** — Semantic context OpenClaw doesn't have
3. **Ledger-based history** — Queryable, not file-based
4. **Pipeline hooks** — More integration points

But the actual agent execution? Same code.

---

## Token Budget: Allocation vs Truncation

### OpenClaw Approach

Reactive truncation — when things don't fit, chop them:

```typescript
// Bootstrap: head/tail truncation at 20K chars
// History: compaction when context overflows
// Skills: loaded in full (no budget)
```

### Nexus Approach

Proactive allocation — each layer gets a budget:

```typescript
interface TokenBudget {
  total: number;           // Model's context window
  reserveResponse: number; // Reserved for output
  reserveTools: number;    // Reserved for tool calls
  available: number;       // Available for context
  
  // Layer allocation
  workspace: number;
  persona: number;
  history: number;
  cortex: number;
  event: number;
}
```

**Key difference:** Nexus can prioritize layers when constrained. OpenClaw just truncates what's too big.

---

## History: Files vs Database

### OpenClaw: JSONL Files

```
sessions/
└── abc123.jsonl      # Session transcript
└── abc123.jsonl.bak  # Archived after compaction
```

**Pros:**
- Simple, portable
- Easy to inspect manually
- Git-friendly (text files)

**Cons:**
- Must parse entire file to query
- No cross-session queries
- Backup files accumulate

### Nexus: Agents Ledger (SQLite)

```sql
-- Turns table
CREATE TABLE turns (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  parent_id TEXT,
  sequence INTEGER,
  ...
);

-- Messages table  
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  turn_id TEXT,
  role TEXT,
  content BLOB,
  ...
);
```

**Pros:**
- Queryable across sessions/threads
- Efficient tree traversal (parent_id)
- No backup file sprawl

**Cons:**
- More complex to debug
- Requires SQLite tooling
- Migration complexity

---

## Migration Path

When porting OpenClaw context assembly to Nexus:

| OpenClaw | Nexus |
|----------|-------|
| Bootstrap files | Workspace layer |
| System prompt building | Combined from layers |
| Skills snapshot | Skills from Workspace layer |
| JSONL transcript | `turns` + `messages` tables |
| Compaction entry | Compaction turn in turn tree |
| `firstKeptEntryId` | `first_kept_turn_id` |
| `.bak` archive | Full history preserved in tree |
| — | **Cortex layer (new)** |

---

## Key Takeaways

1. **Same engine, different fuel** — Both use pi-coding-agent; Nexus feeds it better-structured context

2. **Layers beat concatenation** — Intentional organization makes debugging easier and enables smarter allocation

3. **Cortex is the differentiator** — Semantic retrieval is the capability that OpenClaw fundamentally lacks

4. **SQLite over JSONL** — Queryable history enables features that file-based history can't support

5. **pi-agent doesn't need to change** — Nexus adds value *around* the execution engine, not by replacing it

---

## References

- `specs/runtime/broker/upstream/CONTEXT_ASSEMBLY.md` — OpenClaw context assembly
- `specs/runtime/broker/CONTEXT_ASSEMBLY.md` — Nexus context assembly
- `specs/runtime/broker/upstream/AGENT_EXECUTION.md` — pi-coding-agent execution
- `specs/cortex/` — Cortex system

---

*This document compares context assembly between OpenClaw and Nexus.*
