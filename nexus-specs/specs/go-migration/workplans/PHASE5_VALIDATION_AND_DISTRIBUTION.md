# Phase 5: Validation + Distribution

**Status:** PENDING (depends on Phase 4)
**Parent:** [GO_MIGRATION_SPEC.md](../GO_MIGRATION_SPEC.md) § Phase 5
**Target project:** `/Users/tyler/nexus/home/projects/nexus/nexgo/`

---

## Scope

Prove the Go binary is a complete, correct replacement for the TS runtime: port the behavioral test suite, run performance benchmarks, set up distribution (Homebrew, binary releases), write migration guide, and optimize binary size. By the end of this phase, existing users can switch from TS to Go transparently.

**Does NOT include:** New features beyond TS parity. Post-V1 improvements (gRPC, SDK generation, TTS port, canvas port) are future work.

---

## Prerequisite

Phase 4 complete: full CLI parity, all operations, media, security, wizard, Control UI.

---

## Task 1: Behavioral Test Suite

**Port from:** nex TS test suite (~4,852 tests across ~265 test files)

### 1.1 Test inventory and prioritization

Catalog all existing TS tests by category and priority:

| Category | Test Files | Tests | Priority |
|----------|-----------|-------|----------|
| Pipeline stages | ~10 | ~60 | P0 — correctness-critical |
| Database access (CRUD, migrations) | ~15 | ~120 | P0 — data integrity |
| IAM (grants, policies, authorize) | ~8 | ~80 | P0 — security-critical |
| Agent execution (broker, session, streaming) | ~12 | ~100 | P0 — core feature |
| Memory (recall, retain, embeddings, consolidation) | ~18 | ~150 | P0 — core feature |
| Operations (server methods) | ~25 | ~200 | P1 — feature coverage |
| Adapter (protocol, manager, supervision) | ~10 | ~80 | P1 — integration |
| CLI commands | ~50 | ~400 | P1 — user-facing |
| Config (loading, validation, reload) | ~5 | ~40 | P1 — correctness |
| Hooks/Automations | ~8 | ~60 | P2 — advanced feature |
| Cron/Clock | ~5 | ~40 | P2 — advanced feature |
| Apps platform | ~5 | ~30 | P2 — advanced feature |
| Identity (entities, tags, merge) | ~10 | ~80 | P1 — data integrity |
| Work system | ~5 | ~40 | P2 — CRM feature |
| Security audit | ~5 | ~30 | P2 — diagnostic |
| Onboarding/Wizard | ~8 | ~50 | P3 — UX |
| Media | ~5 | ~30 | P2 — feature |
| Misc (terminal, pairing, etc.) | ~10 | ~50 | P3 — polish |

### 1.2 Test infrastructure

```go
// internal/testutil/testutil.go
func NewTestLedgers(t *testing.T) *db.Ledgers  // in-memory SQLite databases
func NewTestConfig(t *testing.T) *config.Config  // minimal test config
func NewTestPipeline(t *testing.T) *pipeline.Pipeline  // pipeline with stub handlers
func NewTestBroker(t *testing.T) *broker.Broker  // broker with mock agent
func NewTestServer(t *testing.T) (*httptest.Server, *ws.Client)  // HTTP+WS test server
```

Shared test fixtures, mock providers, test database helpers.

### 1.3 P0 tests — Pipeline and core

Port pipeline stage tests:
- `acceptRequest` — request validation, ID assignment, dedup
- `resolvePrincipals` — entity lookup, auto-create, contact resolution
- `resolveAccess` — grant evaluation, deny paths, audit
- `executeOperation` — handler dispatch, error handling
- `finalizeRequest` — trace persistence, status codes

Port database tests:
- Schema creation, migration
- CRUD for each ledger
- FTS5 search
- Concurrent access

Port IAM tests:
- Grant creation, revocation
- Policy evaluation (allow, deny, conditions)
- Role-based access
- Audit log integrity

Port agent tests:
- Agent run (prompt → response)
- Tool execution (mock tools)
- Streaming events
- Session persistence (agents.db)
- Compaction behavior

Port memory tests:
- Recall (FTS5, embeddings, mixed)
- Retain pipeline (turn extraction, episode extraction)
- Element CRUD
- Entity-element linking
- Consolidation
- Memory file sync

### 1.4 P1 tests — Operations and integration

Port operation handler tests:
- Each server method gets at least smoke tests
- Test through full pipeline (not just handler in isolation)
- Verify WS and HTTP delivery

Port adapter tests:
- Protocol encoding/decoding
- Manager lifecycle (start, stop, restart)
- Supervision (crash → restart)
- Event routing

Port config tests:
- Loading, validation, defaults
- Hot-reload
- Invalid config handling

Port identity tests:
- Entity CRUD
- Contact management
- Tag operations (Phase 0 semantics)
- Entity merge

### 1.5 P2 tests — Features

Port tests for hooks, automations, cron, apps, work, security, media.

### 1.6 P3 tests — Polish

Port CLI tests (command parsing, output formatting), onboarding tests, terminal tests.

### 1.7 Test approach

Not all TS tests need direct porting. The strategy:
- **Behavioral tests:** Port the test's intent, not its implementation. Go tests test the same behaviors but through Go APIs.
- **Integration tests:** Write new integration tests that exercise the full pipeline (HTTP request → pipeline → handler → response).
- **E2E tests:** Write a small e2e suite that starts the full daemon, connects via WS, and exercises key flows.
- **Skip TS-specific tests:** Tests for TypeScript-specific concerns (Zod validation, Commander.js parsing, etc.) are irrelevant.

**Acceptance:** `go test ./...` passes with >90% behavioral coverage of the TS test suite. All P0 tests ported. P1 tests at >80% coverage.

---

## Task 2: Cross-Database Compatibility

### 2.1 Schema compatibility verification

```go
// internal/db/compat_test.go
func TestSchemaCompatibility(t *testing.T) {
    // 1. Create databases using TS schema SQL
    // 2. Open with Go binary
    // 3. Verify all tables, columns, indexes exist
    // 4. Verify read/write round-trip
}
```

Ensure the Go binary can read databases created by the TS runtime and vice versa.

### 2.2 Data round-trip tests

Write data using TS runtime → read using Go binary (and vice versa):
- Events (events.db)
- Sessions/turns/messages (agents.db)
- Entities/contacts/tags (identity.db)
- Memory elements/sets/jobs (memory.db)
- Embeddings (embeddings.db)
- Pipeline requests/grants/audit (runtime.db)
- Work items (work.db)

### 2.3 Migration tests

- Go binary opens a database created by an older TS version
- Schema extensions are applied correctly
- No data loss

**Acceptance:** Go binary reads/writes all 7 databases interchangeably with TS runtime. Zero migration required.

---

## Task 3: Adapter Compatibility

### 3.1 Protocol conformance tests

Test that the Go runtime's adapter protocol implementation is byte-compatible with the TS version:
- Send same JSONL frames, verify same parsing
- Receive same events, verify same handling
- All 7 verbs work identically

### 3.2 Live adapter tests

Test with actual adapter binaries:
- Go adapter (e.g., `device-desktop`) connects and works
- TS adapter (e.g., `telegram`) connects and works
- Multiple adapters simultaneously

### 3.3 Adapter SDK compatibility

Verify the Go Adapter SDK produces adapters that work with both TS and Go runtimes.

**Acceptance:** All existing adapter binaries work with the Go runtime without modification.

---

## Task 4: Performance Benchmarks

### 4.1 Startup performance

```go
func BenchmarkStartup(b *testing.B) {
    // Measure time from binary start to "nexus ready" log
}
```

Target: <500ms cold start (TS version is ~2-3s).

### 4.2 Memory usage

Measure RSS after:
- Idle daemon (no active sessions)
- Single agent session active
- 10 concurrent sessions
- 100 concurrent WS connections

Target: <50MB idle (TS version is ~150-200MB).

### 4.3 Pipeline throughput

```go
func BenchmarkPipelineThroughput(b *testing.B) {
    // Measure operations/second through the pipeline
}
```

Target: >10,000 ops/sec for simple operations (health, config.get).

### 4.4 WebSocket throughput

Measure messages/second for WS operations under load.

### 4.5 Database performance

Benchmark key database operations:
- Event insert throughput
- Entity lookup latency
- Memory recall latency (FTS5 + embeddings)
- Session write throughput

### 4.6 Agent execution overhead

Measure the overhead Nexus adds on top of raw go-coding-agent execution:
- Tool registry setup time
- System prompt construction time
- Session persistence overhead
- Streaming event translation overhead

Target: <50ms overhead per agent turn.

**Acceptance:** Benchmark results documented. Startup <500ms. Idle memory <50MB. Pipeline >10K ops/sec.

---

## Task 5: Binary Optimization

### 5.1 Binary size

```bash
# Baseline
go build -o nexus ./cmd/nexus
ls -lh nexus

# Optimized
go build -ldflags="-s -w" -o nexus ./cmd/nexus
ls -lh nexus

# With UPX (optional)
upx --best nexus
```

Target: <30MB uncompressed, <15MB with UPX (if used).

### 5.2 Build tags

Use build tags to optionally exclude components:
- `//go:build !nosqlitevec` — exclude sqlite-vec if not needed
- `//go:build !noui` — exclude embedded Control UI assets

### 5.3 CGo optimization

If using `mattn/go-sqlite3`, optimize the CGo build:
- Static linking with musl for truly portable binaries
- Minimal SQLite compile flags

### 5.4 Embed optimization

If Control UI assets are large, consider:
- gzip compression before embedding
- Lazy decompression at serve time

**Acceptance:** Binary size documented and optimized. Build produces single static binary.

---

## Task 6: Cross-Platform Builds

### 6.1 Target platforms

| OS | Arch | Priority |
|----|------|----------|
| macOS | arm64 (Apple Silicon) | P0 |
| macOS | amd64 (Intel) | P0 |
| Linux | amd64 | P0 |
| Linux | arm64 | P1 |

### 6.2 Build matrix

```makefile
# Makefile
build-all:
    GOOS=darwin GOARCH=arm64 CGO_ENABLED=1 go build -o dist/nexus-darwin-arm64 ./cmd/nexus
    GOOS=darwin GOARCH=amd64 CGO_ENABLED=1 go build -o dist/nexus-darwin-amd64 ./cmd/nexus
    GOOS=linux GOARCH=amd64 CGO_ENABLED=1 go build -o dist/nexus-linux-amd64 ./cmd/nexus
    GOOS=linux GOARCH=arm64 CGO_ENABLED=1 CC=aarch64-linux-musl-gcc go build -o dist/nexus-linux-arm64 ./cmd/nexus
```

### 6.3 CGo cross-compilation

For `mattn/go-sqlite3` (CGo), set up cross-compilation toolchains:
- macOS: Xcode command line tools (native arm64, cross amd64)
- Linux: musl-cross for static linking

### 6.4 CI pipeline

GitHub Actions workflow:
1. Build for all platforms
2. Run tests on macOS and Linux
3. Create release artifacts
4. Upload to GitHub Releases

**Acceptance:** Binaries build for all target platforms. CI pipeline produces release artifacts.

---

## Task 7: Distribution

### 7.1 Homebrew formula

```ruby
class Nexus < Formula
  desc "Personal AI workspace runtime"
  homepage "https://github.com/Napageneral/nexus"
  version "1.0.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/Napageneral/nexus/releases/download/v1.0.0/nexus-darwin-arm64.tar.gz"
      sha256 "..."
    else
      url "https://github.com/Napageneral/nexus/releases/download/v1.0.0/nexus-darwin-amd64.tar.gz"
      sha256 "..."
    end
  end

  on_linux do
    url "https://github.com/Napageneral/nexus/releases/download/v1.0.0/nexus-linux-amd64.tar.gz"
    sha256 "..."
  end

  def install
    bin.install "nexus"
  end

  test do
    system "#{bin}/nexus", "--version"
  end
end
```

### 7.2 GitHub Releases

Automated release workflow:
1. Tag triggers build
2. Build all platforms
3. Create GitHub Release with changelog
4. Upload binary artifacts
5. Update Homebrew formula

### 7.3 Install script

One-liner installer for quick setup:
```bash
curl -sSL https://install.nexus.dev | sh
```

Downloads correct binary for platform, places in PATH.

**Acceptance:** `brew install nexus` works on macOS. GitHub Releases contain all platform binaries. Install script works.

---

## Task 8: Migration Guide

### 8.1 Switching from TS to Go

Document the migration path for existing TS users:
1. Stop the TS daemon (`nexus daemon stop`)
2. Install the Go binary (`brew install nexus` or download)
3. Start the Go daemon (`nexus daemon start`)
4. Verify: existing databases, config, adapters work unchanged

### 8.2 Known differences

Document any behavioral differences between TS and Go:
- Startup time improvements
- Memory usage improvements
- Any changed defaults or behaviors
- Deprecated features not ported

### 8.3 Rollback

Document how to roll back to TS if issues arise:
1. Stop Go daemon
2. Restore TS binary
3. Start TS daemon
4. Databases are compatible in both directions

### 8.4 FAQ

Common migration questions:
- Do I need to re-run setup? (No)
- Do my adapters still work? (Yes, unchanged)
- Do my databases need migration? (No)
- Will my native apps still connect? (Yes)

**Acceptance:** Migration guide is clear, tested, and covers edge cases.

---

## Task 9: Final Validation

### 9.1 Full system test

End-to-end test of the complete Go binary:
1. `nexus init` — create fresh state
2. `nexus setup` — configure auth + model
3. `nexus daemon start` — start daemon
4. `nexus status` — verify running
5. `nexus chat` — interactive agent session
6. Start adapter → send event → get response
7. `nexus memory recall` — verify memory
8. `nexus security audit` — verify security
9. `nexus daemon stop` — clean shutdown
10. Restart with existing state — verify persistence

### 9.2 Soak test

Run the Go daemon under sustained load for 24 hours:
- Continuous adapter events
- Multiple concurrent agent sessions
- Memory growth monitoring
- No goroutine leaks
- No database locks

### 9.3 Compatibility matrix

Test against:
- macOS arm64 (Apple Silicon) ✓
- macOS amd64 (Intel) ✓
- Ubuntu 22.04 amd64 ✓
- Ubuntu 22.04 arm64 ✓
- Existing Go adapter binaries ✓
- Existing TS adapter binaries ✓
- iOS native app ✓
- macOS native app ✓
- Control UI in Chrome/Safari/Firefox ✓

### 9.4 Regression check

Compare Go behavior against TS for a set of reference scenarios:
- Same prompt → same tool calls → same response pattern
- Same adapter event → same pipeline trace → same delivery
- Same cron schedule → same firing behavior
- Same memory query → same recall results (or better)

**Acceptance:** Full system test passes. 24-hour soak test clean. All compatibility matrix items verified.

---

## Done Criteria

Phase 5 is complete when:

1. `go test ./...` passes with comprehensive behavioral coverage
2. Cross-database compatibility verified (Go reads TS databases and vice versa)
3. All existing adapter binaries work unchanged
4. Performance benchmarks documented and meeting targets
5. Binary optimized for size and builds for all target platforms
6. `brew install nexus` works on macOS
7. GitHub Releases contain all platform binaries
8. Migration guide written and tested
9. Full system test passes
10. 24-hour soak test clean
11. Compatibility matrix verified

**V1 is shipped.**
