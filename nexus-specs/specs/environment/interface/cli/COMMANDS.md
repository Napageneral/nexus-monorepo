# Nexus CLI Commands Specification

**Status:** SPEC COMPLETE  
**Last Updated:** 2026-01-26  
**Sources:** `nexus-cli/.intent/specs/02_CLI_REFERENCE.md`, `nexus-cli/src/`

---

## Table of Contents

1. [Philosophy](#philosophy)
2. [Complete Command Tree](#complete-command-tree)
3. [Status Legend](#status-legend)
4. [Orientation Commands](#orientation-commands)
5. [Skill Commands](#skill-commands)
6. [Credential Commands](#credential-commands)
7. [Config Commands](#config-commands)
8. [Workspace Commands](#workspace-commands)
9. [Cloud & Sync Commands](#cloud--sync-commands)
10. [Gateway Commands](#gateway-commands)
11. [Utility Commands](#utility-commands)
12. [Additional Subcommand Groups](#additional-subcommand-groups)
13. [Unregistered Commands](#unregistered-commands)
14. [Not Implemented](#not-implemented)
15. [Source Reference](#source-reference)

---

## Philosophy

The `nexus` CLI is a **discovery and guidance system**. It helps agents:

1. Orient themselves (`nexus status`)
2. Discover capabilities (`nexus capabilities`)
3. Access skill guides (`nexus skills use`)
4. Manage credentials (`nexus credential`)

**It does NOT wrap tool execution.** After reading a skill guide, agents use tools directly.

---

## Complete Command Tree

```bash
nexus
├── status                          # Main entry point - orientation
├── capabilities                    # Full capability map
├── map                             # Alias for capabilities
├── identity [target]               # Show identity file paths
├── quest                           # Show onboarding quests
├── suggestions                     # Suggest next actions from usage history
│
├── skills                          # Unified skills command
│   ├── list                        # List installed skills
│   │   ├── --tools                 # Filter: tools only
│   │   ├── --connectors            # Filter: connectors only
│   │   ├── --guides                # Filter: guides only
│   │   └── --domain <domain>       # Filter by domain
│   ├── use <name>                  # Show SKILL.md guide (for agents)
│   ├── info <name>                 # Show detailed skill info
│   ├── search <query>              # Search local + hub
│   │   ├── --local                 # Local only
│   │   ├── --hub                   # Hub only
│   │   └── --capability <cap>      # Filter by capability
│   ├── install <slug>              # Install from hub
│   ├── update <slug>               # Update from hub
│   │   └── --all                   # Update all managed skills
│   ├── updates                     # Check for available updates
│   ├── reset <name>                # Reset to hub version
│   ├── diff <name>                 # Show local modifications
│   ├── verify <name>               # Check requirements met
│   ├── scan                        # Regenerate manifest
│   └── stats [name]                # Show usage statistics
│
├── credential
│   ├── list                        # List credentials from index
│   ├── verify <service>            # Verify credential status
│   ├── get [service/account]       # Get credential value
│   ├── add                         # Add a credential record
│   ├── import <source>             # Import from claude-cli or codex-cli
│   ├── expose                      # Approve for gateway access
│   ├── revoke                      # Revoke gateway access
│   ├── remove                      # Remove credential record
│   ├── scan                        # Scan env vars for credentials
│   └── flag                        # Mark broken or clear flag
│
├── config
│   ├── (no subcommand)             # Show config path and status
│   ├── list                        # List all config values
│   ├── get <key>                   # Get a config value
│   └── set <key> <value>           # Set a config value
│
├── init [workspace]                # Create new workspace
│
├── bindings                        # Harness bindings (Cursor, Claude Code, etc.)
│   ├── detect                      # Detect harnesses via AIX
│   ├── list                        # Show binding status
│   ├── create <harness>            # Create binding
│   ├── verify [harness]            # Verify bindings
│   ├── refresh [harness]           # Regenerate bindings
│   └── remove <harness>            # Remove binding
│
├── login                           # Sign in to Nexus (Hub + Cloud)
├── dashboard                       # Open Control UI
├── update                          # Update nexus CLI
│
├── gateway                         # Gateway server commands
│   ├── (no subcommand)             # Run the Gateway (foreground)
│   ├── call <method>               # Call a Gateway RPC method
│   ├── health                      # Fetch Gateway health
│   ├── status                      # Fetch Gateway status
│   ├── wake                        # Enqueue system event
│   ├── send                        # Send a message
│   ├── agent                       # Run agent turn via Gateway
│   ├── stop                        # Stop Gateway service
│   ├── restart                     # Restart Gateway service
│   └── uninstall                   # Uninstall Gateway service
│
├── gateway-daemon                  # Run as long-lived daemon
│
├── cloud                           # Cloud CLI passthrough
│   └── login                       # Sign in (handled specially)
│
├── collab                          # Collaboration spaces
├── dns                             # DNS management
├── log                             # Log viewing
├── memory                          # Memory search
├── tool                            # Tool connector management
└── usage                           # Usage tracking
```

---

## Status Legend

| Emoji | Status | Meaning |
|-------|--------|---------|
| ✅ | `active` | Configured AND has been used |
| ⭐ | `ready` | Configured but never used — try it! |
| 🔧 | `needs-setup` | Installed but needs credentials/config |
| 📥 | `needs-install` | Tool needs to be installed |
| ⛔ | `unavailable` | Not available on this platform |
| ❌ | `broken` | Was working, now failing |

---

## Orientation Commands

### `nexus status`

**Implementation:** `src/commands/status.ts` ✓ Registered

Main entry point for agents. Shows current state, capabilities, and suggestions.

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `--brief` | Compact output |
| `--capabilities` | Focus on capabilities |
| `--credentials` | Focus on credentials |
| `--usage` | Focus on usage statistics |
| `--quiet` | Minimal output, exit codes only |

**Example Output:**

```
╔════════════════════════════════════════════════════════════════╗
║                        Nexus Status                            ║
║                        darwin/arm64                            ║
╚════════════════════════════════════════════════════════════════╝

👤 Identity
   User: Tyler
         → state/user/IDENTITY.md
   
   Agent: Echo
         → state/agents/echo/IDENTITY.md
         → state/agents/echo/SOUL.md

🔑 Credentials (12 configured)
   ✅ anthropic, openai, gemini
   ✅ google-oauth, github, discord
   ❌ twitter - broken

🎯 Capabilities (18/58 active)
   ✅ email-read, email-send
   ✅ messaging-read
   ⭐ chat-read, chat-send (ready, unused)

📊 Most used: gog (47), eve (23)

🎯 Suggestions
   1. Try Discord - configured but never used
   2. Fix twitter credentials
```

**Bootstrap Detection:** If identity files don't exist, shows bootstrap instructions instead.

---

### `nexus capabilities`

**Implementation:** `src/commands/capabilities.ts` ✓ Registered

Full capability map showing everything possible.

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `--category <name>` | Filter by category |
| `--status <status>` | Filter by status |

**Example Output:**

```
╔════════════════════════════════════════════════════════════════╗
║                     Nexus Capabilities                         ║
╚════════════════════════════════════════════════════════════════╝

Legend: ✅ active  ⭐ ready  🔧 needs-setup  📥 needs-install  ⛔ unavailable

🗣️ Communication (7/8)
   ✅ email-read ─────── gog + google-oauth
   ✅ email-send ─────── gog + google-oauth
   ✅ messaging-read ─── eve, imsg
   ⭐ chat-read ──────── discord (ready)

📱 Social & News (2/5)
   ✅ social-x ───────── bird + twitter
   🔧 news ───────────── brave-search (needs API key)

Summary: 18 active │ 8 ready │ 5 needs-setup
```

---

### `nexus map`

**Implementation:** `src/commands/capabilities.ts` ✓ Registered

Alias for `nexus capabilities`.

---

### `nexus identity`

**Implementation:** `src/commands/identity.ts` ✓ Registered

Show paths to identity documents.

```bash
nexus identity [user|agent]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

**Example Output:**

```
👤 User Identity
   → state/user/IDENTITY.md

🤖 Agent Identity (Echo)
   → state/agents/echo/IDENTITY.md
   → state/agents/echo/SOUL.md
   → state/agents/echo/MEMORY.md
```

---

### `nexus quest`

**Implementation:** `src/commands/quest.ts` ✓ Registered

Show onboarding quests to guide users through setup.

---

### `nexus suggestions`

**Implementation:** `src/commands/suggestions.ts` ✓ Registered

Suggest next actions based on local usage history.

---

## Skills Commands

All skill operations are unified under `nexus skills`. See `../../capabilities/skills/SKILL_CLI.md` for complete specification.

### `nexus skills list`

**Implementation:** `src/cli/skills-cli.ts` ✓ Registered

List installed skills.

| Option | Description |
|--------|-------------|
| `--tools` | Filter: tools only |
| `--connectors` | Filter: connectors only |
| `--guides` | Filter: guides only |
| `--domain <domain>` | Filter by domain |
| `--json` | Output as JSON |

**Example Output:**

```
Tools:
  ✅ gog              Google Workspace CLI              email, calendar
  ⭐ eve              iMessage bridge                   messaging
  📥 tmux             Terminal multiplexer              terminal

Connectors:
  ✅ google-oauth     Google OAuth setup                enables: google
  🔧 anthropic        Anthropic API setup               enables: anthropic

Guides:
  ✅ filesystem       File system operations            files
```

---

### `nexus skills use <name>`

**Implementation:** `src/cli/skills-cli.ts` ✓ Registered

**Primary command.** Returns the SKILL.md guide for agent consumption.

**Behavior:**
- Looks up skill in `skills/tools/`, `skills/connectors/`, or `skills/guides/`
- Returns the full SKILL.md content
- Logs usage to `state/skills/{name}/usage.log`

---

### `nexus skills info <name>`

**Implementation:** `src/cli/skills-cli.ts` ✓ Registered

Show detailed local information about a skill.

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

**Example Output:**

```
Name:           gog
Type:           tool
Version:        2.3.1
Status:         ✅ active
Source:         managed (hub)

Capabilities:   email, calendar, contacts
Requires:
  Credentials:  google — ✅ configured
  Binaries:     gog — ✅ found

Hub:
  Slug:         gog
  Installed:    2.3.1
  Latest:       2.4.0 ⬆️

Location:       ~/nexus/skills/tools/gog/
```

---

### `nexus skills search <query>`

**Implementation:** `src/cli/skills-hub-cli.ts` ✓ Registered

Search both local skills and hub.

| Option | Description |
|--------|-------------|
| `--local` | Local only |
| `--hub` | Hub only |
| `--capability <cap>` | Filter by capability |

---

### `nexus skills install <slug>`

**Implementation:** `src/cli/skills-hub-cli.ts` ✓ Registered

Install a skill from the hub.

```bash
nexus skills install gog              # Latest version
nexus skills install gog@2.3.1        # Specific version
```

---

### `nexus skills update <slug>`

**Implementation:** `src/cli/skills-hub-cli.ts` ✓ Registered

Update a skill to latest version.

| Option | Description |
|--------|-------------|
| `--all` | Update all managed skills |
| `--force` | Overwrite local modifications |

---

### `nexus skills updates`

**Implementation:** `src/cli/skills-hub-cli.ts` ✓ Registered

Check all managed skills for available updates.

---

### `nexus skills reset <name>`

**Implementation:** TODO

Reset a managed skill to its hub version (discards local modifications).

---

### `nexus skills diff <name>`

**Implementation:** TODO

Show local modifications to a managed skill.

---

### `nexus skills verify <name>`

**Implementation:** `src/cli/skills-cli.ts` ✓ Registered

Check if a skill's requirements are met.

---

### `nexus skills scan`

**Implementation:** `src/cli/skills-cli.ts` ✓ Registered

Regenerate the skills manifest by scanning skill directories.

---

### `nexus skills stats [name]`

**Implementation:** `src/cli/skills-cli.ts` ✓ Registered

Show usage statistics for skills.

---

## Credential Commands

### `nexus credential list`

**Implementation:** `src/cli/credential-cli.ts` ✓ Registered

List all configured credentials.

| Option | Description |
|--------|-------------|
| `--service <name>` | Filter by service |
| `--broken` | Only show broken credentials |
| `--json` | Output as JSON |

---

### `nexus credential add`

**Implementation:** `src/cli/credential-cli.ts` ✓ Registered

Add a new credential. Can be interactive or flag-based.

```bash
# Interactive
nexus credential add

# Non-interactive
nexus credential add \
  --service anthropic \
  --account tyler@anthropic.com \
  --type api-key \
  --storage keychain \
  --value "sk-ant-xxxxx"
```

| Option | Description |
|--------|-------------|
| `--service` | Service name (required for non-interactive) |
| `--account` | Account identifier (email/username) (required) |
| `--type` | Credential type (`api-key`, `oauth`, `token`, `config`) (required) |
| `--storage` | Storage provider (`keychain`, `1password`, `env`, `external`) |
| `--value` | Secret value (for keychain storage) |

---

### `nexus credential get <service/account>`

**Implementation:** `src/cli/credential-cli.ts` ✓ Registered

Retrieve a credential value for scripts/agents.

```bash
nexus credential get anthropic/tyler@anthropic.com
# Output: sk-ant-xxxxx (just the value)

# With explicit auth id:
nexus credential get anthropic/tyler@anthropic.com/api_key
```

---

### `nexus credential verify <service>`

**Implementation:** `src/cli/credential-cli.ts` ✓ Registered

Test that credentials work for a given service.

```bash
nexus credential verify google-oauth
```

---

### `nexus credential import <source>`

**Implementation:** `src/cli/credential-cli.ts` ✓ Registered

Import credentials from external CLI tools.

```bash
nexus credential import claude-cli
nexus credential import codex-cli
```

---

### `nexus credential scan`

**Implementation:** `src/cli/credential-cli.ts` ✓ Registered

Detect credentials from environment variables.

| Option | Description |
|--------|-------------|
| `--deep` | Scan all env vars (pattern matching) |
| `--import` | Import found credentials |
| `--yes` | Skip confirmation prompts |

```bash
nexus credential scan              # Known variables only
nexus credential scan --deep       # All env vars (pattern matching)
nexus credential scan --import     # Import found credentials
nexus credential scan --deep --yes # Skip confirmation prompts
```

---

### `nexus credential expose`

**Implementation:** `src/cli/credential-cli.ts` ✓ Registered

Approve a credential for gateway access.

---

### `nexus credential revoke`

**Implementation:** `src/cli/credential-cli.ts` ✓ Registered

Revoke gateway access for a credential.

---

### `nexus credential remove`

**Implementation:** `src/cli/credential-cli.ts` ✓ Registered

Remove a credential record.

---

### `nexus credential flag`

**Implementation:** `src/cli/credential-cli.ts` ✓ Registered

Mark a credential as broken or clear the broken flag.

---

## Config Commands

### `nexus config`

**Implementation:** `src/commands/config.ts` ✓ Registered

Without a subcommand, shows the config path and status.

**Config Location:** `~/nexus/state/nexus/config.json`  
**Override:** `NEXUS_CONFIG_PATH` env var  
**Format:** JSON5 (comments allowed)

---

### `nexus config list`

**Implementation:** `src/commands/config.ts` ✓ Registered

List all config values.

---

### `nexus config get <key>`

**Implementation:** `src/commands/config.ts` ✓ Registered

Get a config value by dot-path.

```bash
nexus config get credential-store
nexus config get gateway.port
nexus config get agent.model
```

---

### `nexus config set <key> <value>`

**Implementation:** `src/commands/config.ts` ✓ Registered

Set a config value by dot-path.

```bash
nexus config set credential-store keychain
nexus config set gateway.port 8080
```

---

## Workspace Commands

### `nexus init`

**Implementation:** `src/commands/init.ts` ✓ Registered

Create a new nexus workspace.

```bash
nexus init              # Create at ~/nexus
nexus init /path/to     # Create at specific path
```

**Creates:**
- Folder structure (`skills/`, `state/`, `home/`)
- Root `AGENTS.md`
- `.cursor/rules`
- `.cursor/hooks.json`
- `.cursor/hooks/nexus-session-start.js`
- Empty identity templates

---

## Cloud & Sync Commands

### `nexus login`

**Implementation:** `src/cli/cloud-cli.ts` → `handleCloudLogin()` ✓ Registered

Sign in to Nexus (Hub + Cloud sync).

---

### `nexus dashboard`

**Implementation:** `src/commands/dashboard.ts` ✓ Registered

Open the Control UI with your current token.

---

### `nexus cloud`

**Implementation:** `src/cli/cloud-cli.ts` ✓ Registered

Cloud CLI passthrough to the Rust `nexus-cloud-rs` binary.

```bash
nexus cloud login    # Sign in (handled specially)
nexus cloud ...      # Other args forwarded to Rust CLI
```

---

### `nexus update`

**Implementation:** `src/commands/update.ts` ✓ Registered

Update the nexus CLI to the latest version.

---

## Gateway Commands

### `nexus gateway`

**Implementation:** `src/cli/gateway-cli.ts` ✓ Registered

Run the Gateway server in the foreground.

| Option | Description |
|--------|-------------|
| `--port` | Port for WebSocket |
| `--bind` | Binding mode (`loopback`, `tailnet`, `lan`, `auto`) |
| `--token` | Auth token |
| `--auth` | Auth method (`token`, `password`) |
| `--password` | Password for auth |
| `--tailscale` | Tailscale mode (`off`, `serve`, `funnel`) |
| `--force` | Kill existing listener |

---

### `nexus gateway call <method>`

**Implementation:** `src/cli/gateway-cli.ts` ✓ Registered

Call a Gateway RPC method.

---

### `nexus gateway health`

**Implementation:** `src/cli/gateway-cli.ts` ✓ Registered

Fetch Gateway health status.

---

### `nexus gateway status`

**Implementation:** `src/cli/gateway-cli.ts` ✓ Registered

Fetch Gateway status information.

---

### `nexus gateway wake`

**Implementation:** `src/cli/gateway-cli.ts` ✓ Registered

Enqueue a system event.

---

### `nexus gateway send`

**Implementation:** `src/cli/gateway-cli.ts` ✓ Registered

Send a message through the Gateway.

---

### `nexus gateway agent`

**Implementation:** `src/cli/gateway-cli.ts` ✓ Registered

Run an agent turn via the Gateway.

---

### `nexus gateway stop`

**Implementation:** `src/cli/gateway-cli.ts` ✓ Registered

Stop the Gateway service.

---

### `nexus gateway restart`

**Implementation:** `src/cli/gateway-cli.ts` ✓ Registered

Restart the Gateway service.

---

### `nexus gateway uninstall`

**Implementation:** `src/cli/gateway-cli.ts` ✓ Registered

Uninstall the Gateway service.

---

### `nexus gateway-daemon`

**Implementation:** `src/cli/gateway-cli.ts` ✓ Registered

Run the Gateway as a long-lived daemon (for launchd/systemd).

---

## Utility Commands

### `nexus collab`

**Implementation:** `src/cli/collab-cli.ts` ✓ Registered

Collaboration spaces management.

---

### `nexus dns`

**Implementation:** `src/cli/dns-cli.ts` ✓ Registered

DNS management.

---

### `nexus log`

**Implementation:** `src/cli/log-cli.ts` ✓ Registered

Log viewing and management.

---

### `nexus memory`

**Implementation:** `src/cli/memory-cli.ts` ✓ Registered

Memory search and management.

---

### `nexus tool`

**Implementation:** `src/cli/tool-connector-cli.ts` ✓ Registered

Tool connector management.

---

### `nexus usage`

**Implementation:** `src/cli/usage-cli.ts` ✓ Registered

Usage tracking and statistics.

---

## Additional Subcommand Groups

These CLI files exist and may be registered elsewhere or used internally:

| Group | File | Purpose |
|-------|------|---------|
| `nexus skills` | `src/cli/skills-hub-cli.ts` | Skills Hub integration |
| Browser | `src/cli/browser-cli.ts` | Browser automation |
| Cron | `src/cli/cron-cli.ts` | Cron scheduling |
| Canvas | `src/cli/canvas-cli.ts` | Canvas host control |
| Nodes | `src/cli/nodes-cli.ts` | Node discovery/bridge |
| Models | `src/cli/models-cli.ts` | Model management |
| Hooks | `src/cli/hooks-cli.ts` | Webhook hooks |
| Telegram | `src/cli/telegram-cli.ts` | Telegram-specific |
| Pairing | `src/cli/pairing-cli.ts` | Device pairing |
| TUI | `src/cli/tui-cli.ts` | Terminal UI |
| Plugins | `src/cli/plugins-cli.ts` | Plugin management |

---

## Unregistered Commands

These commands are **implemented** but **NOT registered** in `src/cli/program.ts`. They exist as exported functions but cannot be invoked via CLI without modification.

### `configureCommand()` - Interactive Setup Wizard

**File:** `src/commands/configure.ts`

Interactive wizard for comprehensive Nexus setup:
- Workspace setup
- Model/auth configuration
- Gateway config
- Daemon installation
- Provider setup (WhatsApp, Telegram, etc.)
- Skills installation
- Health check

**To register:**
```typescript
program
  .command("configure")
  .description("Interactive setup wizard")
  .action(async () => {
    await configureCommand(defaultRuntime);
  });
```

---

### `resetCommand()` - Cleanup Directories

**File:** `src/commands/reset.ts`

⚠️ **Dangerous command** - removes Nexus directories.

| Option | Description |
|--------|-------------|
| `--local` | Remove workspace directory (`~/nexus/home`) |
| `--state` | Remove state directory (`~/nexus/state`) |
| `--all` | Remove both directories |
| `--confirm` | Required flag to actually delete (dry-run without it) |
| `--workspace <path>` | Custom workspace path |

**To register:**
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

---

### `claudeMdCommand()` - Generate CLAUDE.md

**File:** `src/commands/claude-md.ts`

Generates a `CLAUDE.md` file for Claude Code integration.

| Option | Description |
|--------|-------------|
| `--workspace <path>` | Workspace directory |

**To register:**
```typescript
program
  .command("claude-md")
  .description("Generate CLAUDE.md for Claude Code")
  .option("--workspace <path>", "Workspace directory")
  .action(async (opts) => {
    await claudeMdCommand(opts, defaultRuntime);
  });
```

---

### `onboardCommand()` - Full Onboarding Flow

**File:** `src/commands/onboard.ts`

Comprehensive onboarding experience for new users.

---

### `setupCommand()` - Quick Setup

**File:** `src/commands/setup.ts`

Quick setup for common configurations.

---

### `doctorCommand()` - Diagnostic Tool

**File:** `src/commands/doctor.ts`

Diagnostic checks for troubleshooting Nexus installation and configuration.

---

## Bindings Commands

Harness bindings connect external AI coding assistants (Cursor, Claude Code, OpenCode) to Nexus.

> **Note:** These are **harness bindings** (IDE integrations), not to be confused with **routing bindings** (message routing config in `routing.bindings`).

### `nexus bindings detect`

**Implementation:** TODO

Detect installed harnesses via AIX, ranked by usage frequency.

**Requires:** AIX (`aix` binary and `~/.aix/aix.db`)

```bash
nexus bindings detect
nexus bindings detect --json
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

**Output:**

```
Detected Harnesses (via AIX)

  1. cursor        847 sessions    (supported ✅)
  2. claude-code   312 sessions    (supported ✅)
  3. opencode       45 sessions    (supported ✅)
  4. codex          12 sessions    (not supported ⛔)

Recommendation: Create bindings for cursor and claude-code
```

---

### `nexus bindings list`

**Implementation:** TODO

Show current binding status by scanning filesystem.

```bash
nexus bindings list
nexus bindings list --json
```

**Output:**

```
Harness Bindings

  ✅ cursor        .cursor/hooks.json, .cursor/hooks/nexus-session-start.js
  ✅ claude-code   CLAUDE.md, .claude/settings.json
  ❌ opencode      Not configured
  ⛔ codex         Not supported (no hooks available)
```

---

### `nexus bindings create <harness>`

**Implementation:** TODO

Create binding files for a specific harness.

```bash
nexus bindings create cursor
nexus bindings create claude-code
nexus bindings create opencode
nexus bindings create codex        # Returns error (not supported)
```

**Supported harnesses:** `cursor`, `claude-code`, `opencode`

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing files |

---

### `nexus bindings verify [harness]`

**Implementation:** TODO

Verify binding files exist and are correctly configured.

```bash
nexus bindings verify              # Verify all
nexus bindings verify cursor       # Verify specific
```

---

### `nexus bindings refresh [harness]`

**Implementation:** TODO

Regenerate binding files from latest templates.

```bash
nexus bindings refresh             # Refresh all
nexus bindings refresh cursor      # Refresh specific
```

---

### `nexus bindings remove <harness>`

**Implementation:** TODO

Remove binding files for a harness.

```bash
nexus bindings remove cursor
nexus bindings remove --force cursor    # Skip confirmation
```

| Option | Description |
|--------|-------------|
| `--force` | Skip confirmation prompt |

---

**Full specification:** See `../../foundation/harnesses/HARNESS_BINDINGS.md`

---

## Not Implemented

These commands are referenced in documentation or discussions but **do not exist** in the codebase.

| Command | Status | Notes |
|---------|--------|-------|
| `nexus context` | **Not implemented** | No code exists. Closest: `nexus identity` |
| `nexus generate` | **Not implemented** | `claudeMdCommand` exists but not as "generate" |

### Message Routing Bindings (Config Only)

Message routing bindings (which agent handles which channel) exist in the config schema but have no CLI management:

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

This is separate from harness bindings. To add routing bindings CLI, would need to implement `nexus routing bindings list/add/remove` that reads/writes the `routing.bindings` array in config.

---

## JSON Output

All orientation and query commands support `--json` for programmatic use:

```bash
nexus status --json
nexus capabilities --json
nexus skills list --json
nexus skills info gog --json
nexus credential list --json
```

---

## Agent Workflow Example

Typical agent session:

```bash
# 1. Orient
nexus status

# 2. Read identity files (paths from status)
# (agent reads directly)

# 3. Need to use a capability? Get the skill guide
nexus skills use gog

# 4. Follow the guide, use the tool directly
gog gmail search "is:unread"

# 5. If credentials fail
nexus credential verify google-oauth

# 6. Grow capabilities
nexus capabilities --status needs-setup
```

---

## Configuration Reference

### Config File Location

**Path:** `~/nexus/state/nexus/config.json`  
**Override:** `NEXUS_CONFIG_PATH` env var  
**Format:** JSON5 (comments allowed)

### State Directory

**Path:** `~/nexus/state`  
**Override:** `NEXUS_STATE_DIR` env var

**Contains:**
- `nexus/config.json` - Main config
- `credentials/` - Credential records
- `sessions/` - Session transcripts
- `agents/` - Agent state (identities, memory)
- `skills/` - Skill state and usage data
- `logs/` - Log files

### Config Schema Sections

**Type definition:** `src/config/types.ts` - `NexusConfig` interface

Major sections:
- `auth` - Auth profiles
- `agent` - Agent defaults (model, workspace, timeouts, sandbox)
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

## Documentation vs Implementation Gap Summary

### AGENTS.md Documents These (Core)

- `status`, `capabilities`, `identity`
- `skill` (list, use, info)
- `credential` (list, add, get, verify, remove, scan, import, flag)
- `config` (list, get, set)

### Implementation Has More (Additional)

**Top-level commands:**
- `init`, `login`, `dashboard`, `map`, `quest`, `update`, `suggestions`
- `gateway`, `gateway-daemon`
- `cloud`, `collab`, `dns`, `log`, `memory`, `tool`, `usage`

**Additional skill subcommands:**
- `scan`, `verify`, `stats`

**Additional credential subcommands:**
- `expose`, `revoke`

### Recommendations

1. **Register existing commands:** `configure`, `reset`, `doctor`, `setup`, `onboard` are implemented but not CLI-accessible.

2. **Add bindings CLI:** If agent bindings need runtime management, add `nexus bindings list/add/remove`.

3. **Update AGENTS.md:** The root documentation understates the actual CLI capabilities significantly.

4. **Consider `nexus generate`:** If CLAUDE.md/AGENTS.md generation is desired, expose `claudeMdCommand` as `nexus generate claude-md` or similar.

---

## Source Reference

Primary specification:
```
~/nexus/home/projects/nexus/nexus-cli/.intent/specs/02_CLI_REFERENCE.md
```

Implementation research:
```
~/nexus/home/projects/nexus/worktrees/bulk-sync/.upstream-sync/nexus-specs/specs/cli/CURRENT_CLI_RESEARCH.md
```

Agent bindings context:
```
~/nexus/home/projects/nexus/nexus-cli/.intent/specs/07_AGENT_BINDINGS.md
```

Source code:
```
~/nexus/home/projects/nexus/nexus-cli/src/cli/
~/nexus/home/projects/nexus/nexus-cli/src/commands/
```

---

*Specification complete. Last updated 2026-01-26.*
