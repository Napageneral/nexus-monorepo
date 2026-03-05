# Phase 4: CLI + Polish

**Status:** PENDING (depends on Phase 3)
**Parent:** [GO_MIGRATION_SPEC.md](../GO_MIGRATION_SPEC.md) § Phase 4
**Target project:** `/Users/tyler/nexus/home/projects/nexus/nexgo/`

---

## Scope

Complete the user-facing interface: all cobra CLI commands, media handling (store/serve/understanding), security audit, device pairing, onboarding wizard, terminal formatting, Control UI static serving via `go:embed`, and SSE endpoint for browser streaming. By the end of this phase, the Go binary has full CLI parity with the TS version.

**Does NOT include:** Behavioral test suite porting, performance benchmarks, distribution packaging. Those are Phase 5.

---

## Prerequisite

Phase 3 complete: all operations, adapters, memory, IAM, automations, apps, cron, multi-agent, all tools, full control plane.

---

## Task 1: CLI Framework (cobra)

**Port from:** `nex/src/commands/commands-registry.ts` (512 lines), `commands-registry.data.ts` (614), `commands-registry.types.ts` (86), `commands-args.ts` (100)
**Existing:** `nexgo/cmd/nexus/main.go` (185 lines, stub cobra skeleton)

### 1.1 Command registry

Restructure the existing cobra skeleton to support all commands. The nexgo `main.go` already has stub subcommands. Replace stubs with real implementations that connect to the daemon via WS and dispatch operations.

```go
// cmd/nexus/main.go — restructure
rootCmd
├── daemon
│   ├── start      (nexus daemon start)
│   ├── stop       (nexus daemon stop)
│   ├── restart    (nexus daemon restart)
│   └── install    (nexus daemon install — launchd/systemd)
├── serve          (nexus serve — foreground mode)
├── init           (nexus init — create state directory)
├── setup          (nexus setup — onboarding wizard)
├── status         (nexus status — runtime status)
├── health         (nexus health — health check)
├── doctor         (nexus doctor — diagnose issues)
├── config
│   ├── get        (nexus config get)
│   ├── set        (nexus config set)
│   └── edit       (nexus config edit)
├── agents
│   ├── list       (nexus agents list)
│   ├── add        (nexus agents add)
│   ├── delete     (nexus agents delete)
│   └── identity   (nexus agents identity)
├── sessions
│   ├── list       (nexus sessions list)
│   └── inspect    (nexus sessions inspect)
├── memory
│   ├── recall     (nexus memory recall)
│   ├── search     (nexus memory search)
│   ├── status     (nexus memory status)
│   └── sync       (nexus memory sync)
├── adapters
│   ├── list       (nexus adapters list)
│   ├── add        (nexus adapters add)
│   ├── remove     (nexus adapters remove)
│   ├── status     (nexus adapters status)
│   └── logs       (nexus adapters logs)
├── clock
│   ├── list       (nexus clock list)
│   ├── schedule   (nexus clock schedule)
│   └── run        (nexus clock run)
├── models
│   ├── list       (nexus models list)
│   ├── set        (nexus models set)
│   ├── status     (nexus models status)
│   └── scan       (nexus models scan)
├── credential     (nexus credential — manage auth profiles)
├── security
│   ├── audit      (nexus security audit)
│   └── fix        (nexus security fix)
├── chat           (nexus chat — interactive)
├── reset          (nexus reset)
├── uninstall      (nexus uninstall)
├── dashboard      (nexus dashboard — open Control UI)
└── docs           (nexus docs — open docs)
```

### 1.2 Daemon connection helper

Already scaffolded in Phase 1 (`internal/cli/connect.go`). Ensure all CLI commands use it to connect to the running daemon.

**Acceptance:** `nexus --help` shows all commands. Each command parses flags correctly.

---

## Task 2: Daemon Commands

**Port from:** `nex/src/commands/daemon-install-helpers.ts` (83), `daemon-runtime.ts` (19), `node-daemon-runtime.ts` (16), `node-daemon-install-helpers.ts` (67), `signal-install.ts` (182), `systemd-linger.ts` (121)
**Total:** ~488 TS lines → ~350 Go lines

### 2.1 `nexus daemon start`

Start the daemon in the background (fork + setsid). Equivalent to `nexus serve` but detached.

### 2.2 `nexus daemon stop`

Find running daemon via PID file, send SIGTERM, wait for clean exit.

### 2.3 `nexus daemon restart`

Stop then start. Handle the case where daemon isn't running.

### 2.4 `nexus daemon install`

Platform-specific service installation:
- **macOS:** Write launchd plist, load with `launchctl`
- **Linux:** Write systemd unit file, enable with `systemctl`

### 2.5 `nexus daemon uninstall`

Remove the service registration.

**Acceptance:** `nexus daemon start` starts background daemon. `nexus daemon stop` stops it. `nexus daemon install` creates launchd/systemd service.

---

## Task 3: Status + Health + Doctor Commands

**Port from:** `nex/src/commands/status.command.ts` (603), `status-message.ts` (683), `status-all.ts` (499), `status-all/` (~1,239 total), `status.*.ts` (~540 total), `health.ts` (664), `doctor*.ts` (~2,186 total), `runtime-status.ts` (408), `runtime-status/helpers.ts` (306)
**Total:** ~7,128 TS lines → ~4,000 Go lines

### 3.1 `nexus status`

Connect to daemon, fetch runtime state, display:
- Daemon status (PID, uptime, port)
- Database status (all 7 ledgers)
- Adapter status (connected adapters, health)
- Agent status (configured agents, active sessions)
- Memory status (elements, embeddings, pending jobs)

### 3.2 `nexus health`

Connect to daemon or probe HTTP `/health`. Display structured health output with pass/fail for each subsystem.

### 3.3 `nexus doctor`

Comprehensive diagnostic tool:
- Config validation
- Auth profile health (credential rotation, cooldowns)
- State directory integrity
- Database schema validation
- Daemon service registration
- Adapter connectivity
- Model availability
- Security audit
- Platform-specific notes (launchd env overrides, systemd lingering)

### 3.4 Terminal formatting

**Port from:** `nex/src/terminal/` (~744 lines)

Table rendering, ANSI colors, progress indicators, themed output for CLI display.

```go
// internal/cli/terminal.go
func RenderTable(headers []string, rows [][]string) string
func FormatHealth(health HealthResult) string
func FormatStatus(status StatusResult) string
```

**Acceptance:** `nexus status` shows comprehensive runtime status. `nexus health` shows subsystem health. `nexus doctor` runs diagnostics and reports issues.

---

## Task 4: Config Commands

**Port from:** `nex/src/commands/configure.*.ts` (~1,130 lines), `config-reload.ts` (371)
**Total:** ~1,500 TS lines → ~900 Go lines

### 4.1 `nexus config get`

Print current config (full or specific key path).

### 4.2 `nexus config set`

Set a config value. Dispatches `config.set` operation to daemon.

### 4.3 `nexus config edit`

Open config file in `$EDITOR`. Watch for changes and trigger reload.

**Acceptance:** Config CRUD works from CLI. Changes are hot-reloaded by daemon.

---

## Task 5: Agent + Session Commands

**Port from:** `nex/src/commands/agents.*.ts` (~958 lines), `agent.ts` (749), `agent/` (~441 lines), `sessions.ts` (220)
**Total:** ~2,368 TS lines → ~1,400 Go lines

### 5.1 `nexus agents list`

List configured agents with their models, tools, and status.

### 5.2 `nexus agents add`

Interactive or flag-based agent creation. Set name, model, skills, tools.

### 5.3 `nexus agents delete`

Remove an agent configuration.

### 5.4 `nexus agents identity`

Manage agent identity (persona, name, system prompt overrides).

### 5.5 `nexus sessions list`

List sessions with filters (agent, time range, status).

### 5.6 `nexus sessions inspect`

Show session detail: turns, messages, tool calls, token usage.

**Acceptance:** Agent and session management works from CLI.

---

## Task 6: Memory Commands

**Port from:** commands that dispatch memory operations to the daemon
**Total:** ~400 Go lines

### 6.1 `nexus memory recall`

Recall facts about a topic. Uses `cortex_recall` internally.

### 6.2 `nexus memory search`

Search memory files by query. Uses memory manager search.

### 6.3 `nexus memory status`

Show memory system status: element count, embedding count, pending jobs, providers.

### 6.4 `nexus memory sync`

Trigger manual memory file sync.

**Acceptance:** Memory commands work from CLI.

---

## Task 7: Adapter Commands

**Port from:** `nex/src/commands/channels/` (~1,453 lines), `channels.ts` (14)
**Total:** ~1,467 TS lines → ~900 Go lines

### 7.1 `nexus adapters list`

List configured adapters with connection status, health, capabilities.

### 7.2 `nexus adapters add`

Interactive adapter configuration. Set adapter binary path, credentials, config.

### 7.3 `nexus adapters remove`

Remove an adapter configuration.

### 7.4 `nexus adapters status`

Show detailed adapter status: connected accounts, message counts, errors.

### 7.5 `nexus adapters logs`

Tail adapter stdout/stderr logs.

**Acceptance:** Adapter management works from CLI.

---

## Task 8: Models + Credentials Commands

**Port from:** `nex/src/commands/models/` (~2,958 lines), `credential.ts` (596), `auth-choice*.ts` (~2,190 lines)
**Total:** ~5,744 TS lines → ~3,000 Go lines

### 8.1 `nexus models list`

List available models across all providers. Show availability, auth status.

### 8.2 `nexus models set`

Set the default model for an agent or globally.

### 8.3 `nexus models status`

Probe model availability: check API keys, test connections, report latency.

### 8.4 `nexus models scan`

Scan for available models across all configured providers.

### 8.5 `nexus credential`

Manage auth profiles:
- List credentials
- Add API key / OAuth token
- Rotate / refresh credentials
- Test credential validity
- Import from external CLIs (Claude Code, Codex, etc.)

### 8.6 Auth choice flow

Interactive auth setup: select provider, enter credentials, verify, set default model.

**Acceptance:** Model listing, setting, and scanning work. Credential management works. Auth setup flow completes successfully.

---

## Task 9: Clock Commands

**Port from:** `nex/src/commands/` clock-related (dispatches to `clock.schedule.*` operations)
**Total:** ~200 Go lines

### 9.1 `nexus clock list`

List all schedules with next fire time, last execution.

### 9.2 `nexus clock schedule`

Create a new schedule (interactive or flag-based).

### 9.3 `nexus clock run`

Manually trigger a scheduled job.

**Acceptance:** Clock management works from CLI.

---

## Task 10: Interactive Chat

Already scaffolded in Phase 2 (`nexus chat`). Polish for Phase 4:

**Port from:** `nex/src/commands/agent.ts` (749 lines), `chat.ts` (764 lines)
**Total:** ~1,500 TS lines → ~800 Go lines

### 10.1 Rich interactive mode

- Readline with history
- Streaming token display
- Tool call visualization
- Multi-line input support
- `/commands` within chat (e.g., `/abort`, `/new`, `/model`, `/exit`)
- File attachment support

### 10.2 Non-interactive mode

Accept prompt from stdin or `--prompt` flag. Output response to stdout. Useful for scripting.

**Acceptance:** `nexus chat` provides a polished interactive experience with streaming, tool visualization, and slash commands.

---

## Task 11: Onboarding Wizard

**Port from:** `nex/src/wizard/` (~1,668 lines), `nex/src/commands/onboard*.ts` (~4,168 lines), `setup.ts` (11)
**Total:** ~5,847 TS lines → ~3,000 Go lines

### 11.1 `nexus setup`

Interactive onboarding flow:
1. Create state directory
2. Configure auth (select provider, enter credentials)
3. Set default model
4. Configure daemon (port, log level)
5. Optional: configure adapters (Discord, Telegram, etc.)
6. Optional: configure skills
7. Start daemon

### 11.2 Non-interactive setup

`nexus setup --non-interactive --provider anthropic --api-key sk-...`

Support fully automated setup for CI/scripting.

### 11.3 Plugin/app installation during onboarding

Offer to install recommended apps during setup.

**Acceptance:** `nexus setup` guides a new user from zero to working daemon with agent capability.

---

## Task 12: Media System

**Port from:** `nex/src/media/` (~2,048 lines), `nex/src/media-understanding/` (~3,436 lines)
**Total:** ~5,484 TS lines → ~3,500 Go lines

### 12.1 Media store

**Port from:** `media/store.ts` (242), `media/fetch.ts` (219), `media/server.ts` (106), `media/host.ts` (68)

```go
// internal/media/store.go
type Store struct {
    baseDir string
    config  *config.Config
}

func (s *Store) Download(ctx context.Context, url string) (string, error)
func (s *Store) Save(ctx context.Context, data []byte, mimeType string) (string, error)
func (s *Store) Serve(w http.ResponseWriter, r *http.Request, mediaID string) error
func (s *Store) Cleanup(ctx context.Context, olderThan time.Duration) error
```

Download media from URLs, save to disk, serve via HTTP, periodic cleanup.

### 12.2 Media processing

**Port from:** `media/image-ops.ts` (473), `media/input-files.ts` (356), `media/parse.ts` (220), `media/mime.ts` (190), `media/png-encode.ts` (90), `media/audio.ts` (22), `media/audio-tags.ts` (19)

Image resizing/conversion (via Go image libraries), MIME detection, audio metadata parsing, input file handling.

### 12.3 Media understanding

**Port from:** `media-understanding/runner.ts` (1,304), `apply.ts` (556), `attachments.ts` (430), `resolve.ts` (187), `format.ts` (98), `types.ts` (114), `scope.ts` (64)

```go
// internal/media/understanding.go
type UnderstandingService struct {
    providers map[string]UnderstandingProvider
    config    *config.Config
}

func (s *UnderstandingService) Process(ctx context.Context, attachments []Attachment) ([]Interpretation, error)
```

Multi-provider AI media analysis:
- Images: describe, OCR, object detection via LLM vision
- Audio: transcription via Deepgram, Google, OpenAI, Groq
- Video: frame extraction + vision analysis

### 12.4 Understanding providers

**Port from:** `providers/` (~470 lines across anthropic, deepgram, google, groq, minimax, openai)

Provider implementations for media understanding. Each implements a common interface.

**Acceptance:** Media download, storage, and serving work. Media understanding processes images and audio through configured providers. Interpretations are stored in events.db.

---

## Task 13: Security Audit

**Port from:** `nex/src/security/` (~3,633 lines)
**Total:** ~3,633 TS lines → ~2,200 Go lines

### 13.1 `nexus security audit`

**Port from:** `audit.ts` (737), `audit-extra.ts` (1,246), `audit-fs.ts` (194)

```go
// internal/security/audit.go
func RunAudit(ctx context.Context, stateDir string) (*AuditReport, error)
```

Comprehensive security checks:
- File permissions on state directory and databases
- Config security (exposed ports, permissive CORS)
- Credential storage (plaintext detection)
- Adapter security (exposed tokens in config)
- Skill security (malicious content detection)
- Network security (open ports, TLS)
- Platform-specific (macOS SIP, Linux AppArmor)

### 13.2 `nexus security fix`

**Port from:** `fix.ts` (467)

Auto-fix common security issues:
- Fix file permissions
- Rotate exposed credentials
- Tighten CORS configuration
- Enable recommended security settings

### 13.3 Skill scanner

**Port from:** `skill-scanner.ts` (441)

Scan skill files for potential security issues: shell injection, data exfiltration, privilege escalation patterns.

### 13.4 External content safety

**Port from:** `external-content.ts` (275)

Sanitize external content (URLs, user input, adapter payloads) before processing.

**Acceptance:** `nexus security audit` reports findings. `nexus security fix` auto-remediates. Skill scanning works.

---

## Task 14: Device Pairing

**Port from:** `nex/src/pairing/` (~516 lines), `nex/src/nex/control-plane/device-host-ws-registry.ts` (307)
**Total:** ~823 TS lines → ~500 Go lines

### 14.1 Pairing store

**Port from:** `pairing-store.ts` (490)

Manage pairing requests, approvals, paired device list. Stored in runtime.db.

### 14.2 Device host WS registry

**Port from:** `device-host-ws-registry.ts` (307)

Track which devices are connected via WebSocket. Route messages to specific devices.

### 14.3 Pairing flow

The pairing dance: device requests pairing → user approves → device is registered → device can issue operations.

**Acceptance:** Device pairing flow works. Paired devices can connect via WS and issue operations.

---

## Task 15: Control UI Serving

**Port from:** `nex/src/nex/control-plane/control-ui.ts` (368), `control-ui-shared.ts` (69), `http-control-browser-apps.ts` (569)

### 15.1 go:embed static assets

```go
//go:embed ui/dist/*
var uiAssets embed.FS

func ServeControlUI(w http.ResponseWriter, r *http.Request) {
    // Serve embedded SPA assets
    // SPA fallback: serve index.html for non-asset paths
}
```

The Control UI is a React SPA built separately. Embed the built assets into the Go binary via `go:embed`.

### 15.2 App UI serving

Serve app UIs from their package directories:
- `/app/<app-id>/` → serve from `apps/<app-id>/ui/dist/`

### 15.3 Dashboard command

**Port from:** `commands/dashboard.ts` (67)

`nexus dashboard` — open Control UI in default browser.

**Acceptance:** `http://localhost:3284/` serves the Control UI SPA. App UIs served at `/app/<id>/`. `nexus dashboard` opens browser.

---

## Task 16: Remaining CLI Commands

### 16.1 `nexus init`

Already scaffolded in Phase 1. Finalize:
- Create full state directory structure
- Generate default config
- Set correct permissions

### 16.2 `nexus reset`

**Port from:** `commands/reset.ts` (168)

Reset state: clear databases, reset config to defaults, remove PID lock. Interactive confirmation required.

### 16.3 `nexus uninstall`

**Port from:** `commands/uninstall.ts` (204)

Full uninstall: stop daemon, remove service registration, optionally remove state directory.

### 16.4 `nexus docs`

**Port from:** `commands/docs.ts` (195)

Open documentation in browser.

### 16.5 `nexus capabilities`

**Port from:** `commands/capabilities.ts` (316)

List runtime capabilities: installed adapters, available providers, loaded skills, enabled features.

**Acceptance:** All CLI commands work. `nexus --help` shows complete command tree.

---

## Done Criteria

Phase 4 is complete when:

1. All cobra CLI commands are implemented and functional
2. `nexus setup` onboarding wizard guides new user to working setup
3. `nexus status`, `nexus health`, `nexus doctor` provide comprehensive diagnostics
4. `nexus chat` provides polished interactive experience with streaming
5. `nexus daemon install` creates platform-appropriate service
6. Media store/serve/understanding works (images, audio, video)
7. `nexus security audit` and `nexus security fix` work
8. Device pairing flow works end-to-end
9. Control UI loads at `http://localhost:3284/`
10. App UIs served at `/app/<id>/`
11. All 30+ CLI commands have `--help` text and work correctly
12. Terminal output is well-formatted with tables, colors, and progress indicators
13. All of the above passes `go test ./...`
