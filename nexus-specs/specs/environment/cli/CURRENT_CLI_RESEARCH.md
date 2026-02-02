# Current Nexus CLI Research

**Generated:** 2026-01-26  
**Source:** `/Users/tyler/nexus/home/projects/nexus/nexus-cli/src/`

This document details the actual CLI implementation found in the Nexus codebase, including command inventory, code paths, and gaps between documentation (AGENTS.md) and implementation.

---

## Table of Contents

1. [Command Inventory](#command-inventory)
2. [Specific Command Analysis](#specific-command-analysis)
3. [Configuration](#configuration)
4. [Gaps Between AGENTS.md and Implementation](#gaps)

---

## Command Inventory

### Top-Level Commands (registered in `src/cli/program.ts`)

| Command | Description | Code Path |
|---------|-------------|-----------|
| `nexus init [workspace]` | Create a new nexus workspace | `src/commands/init.ts` |
| `nexus login` | Sign in to Nexus (Hub + Cloud sync) | `src/cli/cloud-cli.ts` → `handleCloudLogin()` |
| `nexus status` | Show current status and onboarding guidance | `src/commands/status.ts` |
| `nexus dashboard` | Open the Control UI with your current token | `src/commands/dashboard.ts` |
| `nexus capabilities` | Show full capabilities map | `src/commands/capabilities.ts` |
| `nexus map` | Alias for capabilities | `src/commands/capabilities.ts` |
| `nexus quest` | Show onboarding quests | `src/commands/quest.ts` |
| `nexus identity [target]` | Show identity files (user/agent) | `src/commands/identity.ts` |
| `nexus config` | Manage config | `src/commands/config.ts` |
| `nexus update` | Update nexus CLI | `src/commands/update.ts` |
| `nexus suggestions` | Suggest next actions from local usage history | `src/commands/suggestions.ts` |

### Subcommand Groups (registered via register* functions)

| Group | Registration Function | Code Path |
|-------|----------------------|-----------|
| `nexus skill` | `registerSkillsCommand()` | `src/cli/skills-cli.ts` |
| `nexus skills` | `registerSkillsHubCommand()` | `src/cli/skills-hub-cli.ts` |
| `nexus cloud` | `registerCloudCommand()` | `src/cli/cloud-cli.ts` |
| `nexus collab` | `registerCollabCommand()` | `src/cli/collab-cli.ts` |
| `nexus credential` | `registerCredentialCli()` | `src/cli/credential-cli.ts` |
| `nexus dns` | `registerDnsCli()` | `src/cli/dns-cli.ts` |
| `nexus gateway` | `registerGatewayCli()` | `src/cli/gateway-cli.ts` |
| `nexus log` | `registerLogCli()` | `src/cli/log-cli.ts` |
| `nexus memory` | `registerMemoryCli()` | `src/cli/memory-cli.ts` |
| `nexus tool` | `registerToolConnectorCli()` | `src/cli/tool-connector-cli.ts` |
| `nexus usage` | `registerUsageCli()` | `src/cli/usage-cli.ts` |

### Additional CLI Files (not registered in main program.ts)

These exist as files but may be registered elsewhere or not fully integrated:

- `src/cli/browser-cli.ts` - Browser automation
- `src/cli/cron-cli.ts` - Cron scheduling
- `src/cli/canvas-cli.ts` - Canvas host control
- `src/cli/nodes-cli.ts` - Node discovery/bridge
- `src/cli/models-cli.ts` - Model management
- `src/cli/hooks-cli.ts` - Webhook hooks
- `src/cli/telegram-cli.ts` - Telegram-specific
- `src/cli/pairing-cli.ts` - Device pairing
- `src/cli/tui-cli.ts` - Terminal UI
- `src/cli/plugins-cli.ts` - Plugin management

---

## Specific Command Analysis

### 1. `nexus context` - DOES NOT EXIST

**Status:** Not implemented  
**Analysis:** No `context` command found anywhere in the codebase. This command does not exist.

If there's intent for an agent context/bindings command, it would need to be created. The closest functionality is:
- `nexus identity` - Shows identity files
- `routing.bindings` in config - Agent routing bindings (config-only, no CLI)

### 2. `nexus generate` - DOES NOT EXIST (as a top-level command)

**Status:** Not implemented as `nexus generate`  
**Related:** `nexus claude-md` exists but is NOT registered in program.ts

**File:** `src/commands/claude-md.ts`

```typescript
export async function claudeMdCommand(
  opts?: { workspace?: string },
  runtime: RuntimeEnv = defaultRuntime,
)
```

This command generates a `CLAUDE.md` file for Claude Code integration, but **it is NOT registered as a CLI command** in `src/cli/program.ts`. It exists as an exported function only.

**To enable:** Would need to add registration in `program.ts`:
```typescript
program
  .command("claude-md")
  .description("Generate CLAUDE.md for Claude Code")
  .option("--workspace <path>", "Workspace directory")
  .action(async (opts) => {
    await claudeMdCommand(opts, defaultRuntime);
  });
```

### 3. `nexus configure` vs `nexus config`

**Both exist but serve different purposes:**

#### `nexus config` (IMPLEMENTED)
**Location:** `src/cli/program.ts` lines 249-282, `src/commands/config.ts`

Subcommands:
- `nexus config` - Show config path and status (via `configViewCommand`)
- `nexus config list` - List all config values
- `nexus config get <key>` - Get a config value by dot-path
- `nexus config set <key> <value>` - Set a config value by dot-path

#### `nexus configure` (EXISTS but NOT REGISTERED)
**Location:** `src/commands/configure.ts`

The `configureCommand()` and `runConfigureWizard()` functions exist and provide an interactive wizard for:
- Workspace setup
- Model/auth configuration
- Gateway config
- Daemon installation
- Provider setup (WhatsApp, Telegram, etc.)
- Skills installation
- Health check

**Status:** The `configure` command IS NOT registered in `program.ts`. It's an internal function used elsewhere but not exposed as a CLI command.

**Key difference:**
- `config` = Read/write individual config keys (implemented CLI)
- `configure` = Interactive setup wizard (exists but not CLI-exposed)

### 4. `nexus reset` - DOES NOT EXIST (as a registered command)

**Status:** Implemented but NOT registered in CLI

**Location:** `src/commands/reset.ts`

```typescript
export interface ResetOptions {
  local?: boolean;   // Remove workspace directory
  state?: boolean;   // Remove state directory  
  all?: boolean;     // Remove both
  confirm?: boolean; // Required flag to actually delete
  workspace?: string;
}

export async function resetCommand(
  opts: ResetOptions = {},
  runtime: RuntimeEnv = defaultRuntime,
)
```

**Behavior:**
- `--local` - Removes `~/nexus/home` (workspace)
- `--state` - Removes `~/nexus/state` (state dir)
- `--all` - Removes both
- `--confirm` - Required to actually delete (dry-run without it)

**Note:** This is a **dangerous command** - removes nexus directories. Must specify at least one target and use `--confirm` flag.

**Not registered in program.ts** - would need:
```typescript
program
  .command("reset")
  .description("Remove Nexus directories (testing/cleanup)")
  .option("--local", "Remove workspace directory")
  .option("--state", "Remove state directory")
  .option("--all", "Remove both directories")
  .option("--confirm", "Actually delete (required)")
  .option("--workspace <path>", "Custom workspace path")
  .action(async (opts) => {
    await resetCommand(opts, defaultRuntime);
  });
```

### 5. `nexus bindings` - DOES NOT EXIST

**Status:** Not implemented as a CLI command

**Related functionality:** Agent bindings exist in the config schema as `routing.bindings`:

```typescript
// From src/config/types.ts
routing?: RoutingConfig;

// RoutingConfig includes:
bindings?: Array<{
  agentId: string;
  match: {
    channel: string;
    accountId?: string;
    peer?: { kind: "dm" | "group" | "channel"; id: string };
    guildId?: string;
    teamId?: string;
  };
}>;
```

Bindings are configured via the config file, not CLI. To add a CLI:
- Would read/write `routing.bindings` array
- List current bindings
- Add/remove binding rules

---

## Detailed Command Trees

### `nexus config` Subcommands

```
nexus config
├── (no subcommand)     Show config path and status
├── list                List all config values
├── get <key>           Get a config value  
└── set <key> <value>   Set a config value
```

### `nexus skill` Subcommands

```
nexus skill
├── scan                Scan and write skill index
├── list                List all available skills
│   ├── --type          Filter by type (guide|tool|connector)
│   ├── --status        Filter by status
│   └── --all           Include unavailable skills
├── info <name>         Show detailed skill info
├── use <name>          Show SKILL.md guide
├── verify <name>       Verify skill setup
└── stats [name]        Show usage statistics
```

### `nexus credential` Subcommands

```
nexus credential
├── list                List credentials from index
├── verify <service>    Verify credential status
├── get [service/account]  Get credential value
├── add                 Add a credential record
│   ├── --service       Service id (required)
│   ├── --account       Account id (required)
│   ├── --type          api_key|token|oauth|config (required)
│   ├── --storage       keychain|1password|env|external
│   └── ... (many options)
├── import <source>     Import from claude-cli or codex-cli
├── expose              Approve for gateway access
├── revoke              Revoke gateway access
├── remove              Remove credential record
├── scan                Scan env vars for credentials
│   ├── --deep          Scan all env vars
│   └── --import        Import detected credentials
└── flag                Mark broken or clear flag
```

### `nexus gateway` Subcommands

```
nexus gateway
├── (no subcommand)     Run the Gateway (foreground)
│   ├── --port          Port for WebSocket
│   ├── --bind          loopback|tailnet|lan|auto
│   ├── --token         Auth token
│   ├── --auth          token|password
│   ├── --password      Password auth
│   ├── --tailscale     off|serve|funnel
│   └── --force         Kill existing listener
├── call <method>       Call a Gateway RPC method
├── health              Fetch Gateway health
├── status              Fetch Gateway status
├── wake                Enqueue system event
├── send                Send a message
├── agent               Run agent turn via Gateway
├── stop                Stop Gateway service
├── restart             Restart Gateway service
└── uninstall           Uninstall Gateway service
```

Also: `nexus gateway-daemon` - Run as long-lived daemon (for launchd/systemd)

### `nexus cloud` Subcommands

Passes through to Rust `nexus-cloud-rs` binary:
- `nexus cloud login` - Sign in (handled specially)
- Other args forwarded to Rust CLI

---

## Configuration

### Config File Location

**Path:** `~/nexus/state/nexus/config.json`  
**Override:** `NEXUS_CONFIG_PATH` env var  
**Format:** JSON5 (comments allowed)

**Code:** `src/config/paths.ts`
```typescript
export const CONFIG_PATH_NEXUS = resolveConfigPath();
// Default: $HOME/nexus/state/nexus/config.json
```

### State Directory

**Path:** `~/nexus/state`  
**Override:** `NEXUS_STATE_DIR` env var

Contains:
- `nexus/config.json` - Main config
- `credentials/` - Credential records
- `sessions/` - Session transcripts
- `agents/` - Agent state (BOOTSTRAP.md, identities)
- `skills/` - Skill state and usage data
- `logs/` - Log files

### Config Schema

**Type definition:** `src/config/types.ts` - `NexusConfig` interface (~1450 lines)

**Major sections:**
- `auth` - Auth profiles
- `agent` - Agent defaults (model, workspace, timeouts, sandbox, etc.)
- `agents` - Multi-agent configuration
- `gateway` - Gateway server config (port, bind, auth, tailscale)
- `routing` - Message routing and agent bindings
- `session` - Session management
- `skills` - Skill configuration
- `models` - Custom model providers
- Provider configs: `whatsapp`, `telegram`, `discord`, `slack`, `signal`, `imessage`
- `cron` - Cron scheduling
- `hooks` - Webhook configuration
- `browser` - Browser automation
- `plugins` - Plugin system

---

## Gaps Between AGENTS.md and Implementation

### AGENTS.md Advertises (from `~/nexus/AGENTS.md`)

```
nexus
├── status
├── capabilities
│   └── [--status <status>]
├── skill
│   ├── list
│   ├── use <name>
│   └── info <name>
├── credential
│   ├── list
│   ├── add
│   ├── import <source>
│   ├── get <service/account>
│   ├── verify <service>
│   ├── flag <service/account>
│   ├── remove <service/account>
│   └── scan [--deep]
├── identity
└── config
    ├── list
    ├── get <key>
    └── set <key> <value>
```

### Actual Implementation Has More

**Additional top-level commands:**
- `nexus init [workspace]` - Create workspace
- `nexus login` - Cloud auth
- `nexus dashboard` - Open Control UI
- `nexus map` - Alias for capabilities
- `nexus quest` - Onboarding quests
- `nexus update` - Update CLI
- `nexus suggestions` - Usage-based suggestions
- `nexus gateway` - Run/manage gateway
- `nexus gateway-daemon` - Daemon mode
- `nexus cloud` - Cloud CLI passthrough
- `nexus collab` - Collaboration spaces
- `nexus dns` - DNS management
- `nexus log` - Log viewing
- `nexus memory` - Memory search
- `nexus tool` - Tool connector management
- `nexus usage` - Usage tracking

**Additional skill subcommands:**
- `nexus skills scan` - Scan and update index
- `nexus skills verify <name>` - Verify skill setup
- `nexus skills stats [name]` - Usage statistics

**Additional credential subcommands:**
- `nexus credential expose` - Approve for gateway
- `nexus credential revoke` - Revoke access

### Commands That EXIST But Are NOT Registered

| Function | File | Notes |
|----------|------|-------|
| `configureCommand()` | `src/commands/configure.ts` | Interactive wizard |
| `resetCommand()` | `src/commands/reset.ts` | Dangerous cleanup |
| `claudeMdCommand()` | `src/commands/claude-md.ts` | Generate CLAUDE.md |
| `onboardCommand()` | `src/commands/onboard.ts` | Onboarding flow |
| `setupCommand()` | `src/commands/setup.ts` | Quick setup |
| `doctorCommand()` | `src/commands/doctor.ts` | Diagnostic tool |

### Commands That DO NOT Exist

| Command | Status | Notes |
|---------|--------|-------|
| `nexus context` | **Not implemented** | No code exists |
| `nexus generate` | **Not implemented** | claude-md exists but not as "generate" |
| `nexus bindings` | **Not implemented** | Config-only (routing.bindings) |

---

## Summary

### Implemented and Registered
- `status`, `capabilities`, `map`, `identity`, `quest`
- `config` (list/get/set)
- `skill` (scan/list/info/use/verify/stats)
- `credential` (list/verify/get/add/import/expose/revoke/remove/scan/flag)
- `gateway` (run/call/health/status/wake/send/agent/stop/restart/uninstall)
- `cloud`, `collab`, `dns`, `log`, `memory`, `tool`, `usage`
- `init`, `login`, `dashboard`, `update`, `suggestions`

### Implemented but NOT Registered
- `configure` - Interactive setup wizard
- `reset` - Cleanup directories  
- `claude-md` - Generate CLAUDE.md
- `onboard` - Full onboarding flow
- `setup` - Quick setup
- `doctor` - Diagnostic checks

### Not Implemented
- `context` - Does not exist
- `generate` - Does not exist (claude-md is related)
- `bindings` - Config-only, no CLI

---

## Recommendations

1. **Register existing commands:** `configure`, `reset`, `doctor`, `setup`, `onboard` are implemented but not CLI-accessible.

2. **Add bindings CLI:** If agent bindings need runtime management, add `nexus bindings list/add/remove`.

3. **Update AGENTS.md:** The documentation understates the actual CLI capabilities significantly.

4. **Consider `nexus generate`:** If CLAUDE.md/AGENTS.md generation is desired, expose `claudeMdCommand` as `nexus generate claude-md` or similar.
