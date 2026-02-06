# OpenClaw Configuration System

This document provides a comprehensive analysis of OpenClaw's configuration system, documenting how `config.json` works for reference when designing Nexus's separated config domains.

---

## Table of Contents

1. [Configuration Structure](#configuration-structure)
2. [Config Sections](#config-sections)
3. [Config Management](#config-management)
4. [Identity Configuration](#identity-configuration)
5. [Key Files Reference](#key-files-reference)

---

## Configuration Structure

### File Location and Discovery

| Env Override | Default Location |
|--------------|------------------|
| `OPENCLAW_CONFIG_PATH` | `~/.openclaw/openclaw.json` |
| `OPENCLAW_STATE_DIR` | `~/.openclaw/` |

**Discovery Order:**

1. Explicit `OPENCLAW_CONFIG_PATH` environment variable
2. State directory + config filename (with legacy fallbacks)
3. Legacy state directories (`.clawdbot`, `.moltbot`, `.moldbot`)
4. New default: `~/.openclaw/openclaw.json`

```typescript
// From src/config/paths.ts
const LEGACY_STATE_DIRNAMES = [".clawdbot", ".moltbot", ".moldbot"];
const NEW_STATE_DIRNAME = ".openclaw";
const CONFIG_FILENAME = "openclaw.json";
const LEGACY_CONFIG_FILENAMES = ["clawdbot.json", "moltbot.json", "moldbot.json"];
```

### File Format: JSON5

OpenClaw uses [JSON5](https://json5.org/) for config files, allowing:
- Comments (`// line` and `/* block */`)
- Trailing commas
- Unquoted keys
- Single-quoted strings

```json5
{
  // Agent configuration
  agents: {
    defaults: {
      model: { primary: "anthropic/claude-sonnet-4-5" },
      workspace: "~/projects",
    },
    list: [
      { id: "main", default: true },
    ],
  },
}
```

### Config Loading Pipeline

```
┌─────────────────┐
│   Read File     │  fs.readFileSync(configPath)
└────────┬────────┘
         ▼
┌─────────────────┐
│   Parse JSON5   │  JSON5.parse(raw)
└────────┬────────┘
         ▼
┌─────────────────┐
│ Resolve $include│  Merge modular config files
└────────┬────────┘
         ▼
┌─────────────────┐
│ Substitute ${VAR}│  Environment variable expansion
└────────┬────────┘
         ▼
┌─────────────────┐
│ Legacy Migration│  Auto-migrate old config shapes
└────────┬────────┘
         ▼
┌─────────────────┐
│ Zod Validation  │  Schema validation with strict()
└────────┬────────┘
         ▼
┌─────────────────┐
│ Apply Defaults  │  Fill missing values with defaults
└────────┬────────┘
         ▼
┌─────────────────┐
│ Runtime Overrides│  Apply in-memory patches
└─────────────────┘
```

### Schema Validation

OpenClaw uses [Zod](https://zod.dev/) for runtime schema validation with strict mode (no extra keys allowed):

```typescript
// From src/config/zod-schema.ts
export const OpenClawSchema = z
  .object({
    meta: z.object({...}).strict().optional(),
    env: z.object({...}).catchall(z.string()).optional(),
    agents: AgentsSchema,
    channels: ChannelsSchema,
    // ... 30+ top-level sections
  })
  .strict()
  .superRefine((cfg, ctx) => {
    // Cross-field validation (e.g., broadcast agent refs)
  });
```

### Config Include System

Modular configs via `$include` directive:

```json5
{
  "$include": "./base-config.json5",
  
  // Override specific values
  agents: {
    defaults: {
      model: { primary: "openai/gpt-5.2" },
    },
  },
}
```

**Include Features:**

| Feature | Example |
|---------|---------|
| Single file | `"$include": "./base.json5"` |
| Multiple files | `"$include": ["./a.json5", "./b.json5"]` |
| Relative paths | `"$include": "../shared/models.json5"` |
| Absolute paths | `"$include": "/etc/openclaw/base.json5"` |

**Merge Semantics:**
- Arrays: concatenate
- Objects: deep merge (source wins on conflict)
- Primitives: source wins
- Max depth: 10 (prevents circular includes)

### Environment Variable Substitution

Pattern: `${VAR_NAME}` (uppercase only: `[A-Z_][A-Z0-9_]*`)

```json5
{
  models: {
    providers: {
      "custom-gateway": {
        baseUrl: "https://api.example.com",
        apiKey: "${CUSTOM_API_KEY}",  // Substituted at load time
      },
    },
  },
}
```

**Escape Syntax:** `$${VAR}` → literal `${VAR}` in output

**Config-Defined Variables:**
```json5
{
  env: {
    vars: {
      "MY_API_KEY": "sk-...",
    },
  },
  channels: {
    telegram: {
      botToken: "${MY_API_KEY}",  // References env.vars
    },
  },
}
```

---

## Config Sections

### Top-Level Structure

```typescript
// From src/config/types.openclaw.ts
type OpenClawConfig = {
  meta?: MetaConfig;
  auth?: AuthConfig;
  env?: EnvConfig;
  wizard?: WizardConfig;
  diagnostics?: DiagnosticsConfig;
  logging?: LoggingConfig;
  update?: UpdateConfig;
  browser?: BrowserConfig;
  ui?: UiConfig;
  skills?: SkillsConfig;
  plugins?: PluginsConfig;
  models?: ModelsConfig;
  nodeHost?: NodeHostConfig;
  agents?: AgentsConfig;
  tools?: ToolsConfig;
  bindings?: AgentBinding[];
  broadcast?: BroadcastConfig;
  audio?: AudioConfig;
  messages?: MessagesConfig;
  commands?: CommandsConfig;
  approvals?: ApprovalsConfig;
  session?: SessionConfig;
  web?: WebConfig;
  channels?: ChannelsConfig;
  cron?: CronConfig;
  hooks?: HooksConfig;
  discovery?: DiscoveryConfig;
  canvasHost?: CanvasHostConfig;
  talk?: TalkConfig;
  gateway?: GatewayConfig;
  memory?: MemoryConfig;
};
```

### Agent Configuration

```json5
{
  agents: {
    // Defaults applied to all agents
    defaults: {
      model: {
        primary: "anthropic/claude-sonnet-4-5",
        fallbacks: ["openai/gpt-5.2"],
      },
      imageModel: { primary: "google/gemini-3-pro-preview" },
      workspace: "~/projects",
      contextTokens: 200000,
      timeoutSeconds: 600,
      maxConcurrent: 1,  // Sequential by default
      
      // Context management
      contextPruning: {
        mode: "cache-ttl",
        ttl: "1h",
      },
      compaction: {
        mode: "safeguard",
        maxHistoryShare: 0.5,
      },
      
      // Periodic heartbeats
      heartbeat: {
        every: "30m",
        activeHours: { start: "08:00", end: "22:00" },
        target: "last",
      },
      
      // Sub-agent settings
      subagents: {
        maxConcurrent: 1,
        archiveAfterMinutes: 60,
      },
      
      // Sandbox isolation
      sandbox: {
        mode: "non-main",
        workspaceAccess: "ro",
        scope: "session",
      },
    },
    
    // Named agents
    list: [
      {
        id: "main",
        default: true,
        name: "Atlas",
        workspace: "~/nexus",
        agentDir: "~/nexus/state/agents/atlas",
        model: "anthropic/claude-opus-4-5",
        skills: ["filesystem", "git", "shell"],
        identity: {
          name: "Atlas",
          emoji: "🧭",
          avatar: "https://example.com/avatar.png",
        },
      },
      {
        id: "coder",
        workspace: "~/projects",
        model: { primary: "anthropic/claude-sonnet-4-5" },
      },
    ],
  },
}
```

**Agent Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique agent identifier (required) |
| `default` | `boolean` | Mark as default agent |
| `name` | `string` | Display name |
| `workspace` | `string` | Working directory |
| `agentDir` | `string` | Agent state directory |
| `model` | `string \| ModelConfig` | Primary model |
| `skills` | `string[]` | Skill allowlist (omit = all) |
| `memorySearch` | `MemorySearchConfig` | Vector search settings |
| `humanDelay` | `HumanDelayConfig` | Reply pacing |
| `heartbeat` | `HeartbeatConfig` | Periodic heartbeat |
| `identity` | `IdentityConfig` | Name, emoji, avatar |
| `groupChat` | `GroupChatConfig` | Group behavior |
| `subagents` | `SubagentConfig` | Sub-agent spawning |
| `sandbox` | `SandboxConfig` | Sandbox isolation |
| `tools` | `AgentToolsConfig` | Tool allow/deny |

### Channel Configuration

Channels are messaging platforms. Each channel has provider-specific settings:

```json5
{
  channels: {
    defaults: {
      groupPolicy: "open",  // "open" | "disabled" | "allowlist"
      heartbeat: {
        showOk: false,
        showAlerts: true,
      },
    },
    
    telegram: {
      enabled: true,
      botToken: "${TELEGRAM_BOT_TOKEN}",
      dmPolicy: "pairing",  // "pairing" | "allowlist" | "open" | "disabled"
      groupPolicy: "open",
      allowFrom: ["123456789", "@username"],
      groups: {
        "*": { requireMention: true },
        "-1001234567890": {
          requireMention: false,
          tools: { deny: ["exec"] },
          skills: ["chat"],
        },
      },
      accounts: {
        secondary: {
          botToken: "${TELEGRAM_BOT_TOKEN_2}",
          enabled: true,
        },
      },
    },
    
    discord: {
      enabled: true,
      token: "${DISCORD_BOT_TOKEN}",
      groupPolicy: "allowlist",
      dm: {
        enabled: true,
        policy: "pairing",
        allowFrom: ["123456789"],
      },
      guilds: {
        "server-id": {
          slug: "my-server",
          requireMention: true,
          channels: {
            "channel-id": {
              allow: true,
              requireMention: false,
            },
          },
        },
      },
    },
    
    whatsapp: {
      enabled: true,
      dmPolicy: "pairing",
      allowFrom: ["+1234567890"],
    },
    
    slack: {
      botToken: "${SLACK_BOT_TOKEN}",
      appToken: "${SLACK_APP_TOKEN}",
      enabled: true,
    },
    
    signal: { enabled: false },
    imessage: { enabled: false },
  },
}
```

**Channel Providers:**

| Channel | Key Config Fields |
|---------|-------------------|
| `telegram` | `botToken`, `dmPolicy`, `groupPolicy`, `groups`, `accounts` |
| `discord` | `token`, `dm`, `guilds`, `groupPolicy`, `actions` |
| `whatsapp` | `dmPolicy`, `allowFrom`, `groups` |
| `slack` | `botToken`, `appToken`, `channels`, `teams` |
| `signal` | `enabled`, `allowFrom` |
| `imessage` | `enabled`, `allowFrom`, `allowGroups` |
| `msteams` | `enabled`, `tenantId`, `clientId` |
| `googlechat` | `enabled`, `credentials` |
| `feishu` | `enabled`, `appId`, `appSecret` |

### Model/Provider Configuration

```json5
{
  models: {
    mode: "merge",  // "merge" | "replace"
    
    providers: {
      "custom-provider": {
        baseUrl: "https://api.custom.ai/v1",
        apiKey: "${CUSTOM_API_KEY}",
        api: "openai-completions",  // API format
        models: [
          {
            id: "custom-model-1",
            name: "Custom Model",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
            contextWindow: 200000,
            maxTokens: 8192,
          },
        ],
      },
    },
    
    // AWS Bedrock auto-discovery
    bedrockDiscovery: {
      enabled: true,
      region: "us-east-1",
      providerFilter: ["anthropic", "meta"],
    },
  },
  
  // Authentication profiles
  auth: {
    profiles: {
      "anthropic-api": {
        provider: "anthropic",
        mode: "api_key",
      },
      "anthropic-oauth": {
        provider: "anthropic",
        mode: "oauth",
        email: "user@example.com",
      },
    },
    order: {
      anthropic: ["anthropic-oauth", "anthropic-api"],
    },
    cooldowns: {
      billingBackoffHours: 5,
      billingMaxHours: 24,
    },
  },
}
```

**Model API Types:**

| API | Description |
|-----|-------------|
| `openai-completions` | OpenAI Chat Completions API |
| `openai-responses` | OpenAI Responses API |
| `anthropic-messages` | Anthropic Messages API |
| `google-generative-ai` | Google Generative AI |
| `github-copilot` | GitHub Copilot |
| `bedrock-converse-stream` | AWS Bedrock Converse |

### Plugin Configuration

```json5
{
  plugins: {
    enabled: true,
    allow: ["plugin-a", "plugin-b"],
    deny: ["untrusted-plugin"],
    
    load: {
      paths: ["~/openclaw-plugins"],
    },
    
    slots: {
      memory: "custom-memory-plugin",
    },
    
    entries: {
      "plugin-a": {
        enabled: true,
        config: {
          customOption: "value",
        },
      },
    },
    
    installs: {
      "plugin-a": {
        source: "npm",
        spec: "openclaw-plugin-a@1.0.0",
        version: "1.0.0",
        installedAt: "2025-01-15T10:00:00Z",
      },
    },
  },
}
```

### Skills Configuration

```json5
{
  skills: {
    allowBundled: ["filesystem", "git", "browser"],
    
    load: {
      extraDirs: ["~/my-skills", "~/.openclaw/skills"],
      watch: true,
      watchDebounceMs: 500,
    },
    
    install: {
      preferBrew: true,
      nodeManager: "pnpm",
    },
    
    entries: {
      "custom-skill": {
        enabled: true,
        apiKey: "${SKILL_API_KEY}",
        env: { "SKILL_VAR": "value" },
        config: { option: "value" },
      },
    },
  },
}
```

### Tool Configuration

```json5
{
  tools: {
    profile: "full",  // "minimal" | "coding" | "messaging" | "full"
    allow: ["read", "write", "exec"],
    alsoAllow: ["custom_tool"],  // Additive
    deny: ["dangerous_tool"],
    
    byProvider: {
      "anthropic/claude-opus-4-5": {
        allow: ["*"],
        profile: "full",
      },
    },
    
    exec: {
      host: "sandbox",  // "sandbox" | "gateway" | "node"
      security: "allowlist",  // "deny" | "allowlist" | "full"
      ask: "on-miss",  // "off" | "on-miss" | "always"
      backgroundMs: 30000,
      timeoutSec: 300,
    },
    
    elevated: {
      enabled: true,
      allowFrom: {
        telegram: ["123456789"],
        discord: ["user-id"],
      },
    },
    
    web: {
      search: {
        enabled: true,
        provider: "brave",
        apiKey: "${BRAVE_API_KEY}",
        maxResults: 5,
      },
      fetch: {
        enabled: true,
        maxChars: 50000,
        readability: true,
      },
    },
    
    media: {
      image: { enabled: true },
      audio: { enabled: true },
    },
    
    subagents: {
      tools: {
        allow: ["read", "write"],
        deny: ["exec"],
      },
    },
  },
}
```

### Allowlists and Permissions

**DM Policy Types:**

| Policy | Behavior |
|--------|----------|
| `pairing` | Unknown senders get pairing code; owner approves |
| `allowlist` | Only senders in `allowFrom` list |
| `open` | Accept all DMs (requires `allowFrom: ["*"]`) |
| `disabled` | Block all DMs |

**Group Policy Types:**

| Policy | Behavior |
|--------|----------|
| `open` | Groups bypass allowlists; mention-gating applies |
| `disabled` | Block all group messages |
| `allowlist` | Only groups in config |

**Per-Channel Allowlists:**

```json5
{
  channels: {
    telegram: {
      allowFrom: ["123456", "@username"],  // DM allowlist
      groupAllowFrom: ["789012"],          // Group sender allowlist
      groups: {
        "-1001234567890": {
          allowFrom: ["specific-user"],    // Per-group allowlist
          tools: { deny: ["exec"] },
        },
      },
    },
  },
  
  tools: {
    elevated: {
      allowFrom: {
        telegram: ["123456"],
        discord: ["user-id"],
        whatsapp: ["+1234567890"],
      },
    },
  },
}
```

### Session Configuration

```json5
{
  session: {
    scope: "per-sender",  // "per-sender" | "global"
    dmScope: "main",      // "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer"
    
    // Identity linking for DM scoping
    identityLinks: {
      "canonical-id": ["telegram:123", "discord:456", "whatsapp:+1234567890"],
    },
    
    // Session reset triggers
    resetTriggers: ["/reset", "/clear"],
    
    // Reset timing
    reset: {
      mode: "daily",    // "daily" | "idle"
      atHour: 4,        // Reset at 4am local time
      idleMinutes: 480, // Or after 8 hours idle
    },
    
    resetByType: {
      dm: { mode: "idle", idleMinutes: 1440 },
      group: { mode: "daily", atHour: 4 },
      thread: { mode: "idle", idleMinutes: 60 },
    },
    
    resetByChannel: {
      discord: { mode: "idle", idleMinutes: 10080 },
    },
    
    // Session storage
    store: "~/.openclaw/sessions",
    
    // Typing indicators
    typingMode: "thinking",  // "never" | "instant" | "thinking" | "message"
    typingIntervalSeconds: 5,
    
    // Cross-session send policy
    sendPolicy: {
      default: "allow",
      rules: [
        { action: "deny", match: { channel: "telegram", chatType: "group" } },
      ],
    },
    
    // Agent-to-agent messaging
    agentToAgent: {
      maxPingPongTurns: 5,
    },
  },
}
```

### Bindings (Agent-to-Context)

Bindings route specific contexts to specific agents:

```json5
{
  bindings: [
    {
      agentId: "coder",
      match: {
        channel: "discord",
        guildId: "coding-server",
      },
    },
    {
      agentId: "personal",
      match: {
        channel: "telegram",
        peer: { kind: "dm", id: "123456789" },
      },
    },
    {
      agentId: "work",
      match: {
        channel: "slack",
        teamId: "T12345678",
      },
    },
  ],
  
  // Broadcast sends to multiple agents
  broadcast: {
    strategy: "parallel",  // "parallel" | "sequential"
    "peer-123": ["main", "coder"],  // Send to both agents
  },
}
```

---

## Config Management

### Config I/O

```typescript
// From src/config/io.ts
const io = createConfigIO({
  configPath: "~/.openclaw/openclaw.json",
  env: process.env,
});

// Load config (synchronous, cached)
const config = io.loadConfig();

// Read snapshot (async, includes validation details)
const snapshot = await io.readConfigFileSnapshot();
// { path, exists, raw, parsed, valid, config, hash, issues, warnings, legacyIssues }

// Write config (async, validates, rotates backups)
await io.writeConfigFile(config);
```

**Config Caching:**

```typescript
// Cache TTL: 200ms by default
// Override: OPENCLAW_CONFIG_CACHE_MS=0 (disable)
// Disable: OPENCLAW_DISABLE_CONFIG_CACHE=1
```

### Config Backups

On write, OpenClaw rotates 5 backup files:

```
~/.openclaw/
├── openclaw.json         # Current
├── openclaw.json.bak     # Previous
├── openclaw.json.bak.1   # Older
├── openclaw.json.bak.2
├── openclaw.json.bak.3
└── openclaw.json.bak.4   # Oldest
```

### Legacy Migrations

OpenClaw auto-migrates old config shapes. Migrations are applied at load time and persisted on next write.

**Migration Examples (from `legacy.migrations.part-1.ts`):**

| Migration ID | Description |
|--------------|-------------|
| `providers->channels` | Move `telegram`, `discord`, etc. to `channels.*` |
| `routing.allowFrom->channels.whatsapp.allowFrom` | Move allowlist |
| `gateway.token->gateway.auth.token` | Restructure auth |
| `bindings.match.provider->bindings.match.channel` | Rename field |
| `session.sendPolicy.rules.match.provider->match.channel` | Rename field |

**Migration Structure:**

```typescript
type LegacyConfigMigration = {
  id: string;
  describe: string;
  apply: (raw: Record<string, unknown>, changes: string[]) => void;
};
```

### Runtime Overrides

In-memory config patches that don't persist:

```typescript
import { setConfigOverride, resetConfigOverrides } from "./config/runtime-overrides";

// Set override
setConfigOverride("agents.defaults.model.primary", "openai/gpt-5.2");

// Unset override
unsetConfigOverride("agents.defaults.model.primary");

// Clear all overrides
resetConfigOverrides();
```

### Merge Patch (RFC 7386)

For programmatic config updates:

```typescript
import { applyMergePatch } from "./config/merge-patch";

const updated = applyMergePatch(config, {
  agents: {
    defaults: {
      model: { primary: "openai/gpt-5.2" },
    },
  },
  channels: {
    telegram: null,  // Remove key
  },
});
```

**Merge Patch Semantics:**
- `null` value removes key
- Objects merge recursively
- Other values replace

### Config Version Stamping

```json5
{
  meta: {
    lastTouchedVersion: "1.2.3",
    lastTouchedAt: "2025-02-04T10:00:00.000Z",
  },
}
```

Warns when loading config from newer OpenClaw version.

---

## Identity Configuration

### Agent Identity

```json5
{
  agents: {
    list: [
      {
        id: "atlas",
        identity: {
          name: "Atlas",
          emoji: "🧭",
          theme: "explorer",
          avatar: "https://example.com/avatar.png",  // URL, path, or data URI
        },
      },
    ],
  },
}
```

### UI Identity

```json5
{
  ui: {
    seamColor: "#6366f1",  // Hex color
    assistant: {
      name: "Atlas",
      avatar: "🧭",  // Emoji, URL, or data URI
    },
  },
}
```

### Session Identity Links

Map platform identities to canonical peers:

```json5
{
  session: {
    dmScope: "per-peer",
    identityLinks: {
      // Canonical ID → Platform identities
      "tyler": [
        "telegram:123456789",
        "discord:987654321",
        "whatsapp:+17072876731",
      ],
      "casey": [
        "telegram:111222333",
        "imessage:casey@example.com",
      ],
    },
  },
}
```

This enables cross-platform session continuity.

### DM Scoping Modes

| Mode | Session Key Pattern |
|------|---------------------|
| `main` | All DMs share main session |
| `per-peer` | `dm:{canonicalPeerId}` |
| `per-channel-peer` | `dm:{channel}:{peerId}` |
| `per-account-channel-peer` | `dm:{accountId}:{channel}:{peerId}` |

---

## Key Files Reference

### Core Config Module

| File | Purpose |
|------|---------|
| `src/config/config.ts` | Public exports barrel |
| `src/config/io.ts` | Config I/O (read/write/snapshot) |
| `src/config/paths.ts` | Path resolution |
| `src/config/defaults.ts` | Default value application |
| `src/config/validation.js` | Zod validation wrapper |

### Type Definitions

| File | Defines |
|------|---------|
| `types.ts` | Barrel export |
| `types.openclaw.ts` | `OpenClawConfig` root type |
| `types.agents.ts` | `AgentConfig`, `AgentsConfig` |
| `types.agent-defaults.ts` | `AgentDefaultsConfig` |
| `types.channels.ts` | `ChannelsConfig`, `ChannelDefaultsConfig` |
| `types.discord.ts` | `DiscordConfig`, `DiscordAccountConfig` |
| `types.telegram.ts` | `TelegramConfig`, `TelegramAccountConfig` |
| `types.whatsapp.ts` | `WhatsAppConfig` |
| `types.slack.ts` | `SlackConfig` |
| `types.signal.ts` | `SignalConfig` |
| `types.imessage.ts` | `IMessageConfig` |
| `types.models.ts` | `ModelsConfig`, `ModelProviderConfig` |
| `types.plugins.ts` | `PluginsConfig`, `PluginEntryConfig` |
| `types.skills.ts` | `SkillsConfig`, `SkillConfig` |
| `types.tools.ts` | `ToolsConfig`, `ExecToolConfig` |
| `types.auth.ts` | `AuthConfig`, `AuthProfileConfig` |
| `types.base.ts` | `SessionConfig`, `LoggingConfig`, etc. |
| `types.messages.ts` | `MessagesConfig`, `CommandsConfig` |
| `types.gateway.ts` | `GatewayConfig`, `TalkConfig` |
| `types.hooks.ts` | `HooksConfig` |
| `types.memory.ts` | `MemoryConfig` |
| `types.sandbox.ts` | `SandboxDockerSettings` |

### Schema Definitions

| File | Schemas |
|------|---------|
| `zod-schema.ts` | `OpenClawSchema` (root) |
| `zod-schema.agents.ts` | `AgentsSchema`, `BindingsSchema` |
| `zod-schema.agent-defaults.ts` | `AgentDefaultsSchema` |
| `zod-schema.agent-runtime.ts` | `AgentEntrySchema`, `ToolsSchema` |
| `zod-schema.channels.ts` | `ChannelHeartbeatVisibilitySchema` |
| `zod-schema.providers.ts` | `ChannelsSchema` |
| `zod-schema.session.ts` | `SessionSchema`, `MessagesSchema`, `CommandsSchema` |
| `zod-schema.core.ts` | `ModelsConfigSchema`, `HexColorSchema` |
| `zod-schema.hooks.ts` | `HookMappingSchema`, `InternalHooksSchema` |
| `zod-schema.approvals.ts` | `ApprovalsSchema` |

### Config Utilities

| File | Purpose |
|------|---------|
| `includes.ts` | `$include` directive resolution |
| `env-substitution.ts` | `${VAR}` substitution |
| `env-vars.ts` | Collect config-defined env vars |
| `runtime-overrides.ts` | In-memory overrides |
| `merge-patch.ts` | RFC 7386 merge patch |
| `merge-config.ts` | Config merging utilities |
| `normalize-paths.ts` | Path normalization |
| `config-paths.ts` | Config path parsing/manipulation |

### Migration Files

| File | Purpose |
|------|---------|
| `legacy.ts` | Legacy issue detection |
| `legacy.migrations.ts` | Migration registry |
| `legacy.migrations.part-1.ts` | Migrations batch 1 |
| `legacy.migrations.part-2.ts` | Migrations batch 2 |
| `legacy.migrations.part-3.ts` | Migrations batch 3 |
| `legacy.rules.ts` | Migration rules |
| `legacy.shared.ts` | Migration utilities |
| `legacy-migrate.ts` | Migration execution |

### Session Management

| File | Purpose |
|------|---------|
| `sessions.ts` | Session exports barrel |
| `sessions/types.ts` | Session types |
| `sessions/paths.ts` | Session path resolution |
| `sessions/store.ts` | Session storage |
| `sessions/reset.ts` | Session reset logic |
| `sessions/session-key.ts` | Session key generation |
| `sessions/main-session.ts` | Main session handling |
| `sessions/group.ts` | Group session handling |
| `sessions/metadata.ts` | Session metadata |
| `sessions/transcript.ts` | Session transcript |

---

## Nexus Config Domain Separation

Based on this analysis, Nexus should consider splitting into these config domains:

| Domain | OpenClaw Sections | Nexus Purpose |
|--------|-------------------|---------------|
| **Identity** | `agents[].identity`, `ui.assistant` | Agent/user identity |
| **Agents** | `agents`, `bindings`, `broadcast` | Agent definitions, routing |
| **Channels** | `channels.*` | Platform connections |
| **Models** | `models`, `auth` | Provider configuration |
| **Skills** | `skills` | Capability definitions |
| **Plugins** | `plugins` | Extension system |
| **Tools** | `tools` | Tool policies |
| **Sessions** | `session` | Session management |
| **Gateway** | `gateway`, `hooks`, `cron` | Runtime server |
| **System** | `logging`, `diagnostics`, `update` | System settings |

This separation enables:
- Per-domain validation schemas
- Independent versioning
- Cleaner mental model
- Easier testing and mocking
