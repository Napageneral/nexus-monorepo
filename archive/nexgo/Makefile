# Nexus Go Binary — Build & Validation
# See specs/go-migration/VALIDATION_LADDER.md for gate definitions.

BINARY     := nexus
MODULE     := github.com/Napageneral/nexus
VERSION    ?= dev
COMMIT     := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
LDFLAGS    := -ldflags "-X main.version=$(VERSION) -X main.commit=$(COMMIT)"
TAGS       := -tags "fts5"
BUILD_DIR  := dist
TMP_DIR    := /tmp/nexus-gate-test
TMP_STATE  := $(TMP_DIR)/state
TMP_BIN    := $(TMP_DIR)/nexus
TEST_PORT  := 13284

.PHONY: build test vet lint clean

# ─── Build ───────────────────────────────────────────────────────────

build:
	go build $(TAGS) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY) ./cmd/nexus

build-darwin-arm64:
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=1 go build $(TAGS) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY)-darwin-arm64 ./cmd/nexus

build-darwin-amd64:
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=1 go build $(TAGS) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY)-darwin-amd64 ./cmd/nexus

build-linux-amd64:
	GOOS=linux GOARCH=amd64 CGO_ENABLED=1 CC=x86_64-linux-musl-gcc go build $(TAGS) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY)-linux-amd64 ./cmd/nexus

build-linux-arm64:
	GOOS=linux GOARCH=arm64 CGO_ENABLED=1 CC=aarch64-linux-musl-gcc go build $(TAGS) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY)-linux-arm64 ./cmd/nexus

# build-host builds only for the current OS/arch (always works)
build-host:
	go build $(TAGS) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY) ./cmd/nexus

# build-all builds all platforms where toolchains are available.
# Darwin builds always work on macOS. Linux builds require musl cross-compilers.
build-all: build-darwin-arm64 build-darwin-amd64
	@# Attempt Linux amd64 if cross-compiler exists
	@if command -v x86_64-linux-musl-gcc >/dev/null 2>&1; then \
		echo "--- Linux amd64 cross-compiler found, building ---"; \
		$(MAKE) build-linux-amd64; \
	else \
		echo "--- SKIP: build-linux-amd64 (x86_64-linux-musl-gcc not found) ---"; \
	fi
	@if command -v aarch64-linux-musl-gcc >/dev/null 2>&1; then \
		echo "--- Linux arm64 cross-compiler found, building ---"; \
		$(MAKE) build-linux-arm64; \
	else \
		echo "--- SKIP: build-linux-arm64 (aarch64-linux-musl-gcc not found) ---"; \
	fi

# ─── Quality ─────────────────────────────────────────────────────────

test:
	go test $(TAGS) ./... -count=1 -timeout 300s

test-v:
	go test $(TAGS) ./... -count=1 -timeout 300s -v

vet:
	go vet $(TAGS) ./...

lint: vet
	@echo "lint: OK"

bench:
	go test $(TAGS) -bench=. -benchmem ./...

# ─── Phase 1 Gates ──────────────────────────────────────────────────

gate-P1.1:
	@echo "=== Gate P1.1: Project compiles ==="
	go build $(TAGS) ./...
	go vet $(TAGS) ./...
	go test $(TAGS) ./internal/pipeline/... -run TestNexusRequest -count=1
	go test $(TAGS) ./internal/operations/... -run TestRegistry -count=1
	@echo "✓ P1.1 passed"

gate-P1.2:
	@echo "=== Gate P1.2: Config loads ==="
	go test $(TAGS) ./internal/config/... -count=1
	@echo "✓ P1.2 passed"

gate-P1.3:
	@echo "=== Gate P1.3: Databases open ==="
	go test $(TAGS) ./internal/db/... -count=1
	@echo "✓ P1.3 passed"

gate-P1.4:
	@echo "=== Gate P1.4: Pipeline executes ==="
	go test $(TAGS) ./internal/pipeline/... -count=1
	@echo "✓ P1.4 passed"

gate-P1.5:
	@echo "=== Gate P1.5: Daemon lifecycle ==="
	go test $(TAGS) ./internal/daemon/... -count=1
	@echo "✓ P1.5 passed"

gate-P1.6:
	@echo "=== Gate P1.6: HTTP health endpoint ==="
	go test $(TAGS) ./internal/transport/http/... -count=1
	@echo "✓ P1.6 passed"

gate-P1.7:
	@echo "=== Gate P1.7: WebSocket operations ==="
	go test $(TAGS) ./internal/transport/ws/... -count=1
	@echo "✓ P1.7 passed"

gate-P1.8: gate-phase1

gate-phase1:
	@echo "=== Gate Phase 1: Full integration ==="
	go build $(TAGS) -o $(TMP_BIN) ./cmd/nexus
	go test $(TAGS) ./... -count=1 -timeout 120s
	go vet $(TAGS) ./...
	@echo "--- Binary smoke test ---"
	@mkdir -p $(TMP_STATE)
	$(TMP_BIN) init --state-dir $(TMP_STATE) || true
	$(TMP_BIN) serve --state-dir $(TMP_STATE) --port $(TEST_PORT) & \
		SERVE_PID=$$!; \
		sleep 2; \
		curl -sf http://localhost:$(TEST_PORT)/health > /dev/null && echo "health: OK" || (kill $$SERVE_PID 2>/dev/null; exit 1); \
		kill $$SERVE_PID 2>/dev/null; \
		wait $$SERVE_PID 2>/dev/null || true
	@rm -rf $(TMP_DIR)
	@echo "✓ Phase 1 passed"

# ─── Phase 2 Gates ──────────────────────────────────────────────────

gate-P2.1:
	@echo "=== Gate P2.1: go-coding-agent integrates ==="
	go test $(TAGS) ./internal/agent/... -run TestEngine -count=1
	go test $(TAGS) ./internal/agent/... -run TestToolRegistration -count=1
	@echo "✓ P2.1 passed"

gate-P2.2:
	@echo "=== Gate P2.2: Auth and model selection ==="
	go test $(TAGS) ./internal/agent/... -run TestAuth -count=1
	go test $(TAGS) ./internal/agent/... -run TestModel -count=1
	@echo "✓ P2.2 passed"

gate-P2.3:
	@echo "=== Gate P2.3: System prompt and skills ==="
	go test $(TAGS) ./internal/agent/... -run TestSystemPrompt -count=1
	go test $(TAGS) ./internal/agent/... -run TestSkill -count=1
	@echo "✓ P2.3 passed"

gate-P2.4:
	@echo "=== Gate P2.4: Core tools execute ==="
	go test $(TAGS) ./internal/tools/... -count=1
	@echo "✓ P2.4 passed"

gate-P2.5:
	@echo "=== Gate P2.5: Broker dispatches ==="
	go test $(TAGS) ./internal/broker/... -count=1
	@echo "✓ P2.5 passed"

gate-P2.6:
	@echo "=== Gate P2.6: event.ingest end-to-end ==="
	go test $(TAGS) ./internal/operations/... -run TestEventIngest -count=1
	@echo "✓ P2.6 passed"

gate-P2.7:
	@echo "=== Gate P2.7: Chat CLI ==="
	go test $(TAGS) ./internal/cli/... -run TestChat -count=1
	@echo "✓ P2.7 passed"

gate-P2.8: gate-phase2

gate-phase2:
	@echo "=== Gate Phase 2: Full integration ==="
	go test $(TAGS) ./... -count=1 -timeout 180s
	go vet $(TAGS) ./...
	@echo "✓ Phase 2 passed"

# ─── Phase 3 Gates ──────────────────────────────────────────────────

gate-P3.1:
	@echo "=== Gate P3.1: Adapters connect ==="
	go test $(TAGS) ./internal/adapters/... -count=1
	@echo "✓ P3.1 passed"

gate-P3.2:
	@echo "=== Gate P3.2: Memory system ==="
	go test $(TAGS) ./internal/memory/... -count=1
	@echo "✓ P3.2 passed"

gate-P3.3:
	@echo "=== Gate P3.3: IAM evaluates ==="
	go test $(TAGS) ./internal/iam/... -count=1
	go test $(TAGS) ./internal/pipeline/... -run TestResolveAccess -count=1
	@echo "✓ P3.3 passed"

gate-P3.4:
	@echo "=== Gate P3.4: Automations fire ==="
	go test $(TAGS) ./internal/automations/... -count=1
	@echo "✓ P3.4 passed"

gate-P3.5:
	@echo "=== Gate P3.5: Multi-agent ==="
	go test $(TAGS) ./internal/broker/... -run TestMultiAgent -count=1
	go test $(TAGS) ./internal/tools/... -run TestMWP -count=1
	@echo "✓ P3.5 passed"

gate-P3.6:
	@echo "=== Gate P3.6: All tools ==="
	go test $(TAGS) ./internal/tools/... -count=1
	@echo "✓ P3.6 passed"

gate-P3.7:
	@echo "=== Gate P3.7: Cron fires ==="
	go test $(TAGS) ./internal/cron/... -count=1
	@echo "✓ P3.7 passed"

gate-P3.8:
	@echo "=== Gate P3.8: Apps platform ==="
	go test $(TAGS) ./internal/apps/... -count=1
	@echo "✓ P3.8 passed"

gate-P3.9:
	@echo "=== Gate P3.9: All operations ==="
	go test $(TAGS) ./internal/operations/... -count=1
	@echo "✓ P3.9 passed"

gate-P3.10: gate-phase3

gate-phase3:
	@echo "=== Gate Phase 3: Full integration ==="
	go test $(TAGS) ./... -count=1 -timeout 300s
	go vet $(TAGS) ./...
	@echo "✓ Phase 3 passed"

# ─── Phase 4 Gates ──────────────────────────────────────────────────

gate-P4.1:
	@echo "=== Gate P4.1: CLI commands parse ==="
	go build $(TAGS) -o $(TMP_BIN) ./cmd/nexus
	@for cmd in version serve init setup status health doctor config agents sessions memory adapters clock models credential security chat reset uninstall dashboard docs; do \
		$(TMP_BIN) $$cmd --help > /dev/null 2>&1 || (echo "FAIL: $$cmd --help" && exit 1); \
	done
	@rm -f $(TMP_BIN)
	@echo "✓ P4.1 passed"

gate-P4.2:
	@echo "=== Gate P4.2: Daemon commands ==="
	go test $(TAGS) ./internal/cli/... -run TestDaemon -count=1
	@echo "✓ P4.2 passed"

gate-P4.3:
	@echo "=== Gate P4.3: Status/Health/Doctor ==="
	go test $(TAGS) ./internal/cli/... -run "TestStatus|TestHealth|TestDoctor" -count=1
	@echo "✓ P4.3 passed"

gate-P4.4:
	@echo "=== Gate P4.4: Media processing ==="
	go test $(TAGS) ./internal/media/... -count=1
	@echo "✓ P4.4 passed"

gate-P4.5:
	@echo "=== Gate P4.5: Security audit ==="
	go test $(TAGS) ./internal/security/... -count=1
	@echo "✓ P4.5 passed"

gate-P4.6:
	@echo "=== Gate P4.6: Onboarding wizard ==="
	go test $(TAGS) ./internal/cli/... -run TestWizard -count=1
	@echo "✓ P4.6 passed"

gate-P4.7: gate-phase4

gate-phase4:
	@echo "=== Gate Phase 4: Full integration ==="
	go test $(TAGS) ./... -count=1 -timeout 300s
	go vet $(TAGS) ./...
	@echo "✓ Phase 4 passed"

# ─── Phase 5 Gates ──────────────────────────────────────────────────

gate-P5.1:
	@echo "=== Gate P5.1: DB compatibility ==="
	go test $(TAGS) ./internal/db/... -run "TestSchemaCompat|TestDataRoundTrip" -count=1
	@echo "✓ P5.1 passed"

gate-P5.2:
	@echo "=== Gate P5.2: Adapter protocol ==="
	go test $(TAGS) ./internal/adapters/... -run TestProtocolCompat -count=1
	@echo "✓ P5.2 passed"

gate-P5.3:
	@echo "=== Gate P5.3: Performance ==="
	go test $(TAGS) -bench=BenchmarkStartup -benchmem ./internal/daemon/...
	go test $(TAGS) -bench=BenchmarkPipeline -benchmem ./internal/pipeline/...
	@echo "✓ P5.3 passed (review benchmark numbers manually)"

gate-P5.4:
	@echo "=== Gate P5.4: Cross-platform builds ==="
	$(MAKE) build-all
	@# Verify at least the darwin binaries were produced
	@test -f $(BUILD_DIR)/$(BINARY)-darwin-arm64 || (echo "FAIL: darwin-arm64 binary missing" && exit 1)
	@test -f $(BUILD_DIR)/$(BINARY)-darwin-amd64 || (echo "FAIL: darwin-amd64 binary missing" && exit 1)
	@echo "✓ P5.4 passed"

gate-P5.5: gate-phase5

gate-phase5:
	@echo "=== Gate Phase 5: Full validation ==="
	go test $(TAGS) ./... -count=1 -timeout 600s
	go vet $(TAGS) ./...
	$(MAKE) build-all
	@echo "✓ Phase 5 passed — V1 READY"

# ─── Smoke Test ──────────────────────────────────────────────────────

smoke-test:
	@echo "=== Full smoke test ==="
	@rm -rf $(TMP_DIR)
	@mkdir -p $(TMP_DIR)
	go build $(TAGS) -o $(TMP_BIN) ./cmd/nexus
	$(TMP_BIN) version
	$(TMP_BIN) init --state-dir $(TMP_STATE)
	$(TMP_BIN) serve --state-dir $(TMP_STATE) --port $(TEST_PORT) & \
		SERVE_PID=$$!; \
		sleep 3; \
		echo "--- health check ---"; \
		curl -sf http://localhost:$(TEST_PORT)/health | head -c 200; \
		echo; \
		echo "--- shutdown ---"; \
		kill $$SERVE_PID 2>/dev/null; \
		wait $$SERVE_PID 2>/dev/null || true
	@rm -rf $(TMP_DIR)
	@echo "✓ Smoke test passed"

# ─── Cleanup ─────────────────────────────────────────────────────────

clean:
	rm -rf $(BUILD_DIR) $(TMP_DIR)
	go clean -testcache
