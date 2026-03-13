# Spike Code App Transformation Workplan

**Status:** ACTIVE
**Last Updated:** 2026-03-12

## Gap Analysis Summary

The spec defines Spike as a **code intelligence infrastructure app** with no PRLM oracle, no broker, and no LLM-based "ask" system. The current codebase is a **PRLM oracle app** that happens to also have code intelligence bolted on. The transformation is primarily a **subtraction** (remove PRLM/broker/ask) plus **operation namespace renaming** (code-intel.* -> code.*) and **adding missing mirror/worktree CRUD operations**.

### What exists today that should NOT exist in the target state

| Area | Current State | Lines of Code |
|------|--------------|---------------|
| `internal/broker/` | Full LLM broker, session orchestrator, ledger, streaming | ~14,200 lines (33 Go files) |
| `internal/prlm/` | Oracle tree, node splitting, hydration, history, parallel runner | ~8,800 lines (38 Go files across 6 subdirs) |
| `spike.ask` operation | Runs PRLM oracle queries through LLM tree | Present in nex_protocol.go, nex_handlers.go |
| `spike.sync` operation | Syncs repos and triggers PRLM hydration | Present in nex_protocol.go, nex_handlers.go |
| `spike.status` operation | Returns PRLM oracle tree status | Present in nex_protocol.go, nex_handlers.go |
| `spike.ask-requests.*` (5 ops) | Ask request tracking, timeline, inspection | nex_protocol.go, nex_handlers.go, serve.go |
| `spike.sessions.*` (8 ops) | Broker session management | nex_protocol.go, nex_handlers.go, serve.go |
| `spike.tree-versions.*` (2 ops) | PRLM tree version tracking | nex_protocol.go, nex_handlers.go, serve.go |
| `spike.guides.build` | Guide generation (LLM-dependent) | nex_protocol.go, nex_codeintel_handlers.go |
| CLI commands: `init`, `hydrate`, `ask`, `sync`, `mcp` | PRLM oracle CLI entry points | main.go, mcp.go |
| `servedTree.oracle` / `servedTree.broker` | PRLM oracle + broker per tree | serve.go struct fields |
| `oracleServer` naming | Named after the oracle concept | serve.go |
| `go-coding-agent` dependency | LLM agent execution engine | go.mod |
| `pi-mono` local path replace | LLM engine local override | go.mod |
| AWS Bedrock SDK deps | LLM backend | go.mod |
| `mcp-go` dependency | MCP proxy for oracle_ask | go.mod |
| `tiktoken-go` dependency | Token counting for PRLM tree splitting | go.mod (but may keep for code-intel tokenizer) |
| DB tables: `trees`, `history`, `agent_nodes`, `agent_node_files`, `agent_node_bundles`, `corpus_entries`, `ask_requests`, `ask_request_executions` | PRLM oracle state | schema.go |
| Manifest methods: `spike.ask`, `spike.sync`, `spike.status`, `spike.ask-requests.*`, `spike.sessions.*`, `spike.tree-versions.*` | PRLM oracle operations | app.nexus.json |
| Manifest `product` section (plans, pricing, entitlements) | Product/billing metadata | app.nexus.json |
| Manifest `adapters` requirement | GitHub adapter dependency | app.nexus.json |
| HTTP routes: `/ask`, `/status`, `/sync`, `/ask_requests/*`, `/sessions/*`, `/tree_versions/*` | Legacy HTTP API | serve.go handler() |

### What exists today and matches the target state (KEEP)

| Area | Notes |
|------|-------|
| `internal/git/adapter.go` | Mirror management, worktree materialization. Already implements EnsureMirror, EnsurePinnedWorktree, ResolveCommit. Matches spec well. |
| `internal/codeintel/service.go` | Code intelligence service. Build, search, symbols, references, callers, callees, imports, importers, context pack, test impact. All present and functional. |
| `internal/spikedb/` (partial) | DB open, WAL pragmas, many tables match spec exactly. |
| `internal/ignore/` | .gitignore/.spikeignore support for code-intel. |
| `internal/tokenizer/` | Anthropic tokenizer for code-intel file analysis. |
| `internal/control/` (partial) | Jobs, repositories, repo_refs, tree_versions, webhooks, GitHub connector bindings. |
| DB tables: `schema_version`, `agent_configs`, `github_installations`, `git_mirrors`, `repositories`, `repo_refs`, `worktrees`, `jobs`, `webhook_deliveries`, `code_snapshots`, `code_files`, `code_chunks`, `code_chunks_fts`, `code_symbols`, `code_imports`, `code_capabilities`, `code_references`, `code_calls` | All match spec. |
| `github_connector_bindings` table | Matches spec. |
| Nex protocol handler (`nex_protocol.go`) | General envelope format is correct. |
| Health check endpoint | `/health` matches spec. |
| Nex operations: `spike.mirrors.list`, `spike.worktrees.list`, `spike.indexes.*`, `spike.jobs.*`, `spike.repositories.*`, `spike.repo-refs.*`, `spike.config.*`, `spike.github.installations.*`, `spike.connectors.github.*`, `spike.github.webhook` | All match spec operation set. |
| GitHub connector: install start, repos, branches, commits, remove, setup | Already implemented. |
| `github_connector.go` | GitHub API client, token minting, secret management. |
| Webhook handling | Signature verification, delivery dedup, push event handling. |
| CLI `serve` command | Core server startup. Needs some cleanup but structure is right. |

### What exists but needs MODIFICATION

| Area | Current | Target | Change |
|------|---------|--------|--------|
| Code-intel operation names | `spike.code-intel.index.build`, etc. | `spike.code.build`, etc. | Rename all 14 operations in nex_protocol.go |
| `spike.code-intel.symbol.resolve` | Current name | `spike.code.symbols` | Rename |
| `spike.code-intel.symbol.references` | Current name | `spike.code.references` | Rename |
| `spike.code-intel.graph.callers` | Current name | `spike.code.callers` | Rename |
| `spike.code-intel.graph.callees` | Current name | `spike.code.callees` | Rename |
| `spike.code-intel.graph.imports` | Current name | `spike.code.imports` | Rename |
| `spike.code-intel.graph.importers` | Current name | `spike.code.importers` | Rename |
| `spike.code-intel.search.semantic` | Current name | `spike.code.search` | Rename |
| `spike.code-intel.context.pack` | Current name | `spike.code.context` | Rename |
| `spike.code-intel.tests.impact` | Current name | `spike.code.tests.impact` | Rename |
| `spike.code-intel.source.file` | Current name | `spike.code.source.file` | Rename |
| `spike.code-intel.source.chunk` | Current name | `spike.code.source.chunk` | Rename |
| `spike.code-intel.source.context` | Not in spec | N/A | Remove (or alias to code.source.chunk) |
| `oracleServer` struct | Named after oracle, holds oracle/broker fields | Rename to `spikeServer` or `engineServer`, remove oracle fields | Rename + field removal |
| `servedTree` struct | Holds `oracle *prlmtree.OracleTree`, `broker *broker.Broker` | Remove oracle + broker fields entirely. Remove `trees` map. | Field removal |
| `newOracleServer()` | Creates PRLM stores, oracle trees, brokers | Remove PRLM/broker init. Keep git adapter, control store, spikeDB, code-intel init. | Simplify initialization |
| `handler()` routing | Contains /ask, /status, /sync, /sessions/*, /ask_requests/*, /tree_versions/* routes | Remove PRLM routes. Keep code-intel, mirrors, worktrees, indexes, jobs, repos, config, github routes. | Route removal |
| `main.go` CLI dispatch | Has `init`, `hydrate`, `ask`, `sync`, `mcp` subcommands | Remove all except `serve` (and maybe `status` as a simple health check). | Subcommand removal |
| `app.nexus.json` manifest | Contains PRLM operations + product/pricing + adapter requirements | Remove PRLM operations, add code.* operations, update events, remove product section, update requires | Major manifest rewrite |
| `go.mod` dependencies | Has go-coding-agent, AWS SDK, mcp-go | Remove LLM deps, remove mcp-go (MCP proxy was for oracle_ask) | Dependency removal |
| Schema migration | Version 4, includes PRLM tables | Bump to version 5, drop PRLM tables, keep everything else | Schema migration |

### What does NOT exist yet but the spec REQUIRES

| Area | What's Missing |
|------|---------------|
| `spike.mirrors.ensure` operation | Not registered. Git adapter has `EnsureMirror()` but no nex operation handler wired up. |
| `spike.mirrors.refresh` operation | Not registered. Would be a fetch-only variant of ensure. |
| `spike.mirrors.status` operation | Not registered. Would query single mirror status from DB. |
| `spike.worktrees.create` operation | Not registered. Git adapter has `EnsurePinnedWorktree()` but no nex handler. |
| `spike.worktrees.destroy` operation | Not registered. Need to remove from disk + decrement ref_count. |
| `spike.connectors.github.bind` operation | Registered in nex_protocol.go but no handler implementation found in nex_handlers.go (it may be in serve.go). Need to verify or implement. |
| `spike.connectors.github.get` operation | Not in routing table at all. |
| `spike.code.status` operation (renamed) | Exists as `spike.code-intel.index.status` -- just needs rename. |
| Durable `record.ingested` reaction | The target state now uses a daemon-owned Spike job definition plus durable event subscription. Current code has no Spike-owned work-runtime seeding path. |
| Spike reconcile job | Missing entirely. Need a package-local job script that reads the canonical record and composes `spike.mirrors.ensure`, `spike.worktrees.create`, and `spike.code.build`. |
| Nex durable event-subscription control API | Missing entirely. Nex has `event_subscriptions` storage and daemon matching, but no public control-plane CRUD for app hooks to seed these bindings. |
| Git record clone locator contract | Spike's automatic path needs `record.metadata.remote_url`. This dependency must be locked into the git record contract. |

---

## Phased Workplan

### Phase 0: Pre-flight Verification

**Goal:** Confirm the build compiles and tests pass before starting.

1. Run `go build ./...` in `service/`
2. Run `go test ./...` (note any pre-existing failures)
3. Take a snapshot of test results as the baseline

**Validation:** Build succeeds. Test baseline documented.

---

### Phase 1: Delete the PRLM Oracle and Broker Packages

**Goal:** Remove the two largest packages that have no place in the target state, along with all code that imports them.

This is the riskiest phase because broker and prlm are deeply wired into the server. We must remove the consumers (imports in cmd/spike-engine) before removing the packages.

#### 1a. Remove PRLM/broker imports from main.go

**File:** `service/cmd/spike-engine/main.go`
- **DELETE** imports: `prlmstore`, `prlmtree`
- **DELETE** functions: `cmdInit()`, `cmdHydrate()`, `cmdAsk()`, `cmdStatus()`, `cmdSync()`, `cmdMCP()`
- **DELETE** `usage()` function body references to removed commands
- **KEEP** only `cmdServe()` in the switch
- **MODIFY** the switch to only handle `"serve"` (and optionally `"version"`)

#### 1b. Remove MCP proxy file

**File:** `service/cmd/spike-engine/mcp.go`
- **DELETE** entire file. The MCP proxy only served `oracle_ask` and `oracle_status`, which are PRLM operations.

#### 1c. Strip PRLM/broker from serve.go

**File:** `service/cmd/spike-engine/serve.go`
- **DELETE** imports: `broker`, `prlmstore`, `prlmtree`
- **DELETE** `servedTree` struct (or remove `oracle`, `broker`, `store` fields, keeping only what's needed for non-PRLM operations)
- **MODIFY** `oracleServer` struct: remove `trees map[string]*servedTree`, `syncJobs`, `syncCancel`, `syncWorkerDone` fields (sync was for PRLM hydration)
- **DELETE** `askRequest`, `askResponse`, `syncRequest` types (PRLM-specific)
- **DELETE** all ask-request types (`askRequestsGetRequest`, `askRequestsListRequest`, etc.)
- **DELETE** all session types (`sessionsListRequest`, `sessionsResolveRequest`, etc.)
- **DELETE** all ask-inspector types (`askInspectorSession`, `askInspectorTurn`, `askInspectorMessage`, `askInspectorToolCall`, `askTimelineTurnSummary`, `askTimelineNode`)
- **DELETE** `treeVersionsListRequest`, `treeVersionGetRequest` types
- **MODIFY** `newOracleServer()`: remove PRLM store creation, oracle tree init, broker init, sync worker start. Keep spikeDB, control store, git adapter, code-intel service init.
- **MODIFY** `handler()`: remove routes for `/ask`, `/status`, `/sync`, `/ask_requests/*`, `/sessions/*`, `/tree_versions/*`. Keep all other routes.
- **DELETE** all handler methods: `handleAsk`, `handleStatus`, `handleSync`, `handleAskRequestsGet/List/Inspect/Timeline`, `handleSessionsList/Resolve/Preview/Patch/Reset/Delete/Compact/Import/ImportChunk`, `handleTreeVersionGet/List`
- **DELETE** `enqueueSyncJob()`, sync worker goroutine, `resolveServedTree()` and related helpers
- **RENAME** `oracleServer` -> `spikeServer` (or `engineServer`)

#### 1d. Strip PRLM/broker from nex_handlers.go

**File:** `service/cmd/spike-engine/nex_handlers.go`
- **DELETE** imports: `broker`, `prlmstore`, `prlmtree`
- **DELETE** handlers: `nexAsk`, `nexStatus`, `nexSync`
- **DELETE** handlers: `nexTreeVersionGet`, `nexTreeVersionsList`
- **DELETE** handlers: `nexAskRequestsGet/List/Inspect/Timeline`
- **DELETE** handlers: `nexSessionsList/Resolve/Preview/Patch/Reset/Delete/Compact/Import/ImportChunk`
- **DELETE** `payloadImportItems()` helper (broker-specific)
- **MODIFY** `nexIndexesCreate()`: remove PRLM oracle/store/broker init, remove sync+hydrate job enqueue. Replace with: create mirror, create worktree, trigger code.build.
- **MODIFY** `nexIndexesStatus()`: remove PRLM oracle progress check.

#### 1e. Strip PRLM/broker from nex_protocol.go

**File:** `service/cmd/spike-engine/nex_protocol.go`
- **DELETE** operation entries from `buildNexOperationHandlers()`:
  - `spike.ask`, `spike.status`, `spike.sync`
  - `spike.tree-versions.get`, `spike.tree-versions.list`
  - `spike.ask-requests.get/list/inspect/timeline`
  - `spike.sessions.list/resolve/preview/patch/reset/delete/compact/import/import-chunk`
  - `spike.guides.build`

#### 1f. Delete broker and prlm packages

- **DELETE** entire directory: `service/internal/broker/` (33 files, ~14,200 lines)
- **DELETE** entire directory: `service/internal/prlm/` (38 files across 6 subdirs, ~8,800 lines)

#### 1g. Delete test files that depend on deleted code

- **DELETE or MODIFY** `service/cmd/spike-engine/serve_sessions_test.go` (imports broker)
- **DELETE or MODIFY** `service/cmd/spike-engine/serve_sync_test.go` (imports broker, prlmstore, prlmtree)
- **DELETE or MODIFY** `service/cmd/spike-engine/serve_webhook_test.go` (imports prlmstore, prlmtree)
- **DELETE or MODIFY** `service/cmd/spike-engine/serve_integration_test.go` (imports prlmstore)
- **MODIFY** `service/cmd/spike-engine/cli_test.go` if it tests removed CLI commands

**Validation:**
- `go build ./...` succeeds
- `go vet ./...` passes
- No references to `internal/broker` or `internal/prlm` remain (grep confirms)

---

### Phase 2: Rename Code Intelligence Operations

**Goal:** Rename the `spike.code-intel.*` operation namespace to `spike.code.*` to match the spec.

#### 2a. Update operation routing table

**File:** `service/cmd/spike-engine/nex_protocol.go`

| Current Name | Target Name |
|-------------|-------------|
| `spike.code-intel.index.build` | `spike.code.build` |
| `spike.code-intel.index.status` | `spike.code.status` |
| `spike.code-intel.source.file` | `spike.code.source.file` |
| `spike.code-intel.source.chunk` | `spike.code.source.chunk` |
| `spike.code-intel.source.context` | (remove -- not in spec) |
| `spike.code-intel.symbol.resolve` | `spike.code.symbols` |
| `spike.code-intel.symbol.references` | `spike.code.references` |
| `spike.code-intel.graph.callers` | `spike.code.callers` |
| `spike.code-intel.graph.callees` | `spike.code.callees` |
| `spike.code-intel.graph.imports` | `spike.code.imports` |
| `spike.code-intel.graph.importers` | `spike.code.importers` |
| `spike.code-intel.search.semantic` | `spike.code.search` |
| `spike.code-intel.context.pack` | `spike.code.context` |
| `spike.code-intel.tests.impact` | `spike.code.tests.impact` |

The handler functions themselves (`nexCodeIntelIndexBuild`, etc.) can keep their Go names initially -- only the routing string changes. Optionally rename the Go functions too for clarity.

#### 2b. Remove `spike.code-intel.source.context`

This operation is not in the spec. If it's a thin wrapper around source.chunk with extra context, remove it. If it has unique functionality that `code.source.chunk` doesn't cover, fold it into `code.source.chunk`.

#### 2c. Remove `spike.guides.build`

Not in the spec. Delete the handler function from `nex_codeintel_handlers.go` and the routing entry.

**Validation:**
- All 14 spec'd `spike.code.*` operations are present in the routing table
- `spike.code-intel.*` namespace no longer exists
- `go build ./...` succeeds

---

### Phase 3: Add Missing Mirror and Worktree Operations

**Goal:** Wire up the mirror and worktree CRUD operations that the spec requires but don't have nex handlers yet.

#### 3a. `spike.mirrors.ensure`

**File:** `service/cmd/spike-engine/nex_handlers.go` (add new handler)

Implementation:
1. Extract `remote_url` from payload
2. Call `s.gitAdapter.EnsureMirror(ctx, remoteURL)` (already implemented in `internal/git/adapter.go`)
3. Compute deterministic `mirror_id` (SHA-256 of remote_url, first 16 hex chars)
4. Upsert mirror record in `s.spikeStore` (git_mirrors table)
5. Return `{ mirror_id, mirror_path, created }`

Register in `nex_protocol.go` as `"spike.mirrors.ensure"`.

#### 3b. `spike.mirrors.refresh`

Similar to ensure but takes `mirror_id`, looks up the remote_url from DB, and runs fetch only.

Register as `"spike.mirrors.refresh"`.

#### 3c. `spike.mirrors.status`

Takes `mirror_id`, queries `git_mirrors` table, returns status record.

Register as `"spike.mirrors.status"`.

#### 3d. `spike.worktrees.create`

Takes `repo_id`, `mirror_path`, `commit_sha`. Calls `s.gitAdapter.EnsurePinnedWorktree()`. Upserts worktree record in DB. Increments mirror ref_count.

Register as `"spike.worktrees.create"`.

#### 3e. `spike.worktrees.destroy`

Takes `worktree_id`. Looks up worktree record. Removes worktree directory from disk (via `git worktree remove`). Deletes DB record. Decrements mirror ref_count.

Register as `"spike.worktrees.destroy"`.

#### 3f. `spike.connectors.github.bind`

Verify this is already implemented. If not:
- Takes `tree_id`, `service`, `account`, optional `auth_id`, `metadata`
- Upserts into `github_connector_bindings` table
- Register as `"spike.connectors.github.bind"`

#### 3g. `spike.connectors.github.get`

- Takes `tree_id`
- Queries `github_connector_bindings` for the tree
- Register as `"spike.connectors.github.get"`

**Validation:**
- All mirror operations (`ensure`, `refresh`, `list`, `status`) work via nex protocol
- All worktree operations (`create`, `list`, `destroy`) work via nex protocol
- Mirror ref_count correctly tracks worktree references
- `go build ./...` succeeds

---

### Phase 4: Schema Migration

**Goal:** Bump the schema version and drop PRLM-specific tables.

#### 4a. Add migration from version 4 to version 5

**File:** `service/internal/spikedb/schema.go`

- Bump `schemaVersion` from 4 to 5
- Add migration logic: when upgrading from 4 to 5, run:
  ```sql
  DROP TABLE IF EXISTS agent_node_bundles;
  DROP TABLE IF EXISTS agent_node_files;
  DROP TABLE IF EXISTS agent_nodes;
  DROP TABLE IF EXISTS corpus_entries;
  DROP TABLE IF EXISTS ask_request_executions;
  DROP TABLE IF EXISTS ask_requests;
  DROP TABLE IF EXISTS agent_indexes;
  DROP TABLE IF EXISTS trees;
  DROP TABLE IF EXISTS history;
  ```
- Remove these tables from the `schemaStatements` array (they should no longer be created for fresh installs)
- Remove the `-- Broker-managed tables` comment at the bottom of schemaStatements

#### 4b. Remove PRLM-related spikedb methods

**File:** `service/internal/spikedb/` -- scan for methods that operate on deleted tables:
- `UpsertAgentIndex`, `GetAgentIndex`, `ListAgentIndexes`, `DeleteAgentIndex`, `UpdateAgentIndexStatus` -- **KEEP** only if `agent_indexes` is repurposed for the spec's index concept. The spec's `indexes.*` operations do use an index concept, but it's backed by code snapshots, not PRLM trees. Decision: **KEEP the table but strip PRLM fields** (`root_node_id`, `node_count`, `clean_count`, `total_tokens`, `total_files`, `previous_index_id`). Or repurpose `agent_indexes` to track the spec's index concept (mirror_id + worktree_id + snapshot_id + status).

Actually, re-examining: the spec's `indexes.create/list/get/delete/status` operations are already present and work through `agent_indexes`. The table should be kept but cleaned up. The PRLM-specific fields (`root_node_id`, `node_count`, `clean_count`, `total_tokens`, `total_files`, `previous_index_id`) become unused. They can stay as dead columns or be dropped in the migration.

**Validation:**
- Fresh database creates cleanly without PRLM tables
- Existing database migrates from v4 to v5 without errors
- `go test ./internal/spikedb/...` passes

---

### Phase 5: Manifest Update

**Goal:** Rewrite `app.nexus.json` to match the spec.

**File:** `apps/spike/app/app.nexus.json`

#### Changes:

1. **DELETE** all PRLM methods:
   - `spike.ask`, `spike.status`, `spike.sync`
   - `spike.ask-requests.*` (get, list, inspect, timeline)
   - `spike.sessions.*` (list, resolve, preview, patch, reset, delete, compact, import, import-chunk)
   - `spike.tree-versions.*` (get, list)
   - `spike.github.webhook` (keep only if webhook routing stays)

2. **ADD** code intelligence methods (renamed from code-intel):
   - `spike.code.build`, `spike.code.status`, `spike.code.search`, `spike.code.symbols`, `spike.code.references`, `spike.code.callers`, `spike.code.callees`, `spike.code.imports`, `spike.code.importers`, `spike.code.context`, `spike.code.tests.impact`, `spike.code.source.file`, `spike.code.source.chunk`

3. **ADD** missing mirror/worktree methods:
   - `spike.mirrors.ensure`, `spike.mirrors.refresh`, `spike.mirrors.status`
   - `spike.worktrees.create`, `spike.worktrees.destroy`

4. **ADD** missing connector methods:
   - `spike.connectors.github.bind`, `spike.connectors.github.get`

5. **KEEP** manifest free of event declarations. Automatic rebuild is daemon-owned, not manifest-owned.

6. **ADD** Spike lifecycle seeding for durable work resources:
   - ensure job definition `spike.record_ingested_reconcile`
   - ensure durable subscription on `record.ingested`
   - use a match envelope of `{ "platform": "git" }`

7. **DELETE** `product` section (plans, pricing, entitlements)

8. **DELETE** `entitlements` section

9. **MODIFY** `requires` section: remove `adapters` requirement. Spec says Spike is independent of any specific adapter.
   ```json
   "requires": {
     "nex": ">=0.10.0"
   }
   ```

10. **DELETE** `adapters` section (Spike does not bundle adapter definitions)

11. **DELETE** `ui` section (if Spike no longer ships a UI in this spec -- the spec makes no mention of a UI)

**Validation:**
- Manifest JSON is valid
- All spec'd operations are present
- No PRLM operations remain

---

### Phase 6: Dependency Cleanup

**Goal:** Remove unused Go module dependencies.

**File:** `service/go.mod`

#### DELETE:
- `github.com/badlogic/pi-mono/go-coding-agent` -- LLM agent engine (PRLM/broker)
- `github.com/mark3labs/mcp-go` -- MCP proxy (oracle_ask)
- `gopkg.in/yaml.v3` -- likely only used by broker/prlm (verify with grep)
- All AWS SDK packages (indirect, pulled by go-coding-agent for Bedrock):
  - `github.com/aws/aws-sdk-go-v2` and all sub-packages
  - `github.com/aws/smithy-go`
- `github.com/bahlo/generic-list-go`, `github.com/buger/jsonparser`, `github.com/invopop/jsonschema`, `github.com/mailru/easyjson`, `github.com/spf13/cast`, `github.com/wk8/go-ordered-map/v2`, `github.com/yosida95/uritemplate/v3` -- likely indirect deps of mcp-go or go-coding-agent
- Remove the `replace` directive for `pi-mono/go-coding-agent`

#### KEEP:
- `github.com/google/uuid` -- used in handlers
- `github.com/pkoukk/tiktoken-go` -- used by `internal/tokenizer/` for code-intel
- `github.com/sabhiram/go-gitignore` -- used by `internal/ignore/`
- `modernc.org/sqlite` -- core database driver

#### Steps:
1. Delete the explicit `replace` line
2. Remove direct requires that are no longer imported
3. Run `go mod tidy` to clean up indirect dependencies

**Validation:**
- `go mod tidy` succeeds
- `go build ./...` succeeds
- No import of deleted packages remains

---

### Phase 7: Clean Up Legacy HTTP Routes

**Goal:** Remove the duplicate legacy HTTP API routes (the ones that existed before nex protocol).

After Phase 1, many legacy routes were already removed. This phase cleans up any remaining dead routes and ensures the handler() method is clean:

**KEEP routes:**
- `/health` (nex health check)
- `/operations/` (nex operation dispatch)
- `/webhooks/github` or `/adapters/github/webhooks` (GitHub webhook ingestion)
- `/auth/github/callback` (GitHub install flow callback)
- `/app` and `/app/` (runtime UI, if UI is kept)

**Consider keeping as convenience aliases:**
- `/mirrors/list`, `/worktrees/list`, `/indexes/*`, `/jobs/*`, `/repositories/*`, `/repo_refs/*`, `/config/*`
- These mirror the nex operations and may be useful for direct HTTP access during development

**DELETE routes:**
- `/ask`, `/status`, `/sync`
- `/ask_requests/*`, `/sessions/*`, `/tree_versions/*`

Also delete the corresponding `handle*` functions from serve.go.

**Validation:**
- Only spec-aligned routes remain
- `go build ./...` succeeds

---

### Phase 8: Rename Server Type and Clean Up Naming

**Goal:** Remove "oracle" from the codebase naming.

1. Rename `oracleServer` -> `spikeServer` across all files in `cmd/spike-engine/`
2. Rename `oracleServerOptions` -> `spikeServerOptions`
3. Rename `newOracleServer()` -> `newSpikeServer()`
4. Rename `servedTree` -> remove entirely if no longer needed, or rename to `indexEntry` if we still need a per-index struct
5. Update the `serve.go` log messages: "spike server listening on..." (already present)

**Validation:**
- No references to "oracle" remain in production code (tests may reference it in historical comments)
- `go build ./...` succeeds

---

### Phase 9: Final Validation

**Goal:** Confirm the transformed codebase is correct.

1. **Build:** `go build ./...` succeeds
2. **Vet:** `go vet ./...` passes
3. **Test:** `go test ./...` -- document any remaining failures
4. **Smoke test: mirrors.ensure**
   - Start server with `spike-engine serve`
   - POST `/operations/spike.mirrors.ensure` with a public repo URL
   - Verify mirror appears on disk and in DB
5. **Smoke test: worktrees.create**
   - POST `/operations/spike.worktrees.create` with repo_id + mirror_path + commit_sha
   - Verify worktree appears on disk
6. **Smoke test: code.build**
   - POST `/operations/spike.code.build` with the worktree root_path
   - Verify code snapshot created in DB
7. **Smoke test: code.search**
   - POST `/operations/spike.code.search` with query
   - Verify search results returned
8. **Smoke test: code.symbols + code.callers**
   - Query symbols, then callers
   - Verify cross-reference graph works
9. **Health check:** `GET /health` returns `{"status":"ok"}`
10. **Grep audit:** Confirm zero references to `internal/broker`, `internal/prlm`, `prlmstore`, `prlmtree`, `broker.`, `oracle.Ask`, `oracle.Hydrate`

---

## Deletion Inventory

### Entire directories to delete:
- `service/internal/broker/` (33 files, ~14,200 lines)
- `service/internal/prlm/` (38 files, ~8,800 lines)

### Individual files to delete:
- `service/cmd/spike-engine/mcp.go` (MCP proxy)

### Test files to delete or heavily modify:
- `service/cmd/spike-engine/serve_sessions_test.go`
- `service/cmd/spike-engine/serve_sync_test.go`
- `service/cmd/spike-engine/serve_webhook_test.go` (may need partial keep for webhook tests that don't use PRLM)
- `service/cmd/spike-engine/serve_integration_test.go`
- `service/cmd/spike-engine/main_remote_test.go` (if it tests remote ask)

### Total estimated deletion: ~23,000+ lines of Go code

---

## Dependency Cleanup

### Direct dependencies to remove from go.mod:
```
github.com/badlogic/pi-mono/go-coding-agent
github.com/mark3labs/mcp-go
gopkg.in/yaml.v3  (verify no remaining usage)
```

### Replace directives to remove:
```
replace github.com/badlogic/pi-mono/go-coding-agent => /Users/tyler/nexus/home/projects/pi-mono/go-coding-agent
```

### Indirect dependencies that will be removed by `go mod tidy`:
All AWS SDK packages, MCP-go transitive deps, go-coding-agent transitive deps.

### Dependencies to KEEP:
```
github.com/google/uuid
github.com/pkoukk/tiktoken-go
github.com/sabhiram/go-gitignore
modernc.org/sqlite
```

---

## Schema Migration

### Tables to DROP (migration v4 -> v5):
```sql
DROP TABLE IF EXISTS agent_node_bundles;
DROP TABLE IF EXISTS agent_node_files;
DROP TABLE IF EXISTS agent_nodes;
DROP TABLE IF EXISTS corpus_entries;
DROP TABLE IF EXISTS ask_request_executions;
DROP TABLE IF EXISTS ask_requests;
DROP TABLE IF EXISTS trees;
DROP TABLE IF EXISTS history;
```

### Tables to KEEP as-is:
`schema_version`, `agent_configs`, `github_installations`, `git_mirrors`, `repositories`, `repo_refs`, `github_connector_bindings`, `worktrees`, `jobs`, `webhook_deliveries`, `code_snapshots`, `code_files`, `code_chunks`, `code_chunks_fts`, `code_symbols`, `code_imports`, `code_capabilities`, `code_references`, `code_calls`

### Table to KEEP but potentially clean up:
`agent_indexes` -- remove from `schemaStatements` the fields that are PRLM-specific (`root_node_id`, `node_count`, `clean_count`, `total_tokens`, `total_files`, `previous_index_id`). For existing databases, these columns can remain as dead columns (SQLite doesn't have a clean DROP COLUMN). For new databases, the CREATE TABLE statement should exclude them.

### Table to DROP:
`tree_versions` -- the spec doesn't mention tree versions as a separate table. The concept is folded into code snapshots. However, `internal/control/tree_versions.go` uses this table and it may still be useful for the job/sync pipeline. **Decision: KEEP for now**, revisit if unused after PRLM removal.

---

## Manifest Update

See Phase 5 above for the complete diff.

Key structural changes to `app.nexus.json`:
1. Remove 20+ PRLM method definitions
2. Add 13 `spike.code.*` method definitions
3. Add 5 mirror/worktree method definitions
4. Add 2 connector method definitions
5. Add hook-owned seeding of the Spike reconcile job and durable `record.ingested` subscription
6. Remove `product`, `entitlements`, `adapters` sections
7. Simplify `requires` to nex version only

---

## Difficulty Assessment

| Phase | Difficulty | Risk | Notes |
|-------|-----------|------|-------|
| Phase 0 | Easy | Low | Just verification |
| Phase 1 | **Hard** | **High** | Largest change. Many interconnected deletions. Compiler will guide you but expect 20+ files touched. |
| Phase 2 | Easy | Low | String replacements in one file |
| Phase 3 | Medium | Medium | New code, but git adapter methods already exist. Main work is wiring + DB operations. |
| Phase 4 | Easy | Low | SQL DDL changes |
| Phase 5 | Medium | Medium | Manifest rewrite is mechanical, but the durable work cutover also needs hook/runtime seeding and a clean contract with Nex work APIs |
| Phase 6 | Easy | Low | `go mod tidy` does most of the work |
| Phase 7 | Easy | Low | Route deletion |
| Phase 8 | Easy | Low | Find-and-replace rename |
| Phase 9 | Medium | Low | Integration testing |

**Total estimated effort:** Phase 1 is 60% of the work. If Phase 1 compiles, everything else is straightforward.
