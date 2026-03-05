# Spike Workplan: Current State -> E2E Target

> Detailed implementation plan for transforming the current Spike engine into the
> target architecture defined in SPIKE_DATA_MODEL.md. Organized into phases with
> dependencies clearly marked.
>
> Written 2026-03-04. Supersedes previous workplan. Based on gap analysis of all
> engine subsystems.
>
> **HARD CUTOVER. NO BACKWARD COMPATIBILITY.** No YAML profile loading, no
> --configs flag, no migration from old DBs, no legacy mode. Old code is deleted,
> not deprecated.

---

## Current State Summary

| Subsystem | Status | Key Gap |
|---|---|---|
| Engine startup | Crashes without YAML profiles (profile.go:79) | Must start with zero indexes |
| Database | 1 control.db + N per-tree runtime.db | Must unify into spike.db |
| Tree storage | JSON blob in trees.data (potentially 100s of MB) | Must normalize to relational tables |
| Git tracking | Filesystem only, no DB tracking | Must track mirrors + worktrees in DB |
| GitHub connector | Per-tree bindings (tree_id PRIMARY KEY) | Must be engine-level installations |
| API surface | 0 of 7 new target operations exist | Must add indexes.create, mirrors.list, etc. |
| UI | Core works, missing empty state + create flow | Must add create-index UX + browsers |

### Database Architecture (Current)

Per deployment: 1 control.db (global) + N runtime.db (1 per tree profile)

The broker ledger shares the same runtime.db handle as the PRLM store (not a
separate file). The broker creates its ~46 tables via `EnsureLedgerSchema()` in
the same DB.

All databases already use WAL mode, busy_timeout=5000, MaxOpenConns=1, foreign
keys ON.

### Key Files and Line Numbers

| File | Lines | Critical Code |
|---|---|---|
| `cmd/spike-engine/profile.go:79-81` | 87 | **Hard-fail on empty profiles** |
| `cmd/spike-engine/main.go:466-556` | 600+ | cmdServe — startup, flags, env vars |
| `cmd/spike-engine/serve.go:534-687` | 2800+ | newOracleServer — init, path resolution |
| `cmd/spike-engine/serve.go:601` | | loadTreeProfiles call — crash point |
| `cmd/spike-engine/github_connector.go` | 1200+ | GitHub App, callbacks, token minting |
| `internal/prlm/store/sqlitestore.go` | 170 | SaveTree/LoadTree — JSON blob |
| `internal/prlm/store/schema.go` | 100 | PRLM store schema |
| `internal/prlm/tree/tree.go` | 300 | Tree struct, AddNode, RemoveSubtree |
| `internal/prlm/tree/oracle.go` | 1000+ | OracleTree — hydrate, ask, sync |
| `internal/control/store.go` | 170 | Control DB schema + migrations |
| `internal/broker/ledger.go` | 570 | Broker ledger schema (46 tables) |
| `internal/git/adapter.go` | 320 | Git mirror + worktree operations |
| `app/dist/index.html` | 844 | Main dashboard UI |
| `app/dist/inspector.html` | 928 | Ask request inspector UI |

---

## Phase 1: Unified Database Foundation

**Goal:** Replace separate DBs with unified spike.db. Engine starts with zero
indexes. All paths derive from storage_root.

**Why first:** Everything else depends on the unified DB being in place.

### 1.1 Storage Root + Startup Overhaul

**Files to modify:**
- `cmd/spike-engine/main.go` — add --storage-root flag, resolve from flag/env/default, remove --configs flag
- `cmd/spike-engine/profile.go` — DELETE entirely (YAML profiles removed, no backward compat)
- `cmd/spike-engine/serve.go` — change newOracleServer(configsDir) to newOracleServer(storageRoot)

**Changes:**
1. Add `--storage-root` flag (resolve: flag -> NEXUS_STATE_DIR -> `./data/`)
2. Change newOracleServer signature to take storageRoot instead of configsDir
3. Delete loadTreeProfiles() and all YAML profile loading code entirely
4. Remove --configs flag completely (hard cutover, no backward compat)
5. Derive all paths from storageRoot:
   - `{storageRoot}/spike.db` (replaces resolveControlDBPath + resolveDBPath)
   - `{storageRoot}/git/mirrors/` (replaces git-mirrors-dir flag)
   - `{storageRoot}/git/worktrees/` (replaces git-worktrees-dir flag)
   - `{storageRoot}/indexes/{index_id}/runtime/` and `sandboxes/`
6. Seed default AgentConfig on first startup

**Key functions to modify:**
- resolveControlDBPath (serve.go:3004-3017) — replace with storageRoot + "spike.db"
- resolveGitStorageRoots (serve.go:3019-3049) — use storageRoot instead of configsDir
- resolveDBPath (main.go:629-647) — replace with unified DB path
- resolveRuntimeDir (main.go:566-595) — use storageRoot + "indexes/{id}/"

### 1.2 Unified spike.db Schema

**New package: `internal/spikedb/`**
- `store.go` — open spike.db, WAL mode, migrations
- `schema.go` — all CREATE TABLE statements
- `migrations.go` — schema versioning
- `agent_configs.go` — CRUD for configs
- `agent_indexes.go` — CRUD for indexes
- `agent_nodes.go` — CRUD for nodes
- `corpus.go` — CRUD for corpus entries
- `mirrors.go` — CRUD for git mirrors
- `worktrees.go` — CRUD for worktrees
- `github_installations.go` — CRUD for installations

**Tables to create (new):**
- agent_configs, git_mirrors, worktrees, agent_indexes
- agent_nodes, agent_node_files, agent_node_bundles, corpus_entries
- github_installations

**Tables to migrate (from control.db):**
- repositories, repo_refs, jobs, webhook_deliveries
- Rename tree_id -> index_id where applicable

**Tables to migrate (from broker in runtime.db):**
- sessions, turns, messages, tool_calls, threads
- Plus ~10 auxiliary tables (compactions, artifacts, etc.)
- Add index_id FK to all tables

**Tables to drop/replace:**
- trees (replaced by agent_indexes + agent_nodes + corpus_entries)
- agents, agent_messages (legacy, replaced by broker sessions)

### 1.3 Relational Node Storage

**Files to modify:**
- `internal/prlm/store/sqlitestore.go` — SaveTree/LoadTree rewrite
- `internal/prlm/tree/tree.go` — AddNode, RemoveSubtree write to DB
- `internal/prlm/tree/oracle.go` — tree operations pipeline

**Strategy:** Keep the in-memory Tree struct exactly as-is. Only change
serialization. The Tree struct is the runtime format; the relational DB is
the storage format.

**SaveTree becomes:**
1. BEGIN transaction
2. UPSERT agent_indexes row (metadata)
3. DELETE + INSERT all agent_nodes (full replace in transaction)
4. DELETE + INSERT all agent_node_files
5. DELETE + INSERT all corpus_entries (path + tokens + hash, NO content)
6. COMMIT

**LoadTree becomes:**
1. SELECT from agent_indexes WHERE index_id = ?
2. SELECT from agent_nodes WHERE index_id = ?
3. SELECT from agent_node_files WHERE index_id = ?
4. SELECT from corpus_entries WHERE index_id = ?
5. Reconstruct Tree struct maps in memory

**Critical decision: corpus content.**
Current Tree.Index stores full file CONTENT (can be 100s of MB). Target:
do NOT store content in DB. Read from worktree filesystem on demand.
The corpus_entries table stores only path + tokens + hash.

### 1.4 Server Initialization Refactor

**Files to modify:**
- `cmd/spike-engine/serve.go` — rewrite newOracleServer

**Target init flow:**
```
newOracleServer(storageRoot, opts)
  -> open spike.db (unified, WAL mode)
  -> seed default AgentConfig if none exists
  -> init git adapter from {storageRoot}/git/
  -> query agent_indexes WHERE status = 'ready'
  -> for each:
      -> load Tree from agent_nodes/corpus_entries
      -> init OracleTree with unified DB handle
      -> init Broker with unified DB handle
      -> store in s.indexes map
  -> start sync worker
  -> return server (works fine with 0 indexes)
```

---

## Phase 2: Git & GitHub Refactor

**Goal:** Track mirrors and worktrees as first-class DB objects. Decouple
GitHub installations from trees.

**Depends on:** Phase 1

### 2.1 First-Class Mirror Tracking

**Files to modify:**
- `internal/git/adapter.go` — add store ref, DB writes in EnsureMirror
- `internal/spikedb/mirrors.go` — CRUD operations

**Changes:**
- Adapter gets a spikedb.Store reference
- EnsureMirror: after git clone/fetch -> upsert git_mirrors row
- New: ListMirrors(), GetMirror(id)
- Track: status, last_fetched, size_bytes

### 2.2 First-Class Worktree Tracking

**Files to modify:**
- `internal/git/adapter.go` — DB writes in EnsurePinnedWorktree
- `internal/spikedb/worktrees.go` — CRUD operations

**Changes:**
- EnsurePinnedWorktree: after git worktree add -> upsert worktrees row
- New: ListWorktrees(), GetWorktree(id)
- Track: status, last_accessed, size_bytes
- Update last_accessed on any operation touching the worktree

### 2.3 GitHub Installation Refactor

**Files to modify:**
- `cmd/spike-engine/github_connector.go` — major refactor (1200+ lines)
- `internal/control/github_connector_bindings.go` — replace/augment
- `internal/spikedb/github_installations.go` — new CRUD

**Changes:**
1. New github_installations table (engine-level, keyed by installation_id)
2. Callback handler: store in github_installations, not per-tree binding
3. Repos handler: accept installation_id, not tree_id
4. Token minting: look up by installation_id directly
5. Secret storage: `credentials/github/installations/{id}/secret.json`

### 2.4 Sync Flow Update

**Files to modify:**
- `cmd/spike-engine/serve.go` — processSyncTask (lines 1096-1312)

**Changes:**
- Mirror and worktree DB writes now happen automatically via adapter (2.1, 2.2)
- GitHub remote resolution: use installation_id lookup, not tree binding
- Update tree_versions usage to work with new index_id naming

---

## Phase 3: Dynamic Index Creation

**Goal:** Add spike.indexes.create API. Create indexes on-demand.

**Depends on:** Phase 1 + Phase 2

### 3.1 indexes.create Operation

**New handler in serve.go:**
```
POST spike.indexes.create {repo_url, ref?, display_name?, config_overrides?}
  -> Ensure git mirror (create or reuse)
  -> git fetch -> resolve ref (default branch if omitted)
  -> Ensure worktree at resolved commit
  -> Create AgentConfig row (merge defaults + overrides)
  -> Create agent_indexes row (status: pending)
  -> Create runtime dir: {storageRoot}/indexes/{index_id}/
  -> Init PRLM tree in memory
  -> Enqueue hydration job
  -> Return {index_id, status}
```

### 3.2 Supporting Operations (7 new handlers)

- `spike.indexes.list` — list all indexes with status, node/ask counts
- `spike.indexes.get` — full details for one index
- `spike.indexes.delete` — remove index + associated data (manual only)
- `spike.indexes.status` — hydration progress (nodes, %, phase)
- `spike.mirrors.list` — list tracked mirrors (URL, last_fetched, status, size)
- `spike.worktrees.list` — list worktrees (repo, commit, size, linked indexes)
- `spike.github.installations` — list connected GitHub installations

### 3.3 Config Operations (3 new handlers)

- `spike.config.defaults` — get/set default AgentConfig
- `spike.config.get` — get effective config for specific index
- `spike.config.update` — update config for specific index

---

## Phase 4: UI Updates

**Goal:** Update dashboard for the new E2E user flow.

**Depends on:** Phase 3

### 4.1 Empty State + Connect GitHub

**File:** `app/dist/index.html`

- On load: call spike.github.installations
- If empty: large "Connect GitHub to get started" CTA
- If connected: transition to repo browser
- Remove manual tree_id input

### 4.2 Create Index Flow

**File:** `app/dist/index.html`

- Repo + branch picker (already works) -> "Create Index" button
- Calls spike.indexes.create
- Polls spike.indexes.status every 3s
- Shows: nodes indexed, % complete, current phase
- On ready: transition to ask interface

### 4.3 Browse Panels

**File:** `app/dist/index.html` (new sections)

- Mirrors browser: remote URL, last fetch, status, size
- Worktrees browser: repo, commit, status, linked indexes
- Indexes browser: name, status, nodes, ask count
- Ask history: query text, answer preview, timestamps, drill-in to inspector

### 4.4 Inspector Updates

**File:** `app/dist/inspector.html`

- Replace tree_id with index_id throughout
- Update API method names to match new operations
- Add "Browse by Index" navigation

---

## Phase 5: Integration & E2E Test

**Goal:** Full production flow working on oracle-1.

**Depends on:** All previous phases

### 5.1 Pre-Test Checklist

- [ ] Engine starts with zero indexes (no crash)
- [ ] spike.db created with all tables on first startup
- [ ] Default AgentConfig seeded
- [ ] Git adapter tracks mirrors + worktrees in spike.db
- [ ] GitHub installation stored engine-level
- [ ] spike.indexes.create works end-to-end
- [ ] UI shows empty state -> connect -> browse -> create -> hydrate -> ask

### 5.2 E2E Test Flow

1. Visit frontdoor.nexushub.sh
2. Google OAuth login -> auto-provision
3. Spike dashboard loads (empty state)
4. Click "Connect GitHub" -> authorize Ask-Spike app
5. GitHub callback routes through frontdoor to engine
6. Repo list appears
7. Select repo + branch -> "Create Index"
8. Watch hydration progress
9. Ask a question -> get answer
10. Browse mirrors, worktrees, indexes, ask history

---

## Work Estimates

| Phase | Scope | Est. LOC | Complexity |
|---|---|---|---|
| 1.1 Storage Root + Startup | ~200 | Medium |
| 1.2 Unified spike.db Schema | ~600 | **High** |
| 1.3 Relational Node Storage | ~400 | **High** |
| 1.4 Server Init Refactor | ~300 | **High** |
| 2.1 Mirror Tracking | ~150 | Medium |
| 2.2 Worktree Tracking | ~150 | Medium |
| 2.3 GitHub Install Refactor | ~300 | Medium |
| 2.4 Sync Flow Update | ~100 | Low |
| 3.1 indexes.create | ~200 | Medium |
| 3.2 Supporting Operations | ~400 | Medium |
| 3.3 Config Operations | ~100 | Low |
| 4.1-4.4 UI Updates | ~650 | Medium |
| 5.x Integration/Testing | — | Medium |
| **Total** | **~3,550 LOC** | **High** |

---

## Dependency Graph

```
Phase 1.1 (Storage Root)
  |
  v
Phase 1.2 (Unified Schema) <---- Phase 1.3 (Relational Nodes)
  |
  v
Phase 1.4 (Server Init Refactor)
  |
  v
Phase 2.1 + 2.2 (Mirror + Worktree Tracking)
  |
  v
Phase 2.3 + 2.4 (GitHub + Sync Refactor)
  |
  v
Phase 3.1 + 3.2 + 3.3 (Dynamic Creation + APIs)
  |
  v
Phase 4.x (UI Updates)
  |
  v
Phase 5.x (Integration + E2E Test)
```

---

## Design Decisions

### DD-1: Corpus Content Storage
Current Tree.Index stores full file CONTENT (can be 100s of MB).
**Decision: Do NOT store content in DB.** Read from worktree on demand.
corpus_entries stores only path + tokens + hash.

### DD-2: In-Memory Tree Struct
PRLM algorithms operate on in-memory Tree struct.
**Decision: Keep in-memory approach.** Load from DB at startup, write-through
on changes. Relational DB is storage format, Tree struct is runtime format.

### DD-3: Broker Table Migration
Broker has 46 tables with complex migration logic.
**Decision: Move all tables into spike.db.** Add index_id FK to core tables.
Preserve broker's ensureColumnExists migration logic.

### DD-4: MaxOpenConns
Currently all DBs use MaxOpenConns=1.
**Decision: Start with 1.** WAL handles concurrent reads. Increase if profiling
shows contention.

### DD-5: CLI Commands
init/hydrate/ask/sync currently use --config flag for YAML profiles.
**Decision: Replace with --index-id flag.** Remove --config entirely (hard cutover).
CLI reads from spike.db. No YAML profile support.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Performance from relational nodes | Medium | Benchmark SaveTree/LoadTree |
| Unified DB lock contention | Medium | WAL mode + monitoring |
| UI regressions | Low | Test each feature after changes |
