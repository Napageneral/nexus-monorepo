## CLI Review - Unwired Modules

This doc captures the current findings for CLI modules that are present but not
wired into the main `nexus` command surface. Use this as a decision log for
which ones to expose and how to describe them to agents.

### Agent Guidance (Short)

- Use headless tools for fast, deterministic automation.
- Use gateway-managed tools when you need persistent state, shared sessions,
  or device-level control.
- Treat pairing and node access as security-sensitive surfaces.

### Browser (Gateway Chrome) vs Headless Browser Tool

**Nexus browser CLI (gateway-managed Chrome):**
- Controls a dedicated Chrome/Chromium instance via the gateway.
- Supports tabs, profiles, screenshots/snapshots, and interactive actions.
- Best for long-lived sessions, shared context, and manual inspection.

**Headless browser CLI (`agent-browser`):**
- Standalone deterministic automation CLI.
- No gateway dependency; good for CI, repeatable runs, and quick tasks.
- Uses DOM refs from snapshots (predictable).

**Agent guidance (suggested):**
- Use `agent-browser` for fast, deterministic, one-off automation.
- Use `nexus browser` when you want a persistent stateful browser, multi-step
  flows across sessions, or manual inspection/debugging.

### Canvas + Nodes (Device Surfaces)

**Canvas CLI** controls a node’s canvas surface:
- Show/hide/navigate/eval.
- Capture snapshots that can be viewed locally.

**Nodes CLI** manages paired devices and invokes capabilities:
- Pairing approvals, device info, and commands (camera/screen/canvas/location).

**Relationship:**
- Canvas commands are node commands; canvas is a device UI surface.

**Could json-render be shown on a node?**
- Potentially yes if a node’s canvas can open a web URL.
- That would require a web renderer serving the json-render UI (not currently
  built-in to nodes).

### Cron (Scheduled Agent Jobs)

Cron is a gateway scheduler front-end. It stores schedules and triggers agent
jobs from the gateway layer. This should be reviewed against the broker layer
to decide whether scheduling belongs in gateway, broker, or both.

### Hooks (Gmail Pub/Sub)

Hooks orchestrate Gmail Pub/Sub + `gog gmail watch serve` and integrate it with
the gateway hook surface. This is not the same as `gog` by itself:
- `gog` provides raw watch/serve commands.
- `hooks` wires the setup, defaults, and gateway routing.
- Open question: should hooks become a gogcli plugin surface, or remain a
  gateway-integrated CLI for inbound webhooks?

### Models

Models CLI manages **model selection policy**:
- Defaults, aliases, fallbacks, provider lists.
- Writes `models.json` per agent.
- Defines a model catalog per provider (ids, names, inputs, context, costs).

This is separate from credentials:
- Credentials store secrets (API keys/tokens).
- Models define which models are available and which to prefer.

### Paired Nodes (What are they?)

Paired nodes are devices (macOS/iOS/Android) approved to connect to the gateway.
Each paired node has capabilities like camera, screen, canvas, or location, and
can be invoked through the gateway.

### Telegram Pairing Wrapper

Telegram pairing CLI is a thin wrapper around the generic pairing store with
extra metadata (username/first/last). This could be consolidated into the
generic pairing CLI with a `--show-meta` or `--verbose` mode.

**Consolidation proposal (exact changes):**
- Add `--verbose` (or `--show-meta`) to `pairing list` and `pairing approve`.
- When provider is `telegram`, include username/first/last in list output.
- Deprecate `nexus telegram pairing` CLI; replace with a help message that
  points to `nexus pairing --provider telegram`.
- Update docs to reference the generic pairing CLI only.

### TUI

Terminal UI is a gateway chat client. It connects to the gateway WebSocket and
lets you chat, switch sessions, and inspect tool output. It is useful for local
debugging and remote access with a URL/token.

### Devices Grouping Proposal (CLI Surface + Docs)

Group commands so relationships are obvious:
- **Devices:** `nodes`, `canvas`, `browser`
- **Messaging & Pairing:** `pairing` (and `telegram` only if kept)
- **Scheduling:** `cron` and `wake`
- **Hooks / Inbound:** `hooks`
- **Models / Policy:** `models`
- **UI:** `tui`

**Docs/Help text proposal:**
- In CLI help, add a Devices section header that lists `nodes`, `canvas`,
  `browser` together.
- In docs, describe canvas as a node surface and link `nodes` + `canvas`
  together in the same section.

