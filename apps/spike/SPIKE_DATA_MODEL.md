# Spike Data Model & Architecture Spec

> Defines the core data model, naming conventions, storage architecture, and
> lifecycle behaviors for Spike as a nex app.
>
> Written 2026-03-04. Companion to SPIKE_FRONTDOOR_INTEGRATION.md and SPIKE_WORKPLAN.md.
>
> **HARD CUTOVER. NO BACKWARD COMPATIBILITY.** No YAML profiles, no old DB
> migration. Clean break from legacy code.

---

## 1. Core Concepts & Naming

### 1.1 AgentConfig

A set of tuning parameters that control how an AgentIndex is built and queried.
Represents a "recipe" — no identity, no repo binding, no storage paths.

```
AgentConfig:
  capacity:      120000    # max tokens the index can hold
  max_children:  12        # max child nodes per parent in the B-tree
  max_parallel:  4         # concurrent LLM calls during hydrate/ask
  hydrate_model: "gpt-5.3-codex:high"   # LLM for hydration passes
  ask_model:     "claude-sonnet-4-20250514"     # LLM for ask operations
```

**Sane defaults are mandatory.** Users should never need to touch AgentConfig.
The engine populates defaults automatically. Power users can override.

Default resolution order:
1. Explicit user override (via UI or API)
2. Engine-level defaults (compiled into the binary)
3. Built-in fallbacks: capacity=120000, max_children=12, max_parallel=4,
   hydrate_model=best available, ask_model=best available

### 1.2 Git Mirror

A **bare git clone** of a remote repository. Contains ALL git data — every
commit, every branch, every tag, the full history — but NO files checked out.
It is the compressed object database of the repo's entire history.

You cannot `ls` a mirror and see source files. It stores packed git objects and
refs. Its purpose is to enable efficient `git fetch` to pull new commits without
re-cloning the entire repo each time.

```
Git Mirror:
  mirror_id:     sha256(remote_url)[:16]    # deterministic from URL
  remote_url:    "https://github.com/owner/repo.git"
  mirror_path:   "{storage}/git/mirrors/{mirror_id}/"
  status:        pending | ready | error
  last_fetched:  timestamp of last successful git fetch
  size_bytes:    disk usage
```

- **1 mirror per unique remote URL** — shared across all worktrees from that repo
- **Never garbage collected** — mirrors are compressed and cheap to keep
- **Updated** via `git fetch` on webhook events or periodic polling

### 1.3 Worktree

A **detached git checkout** of source files at ONE specific commit. This is
what you get when you run `git worktree add --detach <path> <commit_sha>`.
`ls` a worktree and you see `src/`, `README.md`, etc. — actual source files.

The worktree is the **corpus** that an AgentIndex is built over.

```
Worktree:
  worktree_id:   "{repo_id}:{commit_sha}"
  repo_id:       "github:owner/repo"       # links to mirror's repo
  ref_name:      "refs/heads/main"          # branch that was tracked
  commit_sha:    "abc123def456..."          # frozen commit state
  worktree_path: "{storage}/git/worktrees/{repo_id}/{commit_sha}/"
  status:        pending | ready | reclaimed
```

- **Created** from a mirror: `git worktree add --detach <path> <commit>`
- **Shared** across AgentIndexes at the same commit (reference-counted)
- **LRU cached** — reclaimed after prolonged non-use (always restorable)

Flow: `git fetch` into mirror -> resolve ref to commit SHA -> `git worktree add`
at that commit -> source files appear on disk for the AgentIndex to consume.

### 1.4 AgentIndex

The core Spike data structure. An **agentic index** built over a worktree's
source files using the PRLM (Partitioned Recursive Language Model) algorithm.

Conceptually, it is a **B-tree-like index over a codebase** where each node
contains scoped file content and LLM-generated understanding. It enables
efficient agentic search and comprehension of large codebases.

The AgentIndex is fully represented in the database. Its structure (the node
graph, file assignments, corpus entries) and all associated data (agent sessions,
ask requests, tool calls) live as proper relational tables in spike.db. There
is nothing about an AgentIndex that lives outside the database except ephemeral
runtime state (sandboxes spun up during operations).

```
AgentIndex:
  index_id:       "auto-generated-uuid" or user-provided name
  display_name:   "my-project-main"
  config_id:      -> AgentConfig
  worktree_id:    -> Worktree
  source_path:    "/path/to/worktree/files"
  status:         pending | hydrating | ready | stale | error
  node_count:     number of nodes in the tree
  created_at:     timestamp
  updated_at:     timestamp
```

**PRLM Tree = AgentIndex.** Externally, we call it an AgentIndex. Internally
in the Go engine, the PRLM tree operations (hydrate, ask, partition) power it.

**Lifecycle:**
1. Created via API when user selects a repo + branch
2. Worktree materialized from git mirror
3. Hydration begins: PRLM algorithm partitions files into nodes, LLM generates
   understanding for each node bottom-up
4. Status transitions: pending -> hydrating -> ready
5. When tracked branch advances: a NEW AgentIndex is created (not mutated)

### 1.5 First-Class Entities Summary

The engine tracks these as first-class objects in spike.db, all viewable
and queryable from the UI:

| Entity | Description | Cardinality |
|---|---|---|
| **GitHub Installation** | Connected GitHub account | 1+ per engine |
| **Git Mirror** | Bare clone of a remote repo | 1 per unique remote URL |
| **Worktree** | Checked-out files at a specific commit | Many per mirror |
| **AgentConfig** | Tuning parameters for an index | 1 default + per-index overrides |
| **AgentIndex** | Agentic index built over a worktree | 0-many per worktree |
| **Ask Request** | A user question routed to an index | Many per index |
| **Agent Session** | LLM conversation trail for an ask | Many per index |

All entities are tracked with creation timestamps, update timestamps, and
status fields. The UI can display: when mirrors were last fetched, which
worktrees are hydrated, how many questions have been asked to each index,
and drill into the full question/answer/session logs.

---

## 2. Data Relationships

```
Account (frontdoor user, managed by nexus core APIs)
  │
  ▼
Engine (1 per tenant, runs spike-engine binary)
  │
  ├── Engine Config (env vars + CLI flags: auth, rate limits, LLM keys)
  │
  ├── GitHub Installations (engine-level, 1+ per connected GitHub account)
  │     │
  │     │ provides access to repos via installation token
  │     ▼
  ├── Git Mirrors (1 per unique remote URL, tracked in spike.db)
  │     │
  │     │ 1 mirror -> many worktrees (one per commit we materialize)
  │     ▼
  ├── Worktrees (checked out at specific commits, tracked in spike.db)
  │     │
  │     │ 1 worktree -> 0+ AgentIndexes
  │     │ most worktrees have 0 (just tracked) or 1 index
  │     │ some may have multiple (different configs on same code)
  │     ▼
  ├── AgentIndexes (the agentic indexes, tracked in spike.db)
  │     │
  │     │ 1 index -> many agent sessions
  │     │ 1 index -> many ask requests
  │     │
  │     │ Each index is a point-in-time snapshot. When a branch advances
  │     │ to a new commit, a NEW AgentIndex is created (seeded from the
  │     │ previous one for incremental hydration). All snapshots preserved.
  │     ▼
  └── Agent Sessions & Ask Requests
        Sessions contain turns -> messages -> tool calls
        Ask requests link to sessions for full conversation trails
```

### Multi-Repo Vision (Future)

A single AgentIndex spanning multiple repos:
- Multiple worktrees merged into one virtual source tree
- Or: user creates a git repo with submodules, hydrate that as one worktree
- Data model supports this: AgentIndex.worktree_id could become a junction table
- Deferred — submodule approach works today with no changes

---

## 3. Storage Architecture

### 3.1 Directory Layout

```
{storage_root}/                              ← single root, engine-level
├── spike.db                                 ← unified database (everything)
├── git/
│   ├── mirrors/
│   │   └── {mirror_id}/                     ← bare repo, 1 per remote URL
│   │       └── (git packed objects, refs)
│   └── worktrees/
│       └── {repo_id}/
│           └── {commit_sha}/                ← detached checkout
│               └── (actual source files: src/, README.md, etc.)
└── indexes/
    └── {index_id}/
        ├── runtime/                         ← ephemeral agent workspace
        └── sandboxes/                       ← ephemeral per-node scoped files
```

**What lives in spike.db:** Everything about the engine's state — mirrors,
worktrees, configs, indexes, the full node graph for each index, all agent
sessions, all ask requests with answers, all tool calls, all message content.
One file, one backup, one source of truth.

**What lives on the filesystem:** Git data (mirrors and worktrees are actual
git repositories / checkouts managed by git commands) and ephemeral runtime
state (sandboxes created during hydrate/ask operations).

### 3.2 Storage Root Resolution

The engine resolves `{storage_root}` from (in priority order):
1. `--storage-root` CLI flag (explicit override)
2. `NEXUS_STATE_DIR` env var (set by provisioner in nex mode)
3. `./data/` relative to working directory (local dev default)

All paths are derived deterministically from `storage_root` + identifiers.
**No storage paths in configs, YAML files, or API requests.**

Path derivation rules:
- Database: `{storage_root}/spike.db`
- Mirror: `{storage_root}/git/mirrors/{sha256(remote_url)[:16]}/`
- Worktree: `{storage_root}/git/worktrees/{repo_id}/{commit_sha}/`
- Index runtime: `{storage_root}/indexes/{index_id}/runtime/`
- Index sandboxes: `{storage_root}/indexes/{index_id}/sandboxes/`

### 3.3 SQLite Configuration

spike.db MUST be opened with WAL (Write-Ahead Logging) mode to support
concurrent reads during hydration/ask operations:

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
```

WAL mode allows multiple readers and one writer concurrently without blocking.
This is critical for the common case of ask queries running while hydration
or session logging is happening.

If performance becomes an issue at scale, consider:
- Connection pooling with separate read/write connections
- Sharding to per-index DBs (the schema supports this — just filter by index_id)
- Migration to PostgreSQL or similar (the relational schema translates directly)

---

## 4. Unified Database Schema (spike.db)

### 4.1 Agent Configs

```sql
CREATE TABLE IF NOT EXISTS agent_configs (
    config_id      TEXT PRIMARY KEY,
    display_name   TEXT NOT NULL DEFAULT '',
    capacity       INTEGER NOT NULL DEFAULT 120000,
    max_children   INTEGER NOT NULL DEFAULT 12,
    max_parallel   INTEGER NOT NULL DEFAULT 4,
    hydrate_model  TEXT NOT NULL DEFAULT '',
    ask_model      TEXT NOT NULL DEFAULT '',
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
);
```

One row with `config_id = 'default'` seeded at first startup with sane defaults.
Per-index config overrides stored as additional rows.

### 4.2 GitHub Installations

```sql
CREATE TABLE IF NOT EXISTS github_installations (
    installation_id INTEGER PRIMARY KEY,
    account_login   TEXT NOT NULL,
    account_type    TEXT NOT NULL,              -- 'User' or 'Organization'
    app_slug        TEXT NOT NULL,
    permissions_json TEXT NOT NULL DEFAULT '{}',
    suspended       INTEGER NOT NULL DEFAULT 0,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);
```

Engine-level. Not bound to any specific index or mirror. One installation
provides access to all repos in that GitHub account/org.

### 4.3 Git Mirrors

```sql
CREATE TABLE IF NOT EXISTS git_mirrors (
    mirror_id      TEXT PRIMARY KEY,           -- sha256(remote_url)[:16]
    remote_url     TEXT NOT NULL UNIQUE,
    mirror_path    TEXT NOT NULL,              -- filesystem path (derived)
    status         TEXT NOT NULL DEFAULT 'pending',  -- pending | ready | fetching | error
    last_fetched   INTEGER,                   -- unix timestamp of last successful fetch
    last_error     TEXT NOT NULL DEFAULT '',
    size_bytes     INTEGER NOT NULL DEFAULT 0,
    ref_count      INTEGER NOT NULL DEFAULT 0, -- number of worktrees using this mirror
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
);
```

### 4.4 Repositories & Refs

```sql
CREATE TABLE IF NOT EXISTS repositories (
    repo_id        TEXT PRIMARY KEY,           -- e.g., "github:owner/repo"
    remote_url     TEXT NOT NULL,
    mirror_id      TEXT NOT NULL,              -- links to git_mirrors
    installation_id INTEGER,                   -- GitHub installation providing access
    default_branch TEXT NOT NULL DEFAULT 'main',
    metadata_json  TEXT NOT NULL DEFAULT '{}', -- repo description, language, etc.
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    FOREIGN KEY (mirror_id) REFERENCES git_mirrors(mirror_id),
    FOREIGN KEY (installation_id) REFERENCES github_installations(installation_id)
);

CREATE TABLE IF NOT EXISTS repo_refs (
    repo_id        TEXT NOT NULL,
    ref_name       TEXT NOT NULL,              -- e.g., "refs/heads/main"
    commit_sha     TEXT NOT NULL,              -- latest known commit for this ref
    updated_at     INTEGER NOT NULL,
    PRIMARY KEY (repo_id, ref_name),
    FOREIGN KEY (repo_id) REFERENCES repositories(repo_id) ON DELETE CASCADE
);
```

### 4.5 Worktrees

```sql
CREATE TABLE IF NOT EXISTS worktrees (
    worktree_id    TEXT PRIMARY KEY,           -- "{repo_id}:{commit_sha}"
    repo_id        TEXT NOT NULL,
    ref_name       TEXT NOT NULL DEFAULT '',   -- branch that was tracked when created
    commit_sha     TEXT NOT NULL,
    worktree_path  TEXT NOT NULL,              -- filesystem path (derived)
    status         TEXT NOT NULL DEFAULT 'pending',  -- pending | ready | reclaimed | error
    size_bytes     INTEGER NOT NULL DEFAULT 0,
    last_accessed  INTEGER NOT NULL,           -- for LRU eviction
    created_at     INTEGER NOT NULL,
    UNIQUE (repo_id, commit_sha),
    FOREIGN KEY (repo_id) REFERENCES repositories(repo_id) ON DELETE CASCADE
);
```

### 4.6 Agent Indexes

```sql
CREATE TABLE IF NOT EXISTS agent_indexes (
    index_id          TEXT PRIMARY KEY,
    display_name      TEXT NOT NULL DEFAULT '',
    config_id         TEXT NOT NULL DEFAULT 'default',
    worktree_id       TEXT NOT NULL,
    source_path       TEXT NOT NULL,           -- filesystem path to source files
    root_node_id      TEXT NOT NULL DEFAULT '', -- root of the PRLM node graph
    status            TEXT NOT NULL DEFAULT 'pending',
    node_count        INTEGER NOT NULL DEFAULT 0,
    clean_count       INTEGER NOT NULL DEFAULT 0,
    total_tokens      INTEGER NOT NULL DEFAULT 0,
    total_files       INTEGER NOT NULL DEFAULT 0,
    last_error        TEXT NOT NULL DEFAULT '',
    previous_index_id TEXT,                    -- lineage for incremental hydration
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL,
    FOREIGN KEY (config_id) REFERENCES agent_configs(config_id),
    FOREIGN KEY (worktree_id) REFERENCES worktrees(worktree_id)
);
```

`previous_index_id` links to the prior AgentIndex for the same repo+branch,
enabling incremental hydration and version history traversal.

### 4.7 Agent Nodes (PRLM Tree Structure)

The PRLM tree is stored as **proper relational tables** rather than a JSON blob.
This enables individual node queries, cross-index analysis, and eliminates the
need to load multi-MB JSON into memory at startup.

```sql
-- Each node in the agent tree (the B-tree structure)
CREATE TABLE IF NOT EXISTS agent_nodes (
    index_id       TEXT NOT NULL,
    node_id        TEXT NOT NULL,
    parent_id      TEXT NOT NULL DEFAULT '',   -- empty for root node
    path           TEXT NOT NULL,              -- filesystem path this node covers
    capacity       INTEGER NOT NULL,
    status         TEXT NOT NULL DEFAULT 'created',  -- created|partitioning|ready|operating|failed
    staleness      TEXT NOT NULL DEFAULT 'clean',    -- clean|content_stale|structurally_stale
    last_operated  INTEGER,
    error          TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (index_id, node_id),
    FOREIGN KEY (index_id) REFERENCES agent_indexes(index_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_nodes_parent
    ON agent_nodes(index_id, parent_id);

CREATE INDEX IF NOT EXISTS idx_agent_nodes_status
    ON agent_nodes(index_id, status);

-- Files assigned to each node
CREATE TABLE IF NOT EXISTS agent_node_files (
    index_id       TEXT NOT NULL,
    node_id        TEXT NOT NULL,
    file_path      TEXT NOT NULL,
    PRIMARY KEY (index_id, node_id, file_path),
    FOREIGN KEY (index_id, node_id) REFERENCES agent_nodes(index_id, node_id) ON DELETE CASCADE
);

-- Bundle members (files grouped into a single node for small files)
CREATE TABLE IF NOT EXISTS agent_node_bundles (
    index_id       TEXT NOT NULL,
    node_id        TEXT NOT NULL,
    member_path    TEXT NOT NULL,
    PRIMARY KEY (index_id, node_id, member_path),
    FOREIGN KEY (index_id, node_id) REFERENCES agent_nodes(index_id, node_id) ON DELETE CASCADE
);

-- Corpus: every file in the source with token count and content hash
CREATE TABLE IF NOT EXISTS corpus_entries (
    index_id       TEXT NOT NULL,
    file_path      TEXT NOT NULL,
    tokens         INTEGER NOT NULL,
    hash           TEXT NOT NULL,              -- content hash for staleness detection
    PRIMARY KEY (index_id, file_path),
    FOREIGN KEY (index_id) REFERENCES agent_indexes(index_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_corpus_entries_hash
    ON corpus_entries(index_id, hash);
```

**Why relational instead of JSON blob:**
- Query individual nodes without deserializing the whole tree
- Find stale nodes efficiently: `WHERE status = 'stale'`
- File-level queries: "which node owns this file?"
- Cross-index queries: "how many total files across all indexes?"
- No multi-MB JSON load into memory at startup
- Standard SQL indexing for performance

### 4.8 Ask Requests

```sql
CREATE TABLE IF NOT EXISTS ask_requests (
    request_id     TEXT PRIMARY KEY,
    index_id       TEXT NOT NULL,
    query_text     TEXT NOT NULL,
    status         TEXT NOT NULL,               -- pending|running|completed|failed
    root_turn_id   TEXT NOT NULL DEFAULT '',
    answer_preview TEXT NOT NULL DEFAULT '',
    error_code     TEXT NOT NULL DEFAULT '',
    error_message  TEXT NOT NULL DEFAULT '',
    created_at     INTEGER NOT NULL,
    completed_at   INTEGER,
    FOREIGN KEY (index_id) REFERENCES agent_indexes(index_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ask_requests_index
    ON ask_requests(index_id, created_at DESC);
```

### 4.9 Broker Ledger (Agent Sessions)

All LLM conversation data for hydrate and ask operations. Every session, turn,
message, and tool call is preserved permanently, linked to its AgentIndex.

```sql
CREATE TABLE IF NOT EXISTS sessions (
    label          TEXT PRIMARY KEY,
    index_id       TEXT NOT NULL,
    thread_id      TEXT,
    persona_id     TEXT NOT NULL,
    is_subagent    INTEGER DEFAULT 0,
    parent_session_label TEXT,
    parent_turn_id TEXT,
    spawn_tool_call_id TEXT,
    task_description TEXT,
    task_status    TEXT,
    routing_key    TEXT,
    origin         TEXT,
    origin_session_id TEXT,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    status         TEXT NOT NULL DEFAULT 'active',
    FOREIGN KEY (index_id) REFERENCES agent_indexes(index_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_index
    ON sessions(index_id, created_at DESC);

CREATE TABLE IF NOT EXISTS turns (
    id             TEXT PRIMARY KEY,
    index_id       TEXT NOT NULL,
    session_label  TEXT NOT NULL,
    parent_turn_id TEXT,
    turn_type      TEXT NOT NULL DEFAULT 'normal',
    status         TEXT NOT NULL DEFAULT 'pending',
    started_at     INTEGER NOT NULL,
    completed_at   INTEGER,
    model          TEXT,
    provider       TEXT,
    role           TEXT NOT NULL DEFAULT 'unified',
    toolset_name   TEXT,
    tools_available TEXT,
    input_tokens   INTEGER,
    output_tokens  INTEGER,
    cached_input_tokens INTEGER,
    total_tokens   INTEGER,
    query_message_ids TEXT,
    response_message_id TEXT,
    has_children   INTEGER DEFAULT 0,
    tool_call_count INTEGER DEFAULT 0,
    workspace_path TEXT,
    FOREIGN KEY (index_id) REFERENCES agent_indexes(index_id) ON DELETE CASCADE,
    FOREIGN KEY (session_label) REFERENCES sessions(label),
    FOREIGN KEY (parent_turn_id) REFERENCES turns(id)
);

CREATE INDEX IF NOT EXISTS idx_turns_session
    ON turns(session_label, started_at);

CREATE TABLE IF NOT EXISTS messages (
    id             TEXT PRIMARY KEY,
    index_id       TEXT NOT NULL,
    turn_id        TEXT NOT NULL,
    role           TEXT NOT NULL,
    content        TEXT,
    source         TEXT,
    sequence       INTEGER NOT NULL,
    created_at     INTEGER NOT NULL,
    thinking       TEXT,
    context_json   TEXT,
    metadata_json  TEXT,
    FOREIGN KEY (index_id) REFERENCES agent_indexes(index_id) ON DELETE CASCADE,
    FOREIGN KEY (turn_id) REFERENCES turns(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_turn
    ON messages(turn_id, sequence);

CREATE TABLE IF NOT EXISTS tool_calls (
    id             TEXT PRIMARY KEY,
    index_id       TEXT NOT NULL,
    turn_id        TEXT NOT NULL,
    message_id     TEXT,
    tool_name      TEXT NOT NULL,
    tool_number    INTEGER,
    params_json    TEXT NOT NULL,
    result_json    TEXT,
    error          TEXT,
    status         TEXT NOT NULL DEFAULT 'pending',
    spawned_session_label TEXT,
    started_at     INTEGER NOT NULL,
    completed_at   INTEGER,
    sequence       INTEGER NOT NULL,
    FOREIGN KEY (index_id) REFERENCES agent_indexes(index_id) ON DELETE CASCADE,
    FOREIGN KEY (turn_id) REFERENCES turns(id)
);

CREATE INDEX IF NOT EXISTS idx_tool_calls_turn
    ON tool_calls(turn_id, sequence);
```

### 4.10 Jobs

```sql
CREATE TABLE IF NOT EXISTS jobs (
    id             TEXT PRIMARY KEY,
    index_id       TEXT,
    job_type       TEXT NOT NULL,               -- sync | hydrate | ask
    status         TEXT NOT NULL,               -- pending|running|completed|failed
    progress_pct   INTEGER NOT NULL DEFAULT 0,  -- 0-100 for UI progress display
    request_json   TEXT NOT NULL DEFAULT '{}',
    result_json    TEXT NOT NULL DEFAULT '{}',
    error          TEXT NOT NULL DEFAULT '',
    created_at     INTEGER NOT NULL,
    started_at     INTEGER,
    completed_at   INTEGER,
    FOREIGN KEY (index_id) REFERENCES agent_indexes(index_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status
    ON jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_jobs_index
    ON jobs(index_id, created_at DESC);
```

---

## 5. Engine Architecture

### 5.1 What Is the Engine?

The engine is the Go binary (`spike-engine`). It is the single process that:
- Serves the HTTP API (nex service operations + legacy direct routes)
- Manages git operations (mirrors, worktrees) — tracked as first-class objects
- Manages all AgentIndexes in memory and in spike.db
- Runs the PRLM oracle (hydrate, ask, partition operations)
- Runs the broker (LLM agent sessions)
- Processes GitHub webhooks
- Manages the unified database (spike.db)

### 5.2 Engine Config

Engine configuration comes from environment variables and CLI flags.
These are about the process itself, not about any specific index.

| Source | Variables |
|---|---|
| Env (from frontdoor) | SPIKE_AUTH_TOKEN, SPIKE_GITHUB_APP_*, OPENAI_API_KEY, etc. |
| Env (from provisioner) | NEXUS_STATE_DIR, NEX_SERVICE_PORT |
| CLI flags | --port, --storage-root, --ask-timeout, --rate-limit-rps |

See SPIKE_FRONTDOOR_INTEGRATION.md for credential inheritance chain.

### 5.3 Engine Startup

On startup, the engine:
1. Resolves `storage_root` from flag/env/default
2. Opens `spike.db` with WAL mode (creates if first run, runs migrations)
3. Seeds default AgentConfig row if none exists
4. Initializes git adapter (mirrors root, worktrees root derived from storage_root)
5. Loads all AgentIndexes with status=ready from spike.db
6. For each ready index: loads PRLM tree into memory, initializes broker
7. Starts HTTP server

**The engine starts successfully with zero indexes.** This is the normal state
for a freshly provisioned tenant. No YAML profiles required. No crash on empty.

### 5.4 Dynamic Index Creation

New nex operation: `spike.indexes.create`

```json
{
    "repo_url": "https://github.com/owner/repo.git",
    "ref": "refs/heads/main",
    "display_name": "my-project",
    "config_overrides": {
        "capacity": 120000,
        "hydrate_model": "gpt-5.3-codex:high"
    }
}
```

All fields except `repo_url` are optional. `ref` defaults to the repo's default
branch. `config_overrides` defaults to the engine defaults. `display_name`
defaults to `{repo_name}-{branch}`.

Engine flow:
1. Ensure git mirror exists for repo_url (create or reuse)
2. `git fetch` to get latest refs
3. Resolve ref to commit SHA
4. Ensure worktree exists at that commit (create or reuse)
5. Create AgentConfig row (merge defaults with any overrides)
6. Create AgentIndex record in spike.db
7. Initialize PRLM tree in memory, create agent_nodes root
8. Kick off hydration job
9. Return index_id + status to caller

---

## 6. Key Lifecycle Behaviors

### 6.1 AgentIndex Versioning

Each AgentIndex is a **point-in-time snapshot**. When a tracked branch advances
to a new commit:

1. Mirror is updated (new commit fetched via webhook or poll)
2. New worktree materialized at new commit
3. **New AgentIndex created** with `previous_index_id` pointing to the old one
4. New index hydrated incrementally using the previous index as seed:
   - Unchanged files: copy node data from previous index (skip LLM calls)
   - Changed files: mark nodes as stale, re-hydrate
   - New files: create new nodes and hydrate
   - Deleted files: remove nodes, rebalance tree
5. Old index preserved exactly as-is — queryable, browseable, with full
   session history intact

This provides full history: "What did the codebase look like at commit abc123?
What questions were asked about it? What were the answers?"

### 6.2 Incremental Hydration (Future — Marked for Roadmap)

When creating a new AgentIndex from a previous one at a newer commit:
1. Diff the file trees between old and new worktrees
2. Nodes whose files haven't changed: copy from old index (skip LLM calls)
3. Nodes with changed files: mark as stale, re-hydrate
4. Nodes for new files: create and hydrate
5. Nodes for deleted files: remove from tree, rebalance

This makes branch-tracking cheap after the initial full hydration.

### 6.3 Concurrent Access

- **Multiple asks on same index**: Supported. Index is read-only between
  hydrations. Broker handles session isolation. WAL mode ensures reads don't
  block on writes.
- **Ask during hydration**: Queue the ask. Wait for hydration to complete
  before executing. Can be refined later to allow asks against last-stable state.

### 6.4 Garbage Collection & Lifecycle Policies

#### Git Mirrors
- **Policy: Never garbage collect.**
- Mirrors are compressed git object databases. Even large repos are typically
  a few hundred MB in mirror form. The storage cost is negligible compared to
  the cost of re-cloning.
- All mirrors are tracked in `git_mirrors` table with `last_fetched` timestamp
  and `size_bytes` for observability.

#### Worktrees
- **Policy: LRU cache with lazy reclamation.**
- Worktrees are full file checkouts and can be large. When disk pressure or
  time-based policy triggers:
  1. Find worktrees with no active AgentIndex referencing them (status != ready)
  2. Sort by `last_accessed` ascending (least recently used first)
  3. Mark as `status = 'reclaimed'`, delete files from disk
  4. Worktree row stays in spike.db (preserves history)
- **Always restorable**: To restore a reclaimed worktree, re-run
  `git worktree add --detach` from the mirror. The mirror always has the commit.
- **Default eviction threshold**: 30 days of non-access. Configurable via
  engine config.
- Worktree `last_accessed` is updated on: AgentIndex creation, ask request,
  sync operation.

#### AgentIndexes
- **Policy: Never auto-delete. Manual deletion only.**
- Every AgentIndex is a valuable point-in-time snapshot with full conversation
  history. Deleting one loses the LLM-generated understanding and all associated
  ask sessions permanently.
- Manual deletion via `spike.indexes.delete` API removes:
  - The agent_indexes row
  - All agent_nodes, agent_node_files, corpus_entries for that index
  - All sessions, turns, messages, tool_calls for that index
  - The runtime/ and sandboxes/ directories for that index
  - Does NOT remove the worktree (other indexes may reference it)

#### Sandboxes
- **Policy: Ephemeral. Spin up per operation, tear down on completion.**
- Sandboxes are per-node scoped copies of source files, created so the LLM
  agent has a focused view of relevant code during hydrate/ask.
- Created at the start of each hydrate/ask operation for each node being operated on.
- Torn down immediately when the operation completes (success or failure).
- On engine startup: scan `indexes/*/sandboxes/` and delete any stale directories
  left behind by crashed operations.

### 6.5 Engine Restart Recovery

On restart, the engine:
1. Opens spike.db (WAL mode) — all metadata and index data intact
2. Queries `agent_indexes WHERE status = 'ready'`
3. For each: loads PRLM node graph from agent_nodes table, initializes broker
4. Verifies worktree paths still exist on disk:
   - If present: ready to serve
   - If reclaimed: restore from mirror (`git worktree add`), or mark stale
5. Cleans up stale sandboxes from any crashed operations
6. Resumes `jobs WHERE status = 'running'` (hydrations interrupted by restart)
7. Starts HTTP server — immediately serving ready indexes

---

## 7. API Surface (Nex Operations)

### Index Management

| Operation | Description |
|---|---|
| `spike.indexes.create` | Create new AgentIndex from repo+ref with sane defaults |
| `spike.indexes.list` | List all AgentIndexes with status, node counts, ask counts |
| `spike.indexes.get` | Get full details of a specific index |
| `spike.indexes.delete` | Manually delete an index and all associated data |
| `spike.indexes.status` | Get hydration progress (node count, % complete) |

### Agent Operations

| Operation | Description |
|---|---|
| `spike.ask` | Ask a question against an index |
| `spike.ask-requests.list` | List ask history for an index |
| `spike.ask-requests.get` | Get details + answer for a specific ask |
| `spike.ask-requests.inspect` | Inspect full session/turn/message trail |

### Git & GitHub

| Operation | Description |
|---|---|
| `spike.github.installations` | List connected GitHub installations |
| `spike.github.repos` | List repos accessible via installation |
| `spike.github.repos.refs` | List branches/tags for a repo |
| `spike.mirrors.list` | List all tracked git mirrors with status and last fetch |
| `spike.worktrees.list` | List all worktrees with status, size, linked indexes |
| `spike.sync` | Trigger git fetch + worktree update for a repo/index |

### Config

| Operation | Description |
|---|---|
| `spike.config.defaults` | Get/set default AgentConfig |
| `spike.config.get` | Get config for a specific index |
| `spike.config.update` | Update config for a specific index |

---

## 8. UI Flow (E2E Target)

### First-Time User Experience

```
1. User visits spike.fyi
   -> Redirects to frontdoor.nexushub.sh
   -> Google OAuth login
   -> Auto-provision: frontdoor spawns nex runtime + spike engine
   -> Engine starts with empty spike.db, zero indexes

2. Spike dashboard loads (empty state)
   -> "Connect GitHub to get started" prompt
   -> Shows: 0 mirrors, 0 worktrees, 0 indexes

3. User clicks "Connect GitHub"
   -> Redirects to github.com/apps/ask-spike/installations/new
   -> User authorizes on GitHub
   -> GitHub redirects to frontdoor callback URL (session-routed)
   -> Engine stores installation_id in github_installations table
   -> UI shows "GitHub Connected" + repo list

4. User browses repos
   -> Engine calls GitHub API using installation token
   -> UI shows repo names, default branches, last commit date
   -> Repos are stored in repositories table for future reference

5. User selects a repo, clicks "Create Index"
   -> Engine creates git mirror (or reuses existing)
   -> Engine fetches latest, resolves ref to commit
   -> Engine creates worktree at that commit
   -> Engine creates AgentIndex with default AgentConfig
   -> Hydration starts automatically
   -> UI shows progress: nodes created, nodes hydrated, % complete

6. Hydration completes
   -> Index status = 'ready'
   -> UI shows: node count, file count, total tokens indexed
   -> "Ask a question" input appears

7. User asks a question
   -> Engine routes to hydrated AgentIndex
   -> PRLM agent navigates tree, builds domain context, generates answer
   -> Agent session (turns, messages, tool calls) recorded in spike.db
   -> UI shows answer with source file references

8. User can browse:
   -> All mirrors (repos tracked, last fetch time)
   -> All worktrees (which commits, disk size, which indexes built)
   -> All indexes (status, node count, ask count, creation date)
   -> All ask history (questions, answers, full session logs)
```

---

## 9. Migration Path from Current Code

### What Changes

| Current | Target | Change |
|---|---|---|
| TreeProfile (YAML files) | AgentConfig (spike.db rows) | Move config to DB, add sane defaults |
| loadTreeProfiles() crash on empty | Start with zero indexes | Remove hard requirement |
| Per-tree SQLite store (store.db) | Unified spike.db | Merge all tables into one DB |
| Tree DAG as JSON blob | Relational agent_nodes tables | Normalize into proper tables |
| servedTree struct | AgentIndex struct | Rename, adjust fields |
| github_connector_bindings (per tree) | github_installations (engine-level) | Decouple from index |
| Static tree_id in YAML | Dynamic index_id via API | Add create/delete operations |
| control.db (separate) | spike.db (unified) | Merge into single DB |
| No mirror/worktree tracking in DB | First-class git_mirrors + worktrees tables | Add tracking |
| oracleServer.trees map | oracleServer.indexes map | Rename |

### Hard Cutover Policy

**No backward compatibility.** YAML profiles (profile.go) are deleted entirely.
The --configs flag is removed. There is no migration from old per-tree store.db
files. Old data on oracle-1 is abandoned — fresh spike.db created on first
startup. This is a clean break.

---

## 10. Mapping: Old Names -> New Names

For agents working in the codebase, here is the terminology mapping:

| Old (codebase) | New (spec) | Notes |
|---|---|---|
| TreeProfile | AgentConfig | YAML struct -> DB row |
| tree_id | index_id | Identity of an AgentIndex |
| servedTree | AgentIndex | Runtime representation |
| OracleTree | AgentIndex (internal engine) | PRLM operations engine |
| Tree (prlm/tree) | Agent node graph | The B-tree structure, now relational |
| Node (prlm/node) | AgentNode | Individual node in the tree |
| CorpusEntry | corpus_entries row | File path + token count + hash |
| prlmstore.SQLiteStore | spike.db unified | Single database |
| control.Store | spike.db unified | Merged |
| broker.Store | spike.db unified | Merged |
| TreeVersion | AgentIndex lineage (previous_index_id) | Point-in-time snapshots |
| github_connector_bindings | github_installations | Engine-level |
| configsDir (--configs) | storage_root (--storage-root) | Single root, --configs deleted |
| (not tracked) | git_mirrors table | Now first-class |
| (partially tracked) | worktrees table | Now first-class with LRU |

---

## 11. What We Need for E2E Test

To achieve the production flow (spike.fyi -> signup -> connect GitHub -> hydrate
-> ask), the following must work:

### Already Done
- [x] Spike runs as nex app (manifest, service binary, dist/ UI)
- [x] UI serves from filesystem dist/ (not embedded HTML)
- [x] GitHub App configured (Ask-Spike, ID 2957819)
- [x] GitHub App creds in frontdoor.env (cascade to engine)
- [x] Frontdoor restarts with new creds
- [x] GitHub callback redirects to / (isNexMode fix)
- [x] Frontdoor integration spec written
- [x] Data model spec written (this document)

### Must Build
- [ ] Engine starts with zero indexes (remove loadTreeProfiles hard fail)
- [ ] Unified spike.db schema with WAL mode
- [ ] First-class git_mirrors and worktrees tables
- [ ] Relational agent_nodes tables (replace JSON blob)
- [ ] Default AgentConfig seeding at startup
- [ ] Storage path derivation from storage_root (no YAML paths)
- [ ] GitHub installation stored engine-level (not per-tree)
- [ ] `spike.indexes.create` operation (dynamic index creation)
- [ ] `spike.github.repos` operation (list repos via installation)
- [ ] `spike.mirrors.list` and `spike.worktrees.list` operations
- [ ] UI: empty state with "Connect GitHub" prompt
- [ ] UI: repo browser after GitHub connection
- [ ] UI: "Create Index" button with auto-hydration
- [ ] UI: hydration progress display
- [ ] UI: ask interface once index is ready
- [ ] UI: browse mirrors, worktrees, indexes, ask history

### Can Defer
- [ ] Incremental hydration (new commit -> seed from previous index)
- [ ] Auto-advance on branch push (webhook-driven)
- [ ] Worktree LRU garbage collection (implement eviction loop)
- [ ] Multi-repo indexes
- [ ] AgentConfig UI for power users
- [ ] Cross-index ask routing
- [ ] ~~Migration from legacy per-tree store.db files~~ (not doing — hard cutover)
