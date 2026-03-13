# Spike Code App Transformation -- Validation Ladder

Each rung corresponds to a workplan phase. Rungs must pass in order: a higher rung cannot pass if a lower rung fails. Every rung specifies automated checks (commands that must exit 0), manual verification steps, explicit pass criteria, and fail indicators.

All commands assume `cd service/` as the working directory unless stated otherwise.

---

## Rung 0: Pre-flight Baseline

**Workplan phase:** Phase 0 -- Pre-flight Verification
**Prerequisites:** None. This is the first rung.

### Automated Checks

```bash
# 1. Build the entire module
go build ./...

# 2. Vet the entire module
go vet ./...

# 3. Run tests and capture baseline
go test ./... 2>&1 | tee /tmp/spike-baseline-tests.txt
echo "Exit code: $?" >> /tmp/spike-baseline-tests.txt
```

### Manual Verification

1. Open `/tmp/spike-baseline-tests.txt` and count the number of test failures. Record this number as BASELINE_FAILURES.
2. Confirm the binary `spike-engine` is produced by `go build ./cmd/spike-engine/`.

### Pass Criteria

- [ ] `go build ./...` exits 0
- [ ] `go vet ./...` exits 0
- [ ] BASELINE_FAILURES is recorded (any value is acceptable -- this is a snapshot)

### Fail Indicators

- `go build ./...` fails: the codebase is already broken and must be fixed before transformation begins.
- `go vet ./...` reports errors in packages outside `internal/broker/` or `internal/prlm/`: pre-existing issues that will mask transformation problems.

---

## Rung 1: PRLM / Broker Deletion

**Workplan phase:** Phase 1 -- Delete the PRLM Oracle and Broker Packages
**Prerequisites:** Rung 0 passes.

### Automated Checks

```bash
# 1. Build must succeed without broker/prlm
go build ./...

# 2. Vet must pass
go vet ./...

# 3. No import of deleted packages anywhere in the module
# Each of these must return zero matches (exit code 1 from grep = no match = PASS)
! grep -r '".*internal/broker"' --include='*.go' .
! grep -r '".*internal/prlm'   --include='*.go' .
! grep -r 'prlmstore\.'        --include='*.go' .
! grep -r 'prlmtree\.'         --include='*.go' .
! grep -r 'broker\.New'        --include='*.go' .
! grep -r 'broker\.Broker'     --include='*.go' .

# 4. Deleted directories must not exist
[ ! -d internal/broker ]
[ ! -d internal/prlm ]

# 5. mcp.go must not exist
[ ! -f cmd/spike-engine/mcp.go ]

# 6. Run tests -- failures should be FEWER or EQUAL to baseline
#    (deleting code should not introduce NEW failures)
go test ./... 2>&1 | tee /tmp/spike-rung1-tests.txt
```

### Manual Verification

1. Run `go doc ./cmd/spike-engine/` and confirm no exported symbols reference "oracle", "broker", "prlm", "hydrate", or "ask" (in the PRLM sense).
2. Open `cmd/spike-engine/main.go` and confirm the CLI dispatch only handles `"serve"` (and optionally `"version"`). Commands `init`, `hydrate`, `ask`, `sync`, `mcp` must be gone.
3. Open `cmd/spike-engine/serve.go` and confirm:
   - No `servedTree` struct with `oracle` or `broker` fields.
   - No `askRequest`, `askResponse`, `syncRequest` types.
   - No handler methods named `handleAsk`, `handleStatus` (PRLM status), `handleSync`, `handleAskRequests*`, `handleSessions*`, `handleTreeVersion*`.
4. Open `cmd/spike-engine/nex_handlers.go` and confirm:
   - No `nexAsk`, `nexStatus` (PRLM), `nexSync` functions.
   - No `nexAskRequests*`, `nexSessions*`, `nexTreeVersions*` functions.
5. Open `cmd/spike-engine/nex_protocol.go` and confirm the operation routing table has no entries for `spike.ask`, `spike.status`, `spike.sync`, `spike.ask-requests.*`, `spike.sessions.*`, `spike.tree-versions.*`, `spike.guides.build`.

### Pass Criteria

- [ ] `go build ./...` exits 0
- [ ] `go vet ./...` exits 0
- [ ] Zero grep hits for any deleted package import or symbol
- [ ] `internal/broker/` and `internal/prlm/` directories do not exist on disk
- [ ] `cmd/spike-engine/mcp.go` does not exist
- [ ] CLI dispatch is `serve`-only
- [ ] No PRLM operation entries in nex_protocol.go routing table
- [ ] Test failure count is less than or equal to BASELINE_FAILURES

### Fail Indicators

- `go build` fails with "cannot find package" errors referencing broker or prlm: incomplete deletion of import sites.
- `go build` fails with "undefined:" errors: a function or type that was deleted is still referenced somewhere. Trace the error to find the remaining call site.
- grep finds lingering imports: a file was missed during deletion.
- Test count increases: deletion broke something that was previously passing.

---

## Rung 2: Schema Migration

**Workplan phase:** Phase 4 -- Schema Migration
**Prerequisites:** Rung 1 passes.

### Automated Checks

```bash
# 1. Build
go build ./...

# 2. Fresh database creation -- start the server, let it create spike.db, then inspect
rm -rf /tmp/spike-rung2-data
NEX_APP_DATA_DIR=/tmp/spike-rung2-data go run ./cmd/spike-engine serve --port 17422 &
SERVER_PID=$!
sleep 3
kill $SERVER_PID 2>/dev/null || true

# 3. Verify PRLM tables do NOT exist in fresh DB
for table in trees history agent_nodes agent_node_files agent_node_bundles \
             corpus_entries ask_requests ask_request_executions; do
  result=$(sqlite3 /tmp/spike-rung2-data/spike.db \
    "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';")
  [ -z "$result" ] || echo "FAIL: PRLM table '$table' exists in fresh DB"
done

# 4. Verify code-intel tables DO exist in fresh DB
for table in code_snapshots code_files code_chunks code_symbols \
             code_imports code_capabilities code_references code_calls \
             git_mirrors worktrees repositories repo_refs jobs \
             schema_version agent_configs github_installations \
             github_connector_bindings webhook_deliveries; do
  result=$(sqlite3 /tmp/spike-rung2-data/spike.db \
    "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';")
  [ -n "$result" ] || echo "FAIL: expected table '$table' missing from fresh DB"
done

# 5. Verify FTS5 virtual table exists
sqlite3 /tmp/spike-rung2-data/spike.db \
  "SELECT name FROM sqlite_master WHERE type='table' AND name='code_chunks_fts';" \
  | grep -q 'code_chunks_fts'

# 6. Verify schema version is 5 (or whatever the new target is)
sqlite3 /tmp/spike-rung2-data/spike.db \
  "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1;" \
  | grep -q '5'

# 7. Migration test: create a v4 database, then let server migrate it
# (Only if a v4 fixture exists or can be seeded)

# 8. Run spikedb unit tests
go test ./internal/spikedb/... -v

# 9. Cleanup
rm -rf /tmp/spike-rung2-data
```

### Manual Verification

1. Open `internal/spikedb/schema.go` and confirm:
   - `schemaVersion` is bumped (e.g., to 5).
   - The `schemaStatements` array does not contain CREATE TABLE for any PRLM tables (trees, history, agent_nodes, agent_node_files, agent_node_bundles, corpus_entries, ask_requests, ask_request_executions).
   - A migration path from v4 to v5 exists that DROPs those tables.
2. If `agent_indexes` table is kept, confirm PRLM-specific columns (`root_node_id`, `node_count`, `clean_count`, `total_tokens`, `total_files`, `previous_index_id`) are either removed from the CREATE statement or documented as dead columns.

### Pass Criteria

- [ ] `go build ./...` exits 0
- [ ] Fresh spike.db contains zero PRLM tables
- [ ] Fresh spike.db contains all code-intel and infrastructure tables (18 tables listed above)
- [ ] FTS5 virtual table `code_chunks_fts` exists
- [ ] Schema version reads as the new target version (5)
- [ ] `go test ./internal/spikedb/...` passes
- [ ] (If testable) v4-to-v5 migration completes without error

### Fail Indicators

- PRLM table found in fresh DB: the CREATE TABLE statement was not removed from schemaStatements.
- Expected table missing: a table was accidentally deleted.
- Schema version mismatch: the version bump was missed or the migration did not run.
- sqlite3 "malformed" or "no such table" errors: schema is internally inconsistent.

---

## Rung 3: Mirror Operations

**Workplan phase:** Phase 3a-3c -- Add Missing Mirror Operations
**Prerequisites:** Rung 2 passes.

### Automated Checks

```bash
# Start server
rm -rf /tmp/spike-rung3-data
NEX_APP_DATA_DIR=/tmp/spike-rung3-data \
  go run ./cmd/spike-engine serve --port 17423 &
SERVER_PID=$!
sleep 3

# Use a small, public, fast-cloning repo for all tests
TEST_REPO="https://github.com/kelseyhightower/nocode.git"

# 1. mirrors.ensure -- first call (creates mirror)
ENSURE_RESULT=$(curl -s -X POST http://localhost:17423/operations/spike.mirrors.ensure \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"remote_url\":\"$TEST_REPO\"}}")
echo "$ENSURE_RESULT" | jq -e '.ok == true'
echo "$ENSURE_RESULT" | jq -e '.result.mirror_id != null'
echo "$ENSURE_RESULT" | jq -e '.result.mirror_path != null'
echo "$ENSURE_RESULT" | jq -e '.result.created == true'
MIRROR_ID=$(echo "$ENSURE_RESULT" | jq -r '.result.mirror_id')
MIRROR_PATH=$(echo "$ENSURE_RESULT" | jq -r '.result.mirror_path')

# 2. Verify mirror directory exists on disk and is a bare git repo
[ -d "$MIRROR_PATH" ]
git -C "$MIRROR_PATH" rev-parse --is-bare-repository | grep -q 'true'

# 3. mirrors.ensure -- second call (idempotent, no re-clone)
ENSURE2_RESULT=$(curl -s -X POST http://localhost:17423/operations/spike.mirrors.ensure \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"remote_url\":\"$TEST_REPO\"}}")
echo "$ENSURE2_RESULT" | jq -e '.ok == true'
echo "$ENSURE2_RESULT" | jq -e '.result.created == false'
MIRROR_ID2=$(echo "$ENSURE2_RESULT" | jq -r '.result.mirror_id')
[ "$MIRROR_ID" = "$MIRROR_ID2" ]  # same mirror ID

# 4. mirrors.list -- mirror appears in list
LIST_RESULT=$(curl -s -X POST http://localhost:17423/operations/spike.mirrors.list \
  -H 'Content-Type: application/json' \
  -d '{"params":{}}')
echo "$LIST_RESULT" | jq -e '.ok == true'
echo "$LIST_RESULT" | jq -e ".result.items | map(select(.mirror_id == \"$MIRROR_ID\")) | length == 1"

# 5. mirrors.status -- returns correct status
STATUS_RESULT=$(curl -s -X POST http://localhost:17423/operations/spike.mirrors.status \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"mirror_id\":\"$MIRROR_ID\"}}")
echo "$STATUS_RESULT" | jq -e '.ok == true'
echo "$STATUS_RESULT" | jq -e '.result.status == "ready"'
echo "$STATUS_RESULT" | jq -e '.result.last_fetched != null'

# 6. mirrors.refresh -- fetches without error
REFRESH_RESULT=$(curl -s -X POST http://localhost:17423/operations/spike.mirrors.refresh \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"mirror_id\":\"$MIRROR_ID\"}}")
echo "$REFRESH_RESULT" | jq -e '.ok == true'

# 7. mirrors.status after refresh -- last_fetched updated
STATUS2_RESULT=$(curl -s -X POST http://localhost:17423/operations/spike.mirrors.status \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"mirror_id\":\"$MIRROR_ID\"}}")
FETCHED_AFTER=$(echo "$STATUS2_RESULT" | jq -r '.result.last_fetched')
[ "$FETCHED_AFTER" != "null" ]

# Cleanup
kill $SERVER_PID 2>/dev/null || true
rm -rf /tmp/spike-rung3-data
```

### Manual Verification

1. During the test, inspect the mirror directory at `$MIRROR_PATH`:
   - Contains `HEAD`, `config`, `objects/`, `refs/` (bare git layout).
   - `git -C $MIRROR_PATH branch -a` lists branches from the remote.
2. Query the database directly: `sqlite3 /tmp/spike-rung3-data/spike.db "SELECT * FROM git_mirrors;"` and confirm the row has `status='ready'` and `remote_url` matches the test repo.

### Pass Criteria

- [ ] `mirrors.ensure` returns `ok:true` with `mirror_id`, `mirror_path`, `created:true` on first call
- [ ] Mirror directory is a valid bare git repository on disk
- [ ] `mirrors.ensure` second call returns `created:false` with the same `mirror_id` (idempotent)
- [ ] `mirrors.list` includes the created mirror
- [ ] `mirrors.status` returns `status:"ready"` and non-null `last_fetched`
- [ ] `mirrors.refresh` returns `ok:true`
- [ ] `last_fetched` timestamp advances after refresh

### Fail Indicators

- `ok:false` on any operation: check the `error` field in the response for details.
- Mirror directory missing or not a bare repo: `git clone --mirror` is not being invoked correctly.
- Second ensure returns `created:true`: idempotency check is broken (not detecting existing mirror).
- `mirrors.list` returns empty: DB insert is failing silently.
- `mirrors.status` returns `status:"error"`: the mirror clone or fetch failed.

---

## Rung 4: Worktree Operations

**Workplan phase:** Phase 3d-3e -- Add Missing Worktree Operations
**Prerequisites:** Rung 3 passes.

### Automated Checks

```bash
# Start server
rm -rf /tmp/spike-rung4-data
NEX_APP_DATA_DIR=/tmp/spike-rung4-data \
  go run ./cmd/spike-engine serve --port 17424 &
SERVER_PID=$!
sleep 3

TEST_REPO="https://github.com/kelseyhightower/nocode.git"

# 1. Setup: ensure mirror first
ENSURE_RESULT=$(curl -s -X POST http://localhost:17424/operations/spike.mirrors.ensure \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"remote_url\":\"$TEST_REPO\"}}")
MIRROR_ID=$(echo "$ENSURE_RESULT" | jq -r '.result.mirror_id')
MIRROR_PATH=$(echo "$ENSURE_RESULT" | jq -r '.result.mirror_path')

# 2. Get a valid commit SHA from the mirror
COMMIT_SHA=$(git -C "$MIRROR_PATH" rev-parse HEAD)

# 3. worktrees.create
CREATE_RESULT=$(curl -s -X POST http://localhost:17424/operations/spike.worktrees.create \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"repo_id\":\"nocode\",\"mirror_path\":\"$MIRROR_PATH\",\"commit_sha\":\"$COMMIT_SHA\"}}")
echo "$CREATE_RESULT" | jq -e '.ok == true'
echo "$CREATE_RESULT" | jq -e '.result.worktree_id != null'
echo "$CREATE_RESULT" | jq -e '.result.worktree_path != null'
WORKTREE_ID=$(echo "$CREATE_RESULT" | jq -r '.result.worktree_id')
WORKTREE_PATH=$(echo "$CREATE_RESULT" | jq -r '.result.worktree_path')

# 4. Verify worktree exists on disk
[ -d "$WORKTREE_PATH" ]

# 5. Verify worktree is at the correct commit (detached HEAD)
ACTUAL_SHA=$(git -C "$WORKTREE_PATH" rev-parse HEAD)
[ "$ACTUAL_SHA" = "$COMMIT_SHA" ]

# 6. Verify detached HEAD state
git -C "$WORKTREE_PATH" symbolic-ref HEAD 2>&1 | grep -q 'not a symbolic ref'

# 7. worktrees.create -- idempotent (same repo+commit returns existing)
CREATE2_RESULT=$(curl -s -X POST http://localhost:17424/operations/spike.worktrees.create \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"repo_id\":\"nocode\",\"mirror_path\":\"$MIRROR_PATH\",\"commit_sha\":\"$COMMIT_SHA\"}}")
echo "$CREATE2_RESULT" | jq -e '.ok == true'
WORKTREE_ID2=$(echo "$CREATE2_RESULT" | jq -r '.result.worktree_id')
[ "$WORKTREE_ID" = "$WORKTREE_ID2" ]

# 8. worktrees.list -- worktree appears
LIST_RESULT=$(curl -s -X POST http://localhost:17424/operations/spike.worktrees.list \
  -H 'Content-Type: application/json' \
  -d '{"params":{}}')
echo "$LIST_RESULT" | jq -e '.ok == true'
echo "$LIST_RESULT" | jq -e ".result.items | map(select(.worktree_id == \"$WORKTREE_ID\")) | length == 1"

# 9. Check mirror ref_count incremented
STATUS_RESULT=$(curl -s -X POST http://localhost:17424/operations/spike.mirrors.status \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"mirror_id\":\"$MIRROR_ID\"}}")
REF_COUNT=$(echo "$STATUS_RESULT" | jq -r '.result.ref_count')
[ "$REF_COUNT" -ge 1 ]

# 10. worktrees.destroy
DESTROY_RESULT=$(curl -s -X POST http://localhost:17424/operations/spike.worktrees.destroy \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"worktree_id\":\"$WORKTREE_ID\"}}")
echo "$DESTROY_RESULT" | jq -e '.ok == true'

# 11. Verify worktree directory is removed from disk
[ ! -d "$WORKTREE_PATH" ]

# 12. Verify mirror ref_count decremented
STATUS2_RESULT=$(curl -s -X POST http://localhost:17424/operations/spike.mirrors.status \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"mirror_id\":\"$MIRROR_ID\"}}")
REF_COUNT2=$(echo "$STATUS2_RESULT" | jq -r '.result.ref_count')
[ "$REF_COUNT2" -lt "$REF_COUNT" ]

# 13. worktrees.list -- worktree no longer appears
LIST2_RESULT=$(curl -s -X POST http://localhost:17424/operations/spike.worktrees.list \
  -H 'Content-Type: application/json' \
  -d '{"params":{}}')
echo "$LIST2_RESULT" | jq -e ".result.items | map(select(.worktree_id == \"$WORKTREE_ID\")) | length == 0"

# Cleanup
kill $SERVER_PID 2>/dev/null || true
rm -rf /tmp/spike-rung4-data
```

### Manual Verification

1. Before destroying the worktree, inspect its filesystem:
   - The directory contains a `.git` file (not a directory -- this is how git worktrees work).
   - Files from the repository are checked out at the expected commit.
2. After destroy, confirm `git -C $MIRROR_PATH worktree list` no longer lists the destroyed worktree.
3. Query `sqlite3 spike.db "SELECT * FROM worktrees;"` -- the row for the destroyed worktree should be gone (or marked as destroyed, depending on implementation).

### Pass Criteria

- [ ] `worktrees.create` returns `ok:true` with `worktree_id` and `worktree_path`
- [ ] Worktree directory exists on disk with files checked out
- [ ] Worktree is at the exact commit SHA specified (detached HEAD)
- [ ] Second create for same repo+commit returns the same worktree (idempotent)
- [ ] `worktrees.list` includes the created worktree
- [ ] Mirror `ref_count` is at least 1 after worktree creation
- [ ] `worktrees.destroy` returns `ok:true`
- [ ] Worktree directory is removed from disk after destroy
- [ ] Mirror `ref_count` decrements after destroy
- [ ] `worktrees.list` no longer includes the destroyed worktree

### Fail Indicators

- Worktree path does not exist: `git worktree add --detach` is failing. Check server logs for git stderr.
- HEAD does not match requested commit: commit resolution is broken.
- ref_count does not change: DB update is not wired to create/destroy.
- Directory remains after destroy: `git worktree remove` is failing or not being called.
- Destroy returns error for valid worktree_id: ID lookup is broken.

---

## Rung 5: Code Intelligence

**Workplan phase:** Phase 2 (rename) + functional verification
**Prerequisites:** Rung 4 passes.

### Automated Checks

```bash
# Start server
rm -rf /tmp/spike-rung5-data
NEX_APP_DATA_DIR=/tmp/spike-rung5-data \
  go run ./cmd/spike-engine serve --port 17425 &
SERVER_PID=$!
sleep 3

# Use a Go repo that has functions, imports, and call sites.
# Spike itself is a good candidate if cloneable, or use a known small Go project.
TEST_REPO="https://github.com/benhoyt/goawk.git"

# 1. Setup: ensure mirror + create worktree
ENSURE_RESULT=$(curl -s -X POST http://localhost:17425/operations/spike.mirrors.ensure \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"remote_url\":\"$TEST_REPO\"}}")
MIRROR_ID=$(echo "$ENSURE_RESULT" | jq -r '.result.mirror_id')
MIRROR_PATH=$(echo "$ENSURE_RESULT" | jq -r '.result.mirror_path')

COMMIT_SHA=$(git -C "$MIRROR_PATH" rev-parse HEAD)

CREATE_RESULT=$(curl -s -X POST http://localhost:17425/operations/spike.worktrees.create \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"repo_id\":\"goawk\",\"mirror_path\":\"$MIRROR_PATH\",\"commit_sha\":\"$COMMIT_SHA\"}}")
WORKTREE_PATH=$(echo "$CREATE_RESULT" | jq -r '.result.worktree_path')

# 2. code.build -- index the worktree
BUILD_RESULT=$(curl -s -X POST http://localhost:17425/operations/spike.code.build \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"root_path\":\"$WORKTREE_PATH\"}}")
echo "$BUILD_RESULT" | jq -e '.ok == true'
echo "$BUILD_RESULT" | jq -e '.result.snapshot.status == "ready"'
echo "$BUILD_RESULT" | jq -e '.result.snapshot.file_count > 0'
echo "$BUILD_RESULT" | jq -e '.result.snapshot.chunk_count > 0'
echo "$BUILD_RESULT" | jq -e '.result.snapshot.symbol_count > 0'
SNAPSHOT_ID=$(echo "$BUILD_RESULT" | jq -r '.result.snapshot.snapshot_id')

# 3. code.status -- snapshot is ready
STATUS_RESULT=$(curl -s -X POST http://localhost:17425/operations/spike.code.status \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"snapshot_id\":\"$SNAPSHOT_ID\"}}")
echo "$STATUS_RESULT" | jq -e '.ok == true'
echo "$STATUS_RESULT" | jq -e '.result.status == "ready"'

# 4. code.search -- full-text search returns results
SEARCH_RESULT=$(curl -s -X POST http://localhost:17425/operations/spike.code.search \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"snapshot_id\":\"$SNAPSHOT_ID\",\"query\":\"func\",\"limit\":5}}")
echo "$SEARCH_RESULT" | jq -e '.ok == true'
echo "$SEARCH_RESULT" | jq -e '.result.hits | length > 0'
# Each hit has required fields
echo "$SEARCH_RESULT" | jq -e '.result.hits[0].chunk_id != null'
echo "$SEARCH_RESULT" | jq -e '.result.hits[0].file_path != null'
echo "$SEARCH_RESULT" | jq -e '.result.hits[0].score > 0'

# 5. code.symbols -- resolve a symbol
SYMBOLS_RESULT=$(curl -s -X POST http://localhost:17425/operations/spike.code.symbols \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"snapshot_id\":\"$SNAPSHOT_ID\",\"query\":\"main\"}}")
echo "$SYMBOLS_RESULT" | jq -e '.ok == true'
echo "$SYMBOLS_RESULT" | jq -e '.result | length > 0'

# 6. code.references -- find references to a symbol
# Pick a symbol name from the symbols result
SYMBOL_NAME=$(echo "$SYMBOLS_RESULT" | jq -r '.result[0].name')
REFS_RESULT=$(curl -s -X POST http://localhost:17425/operations/spike.code.references \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"snapshot_id\":\"$SNAPSHOT_ID\",\"symbol_name\":\"$SYMBOL_NAME\"}}")
echo "$REFS_RESULT" | jq -e '.ok == true'
# References may or may not exist; just verify the call succeeds

# 7. code.callers -- find callers
CALLERS_RESULT=$(curl -s -X POST http://localhost:17425/operations/spike.code.callers \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"snapshot_id\":\"$SNAPSHOT_ID\",\"callee_name\":\"$SYMBOL_NAME\"}}")
echo "$CALLERS_RESULT" | jq -e '.ok == true'

# 8. code.callees -- find callees
# Get a chunk_id from search results
CHUNK_ID=$(echo "$SEARCH_RESULT" | jq -r '.result.hits[0].chunk_id')
CALLEES_RESULT=$(curl -s -X POST http://localhost:17425/operations/spike.code.callees \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"snapshot_id\":\"$SNAPSHOT_ID\",\"caller_chunk_id\":\"$CHUNK_ID\"}}")
echo "$CALLEES_RESULT" | jq -e '.ok == true'

# 9. code.imports -- list imports for a file
FILE_PATH=$(echo "$SEARCH_RESULT" | jq -r '.result.hits[0].file_path')
IMPORTS_RESULT=$(curl -s -X POST http://localhost:17425/operations/spike.code.imports \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"snapshot_id\":\"$SNAPSHOT_ID\",\"file_path\":\"$FILE_PATH\"}}")
echo "$IMPORTS_RESULT" | jq -e '.ok == true'

# 10. code.importers -- find importers of a path
IMPORT_PATH=$(echo "$IMPORTS_RESULT" | jq -r '
  if .result | type == "array" and length > 0
  then .result[0].import_path
  else "fmt"
  end')
IMPORTERS_RESULT=$(curl -s -X POST http://localhost:17425/operations/spike.code.importers \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"snapshot_id\":\"$SNAPSHOT_ID\",\"import_path\":\"$IMPORT_PATH\"}}")
echo "$IMPORTERS_RESULT" | jq -e '.ok == true'

# 11. code.context -- assemble context pack
CONTEXT_RESULT=$(curl -s -X POST http://localhost:17425/operations/spike.code.context \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"snapshot_id\":\"$SNAPSHOT_ID\",\"query\":\"main\"}}")
echo "$CONTEXT_RESULT" | jq -e '.ok == true'

# 12. code.tests.impact
IMPACT_RESULT=$(curl -s -X POST http://localhost:17425/operations/spike.code.tests.impact \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"snapshot_id\":\"$SNAPSHOT_ID\",\"changed_files\":[\"$FILE_PATH\"]}}")
echo "$IMPACT_RESULT" | jq -e '.ok == true'

# 13. code.source.file -- read file metadata
SOURCE_FILE_RESULT=$(curl -s -X POST http://localhost:17425/operations/spike.code.source.file \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"snapshot_id\":\"$SNAPSHOT_ID\",\"file_path\":\"$FILE_PATH\"}}")
echo "$SOURCE_FILE_RESULT" | jq -e '.ok == true'

# 14. code.source.chunk -- read chunk content
SOURCE_CHUNK_RESULT=$(curl -s -X POST http://localhost:17425/operations/spike.code.source.chunk \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"snapshot_id\":\"$SNAPSHOT_ID\",\"chunk_id\":\"$CHUNK_ID\"}}")
echo "$SOURCE_CHUNK_RESULT" | jq -e '.ok == true'

# 15. Verify old namespace does NOT work
OLD_NS_RESULT=$(curl -s -X POST http://localhost:17425/operations/spike.code-intel.index.build \
  -H 'Content-Type: application/json' \
  -d '{"params":{}}')
echo "$OLD_NS_RESULT" | jq -e '.ok == false'

# Cleanup
kill $SERVER_PID 2>/dev/null || true
rm -rf /tmp/spike-rung5-data
```

### Manual Verification

1. Inspect the build result: `file_count`, `chunk_count`, and `symbol_count` should all be plausible for the test repository (e.g., for goawk: dozens of files, hundreds of chunks, hundreds of symbols).
2. Verify `code.search` results contain meaningful snippets (not empty strings).
3. Verify `code.symbols` returns symbols with `kind` values like "function", "method", "type".
4. Verify `code.context` returns a ContextPack with at least `anchor_chunks` populated.
5. Open `nex_protocol.go` and confirm every operation key starts with `spike.code.` (not `spike.code-intel.`).

### Pass Criteria

- [ ] `code.build` returns `ok:true` with `status:"ready"`, non-zero file/chunk/symbol counts
- [ ] `code.status` returns `status:"ready"` for the built snapshot
- [ ] `code.search` returns at least 1 hit with `chunk_id`, `file_path`, and `score > 0`
- [ ] `code.symbols` returns at least 1 symbol for query "main"
- [ ] `code.references` returns `ok:true` (may be empty for some symbols)
- [ ] `code.callers` returns `ok:true`
- [ ] `code.callees` returns `ok:true`
- [ ] `code.imports` returns `ok:true`
- [ ] `code.importers` returns `ok:true`
- [ ] `code.context` returns `ok:true` with a context pack
- [ ] `code.tests.impact` returns `ok:true`
- [ ] `code.source.file` returns `ok:true`
- [ ] `code.source.chunk` returns `ok:true`
- [ ] All 14 `spike.code.*` operations respond successfully
- [ ] Old `spike.code-intel.*` namespace returns `ok:false` (not found)

### Fail Indicators

- `code.build` returns `status:"error"`: check `last_error` field. Common causes: worktree path does not exist, file walker crashes, AST parser panics.
- `code.search` returns zero hits on a non-trivial repo: FTS5 index was not built or triggers are not firing.
- `code.symbols` returns empty: symbol extraction is broken. Check the Go parser pipeline.
- Old namespace still works: the rename in nex_protocol.go was not applied.
- Any operation returns HTTP 404 or routing error: operation not registered.

---

## Rung 6: Nex Protocol Completeness

**Workplan phase:** Phases 2, 3, 7, 8 -- operation routing, renaming, cleanup
**Prerequisites:** Rung 5 passes.

### Automated Checks

```bash
# Start server
rm -rf /tmp/spike-rung6-data
NEX_APP_DATA_DIR=/tmp/spike-rung6-data \
  go run ./cmd/spike-engine serve --port 17426 &
SERVER_PID=$!
sleep 3

# 1. Health check
curl -s http://localhost:17426/health | jq -e '.status == "ok"'

# 2. Test every spec'd operation responds (not 404 and not "unknown operation")
# Operations are invoked via POST /operations/{method}
# We send minimal/empty params and accept either ok:true or a validation error
# The key test is that the operation is ROUTED, not that params are valid.

OPERATIONS=(
  "spike.mirrors.ensure"
  "spike.mirrors.refresh"
  "spike.mirrors.list"
  "spike.mirrors.status"
  "spike.worktrees.create"
  "spike.worktrees.list"
  "spike.worktrees.destroy"
  "spike.code.build"
  "spike.code.status"
  "spike.code.search"
  "spike.code.symbols"
  "spike.code.references"
  "spike.code.callers"
  "spike.code.callees"
  "spike.code.imports"
  "spike.code.importers"
  "spike.code.context"
  "spike.code.tests.impact"
  "spike.code.source.file"
  "spike.code.source.chunk"
  "spike.repositories.list"
  "spike.repositories.get"
  "spike.repo-refs.list"
  "spike.repo-refs.get"
  "spike.indexes.create"
  "spike.indexes.list"
  "spike.indexes.get"
  "spike.indexes.delete"
  "spike.indexes.status"
  "spike.jobs.list"
  "spike.jobs.get"
  "spike.github.installations.list"
  "spike.github.installations.get"
  "spike.config.defaults"
  "spike.config.get"
  "spike.config.update"
  "spike.connectors.github.bind"
  "spike.connectors.github.get"
  "spike.connectors.github.install.start"
  "spike.connectors.github.install.callback"
  "spike.connectors.github.repos"
  "spike.connectors.github.branches"
  "spike.connectors.github.commits"
  "spike.connectors.github.remove"
  "spike.connectors.github.setup"
)

FAIL_COUNT=0
for op in "${OPERATIONS[@]}"; do
  RESULT=$(curl -s -X POST http://localhost:17426/operations/$op \
    -H 'Content-Type: application/json' \
    -d '{"params":{}}')
  # Check it's NOT an "unknown operation" / "not found" response
  # An operation can fail with a validation error -- that's fine, it means it's routed
  IS_UNKNOWN=$(echo "$RESULT" | jq -r '.error // empty' | grep -ci 'unknown\|not found\|no handler')
  if [ "$IS_UNKNOWN" -gt 0 ]; then
    echo "FAIL: $op returned unknown/not found"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done
[ "$FAIL_COUNT" -eq 0 ]

# 3. Test that REMOVED operations are truly gone
REMOVED_OPERATIONS=(
  "spike.ask"
  "spike.status"
  "spike.sync"
  "spike.ask-requests.get"
  "spike.ask-requests.list"
  "spike.ask-requests.inspect"
  "spike.ask-requests.timeline"
  "spike.sessions.list"
  "spike.sessions.resolve"
  "spike.sessions.preview"
  "spike.sessions.patch"
  "spike.sessions.reset"
  "spike.sessions.delete"
  "spike.sessions.compact"
  "spike.sessions.import"
  "spike.sessions.import-chunk"
  "spike.tree-versions.get"
  "spike.tree-versions.list"
  "spike.guides.build"
  "spike.code-intel.index.build"
  "spike.code-intel.search.semantic"
)

for op in "${REMOVED_OPERATIONS[@]}"; do
  RESULT=$(curl -s -X POST http://localhost:17426/operations/$op \
    -H 'Content-Type: application/json' \
    -d '{"params":{}}')
  IS_GONE=$(echo "$RESULT" | jq -r '.error // "none"' | grep -ci 'unknown\|not found\|no handler')
  if [ "$IS_GONE" -eq 0 ]; then
    # If the operation still works (ok:true or a non-routing error), that's a fail
    echo "FAIL: removed operation $op is still routed"
  fi
done

# 4. Verify "oracleServer" naming is gone from source
! grep -r 'oracleServer'         --include='*.go' cmd/
! grep -r 'newOracleServer'      --include='*.go' cmd/
! grep -r 'oracleServerOptions'  --include='*.go' cmd/

# Cleanup
kill $SERVER_PID 2>/dev/null || true
rm -rf /tmp/spike-rung6-data
```

### Manual Verification

1. Review the complete operation routing table in `nex_protocol.go`. Every spec'd operation from the Operations Summary table in the spec must have an entry.
2. Confirm no handler function references oracle, broker, prlm, or ask (in the PRLM sense).
3. Confirm the server type is named `spikeServer` (or `engineServer`), not `oracleServer`.

### Pass Criteria

- [ ] `/health` returns `{"status":"ok"}`
- [ ] All 45 spec'd operations are routed (not "unknown operation")
- [ ] All 21 removed PRLM operations return "unknown" or "not found"
- [ ] Zero occurrences of `oracleServer`, `newOracleServer`, `oracleServerOptions` in `cmd/` Go files
- [ ] `go build ./...` exits 0

### Fail Indicators

- An expected operation returns "unknown": it was not registered in `buildNexOperationHandlers()`.
- A removed operation still responds: the routing entry was not deleted.
- "oracleServer" still in source: the rename phase was skipped or incomplete.

---

## Rung 7: Durable Event Work

**Workplan phase:** Phase 5 (hook-owned work seeding) + Nex durable event-subscription API
**Prerequisites:** Rung 6 passes.

### Automated Checks

```bash
# 1. Manifest must NOT declare event ownership
MANIFEST_PATH="../apps/spike/app/app.nexus.json"
jq -e 'has("events") | not' "$MANIFEST_PATH"

# 2. Nex runtime must expose durable event-subscription control methods
rg -n '"events\\.subscriptions\\.(list|get|create|update|delete)"' \
  /Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/runtime-operations.ts

# 3. Spike must seed a reconcile job and durable subscription from hook code
rg -n 'spike\\.record_ingested_reconcile|record\\.ingested|events\\.subscriptions\\.(create|update|list)' \
  /Users/tyler/nexus/home/projects/nexus/apps/spike/app/hooks \
  /Users/tyler/nexus/home/projects/nexus/apps/spike/app/jobs

# 4. The reconcile job must fetch the canonical record and compose Spike ops
rg -n 'records\\.get|spike\\.mirrors\\.ensure|spike\\.worktrees\\.create|spike\\.code\\.build' \
  /Users/tyler/nexus/home/projects/nexus/apps/spike/app/jobs
```

### Manual Verification

1. Open `app.nexus.json` and confirm there is no `events` section.
2. Open the Spike lifecycle hook and confirm it idempotently ensures:
   - job definition `spike.record_ingested_reconcile`
   - durable subscription on `record.ingested`
   - match envelope `{ "platform": "git" }`
3. Open the Spike job script and confirm it:
   - receives queued job input from the daemon
   - reads the canonical record with `records.get`
   - requires `record.metadata.remote_url`
   - skips non-rebuild record types such as `pr_comment`
   - composes `spike.mirrors.ensure`, `spike.worktrees.create`, and `spike.code.build`

### Pass Criteria

- [ ] Manifest has no `events` section
- [ ] Nex exposes durable `events.subscriptions.*` control methods
- [ ] Spike hook code seeds the reconcile job and durable subscription
- [ ] Spike job reads canonical records rather than platform APIs
- [ ] Spike job composes mirror/worktree/code-build operations

### Fail Indicators

- Manifest still declares `events`: app ownership boundary is wrong.
- No `events.subscriptions.*` control methods: Spike cannot seed durable work through the canonical runtime API.
- No job script or hook seeding path: automatic rebuild remains theoretical.
- Job script calls provider APIs directly: Spike is no longer record-driven.

---

## Rung 8: Manifest Correctness

**Workplan phase:** Phase 5 -- Manifest Update
**Prerequisites:** Rung 7 passes.

### Automated Checks

```bash
MANIFEST_PATH="../apps/spike/app/app.nexus.json"
# (Adjust path based on actual project layout)

# 1. Manifest is valid JSON
jq '.' "$MANIFEST_PATH" > /dev/null

# 2. Core identity fields
jq -e '.id == "spike"' "$MANIFEST_PATH"
jq -e '.version != null' "$MANIFEST_PATH"

# 3. Services section
jq -e '.services.engine.command != null' "$MANIFEST_PATH"
jq -e '.services.engine.healthCheck.path == "/health"' "$MANIFEST_PATH"

# 4. All spec'd operations are listed in the manifest methods
EXPECTED_METHODS=(
  "spike.mirrors.ensure"
  "spike.mirrors.refresh"
  "spike.mirrors.list"
  "spike.mirrors.status"
  "spike.worktrees.create"
  "spike.worktrees.list"
  "spike.worktrees.destroy"
  "spike.code.build"
  "spike.code.status"
  "spike.code.search"
  "spike.code.symbols"
  "spike.code.references"
  "spike.code.callers"
  "spike.code.callees"
  "spike.code.imports"
  "spike.code.importers"
  "spike.code.context"
  "spike.code.tests.impact"
  "spike.code.source.file"
  "spike.code.source.chunk"
  "spike.repositories.list"
  "spike.repositories.get"
  "spike.repo-refs.list"
  "spike.repo-refs.get"
  "spike.indexes.create"
  "spike.indexes.list"
  "spike.indexes.get"
  "spike.indexes.delete"
  "spike.indexes.status"
  "spike.jobs.list"
  "spike.jobs.get"
  "spike.github.installations.list"
  "spike.github.installations.get"
  "spike.config.defaults"
  "spike.config.get"
  "spike.config.update"
  "spike.connectors.github.bind"
  "spike.connectors.github.get"
  "spike.connectors.github.install.start"
  "spike.connectors.github.install.callback"
  "spike.connectors.github.repos"
  "spike.connectors.github.branches"
  "spike.connectors.github.commits"
  "spike.connectors.github.remove"
  "spike.connectors.github.setup"
)

MANIFEST_METHODS=$(jq -r '[.methods[] | .name] | .[]' "$MANIFEST_PATH" 2>/dev/null || \
                   jq -r 'keys[]' "$MANIFEST_PATH" 2>/dev/null)
# Adjust the jq path based on actual manifest structure (it might be .methods[].name,
# .operations[].name, or a flat map of method names)

MISSING=0
for method in "${EXPECTED_METHODS[@]}"; do
  if ! echo "$MANIFEST_METHODS" | grep -qF "$method"; then
    echo "MISSING from manifest: $method"
    MISSING=$((MISSING + 1))
  fi
done
[ "$MISSING" -eq 0 ]

# 5. No PRLM operations in manifest
PRLM_METHODS=(
  "spike.ask" "spike.status" "spike.sync"
  "spike.ask-requests" "spike.sessions" "spike.tree-versions"
  "spike.guides.build"
  "spike.code-intel"
)
FOUND_PRLM=0
for bad in "${PRLM_METHODS[@]}"; do
  if grep -q "$bad" "$MANIFEST_PATH"; then
    echo "PRLM operation found in manifest: $bad"
    FOUND_PRLM=$((FOUND_PRLM + 1))
  fi
done
[ "$FOUND_PRLM" -eq 0 ]

# 6. No product/pricing/entitlements section
jq -e '.product == null' "$MANIFEST_PATH" || \
  ! jq -e '.product' "$MANIFEST_PATH" 2>/dev/null
jq -e '.entitlements == null' "$MANIFEST_PATH" || \
  ! jq -e '.entitlements' "$MANIFEST_PATH" 2>/dev/null

# 7. Manifest must not claim event ownership
jq -e 'has("events") | not' "$MANIFEST_PATH"

# 8. Requires section -- no adapter requirement
jq -e '.requires.adapters == null' "$MANIFEST_PATH" || \
  ! jq -e '.requires.adapters' "$MANIFEST_PATH" 2>/dev/null
jq -e '.requires.nex != null' "$MANIFEST_PATH"

# 9. No UI section (spec does not define a UI for Spike)
# This check is conditional: skip if UI was intentionally kept
# jq -e '.ui == null' "$MANIFEST_PATH"
```

### Manual Verification

1. Open `app.nexus.json` and read it end to end. Compare each section against the spec's App Manifest section.
2. Verify the operations listed match the Operations Summary table in the spec exactly (all 10 namespace groups).
3. Confirm there are no references to PRLM, oracle, broker, ask, hydrate, sync (PRLM sense), sessions, tree-versions, or guides in the manifest.
4. Verify the manifest does not declare an `events` section.
5. Verify the `requires` section says `"nex": ">=0.10.0"` and nothing else.

### Pass Criteria

- [ ] Manifest is valid JSON (parses without error)
- [ ] `id` is "spike"
- [ ] All 45 spec'd operations are present in the manifest
- [ ] Zero PRLM operations appear in the manifest
- [ ] No `product`, `entitlements`, or `adapters` sections
- [ ] Manifest does not declare an `events` section
- [ ] `requires` section lists nex version only, no adapter requirements
- [ ] Service definition points to `bin/spike-engine` with `serve` command

### Fail Indicators

- JSON parse error: syntax mistake in the manifest edit.
- Missing operations: a method was not added during the rewrite.
- PRLM operation found: an old method was not removed.
- `events` section present: automatic work ownership was attached to the wrong layer.
- Product section present: the cleanup was incomplete.

---

## Rung 9: End-to-End Integration

**Workplan phase:** Phase 9 -- Final Validation
**Prerequisites:** All previous rungs (1-8) pass.

### Automated Checks

```bash
# 1. Full build
cd service/
go build ./...

# 2. Full vet
go vet ./...

# 3. Full test suite
go test ./... 2>&1 | tee /tmp/spike-rung9-tests.txt
RUNG9_FAILURES=$(grep -c '^--- FAIL' /tmp/spike-rung9-tests.txt || echo 0)
# Compare against baseline
echo "Baseline failures: $BASELINE_FAILURES"
echo "Rung 9 failures: $RUNG9_FAILURES"
# Must not have MORE failures than baseline
[ "$RUNG9_FAILURES" -le "$BASELINE_FAILURES" ]

# 4. Grep audit -- zero references to deleted concepts in production code
#    (excluding test files, vendor/, and .git/)
echo "--- Grep audit ---"
AUDIT_FAIL=0

for pattern in \
  'internal/broker' \
  'internal/prlm' \
  'prlmstore\.' \
  'prlmtree\.' \
  'oracle\.Ask' \
  'oracle\.Hydrate' \
  'oracleServer' \
  'newOracleServer' \
  'cmdHydrate' \
  'cmdAsk' \
  'cmdSync' \
  'cmdMCP' \
  'spike\.code-intel\.' \
  'spike\.ask' \
  'spike\.sessions\.' \
  'spike\.tree-versions\.' \
  'spike\.guides\.'; do
  HITS=$(grep -rn --include='*.go' "$pattern" cmd/ internal/ 2>/dev/null | \
         grep -v '_test.go' | grep -v 'vendor/' | wc -l | tr -d ' ')
  if [ "$HITS" -gt 0 ]; then
    echo "AUDIT FAIL: '$pattern' found $HITS times in production code"
    grep -rn --include='*.go' "$pattern" cmd/ internal/ | grep -v '_test.go' | head -5
    AUDIT_FAIL=$((AUDIT_FAIL + 1))
  fi
done
[ "$AUDIT_FAIL" -eq 0 ]

# 5. Dependency audit -- no PRLM deps in go.mod
! grep -q 'go-coding-agent' go.mod
! grep -q 'mcp-go'          go.mod
! grep -q 'pi-mono'         go.mod

# 6. go mod tidy is clean (no changes needed)
cp go.mod go.mod.bak
cp go.sum go.sum.bak
go mod tidy
diff go.mod go.mod.bak
diff go.sum go.sum.bak
rm go.mod.bak go.sum.bak

# 7. End-to-end smoke test: full lifecycle
rm -rf /tmp/spike-e2e-data
NEX_APP_DATA_DIR=/tmp/spike-e2e-data \
  go run ./cmd/spike-engine serve --port 17429 &
SERVER_PID=$!
sleep 3

TEST_REPO="https://github.com/benhoyt/goawk.git"

# 7a. Health check
curl -sf http://localhost:17429/health | jq -e '.status == "ok"'

# 7b. Ensure mirror
ENSURE=$(curl -s -X POST http://localhost:17429/operations/spike.mirrors.ensure \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"remote_url\":\"$TEST_REPO\"}}")
echo "$ENSURE" | jq -e '.ok == true'
MIRROR_PATH=$(echo "$ENSURE" | jq -r '.result.mirror_path')
MIRROR_ID=$(echo "$ENSURE" | jq -r '.result.mirror_id')

# 7c. Create worktree
COMMIT=$(git -C "$MIRROR_PATH" rev-parse HEAD)
WT=$(curl -s -X POST http://localhost:17429/operations/spike.worktrees.create \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"repo_id\":\"goawk\",\"mirror_path\":\"$MIRROR_PATH\",\"commit_sha\":\"$COMMIT\"}}")
echo "$WT" | jq -e '.ok == true'
WT_PATH=$(echo "$WT" | jq -r '.result.worktree_path')
WT_ID=$(echo "$WT" | jq -r '.result.worktree_id')

# 7d. Build code intelligence
BUILD=$(curl -s -X POST http://localhost:17429/operations/spike.code.build \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"root_path\":\"$WT_PATH\"}}")
echo "$BUILD" | jq -e '.ok == true'
echo "$BUILD" | jq -e '.result.snapshot.status == "ready"'
SNAP_ID=$(echo "$BUILD" | jq -r '.result.snapshot.snapshot_id')
FILE_COUNT=$(echo "$BUILD" | jq -r '.result.snapshot.file_count')
SYMBOL_COUNT=$(echo "$BUILD" | jq -r '.result.snapshot.symbol_count')
echo "Files: $FILE_COUNT, Symbols: $SYMBOL_COUNT"
[ "$FILE_COUNT" -gt 0 ]
[ "$SYMBOL_COUNT" -gt 0 ]

# 7e. Search
SEARCH=$(curl -s -X POST http://localhost:17429/operations/spike.code.search \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"snapshot_id\":\"$SNAP_ID\",\"query\":\"func main\",\"limit\":3}}")
echo "$SEARCH" | jq -e '.ok == true'
echo "$SEARCH" | jq -e '.result.hits | length > 0'

# 7f. Symbols
SYMS=$(curl -s -X POST http://localhost:17429/operations/spike.code.symbols \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"snapshot_id\":\"$SNAP_ID\",\"query\":\"main\"}}")
echo "$SYMS" | jq -e '.ok == true'
echo "$SYMS" | jq -e '.result | length > 0'

# 7g. Callers
FIRST_SYM=$(echo "$SYMS" | jq -r '.result[0].name')
CALLERS=$(curl -s -X POST http://localhost:17429/operations/spike.code.callers \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"snapshot_id\":\"$SNAP_ID\",\"callee_name\":\"$FIRST_SYM\"}}")
echo "$CALLERS" | jq -e '.ok == true'

# 7h. Context pack
CTX=$(curl -s -X POST http://localhost:17429/operations/spike.code.context \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"snapshot_id\":\"$SNAP_ID\",\"query\":\"parser\"}}")
echo "$CTX" | jq -e '.ok == true'

# 7i. Config operations
curl -s -X POST http://localhost:17429/operations/spike.config.defaults \
  -H 'Content-Type: application/json' \
  -d '{"params":{}}' | jq -e '.ok == true'

curl -s -X POST http://localhost:17429/operations/spike.config.get \
  -H 'Content-Type: application/json' \
  -d '{"params":{}}' | jq -e '.ok == true'

# 7j. Repository listing
curl -s -X POST http://localhost:17429/operations/spike.repositories.list \
  -H 'Content-Type: application/json' \
  -d '{"params":{}}' | jq -e '.ok == true'

# 7k. Jobs listing
curl -s -X POST http://localhost:17429/operations/spike.jobs.list \
  -H 'Content-Type: application/json' \
  -d '{"params":{}}' | jq -e '.ok == true'

# 7l. Cleanup: destroy worktree
curl -s -X POST http://localhost:17429/operations/spike.worktrees.destroy \
  -H 'Content-Type: application/json' \
  -d "{\"params\":{\"worktree_id\":\"$WT_ID\"}}" | jq -e '.ok == true'
[ ! -d "$WT_PATH" ]

# Done
kill $SERVER_PID 2>/dev/null || true
rm -rf /tmp/spike-e2e-data
echo "=== Rung 9: ALL CHECKS PASSED ==="
```

### Manual Verification

1. **Full lifecycle walkthrough.** Start the server manually. Using curl or a REST client:
   - Ensure a mirror for a real repository you own or have access to.
   - Create a worktree from that mirror at HEAD.
   - Build code intelligence on the worktree.
   - Run `code.search` for a function you know exists in the repo.
   - Run `code.symbols` for that function and verify the result includes file path, line number, and kind.
   - Run `code.callers` and verify it returns call sites (if any exist).
   - Run `code.context` and verify the context pack includes anchor chunks and supporting data.
   - Destroy the worktree and verify it's cleaned up.
   - Verify the server is still healthy after the full cycle.

2. **Database inspection.** Open `spike.db` with sqlite3:
   - `SELECT count(*) FROM code_snapshots;` -- at least 1.
   - `SELECT count(*) FROM code_chunks;` -- many rows.
   - `SELECT count(*) FROM code_symbols;` -- many rows.
   - `SELECT count(*) FROM code_calls;` -- some rows (for Go repos with function calls).
   - `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;` -- no PRLM tables.

3. **Binary size sanity check.** Build the binary:
   - `go build -o spike-engine ./cmd/spike-engine/`
   - `ls -lh spike-engine`
   - The binary should be noticeably smaller than before (PRLM + broker + LLM deps removed). If you recorded the size before, compare.

4. **Process health.** Start the server, let it run for 60 seconds while idle. Check:
   - Memory usage is stable (not growing).
   - No goroutine leaks (check with pprof if available: `curl http://localhost:PORT/debug/pprof/goroutine?debug=1`).
   - No error logs on stderr.

5. **Nex runtime installation (if available).** If a test nex server is available:
   - Install the Spike app using the manifest.
   - Verify the runtime can discover and list Spike's operations.
   - Have an agent call `code.search` and verify it receives results.

### Pass Criteria

- [ ] `go build ./...` exits 0
- [ ] `go vet ./...` exits 0
- [ ] Test failure count is less than or equal to BASELINE_FAILURES
- [ ] Grep audit finds zero PRLM references in production code
- [ ] No PRLM dependencies in `go.mod`
- [ ] `go mod tidy` produces no diff
- [ ] Health check returns OK
- [ ] Full lifecycle (ensure -> worktree -> build -> search -> symbols -> callers -> context -> destroy) completes without errors
- [ ] Database contains code-intel data and no PRLM tables
- [ ] Binary compiles to a single executable
- [ ] Server runs stably for 60 seconds without goroutine leaks or memory growth

### Fail Indicators

- Build or vet failure at this stage: a regression was introduced in a later phase.
- More test failures than baseline: the transformation broke existing functionality.
- Grep audit finds hits: cleanup was incomplete.
- `go mod tidy` changes files: dependencies are out of sync.
- Lifecycle fails at any step: trace to the specific operation that failed and check server logs.
- Memory grows or goroutine count climbs: a cleanup path (likely in the sync/broker removal) left a leaked goroutine.

---

## Summary Matrix

| Rung | Name | Validates | Key Automated Check | Key Manual Check |
|------|------|-----------|-------------------|-----------------|
| 0 | Pre-flight | Build compiles before transformation | `go build ./...` | Record baseline failures |
| 1 | Deletion | PRLM/broker code fully removed | `grep` finds zero PRLM imports | CLI is serve-only |
| 2 | Schema | DB schema matches spec | Fresh DB has no PRLM tables | Schema version bumped |
| 3 | Mirrors | Mirror CRUD works end-to-end | ensure/refresh/list/status via HTTP | Bare git repo on disk |
| 4 | Worktrees | Worktree lifecycle works | create/list/destroy via HTTP + ref_count | Detached HEAD at correct SHA |
| 5 | Code Intel | All 14 code.* operations functional | build+search+symbols return data | FTS search returns real snippets |
| 6 | Nex Protocol | All 45 operations routed, none removed | Iterate all operations via HTTP | Routing table in source matches spec |
| 7 | Durable Work | Spike reconcile job + durable subscription seeded | Manifest has no events section | Hook/job code uses runtime subscription API |
| 8 | Manifest | app.nexus.json matches spec | All 45 ops listed, 0 PRLM ops | Manual read-through |
| 9 | End-to-End | Full system works as integrated unit | Lifecycle smoke test | Agent can use code tools |

---

## Execution Notes

**Run order is strict.** Do not advance to rung N+1 until rung N passes. Earlier rungs validate foundations that later rungs depend on.

**Automated checks are executable.** Each code block can be run as a shell script. Wrap them in `set -euo pipefail` for fail-fast behavior.

**Test repositories.** Two repos are used throughout:
- `kelseyhightower/nocode` -- tiny, clones in under 1 second, good for mirror/worktree mechanics.
- `benhoyt/goawk` -- small Go project with real functions, imports, and call graphs, good for code intelligence validation.

**Port allocation.** Each rung uses a distinct port (17422-17429) to avoid collisions if scripts overlap. Always kill the server PID after each rung.

**Data directories.** Each rung uses a distinct `/tmp/spike-rungN-data` directory, created fresh and deleted after. This ensures no state leaks between rungs.

**If a rung fails.** Read the fail indicators for that rung first. They describe the most common causes. Fix the issue, then re-run the rung from the top. Do not skip ahead.
