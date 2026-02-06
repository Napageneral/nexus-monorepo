# Upstream OpenClaw CLI Reference

**Status:** REFERENCE DOCUMENT  
**Last Updated:** 2026-02-04

> **Comprehensive Documentation:** See [`specs/environment/upstream/CLI_SYSTEM.md`](../../../upstream/CLI_SYSTEM.md) for the full CLI system documentation including architecture, all commands, implementation patterns, and detailed examples.

---

## Overview

This document summarizes the upstream OpenClaw CLI for quick comparison with Nexus. For detailed command reference and implementation patterns, see the comprehensive CLI_SYSTEM.md document.

---

## CLI Architecture

### Entry Point

| Component | Location |
|-----------|----------|
| Main CLI | `src/cli/run-main.ts` → `runCli()` |
| Program builder | `src/cli/program/build-program.ts` → `buildProgram()` |
| Framework | Commander.js |
| Loading | Lazy subcommand loading (on-demand) |

**Lazy Loading:** Subcommands load when invoked unless `CLAWDBOT_DISABLE_LAZY_SUBCOMMANDS` is set.

---

## Top-Level Commands

| Command | Description | Location |
|---------|-------------|----------|
| `setup` | Initialize config + workspace | `register.setup.ts` |
| `onboard` | Interactive setup wizard | `register.onboard.ts` |
| `configure` | Interactive config wizard | `register.configure.ts` |
| `config` | Config get/set/unset | `config-cli.ts` |
| `status` | Channel health + sessions | `register.status-health-sessions.ts` |
| `health` | Gateway health check | `register.status-health-sessions.ts` |
| `sessions` | List conversation sessions | `register.status-health-sessions.ts` |
| `agent` | Run agent turn via Gateway | `register.agent.ts` |
| `agents` | Manage agents (list/add/delete/set-identity) | `register.agent.ts` |
| `message` | Send messages + channel actions | `register.message.ts` |
| `memory` | Memory search/status | `memory-cli.ts` |
| `browser` | Browser automation | `browser-cli.ts` |
| `doctor` | Health checks + fixes | `register.maintenance.ts` |
| `dashboard` | Open Control UI | `register.maintenance.ts` |
| `reset` | Reset local config/state | `register.maintenance.ts` |
| `uninstall` | Uninstall gateway service | `register.maintenance.ts` |

---

## Subcommand Groups (Lazy-Loaded)

| Group | Description | Key Subcommands |
|-------|-------------|-----------------|
| `acp` | Agent Control Protocol tools | Various ACP commands |
| `gateway` | Gateway control | run/call/health/status/wake/send/agent/stop/restart/uninstall |
| `daemon` | Gateway service (legacy alias) | install/status/stop/restart/uninstall |
| `logs` | Gateway logs | Various log viewing |
| `models` | Model configuration | list/add/remove/status |
| `approvals` | Exec approvals | list/approve/reject |
| `nodes` | Node commands | status/pairing/invoke/camera/canvas/screen/notify |
| `devices` | Device pairing + tokens | list/pair/unpair |
| `sandbox` | Sandbox tools | Various sandbox commands |
| `tui` | Terminal UI | Launch TUI interface |
| `cron` | Cron scheduler | list/add/edit/remove/wake |
| `dns` | DNS helpers | Various DNS utilities |
| `docs` | Docs helpers | Generate documentation |
| `hooks` | Hooks tooling | list/add/remove/test |
| `webhooks` | Webhook helpers | Various webhook commands |
| `pairing` | Pairing helpers | Various pairing utilities |
| `plugins` | Plugin management | list/enable/disable/install/update |
| `channels` | Channel management | Various channel commands |
| `directory` | Directory commands | Various directory operations |
| `security` | Security helpers | Various security utilities |
| `skills` | Skills management | list/info/check |
| `update` | CLI update helpers | Check/install updates |

---

## Comparison: Upstream vs Nexus

### Commands Upstream Has That Nexus Adds/Extends

| Category | Upstream | Nexus | Difference |
|----------|----------|-------|------------|
| **Orientation** | `status` (health) | `status` (orientation), `capabilities` | Nexus adds capabilities abstraction |
| **Setup** | `setup`, `onboard`, `configure` | `init` | Upstream has wizard; Nexus is simpler |
| **Skills** | `skills list/info/check` | `skill list/info/use/scan/verify/stats` | Nexus adds `use` and `scan` |
| **Credentials** | None (via `configure`) | `credential list/add/get/verify/scan/import/flag` | Nexus has dedicated credential CLI |
| **Config** | `config get/set/unset` | `config list/get/set` | Similar |

### Commands Only in Nexus (New)

| Command | Purpose |
|---------|---------|
| `capabilities` | Capability map (abstract goals → providers) |
| `identity` | Show identity file paths |
| `credential` | Full credential management CLI |
| `quest` | Onboarding quests |
| `suggestions` | Usage-based suggestions |
| `cloud` | Cloud sync CLI |
| `collab` | Collaboration spaces |
| `usage` | Usage tracking |

### Commands Only in Upstream (Not in Nexus)

| Command | Purpose | Port Priority |
|---------|---------|---------------|
| `onboard` | Full interactive wizard | Low (Nexus has simpler approach) |
| `configure` | Interactive config wizard | Low |
| `agent` | Run agent turn via Gateway | High (needed for gateway) |
| `agents` | Multi-agent management | Medium |
| `message` | Send messages + channel actions | Medium |
| `doctor` | Diagnostic tool with auto-repair | Medium |
| `reset` | Reset config/state/workspace | Low (exists but not registered) |
| `approvals` | Exec command approvals | Low |
| `nodes` | Node discovery/bridge | Low |
| `devices` | Device pairing | Low |
| `tui` | Terminal UI | Low |
| `cron` | Cron scheduling | Medium (ties to triggers) |
| `plugins` | Plugin system | Low |
| `channels` | Channel management | Medium |

---

## Init/Onboard Flow Comparison

### Upstream Flow

```
clawdbot setup           # Quick init (config + workspace)
clawdbot onboard         # Full wizard:
                         #   1. Workspace directory
                         #   2. Auth choice (multiple providers)
                         #   3. Gateway config (port, bind, auth, tailscale)
                         #   4. Remote gateway option
                         #   5. Daemon installation
                         #   6. Channel setup (optional)
                         #   7. Skills setup (optional)
                         #   8. Health check (optional)
```

### Nexus Flow

```
nexus init [workspace]   # Create workspace structure
nexus status             # Detects missing setup, shows guidance
                         # No equivalent to full wizard
```

**Key Difference:** Upstream has extensive wizards; Nexus uses simpler init + status-based guidance.

---

## Configuration

### Upstream

| Aspect | Value |
|--------|-------|
| Path | `~/.clawdbot/clawdbot.json` |
| Format | JSON5 (comments allowed) |

**Major sections:**
- `agents` - Multi-agent configuration
- `gateway` - Gateway server config
- `routing` - Message routing and bindings
- `session` - Session management
- `models` - Model providers
- Provider configs: `whatsapp`, `telegram`, `discord`, `slack`, `signal`, `imessage`
- `cron` - Cron scheduling
- `hooks` - Webhook configuration
- `browser` - Browser automation
- `plugins` - Plugin system

### Nexus

| Aspect | Value |
|--------|-------|
| Path | `~/nexus/state/nexus/config.json` |
| Format | JSON5 (comments allowed) |

**Additional sections:**
- `credentials` - Credential references (not in config, separate system)
- Similar structure otherwise

---

## Command Registration Pattern

### Upstream (Lazy Loading)

```typescript
// Subcommands load on-demand
const entries: SubCliEntry[] = [
  { name: "skills", register: async (program) => { ... } },
  // ...
];

// Lazy registration
function registerLazyCommand(program: Command, entry: SubCliEntry) {
  const placeholder = program.command(entry.name);
  placeholder.action(async (...actionArgs) => {
    // Load the actual command module
    await entry.register(program);
    // Re-parse with loaded commands
    await program.parseAsync(parseArgv);
  });
}
```

### Nexus

Uses eager registration in `src/cli/program.ts` with explicit command registration.

---

## Key Insights

1. **Upstream is more feature-rich:** Multi-agent, message sending, maintenance tools, plugins
2. **Nexus focuses on orientation:** `status`, `capabilities`, credential management
3. **Upstream uses lazy loading** for subcommands; Nexus uses eager loading
4. **Upstream has `onboard` wizard;** Nexus uses `init` + `status` guidance
5. **Nexus adds capabilities abstraction** (goals → providers) — entirely new concept
6. **Nexus adds credential management CLI;** upstream handles credentials via `configure`

---

## Porting Recommendations

### High Priority (Gateway/Core)

- `agent` - Run agent turn via Gateway
- `cron` - Cron scheduling (ties to unified triggers)
- `channels` - Channel management

### Medium Priority (Useful)

- `agents` - Multi-agent management
- `message` - Send messages
- `doctor` - Diagnostic tool

### Low Priority (Nexus has alternatives)

- `onboard`/`configure` - Nexus uses simpler approach
- `reset` - Already exists but not registered
- `tui` - Nice to have
- `plugins` - Future consideration

---

## Related Documentation

- **Full CLI System Reference:** [`specs/environment/upstream/CLI_SYSTEM.md`](../../../upstream/CLI_SYSTEM.md)
- **Configuration System:** [`specs/runtime/upstream/CONFIGURATION.md`](../../../runtime/upstream/CONFIGURATION.md)

*This document provides a summary for quick reference. See CLI_SYSTEM.md for complete architecture and implementation details.*
