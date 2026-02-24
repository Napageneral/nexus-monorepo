# OpenClaw CLI System

**Status:** REFERENCE DOCUMENT  
**Last Updated:** 2026-02-04

This document provides comprehensive documentation of OpenClaw's CLI architecture, commands, and patterns for reference when designing Nexus CLI.

---

## Table of Contents

1. [CLI Architecture](#cli-architecture)
2. [Command Registration Pattern](#command-registration-pattern)
3. [Top-Level Commands](#top-level-commands)
4. [Subcommand Groups](#subcommand-groups)
5. [Gateway CLI](#gateway-cli)
6. [Agent CLI](#agent-cli)
7. [Skills CLI](#skills-cli)
8. [Plugins CLI](#plugins-cli)
9. [Memory CLI](#memory-cli)
10. [Cron CLI](#cron-cli)
11. [Daemon CLI](#daemon-cli)
12. [Config CLI](#config-cli)
13. [Maintenance Commands](#maintenance-commands)
14. [Output Formats](#output-formats)
15. [Mapping to Nexus CLI](#mapping-to-nexus-cli)

---

## CLI Architecture

### Entry Point

```
src/cli/run-main.ts
    └── runCli()
        ├── loadDotEnv()
        ├── normalizeEnv()
        ├── ensureOpenClawCliOnPath()
        ├── assertSupportedRuntime()
        ├── tryRouteCli()                    # Fast-path routing
        ├── enableConsoleCapture()           # Structured logging
        ├── buildProgram()                   # Commander.js setup
        ├── registerSubCliByName()           # Lazy subcommand
        ├── registerPluginCliCommands()      # Plugin CLI
        └── program.parseAsync()
```

### Key Files

| File | Purpose |
|------|---------|
| `run-main.ts` | Entry point, `runCli()` function |
| `program.ts` | Exports `buildProgram()` |
| `program/build-program.ts` | Creates Commander program |
| `program/command-registry.ts` | Registers core commands |
| `program/register.subclis.ts` | Lazy subcommand registration |
| `program/context.ts` | Program context (version, options) |
| `program/preaction.ts` | Pre-action hooks |

### Framework

OpenClaw uses [Commander.js](https://github.com/tj/commander.js) for CLI parsing:

```typescript
import { Command } from "commander";

export function buildProgram() {
  const program = new Command();
  const ctx = createProgramContext();
  
  configureProgramHelp(program, ctx);
  registerPreActionHooks(program, ctx.programVersion);
  registerProgramCommands(program, ctx, process.argv);
  
  return program;
}
```

---

## Command Registration Pattern

### Lazy Loading

Subcommands load on-demand unless `OPENCLAW_DISABLE_LAZY_SUBCOMMANDS=1`:

```typescript
// register.subclis.ts
const entries: SubCliEntry[] = [
  {
    name: "skills",
    description: "Skills management",
    register: async (program) => {
      const mod = await import("../skills-cli.js");
      mod.registerSkillsCli(program);
    },
  },
  // ... more entries
];

function registerLazyCommand(program: Command, entry: SubCliEntry) {
  const placeholder = program.command(entry.name).description(entry.description);
  placeholder.allowUnknownOption(true);
  placeholder.allowExcessArguments(true);
  
  placeholder.action(async (...actionArgs) => {
    // Remove placeholder, load real command, re-parse
    removeCommand(program, placeholder);
    await entry.register(program);
    await program.parseAsync(parseArgv);
  });
}
```

### Command Registry

Core commands register eagerly via `command-registry.ts`:

```typescript
export const commandRegistry: CommandRegistration[] = [
  { id: "setup", register: ({ program }) => registerSetupCommand(program) },
  { id: "onboard", register: ({ program }) => registerOnboardCommand(program) },
  { id: "configure", register: ({ program }) => registerConfigureCommand(program) },
  { id: "config", register: ({ program }) => registerConfigCli(program) },
  { id: "maintenance", register: ({ program }) => registerMaintenanceCommands(program) },
  { id: "message", register: ({ program, ctx }) => registerMessageCommands(program, ctx) },
  { id: "memory", register: ({ program }) => registerMemoryCli(program) },
  { id: "agent", register: ({ program, ctx }) => registerAgentCommands(program, {...}) },
  { id: "subclis", register: ({ program, argv }) => registerSubCliCommands(program, argv) },
  { id: "status-health-sessions", register: ({ program }) => registerStatusHealthSessionsCommands(program) },
  { id: "browser", register: ({ program }) => registerBrowserCli(program) },
];
```

### Fast-Path Routing

Some commands bypass full parsing for speed:

```typescript
// command-registry.ts
const routeHealth: RouteSpec = {
  match: (path) => path[0] === "health",
  loadPlugins: true,
  run: async (argv) => {
    const json = hasFlag(argv, "--json");
    const verbose = getVerboseFlag(argv);
    await healthCommand({ json, verbose }, defaultRuntime);
    return true;
  },
};
```

---

## Top-Level Commands

| Command | Description | File |
|---------|-------------|------|
| `setup` | Initialize config + workspace | `register.setup.ts` |
| `onboard` | Interactive setup wizard | `register.onboard.ts` |
| `configure` | Interactive config wizard | `register.configure.ts` |
| `config` | Config get/set/unset | `config-cli.ts` |
| `status` | Channel health + sessions | `register.status-health-sessions.ts` |
| `health` | Gateway health check | `register.status-health-sessions.ts` |
| `sessions` | List conversation sessions | `register.status-health-sessions.ts` |
| `agent` | Run agent turn via Gateway | `register.agent.ts` |
| `agents` | Manage agents | `register.agent.ts` |
| `message` | Send messages + channel actions | `register.message.ts` |
| `memory` | Memory search/status | `memory-cli.ts` |
| `browser` | Browser automation | `browser-cli.ts` |
| `doctor` | Health checks + fixes | `register.maintenance.ts` |
| `dashboard` | Open Control UI | `register.maintenance.ts` |
| `reset` | Reset local config/state | `register.maintenance.ts` |
| `uninstall` | Uninstall gateway service | `register.maintenance.ts` |

---

## Subcommand Groups

All subcommand groups use lazy loading:

| Group | Description | Key Subcommands |
|-------|-------------|-----------------|
| `acp` | Agent Control Protocol | Various ACP commands |
| `gateway` | Gateway control | run, call, health, status, discover, install, uninstall, start, stop, restart |
| `daemon` | Gateway service (legacy alias) | install, status, stop, restart, uninstall |
| `logs` | Gateway logs | Various log viewing |
| `system` | System events, heartbeat, presence | Various system commands |
| `models` | Model configuration | list, add, remove, status |
| `approvals` | Exec approvals | list, approve, reject |
| `nodes` | Node commands | status, pairing, invoke, camera, canvas, screen, notify |
| `node` | Node control | Various node operations |
| `devices` | Device pairing + tokens | list, pair, unpair |
| `sandbox` | Sandbox tools | Various sandbox commands |
| `tui` | Terminal UI | Launch TUI interface |
| `cron` | Cron scheduler | list, add, edit, remove, status |
| `dns` | DNS helpers | Various DNS utilities |
| `docs` | Docs helpers | Generate documentation |
| `hooks` | Hooks tooling | list, add, remove, test |
| `webhooks` | Webhook helpers | Various webhook commands |
| `pairing` | Pairing helpers | Various pairing utilities |
| `plugins` | Plugin management | list, info, enable, disable, install, update, doctor |
| `channels` | Channel management | Various channel commands |
| `directory` | Directory commands | Various directory operations |
| `security` | Security helpers | Various security utilities |
| `skills` | Skills management | list, info, check |
| `update` | CLI update helpers | Check/install updates |
| `completion` | Shell completion | Generate completion script |

---

## Gateway CLI

**File:** `gateway-cli/register.ts`

The Gateway CLI controls the WebSocket Gateway server.

### Commands

```bash
# Run gateway in foreground
openclaw gateway run
openclaw gateway run --port 9090 --bind 0.0.0.0

# Service management (launchd/systemd/schtasks)
openclaw gateway install [--port <port>] [--runtime node|bun] [--token <token>] [--force]
openclaw gateway start
openclaw gateway stop
openclaw gateway restart
openclaw gateway uninstall

# Status and health
openclaw gateway status [--url <url>] [--deep] [--json]
openclaw gateway health [--json]
openclaw gateway probe [--url <url>] [--ssh <target>] [--json]

# Discovery
openclaw gateway discover [--timeout <ms>] [--json]

# RPC calls
openclaw gateway call <method> [--params <json>] [--json]
openclaw gateway call health
openclaw gateway call status
openclaw gateway call cron.list

# Usage
openclaw gateway usage-cost [--days <n>] [--json]
```

### Gateway Run Options

| Option | Description |
|--------|-------------|
| `--port <port>` | Gateway port (default: config or 9090) |
| `--bind <address>` | Bind address (default: 127.0.0.1) |
| `--auth-mode <mode>` | Authentication mode: none, token, password |
| `--token <token>` | Gateway token for auth |
| `--password <password>` | Gateway password for auth |
| `--no-channels` | Disable channel connections |
| `--no-memory` | Disable memory search |
| `--no-cron` | Disable cron scheduler |
| `--no-bonjour` | Disable Bonjour discovery |

### Gateway Status Output

```
Gateway Status
  Service: installed (running)
  URL: ws://localhost:9090
  Auth: token
  
Channel Health
  telegram: ok (bot @mybot)
  discord: ok (connected to 3 guilds)
  whatsapp: linked (Web)
  slack: ok (workspace: myteam)
  signal: not configured
  imessage: not configured
```

---

## Agent CLI

**File:** `program/register.agent.ts`

### Single Agent Turn

```bash
# Run agent turn via Gateway
openclaw agent --message "status update" --to +15555550123
openclaw agent --message "Summarize logs" --agent ops
openclaw agent --message "Generate report" --session-id 1234

# With options
openclaw agent --message "Hello" --to +15555550123 \
  --thinking medium \
  --verbose on \
  --json

# Local execution (no Gateway)
openclaw agent --message "Hello" --to +15555550123 --local

# Deliver response back to channel
openclaw agent --message "Send update" --to +15555550123 --deliver
openclaw agent --message "Report" --deliver \
  --reply-channel slack --reply-to "#reports"
```

### Agent Options

| Option | Description |
|--------|-------------|
| `-m, --message <text>` | Message body (required) |
| `-t, --to <number>` | Recipient (E.164 format) |
| `--session-id <id>` | Explicit session ID |
| `--agent <id>` | Agent ID (overrides routing) |
| `--thinking <level>` | off, minimal, low, medium, high |
| `--verbose <on\|off>` | Persist verbose level for session |
| `--channel <channel>` | Delivery channel |
| `--local` | Run embedded agent (requires API keys) |
| `--deliver` | Send reply back to channel |
| `--reply-to <target>` | Delivery target override |
| `--reply-channel <channel>` | Delivery channel override |
| `--timeout <seconds>` | Agent timeout (default: 600) |
| `--json` | Output JSON |

### Multi-Agent Management

```bash
# List agents
openclaw agents list [--json] [--bindings]

# Add agent
openclaw agents add [name] \
  --workspace <dir> \
  --model <id> \
  --agent-dir <dir> \
  --bind <channel[:accountId]>

# Set identity
openclaw agents set-identity \
  --agent main \
  --name "Atlas" \
  --emoji "🧭" \
  --avatar avatars/atlas.png

openclaw agents set-identity \
  --workspace ~/.openclaw/workspace \
  --from-identity

# Delete agent
openclaw agents delete <id> [--force] [--json]
```

---

## Skills CLI

**File:** `skills-cli.ts`

### Commands

```bash
# List all skills
openclaw skills list [--json] [--eligible] [--verbose]

# Show skill details
openclaw skills info <name> [--json]

# Check skill status
openclaw skills check [--json]
```

### Skill Status Output

```
Skills (12/18 ready)
Status     Skill              Description                Source
✓ ready    📁 filesystem      File system operations     bundled
✓ ready    🔧 git             Git version control        bundled
✗ missing  🌐 browser         Browser automation         bundled
           (bins: playwright)
⏸ disabled 📧 gmail           Gmail integration          bundled
```

### Skills Info Output

```
📁 filesystem ✓ Ready

File system operations for reading, writing, and managing files.

Details:
  Source: bundled
  Path: ~/.openclaw/skills/filesystem/SKILL.md
  Homepage: https://docs.openclaw.ai/skills/filesystem

Requirements:
  Binaries: ✓ cat, ✓ ls, ✓ find
  Environment: ✓ HOME
```

### Skills Check Output

```
Skills Status Check

Total: 18
✓ Eligible: 12
⏸ Disabled: 2
🚫 Blocked by allowlist: 1
✗ Missing requirements: 3

Ready to use:
  📁 filesystem
  🔧 git
  🐚 shell
  ...

Missing requirements:
  🌐 browser (bins: playwright)
  📧 gmail (env: GMAIL_API_KEY)
```

---

## Plugins CLI

**File:** `plugins-cli.ts`

### Commands

```bash
# List plugins
openclaw plugins list [--json] [--enabled] [--verbose]

# Show plugin info
openclaw plugins info <id> [--json]

# Enable/disable plugins
openclaw plugins enable <id>
openclaw plugins disable <id>

# Install plugins
openclaw plugins install <path-or-spec>
openclaw plugins install ./my-plugin.ts
openclaw plugins install ~/plugins/my-plugin
openclaw plugins install my-plugin.zip
openclaw plugins install @openclaw/plugin-foo
openclaw plugins install @openclaw/plugin-foo@1.2.3

# Link local plugin (no copy)
openclaw plugins install ./my-plugin --link

# Update plugins
openclaw plugins update <id>
openclaw plugins update --all
openclaw plugins update --all --dry-run

# Diagnose issues
openclaw plugins doctor
```

### Plugin Install Sources

| Source | Example |
|--------|---------|
| Local file | `./plugin.ts`, `./plugin.js` |
| Local directory | `~/my-plugins/custom-plugin` |
| Archive | `plugin.zip`, `plugin.tgz`, `plugin.tar.gz` |
| npm package | `@openclaw/plugin-name`, `openclaw-plugin-foo@1.0.0` |

### Plugin Info Output

```
My Custom Plugin
id: my-custom-plugin
A custom plugin for OpenClaw.

Status: loaded
Source: ~/.openclaw/plugins/my-custom-plugin
Origin: npm
Version: 1.2.3
Tools: custom_tool, another_tool
Hooks: onMessage, onReply
Gateway methods: custom.method

Install: npm
Spec: @openclaw/my-custom-plugin@1.2.3
Installed at: 2025-01-15T10:00:00Z
```

---

## Memory CLI

**File:** `memory-cli.ts`

### Commands

```bash
# Show memory status
openclaw memory status [--agent <id>] [--json] [--deep] [--index] [--verbose]

# Reindex memory
openclaw memory index [--agent <id>] [--force] [--verbose]

# Search memory
openclaw memory search <query> \
  [--agent <id>] \
  [--max-results <n>] \
  [--min-score <n>] \
  [--json]
```

### Memory Status Output

```
Memory Search (main)
Provider: openai (requested: openai)
Model: text-embedding-3-small
Sources: memory, sessions
Indexed: 45/48 files · 234 chunks
Dirty: no
Store: ~/.openclaw/agents/main/memory.db
Workspace: ~/projects

By source
  memory · 32/35 files · 178 chunks
  sessions · 13/13 files · 56 chunks

Embeddings: ready
Vector: ready
Vector dims: 1536
FTS: ready
Embedding cache: enabled (1234 entries)
Batch: enabled (failures 0/5)
```

### Memory Search Output

```
0.892 ~/projects/MEMORY.md:12-18
  Tyler prefers direct feedback and pushback when wrong.
  He hates corporate fluff and values creativity.

0.845 ~/.openclaw/agents/main/sessions/abc123.jsonl:45-52
  User mentioned preference for Austin coffee shops...
```

---

## Cron CLI

**File:** `cron-cli/register.ts`

### Commands

```bash
# Show cron status
openclaw cron status [--json]

# List cron jobs
openclaw cron list [--json]

# Add cron job
openclaw cron add <name> \
  --schedule "0 9 * * *" \
  --message "Daily standup reminder" \
  --to "+15555550123" \
  [--agent <id>] \
  [--channel <channel>] \
  [--enabled]

# Edit cron job
openclaw cron edit <id> \
  [--schedule <cron>] \
  [--message <text>] \
  [--enabled <true|false>]

# Remove cron job
openclaw cron remove <id>

# Wake cron (trigger immediately)
openclaw cron wake <id>

# Enable/disable
openclaw cron enable <id>
openclaw cron disable <id>
```

### Cron Schedule Format

Standard cron format: `minute hour day month weekday`

| Example | Description |
|---------|-------------|
| `0 9 * * *` | Every day at 9 AM |
| `*/15 * * * *` | Every 15 minutes |
| `0 9 * * 1-5` | Weekdays at 9 AM |
| `0 0 1 * *` | First of every month |

---

## Daemon CLI

**File:** `daemon-cli/register.ts`

Legacy alias for Gateway service management. Same commands as `openclaw gateway`:

```bash
openclaw daemon status [--url <url>] [--deep] [--json]
openclaw daemon install [--port <port>] [--runtime node|bun] [--force]
openclaw daemon uninstall
openclaw daemon start
openclaw daemon stop
openclaw daemon restart
```

---

## Config CLI

**File:** `config-cli.ts`

### Commands

```bash
# Interactive config wizard
openclaw config
openclaw config --section auth
openclaw config --section channels --section models

# Get config value
openclaw config get <path> [--json]
openclaw config get agents.defaults.model.primary
openclaw config get channels.telegram.botToken
openclaw config get "agents.list[0].id"

# Set config value
openclaw config set <path> <value> [--json]
openclaw config set agents.defaults.model.primary "anthropic/claude-sonnet-4-5"
openclaw config set agents.defaults.contextTokens 200000
openclaw config set --json channels.telegram.enabled true

# Remove config value
openclaw config unset <path>
openclaw config unset channels.telegram.botToken
```

### Path Notation

Supports dot notation and bracket notation:

```
agents.defaults.model.primary
agents.list[0].id
channels.telegram.groups.-1001234567890.requireMention
```

Escape dots with backslash: `some\.key\.with\.dots`

---

## Maintenance Commands

**File:** `program/register.maintenance.ts`

### Doctor

```bash
# Health checks + repairs
openclaw doctor
openclaw doctor --yes                    # Accept defaults
openclaw doctor --repair                 # Apply repairs
openclaw doctor --force                  # Aggressive repairs
openclaw doctor --non-interactive        # Safe migrations only
openclaw doctor --generate-gateway-token # Generate token
openclaw doctor --deep                   # Scan system services
```

### Dashboard

```bash
# Open Control UI
openclaw dashboard
openclaw dashboard --no-open  # Print URL only
```

### Reset

```bash
# Reset local state
openclaw reset
openclaw reset --scope config
openclaw reset --scope config+creds+sessions
openclaw reset --scope full
openclaw reset --yes --dry-run
```

### Uninstall

```bash
# Uninstall components
openclaw uninstall
openclaw uninstall --service   # Gateway service only
openclaw uninstall --state     # State + config
openclaw uninstall --workspace # Workspace dirs
openclaw uninstall --app       # macOS app
openclaw uninstall --all       # Everything
openclaw uninstall --dry-run
```

---

## Output Formats

### JSON Output

All commands support `--json` for machine-readable output:

```bash
openclaw status --json
openclaw agents list --json
openclaw skills list --json
openclaw gateway call status --json
```

### Table Output

Human-readable tables with theming:

```
Skills (12/18 ready)
Status     Skill              Description
✓ ready    📁 filesystem      File system operations
✗ missing  🌐 browser         Browser automation
```

### Text Output

Simple text for scripting:

```bash
openclaw config get agents.defaults.model.primary
# Output: anthropic/claude-sonnet-4-5
```

### Theme Support

Terminal output is styled with colors when TTY is detected:
- `theme.heading()` - Heading text
- `theme.success()` - Success messages (green)
- `theme.warn()` - Warnings (yellow)
- `theme.error()` - Errors (red)
- `theme.muted()` - Muted/secondary text
- `theme.info()` - Informational text
- `theme.accent()` - Accent color
- `theme.command()` - Command names

---

## Mapping to Nexus CLI

### Commands Nexus Adopts

| OpenClaw | Nexus | Notes |
|----------|-------|-------|
| `status` | `status` | Nexus adds orientation focus |
| `config get/set` | `config get/set/list` | Similar structure |
| `skills list/info` | `skill list/info/use` | Nexus adds `use` for reading SKILL.md |
| `gateway` | `gateway` | Same service management |
| `agent` | `agent` | Same agent turn execution |
| `memory` | `memory` | Same memory search |

### Commands Nexus Changes

| OpenClaw | Nexus | Difference |
|----------|-------|------------|
| `onboard` (wizard) | `init` | Nexus uses simpler init + status guidance |
| `configure` (wizard) | `config` | Nexus relies on `status` for guidance |
| `skills check` | `skill list --status` | Status filtering vs separate command |

### New Nexus Commands

| Command | Purpose |
|---------|---------|
| `capabilities` | Abstract capability map (goals → providers) |
| `identity` | Show identity file paths |
| `credential` | Full credential management CLI |
| `quest` | Onboarding quests |
| `suggestions` | Usage-based suggestions |
| `cloud` | Cloud sync CLI |

### Commands Only in OpenClaw

| Command | Purpose | Port Priority |
|---------|---------|---------------|
| `onboard` | Full interactive wizard | Low |
| `configure` | Interactive config wizard | Low |
| `browser` | Browser automation CLI | Low |
| `tui` | Terminal UI | Low |
| `nodes` | Node discovery/bridge | Low |
| `devices` | Device pairing | Low |
| `channels` | Channel management | Medium |
| `cron` | Cron scheduling | Medium (ties to triggers) |
| `plugins` | Plugin system | Low |
| `approvals` | Exec approvals | Low |
| `acp` | Agent Control Protocol | Low |

---

## Key Implementation Patterns

### Command Registration Function

```typescript
export function registerSkillsCli(program: Command) {
  const skills = program
    .command("skills")
    .description("List and inspect available skills")
    .addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink(...)}\n`);

  skills
    .command("list")
    .description("List all available skills")
    .option("--json", "Output as JSON", false)
    .option("--eligible", "Show only eligible skills", false)
    .action(async (opts) => {
      try {
        // ... implementation
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  // Default action for bare command
  skills.action(async () => {
    // Same as `skills list`
  });
}
```

### Runtime Abstraction

Commands use `defaultRuntime` for I/O, enabling testing:

```typescript
import { defaultRuntime } from "../runtime.js";

defaultRuntime.log("Output message");
defaultRuntime.error("Error message");
defaultRuntime.exit(1);
```

### Error Handling Pattern

```typescript
import { runCommandWithRuntime } from "../cli-utils.js";

.action(async (opts) => {
  await runCommandWithRuntime(defaultRuntime, async () => {
    await myCommand(opts, defaultRuntime);
  });
});
```

### Progress Indicators

```typescript
import { withProgress, withProgressTotals } from "../progress.js";

await withProgress(
  { label: "Indexing...", total: 100 },
  async (progress) => {
    progress.tick();
    progress.setLabel("Processing file...");
  }
);
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENCLAW_DISABLE_LAZY_SUBCOMMANDS` | Disable lazy loading (load all commands eagerly) |
| `OPENCLAW_CONFIG_PATH` | Override config file path |
| `OPENCLAW_STATE_DIR` | Override state directory |
| `OPENCLAW_CONFIG_CACHE_MS` | Config cache TTL (default: 200ms, 0 to disable) |
| `OPENCLAW_DISABLE_CONFIG_CACHE` | Disable config caching entirely |

---

*This document provides upstream reference for Nexus CLI design. See `interface/cli/upstream/UPSTREAM_CLI.md` for the comparison summary.*
