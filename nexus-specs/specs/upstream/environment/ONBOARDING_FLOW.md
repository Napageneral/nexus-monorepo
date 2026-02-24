# OpenClaw Onboarding Flow

**Status:** REFERENCE DOCUMENT  
**Source:** OpenClaw upstream (`openclaw/`)  
**Last Updated:** 2026-02-04

---

## Overview

OpenClaw's onboarding flow is handled by `openclaw onboard`, which:

1. Acknowledges security risks
2. Configures authentication (API keys, OAuth)
3. Sets up the workspace directory
4. Configures the gateway (port, auth, bind address)
5. Sets up channels (WhatsApp, Telegram, Discord, etc.)
6. Configures skills and hooks
7. Installs the gateway daemon
8. Runs health checks
9. Launches the TUI for the bootstrap conversation

---

## Command Entry Point

```typescript
// src/commands/onboard.ts

export async function onboardCommand(opts: OnboardOptions, runtime: RuntimeEnv) {
  // Normalize legacy auth choices
  const authChoice = opts.authChoice === "oauth" 
    ? "setup-token" 
    : opts.authChoice;

  // Non-interactive requires explicit risk acknowledgement
  if (opts.nonInteractive && opts.acceptRisk !== true) {
    runtime.error("Non-interactive onboarding requires explicit risk acknowledgement.");
    runtime.exit(1);
  }

  // Handle reset if requested
  if (opts.reset) {
    await handleReset("full", workspaceDir, runtime);
  }

  // Route to appropriate handler
  if (opts.nonInteractive) {
    await runNonInteractiveOnboarding(opts, runtime);
  } else {
    await runInteractiveOnboarding(opts, runtime);
  }
}
```

---

## Onboard Options

```typescript
// src/commands/onboard-types.ts

export type OnboardOptions = {
  // Mode selection
  mode?: "local" | "remote";
  flow?: "quickstart" | "advanced" | "manual";
  
  // Workspace
  workspace?: string;
  
  // Interactive behavior
  nonInteractive?: boolean;
  acceptRisk?: boolean;
  
  // Reset
  reset?: boolean;
  
  // Authentication
  authChoice?: AuthChoice;
  token?: string;
  tokenProvider?: string;
  tokenProfileId?: string;
  tokenExpiresIn?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
  geminiApiKey?: string;
  // ... many more provider-specific keys
  
  // Gateway
  gatewayPort?: number;
  gatewayBind?: "loopback" | "lan" | "auto" | "custom" | "tailnet";
  gatewayAuth?: "token" | "password";
  gatewayToken?: string;
  gatewayPassword?: string;
  
  // Tailscale
  tailscale?: "off" | "serve" | "funnel";
  tailscaleResetOnExit?: boolean;
  
  // Daemon
  installDaemon?: boolean;
  daemonRuntime?: GatewayDaemonRuntime;
  
  // Skip flags
  skipChannels?: boolean;
  skipSkills?: boolean;
  skipHealth?: boolean;
  skipUi?: boolean;
  
  // Package manager
  nodeManager?: "npm" | "pnpm" | "bun";
  
  // Remote gateway
  remoteUrl?: string;
  remoteToken?: string;
  
  // Output
  json?: boolean;
};
```

---

## Auth Choice Options

```typescript
export type AuthChoice =
  // Anthropic
  | "setup-token"           // Anthropic OAuth via setup token
  | "token"                 // Raw API token
  | "oauth"                 // Legacy alias for setup-token
  | "claude-cli"            // Deprecated: Claude CLI
  
  // OpenAI
  | "openai-codex"          // OpenAI Codex OAuth
  | "openai-api-key"        // OpenAI API key
  | "codex-cli"             // Deprecated
  
  // Third-party providers
  | "chutes"                // Chutes.ai
  | "openrouter-api-key"
  | "ai-gateway-api-key"
  | "cloudflare-ai-gateway-api-key"
  | "moonshot-api-key"
  | "kimi-code-api-key"
  | "synthetic-api-key"
  | "venice-api-key"
  
  // Google
  | "gemini-api-key"
  | "google-antigravity"
  | "google-gemini-cli"
  
  // Other
  | "zai-api-key"
  | "xiaomi-api-key"
  | "minimax-cloud"
  | "minimax-api"
  | "opencode-zen"
  | "github-copilot"
  | "copilot-proxy"
  | "qwen-portal"
  
  | "skip";                 // Skip auth setup
```

---

## Interactive Onboarding Flow

### Step-by-Step Sequence

```typescript
// Simplified from wizard/onboarding.ts

async function runOnboardingWizard(opts, runtime, prompter) {
  // 1. Header and intro
  printWizardHeader(runtime);  // ASCII art banner
  await prompter.intro("OpenClaw onboarding");
  
  // 2. Security acknowledgement
  await requireRiskAcknowledgement({ opts, prompter });
  
  // 3. Existing config handling
  const snapshot = await readConfigFileSnapshot();
  if (snapshot.exists) {
    const action = await prompter.select({
      message: "Config handling",
      options: [
        { value: "keep", label: "Use existing values" },
        { value: "modify", label: "Update values" },
        { value: "reset", label: "Reset" },
      ],
    });
  }
  
  // 4. Flow selection (QuickStart vs Advanced)
  const flow = await prompter.select({
    message: "Onboarding mode",
    options: [
      { value: "quickstart", label: "QuickStart", hint: "Configure details later" },
      { value: "advanced", label: "Advanced", hint: "Configure port, network, Tailscale, auth" },
    ],
  });
  
  // 5. Mode selection (local vs remote gateway)
  const mode = await prompter.select({
    message: "What do you want to set up?",
    options: [
      { value: "local", label: "Local gateway (this machine)" },
      { value: "remote", label: "Remote gateway (info-only)" },
    ],
  });
  
  // 6. Workspace directory
  const workspaceInput = await prompter.text({
    message: "Workspace directory",
    initialValue: "~/.openclaw/workspace",
  });
  
  // 7. Auth choice
  const authChoice = await promptAuthChoiceGrouped({
    prompter,
    store: authStore,
    includeSkip: true,
  });
  
  // 8. Model selection
  const modelSelection = await promptDefaultModel({
    config: nextConfig,
    prompter,
    allowKeep: true,
  });
  
  // 9. Gateway configuration (Advanced only)
  const gateway = await configureGatewayForOnboarding({ flow, ... });
  
  // 10. Channel setup
  nextConfig = await setupChannels(nextConfig, runtime, prompter);
  
  // 11. Write config, create workspace
  await writeConfigFile(nextConfig);
  await ensureWorkspaceAndSessions(workspaceDir, runtime);
  
  // 12. Skills setup
  nextConfig = await setupSkills(nextConfig, workspaceDir, runtime, prompter);
  
  // 13. Hooks setup
  nextConfig = await setupInternalHooks(nextConfig, runtime, prompter);
  
  // 14. Finalize
  await finalizeOnboardingWizard({ ... });
}
```

### QuickStart vs Advanced Mode

| Aspect | QuickStart | Advanced |
|--------|------------|----------|
| Gateway port | Default (18789) | User-configurable |
| Bind address | Loopback (127.0.0.1) | User-selectable |
| Auth mode | Token (auto-generated) | Token/Password choice |
| Tailscale | Skipped | Optional (off/serve/funnel) |
| Channel config | Quick-eligible only | Per-channel |
| DM policy | Defaults | User-selectable |

---

## Non-Interactive Onboarding

For automation and CI/CD:

```bash
# Basic non-interactive setup
openclaw onboard --non-interactive --accept-risk \
  --auth-choice setup-token \
  --workspace ~/.openclaw/workspace \
  --install-daemon

# With API key
openclaw onboard --non-interactive --accept-risk \
  --auth-choice token \
  --anthropic-api-key sk-ant-... \
  --install-daemon

# Remote gateway mode
openclaw onboard --non-interactive --accept-risk \
  --mode remote \
  --remote-url wss://gateway.example.com \
  --remote-token xxx
```

### Required Flags

- `--non-interactive` — Enable non-interactive mode
- `--accept-risk` — Acknowledge security risks (required for non-interactive)
- `--auth-choice` — Authentication method

### Skip Flags

```bash
--skip-channels    # Skip channel setup
--skip-skills      # Skip skills setup
--skip-health      # Skip health check
--skip-ui          # Skip Control UI asset build
```

---

## Reset Scopes

The `--reset` flag triggers cleanup before onboarding:

```typescript
export type ResetScope = 
  | "config"                    // Just openclaw.json
  | "config+creds+sessions"     // Config + credentials + session transcripts
  | "full";                     // All above + workspace directory
```

### Reset Behavior

```typescript
async function handleReset(scope: ResetScope, workspaceDir: string, runtime: RuntimeEnv) {
  switch (scope) {
    case "config":
      await fs.rm(configPath, { force: true });
      break;
      
    case "config+creds+sessions":
      await fs.rm(configPath, { force: true });
      await fs.rm(credentialsDir, { recursive: true, force: true });
      await fs.rm(sessionsDir, { recursive: true, force: true });
      break;
      
    case "full":
      await fs.rm(configPath, { force: true });
      await fs.rm(credentialsDir, { recursive: true, force: true });
      await fs.rm(sessionsDir, { recursive: true, force: true });
      await fs.rm(workspaceDir, { recursive: true, force: true });
      break;
  }
}
```

---

## Channel Onboarding

### Channel Selection

Channels are sorted by `quickstartScore` (higher = easier to set up):

```typescript
type ChannelOnboardingStatus = {
  channel: ChannelId;
  configured: boolean;        // Already has credentials
  statusLines: string[];      // Display text
  selectionHint?: string;     // Hint next to option
  quickstartScore?: number;   // Sorting priority
};
```

### DM Policy Options

```typescript
type DmPolicy = 
  | "pairing"      // Unknown senders get pairing code; owner approves
  | "allowlist"    // Only allowFrom contacts can initiate
  | "open"         // Anyone can DM (requires allowFrom: ["*"])
  | "disabled";    // Ignore all DMs
```

### Per-Channel Setup

#### WhatsApp

1. QR code scan via web login
2. Credentials stored in `~/.openclaw/whatsapp/{accountId}/creds.json`
3. Options: selfChatMode (use "Notes to Self" as main session)

#### Telegram

1. Get bot token from @BotFather
2. Configure via env (`TELEGRAM_BOT_TOKEN`) or config
3. Enable inline mode if needed

#### Discord

1. Create bot in Discord Developer Portal
2. Enable Message Content Intent
3. Generate OAuth2 invite URL with `bot` scope
4. Paste bot token

#### iMessage (macOS)

1. Requires `imsg` CLI tool
2. Requires Full Disk Access + Automation permissions
3. Configure allowFrom with phone numbers, emails, or chat IDs

#### Signal

1. Requires `signal-cli` installation
2. Link or register phone number

#### Slack

1. Create Slack App in API dashboard
2. Configure OAuth scopes
3. Install to workspace
4. Get bot token

---

## Skills Setup

```typescript
async function setupSkills(cfg, workspaceDir, runtime, prompter) {
  const report = buildWorkspaceSkillStatus(workspaceDir, { config: cfg });
  
  // Show status
  await prompter.note([
    `Eligible: ${eligible.length}`,
    `Missing requirements: ${missing.length}`,
    `Blocked by allowlist: ${blocked.length}`,
  ].join("\n"), "Skills status");
  
  // Homebrew prompt (macOS/Linux)
  if (needsBrewPrompt) {
    await prompter.note("Many skill dependencies are shipped via Homebrew.");
  }
  
  // Node manager selection
  const nodeManager = await prompter.select({
    message: "Preferred node manager for skill installs",
    options: [
      { value: "npm", label: "npm" },
      { value: "pnpm", label: "pnpm" },
      { value: "bun", label: "bun" },
    ],
  });
  
  // Install missing dependencies
  const toInstall = await prompter.multiselect({
    message: "Install missing skill dependencies",
    options: installable.map(skill => ({
      value: skill.name,
      label: `${skill.emoji} ${skill.name}`,
    })),
  });
  
  // API key prompts for skills that need them
  for (const skill of missing) {
    if (skill.primaryEnv) {
      const apiKey = await prompter.text({ 
        message: `Enter ${skill.primaryEnv}` 
      });
    }
  }
  
  return next;
}
```

---

## Hooks Setup

```typescript
async function setupInternalHooks(cfg, runtime, prompter) {
  await prompter.note([
    "Hooks let you automate actions when agent commands are issued.",
    "Example: Save session context to memory when you issue /new.",
  ].join("\n"), "Hooks");
  
  const report = buildWorkspaceHookStatus(workspaceDir, { config: cfg });
  const eligibleHooks = report.hooks.filter(h => h.eligible);
  
  const toEnable = await prompter.multiselect({
    message: "Enable hooks?",
    options: [
      { value: "__skip__", label: "Skip for now" },
      ...eligibleHooks.map(hook => ({
        value: hook.name,
        label: `${hook.emoji} ${hook.name}`,
        hint: hook.description,
      })),
    ],
  });
  
  // Enable selected hooks
  const entries = { ...cfg.hooks?.internal?.entries };
  for (const name of selected) {
    entries[name] = { enabled: true };
  }
  
  return { 
    ...cfg, 
    hooks: { 
      ...cfg.hooks, 
      internal: { enabled: true, entries } 
    } 
  };
}
```

### Built-in Hooks

| Hook | Description |
|------|-------------|
| `boot-md` | Run BOOT.md on gateway startup |
| `session-memory` | Save session context to memory on `/new` |
| `command-logger` | Log commands to file |
| `soul-evil` | Soul integrity checking |

---

## Finalization

```typescript
async function finalizeOnboardingWizard(options) {
  // 1. Systemd user linger (Linux)
  if (process.platform === "linux" && systemdAvailable) {
    await ensureSystemdUserLingerInteractive({ ... });
  }
  
  // 2. Gateway service install
  if (installDaemon) {
    const daemonRuntime = await prompter.select({
      message: "Gateway service runtime",
      options: GATEWAY_DAEMON_RUNTIME_OPTIONS,
    });
    await service.install({ ... });
  }
  
  // 3. Health check
  await healthCommand({ json: false, timeoutMs: 10_000 }, runtime);
  
  // 4. Control UI assets
  await ensureControlUiAssetsBuilt(runtime);
  
  // 5. Show links
  await prompter.note([
    `Web UI: ${links.httpUrl}`,
    `Gateway WS: ${links.wsUrl}`,
  ].join("\n"), "Control UI");
  
  // 6. TUI launch (if BOOTSTRAP.md exists)
  if (hasBootstrap) {
    await prompter.note([
      "This is the defining action that makes your agent you.",
      "Please take your time.",
    ].join("\n"), "Start TUI");
    
    if (await prompter.confirm({ message: "Do you want to hatch your bot now?" })) {
      await runTui({
        url: links.wsUrl,
        token: settings.gatewayToken,
        message: "Wake up, my friend!",
      });
    }
  }
  
  // 7. Final outro
  await prompter.outro("Onboarding complete.");
}
```

---

## Daemon Installation

### macOS (launchd)

```typescript
// Service label: com.openclaw.gateway
// Plist: ~/Library/LaunchAgents/com.openclaw.gateway.plist
// Logs: ~/.openclaw/logs/gateway.log

await installLaunchAgent({
  programArguments: ["node", "/path/to/openclaw", "gateway", "start"],
  workingDirectory,
  environment: {
    OPENCLAW_GATEWAY_PORT: "18789",
    OPENCLAW_GATEWAY_TOKEN: token,
  },
});
```

### Linux (systemd)

```typescript
// Service: openclaw-gateway
// Unit: ~/.config/systemd/user/openclaw-gateway.service

await installSystemdService({
  programArguments,
  workingDirectory,
  environment,
  description: "OpenClaw Gateway",
});

// User lingering (required for service to run after logout)
// loginctl enable-linger $USER
```

### Profile Support

Multiple gateway instances with different profiles:

```bash
OPENCLAW_PROFILE=work openclaw onboard
# Creates: com.openclaw.work (macOS)
# Creates: openclaw-gateway-work (Linux)
```

---

## Post-Onboarding Commands

```bash
# Check status
openclaw status

# Health check
openclaw health

# Diagnose issues
openclaw doctor

# Modify config
openclaw configure

# Channel management
openclaw channels status
openclaw channels add telegram
openclaw channels remove discord
```

---

## Comparison with Nexus

| Aspect | OpenClaw Onboarding | Nexus Bootstrap |
|--------|---------------------|-----------------|
| Entry point | `openclaw onboard` | `nexus init` |
| Interactive wizard | Full TUI wizard | Simpler prompts |
| Bootstrap conversation | TUI-driven first-run | Agent-led identity setup |
| Channel setup | During onboarding | Separate `nexus channel` commands |
| Gateway daemon | Installed during onboarding | Optional |
| IDE integration | None | Harness bindings during init |
| Auth providers | 20+ providers | Focus on Anthropic |

---

*This document captures OpenClaw onboarding for comparison with Nexus. See `foundation/BOOTSTRAP_ONBOARDING.md` for the Nexus bootstrap spec.*
