# Upstream Workspace Behavior

**Status:** REFERENCE DOCUMENT  
**Source:** clawdbot upstream (`80c1edc3ff43b3bd3b7b545eed79f303d992f7dc`)  
**Last Updated:** 2026-01-22

This document captures the workspace initialization, project structure, bootstrap files, onboarding flow, and agent bindings behavior from upstream clawdbot for comparison with Nexus.

---

## Init Command

The main entry point is `clawdbot onboard` which handles both interactive and non-interactive onboarding.

### Entry Points

```typescript
// src/commands/onboard.ts
export async function onboardCommand(opts: OnboardOptions, runtime: RuntimeEnv = defaultRuntime) {
  // Normalize legacy "oauth" to "setup-token"
  const authChoice = opts.authChoice === "oauth" ? ("setup-token" as const) : opts.authChoice;
  
  // Non-interactive requires explicit --accept-risk flag
  if (normalizedOpts.nonInteractive && normalizedOpts.acceptRisk !== true) {
    runtime.error("Non-interactive onboarding requires explicit risk acknowledgement.");
  }
  
  // Handle --reset flag
  if (normalizedOpts.reset) {
    await handleReset(scope, workspaceDir, runtime);
  }
  
  // Route to appropriate handler
  if (normalizedOpts.nonInteractive) {
    await runNonInteractiveOnboarding(normalizedOpts, runtime);
  } else {
    await runInteractiveOnboarding(normalizedOpts, runtime);
  }
}
```

### Reset Scopes

```typescript
// src/commands/onboard-types.ts
export type ResetScope = "config" | "config+creds+sessions" | "full";
```

- **config**: Just `~/.clawdbot/clawdbot.json`
- **config+creds+sessions**: Config + `~/.clawdbot/credentials/` + session transcripts
- **full**: All above + workspace directory (`~/clawd/`)

---

## Project Structure

### State Directory (`~/.clawdbot/`)

```
~/.clawdbot/                          # $CLAWDBOT_STATE_DIR (configurable)
├── clawdbot.json                     # Main config file ($CLAWDBOT_CONFIG_PATH)
├── credentials/                       # OAuth/credential storage ($CLAWDBOT_OAUTH_DIR)
│   └── oauth.json
├── agents/                           # Per-agent state (when agentDir not customized)
│   └── {agent-id}/
│       └── agent/                    # Agent workspace (if not custom agentDir)
└── sessions/                         # Session transcripts
    └── transcripts/
        └── {agent-id}/
```

### Workspace Directory (`~/clawd/`)

```
~/clawd/                              # agents.defaults.workspace (configurable)
├── AGENTS.md                         # Primary workspace instructions
├── SOUL.md                           # Agent identity/personality
├── TOOLS.md                          # Local tool notes (camera names, SSH hosts, etc.)
├── IDENTITY.md                       # Agent name, emoji, creature type (empty by default)
├── USER.md                           # User profile (empty by default)
├── HEARTBEAT.md                      # Heartbeat checklist (minimal)
├── BOOTSTRAP.md                      # First-run script (deleted after onboarding)
├── MEMORY.md                         # Long-term memory (user creates)
├── memory/                           # Daily memory files (user creates)
│   ├── YYYY-MM-DD.md
│   └── heartbeat-state.json
└── .git/                             # Auto-init'd on brand new workspaces
```

### Path Resolution

```typescript
// src/config/paths.ts
export function resolveStateDir(env, homedir): string {
  const override = env.CLAWDBOT_STATE_DIR?.trim();
  if (override) return resolveUserPath(override);
  return path.join(homedir(), ".clawdbot");
}

export function resolveConfigPath(env, stateDir): string {
  const override = env.CLAWDBOT_CONFIG_PATH?.trim();
  if (override) return resolveUserPath(override);
  return path.join(stateDir, "clawdbot.json");
}

// src/agents/workspace.ts
export function resolveDefaultAgentWorkspaceDir(env, homedir): string {
  const profile = env.CLAWDBOT_PROFILE?.trim();
  if (profile && profile.toLowerCase() !== "default") {
    return path.join(homedir(), `clawd-${profile}`);  // ~/clawd-{profile}/
  }
  return path.join(homedir(), "clawd");  // ~/clawd/
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CLAWDBOT_STATE_DIR` | State directory | `~/.clawdbot` |
| `CLAWDBOT_CONFIG_PATH` | Config file path | `$STATE_DIR/clawdbot.json` |
| `CLAWDBOT_OAUTH_DIR` | OAuth credentials dir | `$STATE_DIR/credentials` |
| `CLAWDBOT_PROFILE` | Named profile (creates `~/clawd-{profile}/`) | `default` |
| `CLAWDBOT_NIX_MODE` | Nix deployment mode (disables auto-install) | `0` |
| `CLAWDBOT_GATEWAY_PORT` | Gateway port override | `18789` |

---

## Bootstrap Files

All templates are stored in `docs/reference/templates/` and loaded via `loadTemplate()`. Frontmatter is stripped before writing.

### File Constants

```typescript
// src/agents/workspace.ts
export const DEFAULT_AGENTS_FILENAME = "AGENTS.md";
export const DEFAULT_SOUL_FILENAME = "SOUL.md";
export const DEFAULT_TOOLS_FILENAME = "TOOLS.md";
export const DEFAULT_IDENTITY_FILENAME = "IDENTITY.md";
export const DEFAULT_USER_FILENAME = "USER.md";
export const DEFAULT_HEARTBEAT_FILENAME = "HEARTBEAT.md";
export const DEFAULT_BOOTSTRAP_FILENAME = "BOOTSTRAP.md";
```

### AGENTS.md (Primary Instructions)

Main workspace behavior file. Key sections:

- **First Run**: Check for `BOOTSTRAP.md`, follow it, then delete
- **Every Session**: Read `SOUL.md`, `USER.md`, `memory/YYYY-MM-DD.md`, and `MEMORY.md` (main session only)
- **Memory**: Daily notes in `memory/`, long-term in `MEMORY.md`
- **Safety**: Don't exfiltrate data, use `trash` over `rm`, ask before external actions
- **External vs Internal**: Safe to read/explore, ask before sending emails/tweets
- **Group Chats**: Participate don't dominate, `HEARTBEAT_OK` when nothing to say
- **Heartbeats**: Periodic checks (email, calendar, mentions, weather)
- **Platform Formatting**: Discord/WhatsApp no markdown tables, Discord links in `<>`

```markdown
# AGENTS.md - Your Workspace

This folder is home. Treat it that way.

## First Run
If `BOOTSTRAP.md` exists, that's your birth certificate. Follow it, figure out who you are, then delete it.

## Every Session
1. Read `SOUL.md` — this is who you are
2. Read `USER.md` — this is who you're helping
3. Read `memory/YYYY-MM-DD.md` (today + yesterday)
4. **If in MAIN SESSION**: Also read `MEMORY.md`
```

### SOUL.md (Agent Identity)

Defines the agent's personality and boundaries:

```markdown
# SOUL.md - Who You Are

*You're not a chatbot. You're becoming someone.*

## Core Truths
- Be genuinely helpful, not performatively helpful
- Have opinions
- Be resourceful before asking
- Earn trust through competence
- Remember you're a guest

## Boundaries
- Private things stay private
- Ask before acting externally
- Never send half-baked replies
- You're not the user's voice
```

### TOOLS.md (Local Notes)

For environment-specific details:

```markdown
# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics.

## What Goes Here
- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
```

### IDENTITY.md (Empty by Default)

User fills in via BOOTSTRAP conversation:

```markdown
# IDENTITY.md - Agent Identity

- **Name:** (agent name)
- **Creature:** (what kind of entity)
- **Vibe:** (personality style)
- **Emoji:** (signature emoji)
- **Avatar:** (optional path)
```

### USER.md (Empty by Default)

User fills in via BOOTSTRAP conversation:

```markdown
# USER.md - User Profile

- **Name:** (user name)
- **Preferred address:** (how to call them)
- **Pronouns:** (optional)
- **Timezone:** (IANA timezone)
- **Notes:** (additional context)
```

### HEARTBEAT.md (Minimal)

```markdown
# HEARTBEAT.md

Keep this file empty unless you want a tiny checklist. Keep it small.
```

### BOOTSTRAP.md (First-Run Script)

**Only created for brand-new workspaces.** Deleted after onboarding.

```markdown
# BOOTSTRAP.md - Hello, World

*You just woke up. Time to figure out who you are.*

## The Conversation
Start with something like:
> "Hey. I just came online. Who am I? Who are you?"

Then figure out together:
1. **Your name** — What should they call you?
2. **Your nature** — What kind of creature are you?
3. **Your vibe** — Formal? Casual? Snarky? Warm?
4. **Your emoji** — Everyone needs a signature.

## After You Know Who You Are
Update:
- `IDENTITY.md` — your name, creature, vibe, emoji
- `USER.md` — their name, how to address them, timezone, notes
- `SOUL.md` — together, talk about boundaries

## When You're Done
Delete this file. You don't need a bootstrap script anymore — you're you now.
```

### Bootstrap File Creation Logic

```typescript
// src/agents/workspace.ts
export async function ensureAgentWorkspace(params?: {
  dir?: string;
  ensureBootstrapFiles?: boolean;
}): Promise<WorkspaceResult> {
  const dir = resolveUserPath(rawDir);
  await fs.mkdir(dir, { recursive: true });

  if (!params?.ensureBootstrapFiles) return { dir };

  // Check if brand new workspace (no existing files)
  const isBrandNewWorkspace = await checkNoExistingFiles(paths);

  // Write files if missing (wx flag = fail if exists)
  await writeFileIfMissing(agentsPath, agentsTemplate);
  await writeFileIfMissing(soulPath, soulTemplate);
  await writeFileIfMissing(toolsPath, toolsTemplate);
  await writeFileIfMissing(identityPath, identityTemplate);
  await writeFileIfMissing(userPath, userTemplate);
  await writeFileIfMissing(heartbeatPath, heartbeatTemplate);
  
  // BOOTSTRAP.md only for brand new workspaces
  if (isBrandNewWorkspace) {
    await writeFileIfMissing(bootstrapPath, bootstrapTemplate);
  }
  
  // Git init only for brand new workspaces
  await ensureGitRepo(dir, isBrandNewWorkspace);

  return { dir, agentsPath, soulPath, ... };
}
```

### Subagent Bootstrap Filtering

```typescript
// src/agents/workspace.ts
const SUBAGENT_BOOTSTRAP_ALLOWLIST = new Set([DEFAULT_AGENTS_FILENAME, DEFAULT_TOOLS_FILENAME]);

export function filterBootstrapFilesForSession(
  files: WorkspaceBootstrapFile[],
  sessionKey?: string,
): WorkspaceBootstrapFile[] {
  if (!sessionKey || !isSubagentSessionKey(sessionKey)) return files;
  return files.filter((file) => SUBAGENT_BOOTSTRAP_ALLOWLIST.has(file.name));
}
```

Subagents only get `AGENTS.md` and `TOOLS.md` — no `SOUL.md`, `MEMORY.md`, `USER.md`, etc. for security.

---

## Onboarding Flow

### Interactive Wizard Sequence

```typescript
// src/wizard/onboarding.ts
export async function runOnboardingWizard(opts, runtime, prompter) {
  // 1. Header and intro
  printWizardHeader(runtime);  // ASCII art banner
  await prompter.intro("Clawdbot onboarding");
  
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
  
  // 4. Flow selection (quickstart vs advanced)
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
    initialValue: DEFAULT_WORKSPACE,  // ~/clawd
  });
  
  // 7. Auth choice (multiple provider options)
  const authChoice = await promptAuthChoiceGrouped({
    prompter,
    store: authStore,
    includeSkip: true,
    includeClaudeCliIfMissing: true,
  });
  
  // 8. Model selection
  const modelSelection = await promptDefaultModel({
    config: nextConfig,
    prompter,
    allowKeep: true,
  });
  
  // 9. Gateway configuration
  const gateway = await configureGatewayForOnboarding({ flow, ... });
  
  // 10. Channel setup (WhatsApp, Telegram, Discord, etc.)
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

### Auth Choices

```typescript
// src/commands/onboard-types.ts
export type AuthChoice =
  | "oauth" | "setup-token"    // Anthropic OAuth
  | "claude-cli"                // Claude CLI (claude)
  | "token"                     // Raw API token
  | "chutes"                    // Chutes.ai
  | "openai-codex" | "openai-api-key"
  | "openrouter-api-key"
  | "ai-gateway-api-key"
  | "moonshot-api-key" | "kimi-code-api-key"
  | "gemini-api-key" | "google-antigravity" | "google-gemini-cli"
  | "zai-api-key"
  | "minimax-cloud" | "minimax" | "minimax-api" | "minimax-api-lightning"
  | "opencode-zen"
  | "github-copilot" | "copilot-proxy"
  | "qwen-portal"
  | "skip";
```

### OnboardOptions Full Interface

```typescript
// src/commands/onboard-types.ts
export type OnboardOptions = {
  mode?: OnboardMode;                    // "local" | "remote"
  flow?: "quickstart" | "advanced";
  workspace?: string;
  nonInteractive?: boolean;
  acceptRisk?: boolean;
  reset?: boolean;
  authChoice?: AuthChoice;
  tokenProvider?: string;
  token?: string;
  tokenProfileId?: string;
  tokenExpiresIn?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
  aiGatewayApiKey?: string;
  moonshotApiKey?: string;
  kimiCodeApiKey?: string;
  geminiApiKey?: string;
  zaiApiKey?: string;
  minimaxApiKey?: string;
  syntheticApiKey?: string;
  opencodeZenApiKey?: string;
  gatewayPort?: number;
  gatewayBind?: GatewayBind;             // "loopback" | "lan" | "auto" | "custom" | "tailnet"
  gatewayAuth?: GatewayAuthChoice;       // "off" | "token" | "password"
  gatewayToken?: string;
  gatewayPassword?: string;
  tailscale?: TailscaleMode;             // "off" | "serve" | "funnel"
  tailscaleResetOnExit?: boolean;
  installDaemon?: boolean;
  daemonRuntime?: GatewayDaemonRuntime;
  skipChannels?: boolean;
  skipSkills?: boolean;
  skipHealth?: boolean;
  skipUi?: boolean;
  nodeManager?: NodeManagerChoice;       // "npm" | "pnpm" | "bun"
  remoteUrl?: string;
  remoteToken?: string;
  json?: boolean;
};
```

### QuickStart vs Advanced Mode

**QuickStart:**
- Uses defaults for gateway port (`18789`), bind (`loopback`), auth (`token`)
- Skips detailed network/Tailscale configuration
- Auto-enables quickstart-eligible channels
- Skips DM policy prompt
- Goes straight to TUI for BOOTSTRAP conversation

**Advanced:**
- Prompts for port, bind address, auth mode
- Tailscale integration options (off/serve/funnel)
- Per-channel configuration
- DM policy selection

### Skills Setup

```typescript
// src/commands/onboard-skills.ts
export async function setupSkills(cfg, workspaceDir, runtime, prompter): Promise<ClawdbotConfig> {
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
      const apiKey = await prompter.text({ message: `Enter ${skill.primaryEnv}` });
    }
  }
  
  return next;
}
```

### Hooks Setup

```typescript
// src/commands/onboard-hooks.ts
export async function setupInternalHooks(cfg, runtime, prompter): Promise<ClawdbotConfig> {
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
  
  return { ...cfg, hooks: { ...cfg.hooks, internal: { enabled: true, entries } } };
}
```

### Finalization

```typescript
// src/wizard/onboarding.finalize.ts
export async function finalizeOnboardingWizard(options) {
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
  
  // 7. Web search setup hint
  // 8. Final outro
  await prompter.outro("Onboarding complete.");
}
```

---

## Agent Bindings

Bindings map channels/accounts to specific agents (multi-agent support).

### Binding Structure

```typescript
// src/config/types.agents.ts
export type AgentBinding = {
  agentId: string;
  match: {
    channel: string;              // "telegram" | "discord" | "whatsapp" | ...
    accountId?: string;           // Bot token ID, phone number, etc.
    peer?: {
      kind: "dm" | "group" | "channel";
      id: string;
    };
    guildId?: string;             // Discord guild
    teamId?: string;              // Slack team
  };
};
```

### Binding Logic

```typescript
// src/routing/bindings.ts
export function listBindings(cfg: ClawdbotConfig): AgentBinding[] {
  return Array.isArray(cfg.bindings) ? cfg.bindings : [];
}

export function resolveDefaultAgentBoundAccountId(cfg, channelId): string | null {
  const defaultAgentId = normalizeAgentId(resolveDefaultAgentId(cfg));
  for (const binding of listBindings(cfg)) {
    if (normalizeAgentId(binding.agentId) !== defaultAgentId) continue;
    const channel = normalizeBindingChannelId(match.channel);
    if (channel !== normalizedChannel) continue;
    const accountId = match.accountId?.trim();
    if (accountId && accountId !== "*") return normalizeAccountId(accountId);
  }
  return null;
}
```

### Multi-Agent Directory Resolution

```typescript
// src/config/agent-dirs.ts
function resolveEffectiveAgentDir(cfg, agentId, deps): string {
  const id = normalizeAgentId(agentId);
  
  // Check for explicit agentDir in config
  const configured = cfg.agents?.list?.find(
    agent => normalizeAgentId(agent.id) === id
  )?.agentDir;
  
  if (configured?.trim()) return resolveUserPath(configured);
  
  // Default to $STATE_DIR/agents/{id}/agent
  const root = resolveStateDir(deps?.env, deps?.homedir);
  return path.join(root, "agents", id, "agent");
}
```

### Duplicate Agent Dir Detection

```typescript
// src/config/agent-dirs.ts
export function findDuplicateAgentDirs(cfg, deps): DuplicateAgentDir[] {
  // Collects all referenced agent IDs and their directories
  // Returns conflicts where multiple agents share the same dir
  // Error: "Duplicate agentDir detected (multi-agent config)."
}
```

---

## Configuration

### Main Config Structure

```typescript
// src/config/types.clawdbot.ts
export type ClawdbotConfig = {
  meta?: {
    lastTouchedVersion?: string;
    lastTouchedAt?: string;
  };
  auth?: AuthConfig;
  env?: {
    shellEnv?: { enabled?: boolean; timeoutMs?: number };
    vars?: Record<string, string>;
  };
  wizard?: {
    lastRunAt?: string;
    lastRunVersion?: string;
    lastRunCommit?: string;
    lastRunCommand?: string;
    lastRunMode?: "local" | "remote";
  };
  diagnostics?: DiagnosticsConfig;
  logging?: LoggingConfig;
  update?: {
    channel?: "stable" | "beta" | "dev";
    checkOnStart?: boolean;
  };
  browser?: BrowserConfig;
  ui?: {
    seamColor?: string;
    assistant?: { name?: string; avatar?: string };
  };
  skills?: SkillsConfig;
  plugins?: PluginsConfig;
  models?: ModelsConfig;
  agents?: AgentsConfig;
  tools?: ToolsConfig;
  bindings?: AgentBinding[];
  broadcast?: BroadcastConfig;
  audio?: AudioConfig;
  messages?: MessagesConfig;
  commands?: CommandsConfig;
  session?: SessionConfig;
  web?: WebConfig;
  channels?: ChannelsConfig;
  cron?: CronConfig;
  hooks?: HooksConfig;
  discovery?: DiscoveryConfig;
  canvasHost?: CanvasHostConfig;
  talk?: TalkConfig;
  gateway?: GatewayConfig;
};
```

### Agent Defaults

```typescript
// src/config/types.agent-defaults.ts
export type AgentDefaultsConfig = {
  model?: AgentModelListConfig;              // { primary, fallbacks }
  imageModel?: AgentModelListConfig;
  models?: Record<string, AgentModelEntryConfig>;
  workspace?: string;                         // ~/clawd
  repoRoot?: string;
  skipBootstrap?: boolean;
  bootstrapMaxChars?: number;                 // 20000
  userTimezone?: string;
  timeFormat?: "auto" | "12" | "24";
  envelopeTimezone?: string;
  envelopeTimestamp?: "on" | "off";
  envelopeElapsed?: "on" | "off";
  contextTokens?: number;
  cliBackends?: Record<string, CliBackendConfig>;
  contextPruning?: AgentContextPruningConfig;
  compaction?: AgentCompactionConfig;
  memorySearch?: MemorySearchConfig;
  thinkingDefault?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  verboseDefault?: "off" | "on" | "full";
  elevatedDefault?: "off" | "on" | "ask" | "full";
  blockStreamingDefault?: "off" | "on";
  blockStreamingBreak?: "text_end" | "message_end";
  blockStreamingChunk?: BlockStreamingChunkConfig;
  blockStreamingCoalesce?: BlockStreamingCoalesceConfig;
  humanDelay?: HumanDelayConfig;
  timeoutSeconds?: number;
  mediaMaxMb?: number;
  typingIntervalSeconds?: number;
  typingMode?: TypingMode;
  heartbeat?: {
    every?: string;                           // "30m"
    activeHours?: { start, end, timezone };
    model?: string;
    session?: string;
    target?: "last" | "whatsapp" | "telegram" | ...;
    to?: string;
    prompt?: string;
    ackMaxChars?: number;
    includeReasoning?: boolean;
  };
  maxConcurrent?: number;                     // 1
  subagents?: {
    maxConcurrent?: number;
    archiveAfterMinutes?: number;             // 60
    model?: string | { primary, fallbacks };
  };
  sandbox?: SandboxConfig;
};
```

### Per-Agent Config

```typescript
// src/config/types.agents.ts
export type AgentConfig = {
  id: string;
  default?: boolean;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: AgentModelConfig;
  memorySearch?: MemorySearchConfig;
  humanDelay?: HumanDelayConfig;
  heartbeat?: AgentDefaultsConfig["heartbeat"];
  identity?: IdentityConfig;
  groupChat?: GroupChatConfig;
  subagents?: {
    allowAgents?: string[];
    model?: string | { primary, fallbacks };
  };
  sandbox?: SandboxConfig;
  tools?: AgentToolsConfig;
};

export type AgentsConfig = {
  defaults?: AgentDefaultsConfig;
  list?: AgentConfig[];
};
```

---

## System Prompt Generation

The system prompt is built dynamically based on configuration and runtime context.

```typescript
// src/agents/system-prompt.ts
export function buildAgentSystemPrompt(params): string {
  const lines = [
    "You are a personal assistant running inside Clawdbot.",
    "",
    "## Tooling",
    // ... tool list with summaries
    "",
    "## Tool Call Style",
    // ... narration guidance
    "",
    "## Clawdbot CLI Quick Reference",
    // ... CLI help
    "",
    // Skills section (if skills available)
    ...buildSkillsSection({ skillsPrompt, isMinimal, readToolName }),
    // Memory section (if memory tools available)
    ...buildMemorySection({ isMinimal, availableTools }),
    // ... more sections
    "",
    "## Workspace",
    `Your working directory is: ${params.workspaceDir}`,
    // ... workspace notes
    "",
    "## Workspace Files (injected)",
    "These user-editable files are loaded by Clawdbot and included below in Project Context.",
    "",
    // ... context files
    "",
    "## Silent Replies",
    `When you have nothing to say, respond with ONLY: ${SILENT_REPLY_TOKEN}`,
    "",
    "## Heartbeats",
    // ... heartbeat guidance
    "",
    "## Runtime",
    buildRuntimeLine(runtimeInfo, ...),
  ];
  
  return lines.filter(Boolean).join("\n");
}
```

### Prompt Modes

```typescript
export type PromptMode = "full" | "minimal" | "none";
```

- **full**: All sections (main agent)
- **minimal**: Reduced sections (Tooling, Workspace, Runtime) — for subagents
- **none**: Just "You are a personal assistant running inside Clawdbot."

---

## Skills System

### Skill Metadata Format

```yaml
---
name: 1password
description: Set up and use 1Password CLI (op)...
homepage: https://developer.1password.com/docs/cli/get-started/
metadata: {"clawdbot":{"emoji":"🔐","requires":{"bins":["op"]},"install":[...]}}
---
```

### Skill Status Types

- **eligible**: Ready to use
- **missing**: Missing requirements (bins, env vars)
- **disabled**: Explicitly disabled in config
- **blockedByAllowlist**: Not in skills allowlist

### Install Options

```typescript
type InstallOption = {
  id: string;
  kind: "brew" | "npm" | "pip" | "manual";
  formula?: string;      // brew
  package?: string;      // npm/pip
  bins?: string[];       // binaries provided
  label: string;
};
```

---

## Hooks System

### Built-in Hooks

Located in `src/hooks/bundled/`:

- **boot-md**: Boot memory management
- **command-logger**: Log commands
- **session-memory**: Save session context to memory on `/new`
- **soul-evil**: Soul integrity checking

### Hook Configuration

```typescript
// src/config/types.hooks.ts
export type HooksConfig = {
  internal?: {
    enabled?: boolean;
    entries?: Record<string, { enabled?: boolean }>;
  };
  // ... plugin hooks, external hooks
};
```

---

## IDE Integration

Upstream clawdbot is **not designed for direct IDE integration**. It's a standalone gateway service that:

1. Runs as a background daemon (launchd/systemd)
2. Provides a WebSocket API for clients
3. Has its own TUI and Control UI web interface
4. Handles messaging channels (WhatsApp, Telegram, Discord, etc.)

There is **no built-in Cursor/VS Code integration** in upstream. The gateway is IDE-agnostic by design.

### Harness Architecture

Clawdbot uses a "harness" concept where different client interfaces can connect to the same gateway:

- **TUI**: Terminal-based chat interface
- **Control UI**: Web-based dashboard
- **Channel Monitors**: WhatsApp, Telegram, Discord, etc.
- **API**: WebSocket protocol for custom clients

Each harness connects to the gateway via WebSocket and can:
- Send messages to agent sessions
- Receive streaming responses
- Access tools and capabilities
- Manage sessions

---

## Key Differences from Nexus

| Aspect | Upstream Clawdbot | Nexus |
|--------|-------------------|-------|
| **Primary Interface** | TUI, Web Control UI, Channels | IDE (Cursor), CLI |
| **State Directory** | `~/.clawdbot/` | `~/nexus/state/` |
| **Workspace** | `~/clawd/` | `~/nexus/home/` |
| **Config Format** | JSON (`clawdbot.json`) | Multiple files |
| **Identity Location** | Workspace (`IDENTITY.md`) | `state/agents/{id}/IDENTITY.md` |
| **Skill Location** | `skills/` (bundled) | `skills/` (installable) |
| **IDE Integration** | None (gateway-first) | Native (Cursor rules, hooks) |
| **Multi-Agent** | Config-based bindings | Dedicated agent directories |
| **Bootstrap** | BOOTSTRAP.md first-run wizard | Simpler identity setup |

---

*This document captures upstream behavior for comparison with Nexus. See the individual spec files for Nexus-specific implementations.*
