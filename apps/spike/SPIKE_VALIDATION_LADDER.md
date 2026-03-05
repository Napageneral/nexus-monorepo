# Spike Validation Ladder

> Incremental checkpoints for validating the implementation as we build toward
> the E2E target. Each rung confirms specific behaviors before moving to the next.
> Every rung should leave the system in a working state.
>
> Written 2026-03-04. Validates work defined in SPIKE_WORKPLAN.md against
> target architecture in SPIKE_DATA_MODEL.md and SPIKE_FRONTDOOR_INTEGRATION.md.
>
> **HARD CUTOVER. NO BACKWARD COMPATIBILITY.** No YAML profiles, no --configs
> flag, no migration from old DBs. Old code is deleted, not deprecated.
> 16 rungs (0-15), no legacy compatibility rung.

---

## How to Use This Document

Each rung has:
- **What to build** — brief description of the implementation scope
- **Validation steps** — concrete checks that MUST pass before proceeding
- **Checkpoint state** — what the system should look like after this rung

Rungs are ordered by dependency. Do not skip rungs. Each rung builds on all
previous rungs being green.

---

## Rung 0: Baseline Verification

**What:** Confirm current state works before changing anything.

**Validation:**
```
[ ] go build ./cmd/spike-engine/ succeeds
[ ] go test ./... passes (all existing tests)
[ ] GET /health returns 200
[ ] GET /status returns tree status JSON
[ ] POST /operations/spike.status returns wrapped OperationResponse
[ ] UI loads at / (index.html served from dist/)
[ ] Inspector loads at /ask_requests/inspect (inspector.html served)
```

**Checkpoint:** Build passes, existing tests pass. Tag this commit as the
pre-cutover baseline.

---

## Rung 1: Engine Starts with Zero Indexes

**What:** Delete profile.go and all YAML profile loading. Engine boots clean
with zero indexes. Hard cutover — no --configs flag, no loadTreeProfiles.
(Workplan Phase 1.1 — partial)

**Validation:**
```
[ ] profile.go deleted entirely
[ ] loadTreeProfiles() call removed from server init
[ ] --configs flag removed from CLI
[ ] spike-engine serve --storage-root /tmp/spike-test/ starts WITHOUT crashing
[ ] GET /health returns 200
[ ] GET /status returns {"trees": {}} or equivalent empty response
[ ] POST /operations/spike.status returns {"result": {"trees": {}}} or empty
[ ] No references to "profile" or "configs" in startup code path
[ ] All existing tests pass (tests referencing profiles updated/removed)
```

**Checkpoint:** Engine boots clean with zero indexes. All YAML profile code is gone.

---

## Rung 2: Storage Root Path Resolution

**What:** Add --storage-root flag. All paths derive from it.
(Workplan Phase 1.1 — complete)

**Validation:**
```
[ ] New flag: spike-engine serve --storage-root /tmp/spike-data/
[ ] NEXUS_STATE_DIR env var works as fallback
[ ] Default (no flag, no env): uses ./data/
[ ] Engine creates storage_root directory if it doesn't exist
[ ] Git mirrors dir resolves to {storage_root}/git/mirrors/
[ ] Git worktrees dir resolves to {storage_root}/git/worktrees/
[ ] No references to --configs, configsDir, or YAML paths anywhere
[ ] All existing tests still pass (may need test helper updates)
```

**Checkpoint:** Engine uses a single storage root. Path derivation is deterministic
and documented. No legacy flags remain.

---

## Rung 3: Unified spike.db Opens and Migrates

**What:** Create the spikedb package. Open spike.db with full schema. Migrate
control.db tables into it.
(Workplan Phase 1.2 — partial: schema + control plane tables)

**Validation:**
```
[ ] Engine opens {storage_root}/spike.db on startup
[ ] spike.db is created with WAL mode: PRAGMA journal_mode returns 'wal'
[ ] Schema version table exists and tracks version number
[ ] All control plane tables exist in spike.db:
    [ ] agent_configs (with 'default' row seeded)
    [ ] repositories
    [ ] repo_refs
    [ ] jobs
    [ ] webhook_deliveries
    [ ] github_installations
    [ ] git_mirrors
    [ ] worktrees
    [ ] agent_indexes
[ ] Default AgentConfig row exists:
    SELECT * FROM agent_configs WHERE config_id = 'default'
    → capacity=120000, max_children=12, max_parallel=4
[ ] Old control.db is no longer opened (or redirected to spike.db)
[ ] All existing tests pass (control store tests may need DB path updates)
```

**Checkpoint:** Single database file exists. Control plane tables migrated.
Default config seeded. Old control.db superseded.

---

## Rung 4: Relational Agent Node Tables

**What:** Add agent_nodes, agent_node_files, corpus_entries tables. Rewrite
SaveTree/LoadTree to use relational storage.
(Workplan Phase 1.3)

**Validation:**
```
[ ] Tables exist in spike.db:
    [ ] agent_nodes (with index on index_id, parent_id, status)
    [ ] agent_node_files (composite PK: index_id, node_id, file_path)
    [ ] agent_node_bundles (composite PK: index_id, node_id, member_path)
    [ ] corpus_entries (composite PK: index_id, file_path)
[ ] SaveTree writes relational data:
    [ ] agent_indexes row created/updated
    [ ] agent_nodes rows match Tree.Nodes map entries
    [ ] agent_node_files rows match each node's LocalPaths
    [ ] corpus_entries rows match Tree.Index entries (path + tokens + hash, NO content)
[ ] LoadTree reconstructs identical Tree struct:
    [ ] Round-trip test: save tree → load tree → compare → identical
    [ ] Node parent/child relationships preserved
    [ ] File assignments preserved
    [ ] Corpus entries preserved (minus content — read from worktree)
[ ] JSON blob column (trees.data) is no longer used
[ ] Hydrate still works end-to-end with relational storage:
    spike-engine serve --storage-root /tmp/test/
    → create index via API → hydrate → verify agent_nodes populated
    → ask a question → verify answer returned
[ ] All existing tests pass
```

**Checkpoint:** Tree data is stored relationally. No more JSON blob. Full
round-trip fidelity. Hydrate and ask still work.

---

## Rung 5: Broker Ledger in Unified DB

**What:** Move broker sessions/turns/messages/tool_calls into spike.db with
index_id foreign keys.
(Workplan Phase 1.2 — complete: broker tables)

**Validation:**
```
[ ] Broker tables exist in spike.db (not in separate runtime.db):
    [ ] sessions (with index_id FK)
    [ ] turns (with index_id FK, session_label FK)
    [ ] messages (with index_id FK)
    [ ] tool_calls (with index_id FK)
    [ ] threads (with index_id FK)
    [ ] Plus auxiliary tables: compactions, artifacts, etc.
[ ] Broker EnsureLedgerSchema runs against spike.db
[ ] Broker column migration logic (ensureColumnExists) still works
[ ] Ask operation creates session + turns + messages in spike.db:
    [ ] SELECT COUNT(*) FROM sessions WHERE index_id = ? → > 0
    [ ] SELECT COUNT(*) FROM turns WHERE index_id = ? → > 0
    [ ] SELECT COUNT(*) FROM messages WHERE index_id = ? → > 0
[ ] Ask inspector shows full session trail (reads from spike.db)
[ ] No per-tree runtime.db files created anymore
[ ] All existing tests pass
```

**Checkpoint:** Single spike.db contains ALL data — config, control plane,
tree structure, and agent sessions. No separate DB files.

---

## Rung 6: Server Init Uses Unified DB

**What:** Rewrite newOracleServer to use spike.db. Load indexes from DB.
No YAML profiles. No legacy mode.
(Workplan Phase 1.4)

**Validation:**
```
[ ] newOracleServer(storageRoot, opts) — new signature works
[ ] Engine starts from spike.db alone:
    spike-engine serve --storage-root /tmp/existing-data/
    → loads indexes from agent_indexes table
    → reconstructs trees from agent_nodes
    → initializes brokers
    → serves API
[ ] Engine starts with zero indexes (fresh spike.db):
    spike-engine serve --storage-root /tmp/fresh/
    → creates spike.db, seeds defaults
    → no crash, API responds to /health
[ ] Restart recovery:
    Start engine → hydrate index → stop engine → restart
    → index loaded from spike.db → status = ready → ask works
[ ] All existing tests pass
```

**Checkpoint:** Phase 1 complete. Engine runs entirely from unified spike.db.
Zero-index startup works. No YAML profile code exists.

---

## Rung 7: First-Class Git Mirror + Worktree Tracking

**What:** Git adapter writes to git_mirrors and worktrees tables in spike.db.
(Workplan Phase 2.1 + 2.2)

**Validation:**
```
[ ] After sync/hydrate, git_mirrors table has entry:
    SELECT mirror_id, remote_url, status, last_fetched FROM git_mirrors
    → row exists, status='ready', last_fetched is recent
[ ] After sync/hydrate, worktrees table has entry:
    SELECT worktree_id, repo_id, commit_sha, status FROM worktrees
    → row exists, status='ready'
[ ] Mirror ref_count tracks number of worktrees using it
[ ] Worktree last_accessed updates on operations
[ ] Multiple syncs to same repo reuse the same mirror (no duplicates):
    SELECT COUNT(*) FROM git_mirrors WHERE remote_url = ? → 1
[ ] Multiple indexes at same commit share the same worktree:
    SELECT COUNT(*) FROM worktrees WHERE repo_id=? AND commit_sha=? → 1
[ ] spike.mirrors.list returns mirror data via API
[ ] spike.worktrees.list returns worktree data via API
[ ] All existing tests pass
```

**Checkpoint:** Git operations are tracked as first-class DB entities. API
can list them. Sharing and deduplication work.

---

## Rung 8: Engine-Level GitHub Installations

**What:** GitHub connector uses github_installations table. Not per-tree.
(Workplan Phase 2.3)

**Validation:**
```
[ ] GitHub App callback stores installation in github_installations table:
    SELECT installation_id, account_login, account_type FROM github_installations
    → row exists after callback
[ ] Installation is NOT tied to any specific index (no tree_id/index_id FK)
[ ] Repos endpoint works without tree_id:
    POST spike.github.repos {installation_id: 12345}
    → returns list of repos accessible via that installation
[ ] Token minting uses installation_id lookup
[ ] Multiple indexes can use repos from the same installation
[ ] Old github_connector_bindings table removed (hard cutover, no migration)
[ ] All existing tests pass
```

**Checkpoint:** Phase 2 complete. GitHub is engine-level. Mirrors and worktrees
are first-class. Ready for dynamic index creation.

---

## Rung 9: Dynamic Index Creation

**What:** spike.indexes.create API — create an index from a repo URL.
(Workplan Phase 3.1)

**Validation:**
```
[ ] POST spike.indexes.create works:
    {
      "repo_url": "https://github.com/owner/repo.git",
      "ref": "refs/heads/main"
    }
    → returns {index_id, status: "pending"}
[ ] Creates git mirror (or reuses existing)
[ ] Creates worktree at resolved commit
[ ] Creates agent_configs row (with defaults)
[ ] Creates agent_indexes row
[ ] Kicks off hydration job
[ ] Poll spike.indexes.status {index_id}:
    → returns {status: "hydrating", node_count: N, progress_pct: X}
[ ] After hydration completes:
    → status = "ready"
    → agent_nodes table populated
    → corpus_entries table populated
[ ] Ask works against the new index:
    POST spike.ask {index_id: "...", query: "How does X work?"}
    → returns answer
[ ] Session data recorded in spike.db for the new index
[ ] All existing tests pass
```

**Checkpoint:** Full programmatic index creation works. Create → hydrate → ask
pipeline is functional end-to-end via API.

---

## Rung 10: Supporting API Operations

**What:** All remaining CRUD operations for indexes, mirrors, worktrees, config.
(Workplan Phase 3.2 + 3.3)

**Validation:**
```
[ ] spike.indexes.list returns all indexes with stats:
    → [{index_id, display_name, status, node_count, ask_count, created_at}]
[ ] spike.indexes.get returns full details for one index
[ ] spike.indexes.delete removes index + all associated data:
    → agent_indexes, agent_nodes, corpus_entries, sessions, etc. all deleted
    → worktree NOT deleted (may be shared)
[ ] spike.indexes.status returns hydration progress
[ ] spike.mirrors.list returns mirrors with last_fetched, size
[ ] spike.worktrees.list returns worktrees with status, linked indexes
[ ] spike.github.installations returns connected accounts
[ ] spike.config.defaults returns default AgentConfig
[ ] spike.config.get returns effective config for an index
[ ] spike.config.update modifies config for a specific index
[ ] All operations work in both standalone (HTTP) and nex (WebSocket RPC) modes
```

**Checkpoint:** Phase 3 complete. Full API surface available. Ready for UI.

---

## Rung 11: UI Empty State + GitHub Connection

**What:** Dashboard shows empty state, connects GitHub.
(Workplan Phase 4.1)

**Validation:**
```
[ ] Fresh engine → load UI → "Connect GitHub to get started" message shown
[ ] "Connect GitHub" button redirects to github.com/apps/ask-spike/installations/new
[ ] After authorization:
    → GitHub redirects to frontdoor callback URL
    → Frontdoor routes to engine via session cookie
    → Engine stores installation in github_installations
    → UI refreshes → shows "GitHub Connected"
[ ] Repo list appears after connection:
    → UI calls spike.github.repos
    → Displays repo names, default branches
[ ] No manual tree_id or config input required
[ ] UI works in both standalone and nex modes
```

**Checkpoint:** Empty → connected flow works in the UI.

---

## Rung 12: UI Create Index + Hydration

**What:** User can create an index and watch hydration progress.
(Workplan Phase 4.2)

**Validation:**
```
[ ] After selecting repo + branch: "Create Index" button appears
[ ] Clicking "Create Index" calls spike.indexes.create
[ ] Progress display shows:
    → Current phase (syncing / partitioning / hydrating)
    → Node count
    → Percentage complete
    → Estimated time (optional)
[ ] Progress updates every 3-5 seconds via polling
[ ] On completion: status shows "Ready"
[ ] "Ask a question" input appears when ready
```

**Checkpoint:** Create → hydrate → ready flow works in the UI.

---

## Rung 13: UI Ask + Browse

**What:** Ask questions, browse all entities.
(Workplan Phase 4.3 + 4.4)

**Validation:**
```
[ ] Ask interface works:
    → Type question → submit → answer appears
    → Source file references shown
    → Session recorded in spike.db
[ ] Mirrors browser:
    → Shows remote URLs, last fetch time, status, size
[ ] Worktrees browser:
    → Shows repo, commit, status, linked indexes, size
[ ] Indexes browser:
    → Shows name, worktree, status, node count, ask count, created_at
    → Can select different indexes
[ ] Ask history browser:
    → Shows all questions asked across indexes
    → Query text, answer preview, timestamps
    → Click to drill into full session in inspector
[ ] Inspector works with index_id (not tree_id):
    → Full session trail visible
    → Turns, messages, tool calls all displayed
```

**Checkpoint:** Phase 4 complete. Full UI working.

---

## Rung 14: Nex Mode Integration

**What:** Verify everything works through the nex runtime proxy.
(Workplan Phase 5.1)

**Validation:**
```
[ ] Nex runtime spawns spike-engine with NEX_SERVICE_PORT
[ ] Engine detects nex mode, binds to assigned port
[ ] Health check passes: nex runtime → engine /health → 200
[ ] UI loads at /app/spike/ through nex runtime proxy
[ ] WebSocket RPC works: UI connects to /runtime/ws
[ ] All spike.* operations work via WebSocket RPC
[ ] Dashboard JS correctly detects isNexMode based on path
[ ] Credential inheritance verified:
    → Engine has SPIKE_GITHUB_APP_* from env
    → Engine has OPENAI_API_KEY from env
```

**Checkpoint:** Spike works as a proper nex app behind the runtime.

---

## Rung 15: Production E2E on oracle-1

**What:** Full flow on the live VPS.
(Workplan Phase 5.2)

**Validation:**
```
[ ] Visit spike.fyi → redirects to frontdoor.nexushub.sh
[ ] Google OAuth login succeeds
[ ] Auto-provision fires → nex runtime + spike engine start
[ ] Spike dashboard loads at /app/spike/ (empty state)
[ ] "Connect GitHub" → authorize Ask-Spike app
[ ] GitHub callback routes through frontdoor → engine stores installation
[ ] Repo list appears → repos from GitHub account visible
[ ] Select a repo → "Create Index" → hydration starts
[ ] Hydration progress shows in UI
[ ] Hydration completes → "Ready" status
[ ] Ask "How does X work?" → answer with source references
[ ] Browse mirrors → see the repo mirror
[ ] Browse worktrees → see the checked-out commit
[ ] Browse indexes → see the hydrated index with stats
[ ] Browse ask history → see the question and answer
[ ] Stop and restart engine → index loads from spike.db → ask still works
```

**Checkpoint:** THE E2E TEST PASSES. Full production flow works end-to-end.

---

## Summary: Rung → Workplan Phase Mapping

| Rung | Description | Workplan Phase |
|---|---|---|
| 0 | Baseline verification | Pre-work |
| 1 | Zero-index startup | 1.1 (partial) |
| 2 | Storage root resolution | 1.1 (complete) |
| 3 | Unified spike.db schema | 1.2 (partial) |
| 4 | Relational node storage | 1.3 |
| 5 | Broker in unified DB | 1.2 (complete) |
| 6 | Server init from DB | 1.4 |
| 7 | Mirror + worktree tracking | 2.1 + 2.2 |
| 8 | Engine-level GitHub installs | 2.3 |
| 9 | Dynamic index creation | 3.1 |
| 10 | Full API surface | 3.2 + 3.3 |
| 11 | UI empty state + GitHub | 4.1 |
| 12 | UI create + hydrate | 4.2 |
| 13 | UI ask + browse | 4.3 + 4.4 |
| 14 | Nex mode integration | 5.1 |
| 15 | Production E2E | 5.2 |

---

## Quick Reference: Test Commands

```bash
# Build
cd apps/spike/service && go build ./cmd/spike-engine/

# Run tests
cd apps/spike/service && go test ./...

# Start with zero indexes
spike-engine serve --storage-root /tmp/spike-fresh/

# Check spike.db contents
sqlite3 /tmp/spike-fresh/spike.db ".tables"
sqlite3 /tmp/spike-test/spike.db "SELECT * FROM agent_configs"
sqlite3 /tmp/spike-test/spike.db "SELECT * FROM agent_indexes"
sqlite3 /tmp/spike-test/spike.db "SELECT COUNT(*) FROM agent_nodes"

# Health check
curl http://localhost:7422/health

# List indexes (nex operation)
curl -X POST http://localhost:7422/operations/spike.indexes.list \
  -H "Content-Type: application/json" \
  -d '{"params": {}}'

# Create index (nex operation)
curl -X POST http://localhost:7422/operations/spike.indexes.create \
  -H "Content-Type: application/json" \
  -d '{"params": {"repo_url": "https://github.com/owner/repo.git"}}'
```
