# Upstream Gateway & Channel System

This document details how upstream clawdbot handles its gateway server, channel adapters, service management, and session routing.

---

## Table of Contents

1. [Gateway Overview](#gateway-overview)
2. [Gateway Startup](#gateway-startup)
3. [Gateway Configuration](#gateway-configuration)
4. [Channel Plugin Architecture](#channel-plugin-architecture)
5. [Channel Adapters](#channel-adapters)
6. [Channel Setup Flow](#channel-setup-flow)
7. [Session Routing](#session-routing)
8. [Service Management](#service-management)

---

## Gateway Overview

The gateway is the central WebSocket + HTTP server that:
- Handles all agent communication
- Manages channel connections (WhatsApp, Telegram, Discord, etc.)
- Provides the Control UI (web dashboard)
- Exposes optional HTTP endpoints (`/v1/chat/completions`, `/v1/responses`)
- Coordinates with mobile/desktop node apps

**Default port:** `18789`

**Architecture:**

```
┌─────────────────────────────────────────────────────┐
│                   Gateway Server                    │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ WS Core │  │ HTTP API │  │ Control UI        │  │
│  └────┬────┘  └────┬─────┘  └─────────┬─────────┘  │
│       │            │                  │            │
│  ┌────┴────────────┴──────────────────┴────────┐   │
│  │            Channel Manager                   │   │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────────┐ │   │
│  │  │WhatsApp │ │ Telegram │ │ Discord, etc. │ │   │
│  │  └─────────┘ └──────────┘ └───────────────┘ │   │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## Gateway Startup

### When Does Gateway Start?

The gateway starts **after onboarding** via daemon installation:

1. **During `clawdbot onboard`**: User completes auth, workspace, and channel setup
2. **Daemon install step**: The wizard prompts to install the gateway service
3. **Service starts**: launchd (macOS), systemd (Linux), or schtasks (Windows) launches the gateway

### Startup Sequence

```typescript
// From server.impl.ts - startGatewayServer()

1. Read and validate config (CONFIG_PATH_CLAWDBOT = ~/.config/clawdbot/config.json5)
2. Migrate legacy config if needed
3. Load plugin registry (channel plugins, extensions)
4. Resolve gateway runtime config (bind, port, auth, TLS)
5. Create HTTP server + WebSocket server
6. Start sidecars (startGatewaySidecars):
   - Browser control server (optional)
   - Gmail watcher (optional)
   - Internal hooks
   - Channel startup (startChannels)
   - Plugin services
7. Start discovery (Bonjour/mDNS)
8. Start maintenance timers (health checks, cleanup)
9. Start cron service
10. Enable config hot-reload watcher
```

### Boot File (BOOT.md)

On gateway startup, it can run a `BOOT.md` file from the workspace:

```typescript
// From boot.ts
const BOOT_FILENAME = "BOOT.md";

// If BOOT.md exists in workspace, agent runs it on startup
// Used for startup notifications, health checks, etc.
```

---

## Gateway Configuration

### Full Gateway Config Schema

```typescript
// From types.gateway.ts

type GatewayConfig = {
  // Single multiplexed port for Gateway WS + HTTP (default: 18789)
  port?: number;
  
  // Explicit gateway mode
  // "local": CLI may start gateway locally
  // "remote": local gateway start is disabled
  mode?: "local" | "remote";
  
  // Bind address policy
  bind?: GatewayBindMode;
  // - "loopback": 127.0.0.1 (local-only, default)
  // - "lan": 0.0.0.0 (all interfaces)
  // - "auto": loopback if available, else 0.0.0.0
  // - "tailnet": Tailscale IPv4 (100.x.x.x)
  // - "custom": user-specified IP (requires customBindHost)
  
  // Custom IP for bind="custom" mode
  customBindHost?: string;
  
  // Control UI settings
  controlUi?: {
    enabled?: boolean;           // Serve the web UI (default: true)
    basePath?: string;           // Base path prefix (e.g., "/clawdbot")
    allowInsecureAuth?: boolean; // Allow token auth over HTTP
  };
  
  // Authentication
  auth?: {
    mode?: "token" | "password";
    token?: string;              // Shared token for token mode
    password?: string;           // Password for password mode
    allowTailscale?: boolean;    // Allow Tailscale identity headers
  };
  
  // Tailscale exposure
  tailscale?: {
    mode?: "off" | "serve" | "funnel";
    resetOnExit?: boolean;       // Reset serve/funnel on shutdown
  };
  
  // Remote gateway connection
  remote?: {
    url?: string;                // WebSocket URL (ws:// or wss://)
    token?: string;              // Token for remote auth
    password?: string;           // Password for remote auth
    tlsFingerprint?: string;     // Expected TLS fingerprint
    sshTarget?: string;          // SSH target for tunneling
    sshIdentity?: string;        // SSH identity file
  };
  
  // Config reload behavior
  reload?: {
    mode?: "off" | "restart" | "hot" | "hybrid";
    debounceMs?: number;         // Default: 300
  };
  
  // TLS settings
  tls?: {
    enabled?: boolean;
    autoGenerate?: boolean;      // Auto-generate self-signed cert
    certPath?: string;
    keyPath?: string;
    caPath?: string;
  };
  
  // HTTP endpoint settings
  http?: {
    endpoints?: {
      chatCompletions?: { enabled?: boolean };
      responses?: { enabled?: boolean; maxBodyBytes?: number; ... };
    };
  };
  
  // Node connection settings
  nodes?: {
    allowCommands?: string[];
    denyCommands?: string[];
  };
};
```

### Auth Modes

```typescript
// From auth.ts - resolveGatewayAuth()

type ResolvedGatewayAuth = {
  mode: "none" | "token" | "password";
  token?: string;
  password?: string;
  allowTailscale: boolean;
};

// Auth resolution priority:
// 1. Config: gateway.auth.token or gateway.auth.password
// 2. Env: CLAWDBOT_GATEWAY_TOKEN or CLAWDBOT_GATEWAY_PASSWORD
// 3. Default: "none" if loopback, "token" otherwise

// Tailscale auth:
// - If tailscale.mode === "serve" and auth.mode !== "password"
// - Allows identity via Tailscale-User-Login header
```

### Environment Variables

```
CLAWDBOT_GATEWAY_PORT       - Override gateway port
CLAWDBOT_GATEWAY_TOKEN      - Gateway auth token
CLAWDBOT_GATEWAY_PASSWORD   - Gateway auth password
CLAWDBOT_SKIP_CHANNELS      - Skip channel startup (testing)
CLAWDBOT_SKIP_GMAIL_WATCHER - Skip Gmail watcher startup
```

---

## Channel Plugin Architecture

### Plugin Interface

```typescript
// From types.plugin.ts

type ChannelPlugin<ResolvedAccount = any> = {
  id: ChannelId;                    // "whatsapp", "telegram", "discord", etc.
  meta: ChannelMeta;                // Display info, docs path, order
  capabilities: ChannelCapabilities; // Feature flags
  defaults?: { queue?: { debounceMs?: number } };
  reload?: { configPrefixes: string[] };
  
  // CLI onboarding wizard hooks
  onboarding?: ChannelOnboardingAdapter;
  
  // Account management
  config: ChannelConfigAdapter<ResolvedAccount>;
  configSchema?: ChannelConfigSchema;
  
  // Lifecycle adapters
  setup?: ChannelSetupAdapter;
  pairing?: ChannelPairingAdapter;
  security?: ChannelSecurityAdapter<ResolvedAccount>;
  
  // Messaging adapters
  groups?: ChannelGroupAdapter;
  mentions?: ChannelMentionAdapter;
  outbound?: ChannelOutboundAdapter;
  
  // Runtime adapters
  status?: ChannelStatusAdapter<ResolvedAccount>;
  gateway?: ChannelGatewayAdapter<ResolvedAccount>;  // Start/stop
  
  // Auth & access
  auth?: ChannelAuthAdapter;
  elevated?: ChannelElevatedAdapter;
  commands?: ChannelCommandAdapter;
  
  // Message handling
  streaming?: ChannelStreamingAdapter;
  threading?: ChannelThreadingAdapter;
  messaging?: ChannelMessagingAdapter;
  agentPrompt?: ChannelAgentPromptAdapter;
  directory?: ChannelDirectoryAdapter;
  resolver?: ChannelResolverAdapter;
  actions?: ChannelMessageActionAdapter;
  heartbeat?: ChannelHeartbeatAdapter;
  
  // Agent tools owned by channel
  agentTools?: ChannelAgentToolFactory | ChannelAgentTool[];
};
```

### Channel Manager

The `ChannelManager` handles runtime lifecycle:

```typescript
// From server-channels.ts

type ChannelManager = {
  getRuntimeSnapshot: () => ChannelRuntimeSnapshot;
  startChannels: () => Promise<void>;    // Start all enabled channels
  startChannel: (id, accountId?) => Promise<void>;
  stopChannel: (id, accountId?) => Promise<void>;
  markChannelLoggedOut: (id, cleared, accountId?) => void;
};

// Channel account snapshot
type ChannelAccountSnapshot = {
  accountId: string;
  running?: boolean;
  connected?: boolean;
  lastStartAt?: number;
  lastStopAt?: number;
  lastError?: string | null;
};
```

### Plugin Discovery

Plugins are discovered from:
1. **config**: Paths in config file
2. **workspace**: `plugins/` in workspace
3. **global**: `~/.clawdbot/plugins/`
4. **bundled**: Built-in `extensions/` directory

```typescript
// From catalog.ts
const ORIGIN_PRIORITY: Record<PluginOrigin, number> = {
  config: 0,    // Highest priority
  workspace: 1,
  global: 2,
  bundled: 3,   // Lowest priority
};
```

---

## Channel Adapters

### WhatsApp

**Setup flow:**
1. QR code scan via web login (`loginWeb()`)
2. Credentials stored in `~/.clawdbot/whatsapp/{accountId}/creds.json`

**Configuration:**
```typescript
channels.whatsapp: {
  enabled?: boolean;
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  allowFrom?: string[];        // E.164 phone numbers
  selfChatMode?: boolean;      // Use "Notes to Self" as main session
  accounts?: Record<string, WhatsAppAccountConfig>;
}
```

**Key adapter methods:**
- `whatsappOnboardingAdapter.configure()`: Prompts for QR scan, phone number
- Checks for existing credentials via `detectWhatsAppLinked()`
- Personal phone mode auto-sets `dmPolicy: "allowlist"` + `selfChatMode: true`

### Telegram

**Setup flow:**
1. Get bot token from @BotFather
2. Configure via env (`TELEGRAM_BOT_TOKEN`) or config

**Configuration:**
```typescript
channels.telegram: {
  enabled?: boolean;
  botToken?: string;           // Or use env TELEGRAM_BOT_TOKEN
  tokenFile?: string;          // Path to token file
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  allowFrom?: (string | number)[];  // Telegram user IDs
  accounts?: Record<string, TelegramAccountConfig>;
}
```

**Key features:**
- Username resolution via Telegram API (`getChat`)
- User ID lookup for allowlist

### Discord

**Setup flow:**
1. Create bot in Discord Developer Portal
2. Enable Message Content Intent
3. Generate OAuth2 invite URL with `bot` scope
4. Paste bot token

**Configuration:**
```typescript
channels.discord: {
  enabled?: boolean;
  token?: string;              // Or use env DISCORD_BOT_TOKEN
  dm?: {
    enabled?: boolean;
    policy?: DmPolicy;
    allowFrom?: string[];      // Discord user IDs
  };
  groupPolicy?: "open" | "allowlist" | "disabled";
  guilds?: Record<string, DiscordGuildEntry>;
  accounts?: Record<string, DiscordAccountConfig>;
}
```

**Guild/Channel allowlisting:**
```typescript
guilds: {
  "guild-id-or-name": {
    channels: {
      "channel-id-or-name": { allow: true }
    }
  }
}
```

### iMessage (macOS)

**Setup flow:**
1. Requires `imsg` CLI tool (separate install)
2. Requires Full Disk Access + Automation permissions

**Configuration:**
```typescript
channels.imessage: {
  enabled?: boolean;
  cliPath?: string;            // Path to imsg binary (default: "imsg")
  dbPath?: string;             // Custom chat.db path
  dmPolicy?: DmPolicy;
  allowFrom?: string[];        // Phone numbers, emails, or chat_id:X
  service?: string;            // iMessage service identifier
  region?: string;
  accounts?: Record<string, IMessageAccountConfig>;
}
```

**AllowFrom formats:**
- Phone: `+15555550123`
- Email: `user@example.com`
- Chat ID: `chat_id:123`
- Chat GUID: `chat_guid:...`

### Signal

**Setup flow:**
1. Requires signal-cli installation
2. Link or register phone number

**Configuration:**
```typescript
channels.signal: {
  enabled?: boolean;
  cliPath?: string;
  phoneNumber?: string;
  dmPolicy?: DmPolicy;
  allowFrom?: string[];
  accounts?: Record<string, SignalAccountConfig>;
}
```

### Slack

**Setup flow:**
1. Create Slack App in API dashboard
2. Configure OAuth scopes
3. Install to workspace
4. Get bot token

**Configuration:**
```typescript
channels.slack: {
  enabled?: boolean;
  botToken?: string;           // xoxb-...
  appToken?: string;           // xapp-... (for socket mode)
  signingSecret?: string;
  dmPolicy?: DmPolicy;
  allowFrom?: string[];        // Slack user IDs
  accounts?: Record<string, SlackAccountConfig>;
}
```

---

## Channel Setup Flow

### Onboarding Wizard

```typescript
// From wizard/onboarding.ts

1. User runs `clawdbot onboard`
2. Risk acknowledgement prompt
3. Config handling (keep/modify/reset)
4. Flow selection (QuickStart vs Advanced)
5. Workspace directory setup
6. Auth choice (API key, Claude.ai, etc.)
7. Model selection
8. Gateway configuration
9. **Channel setup** (`setupChannels()`)
10. Config save
11. Skills setup
12. Hooks setup
13. Daemon installation
14. Health check
```

### Channel Selection UI

```typescript
// Channels are sorted by quickstartScore
// Higher score = more likely to work out-of-the-box

type ChannelOnboardingStatus = {
  channel: ChannelId;
  configured: boolean;        // Already has credentials
  statusLines: string[];      // Display text
  selectionHint?: string;     // Hint next to option
  quickstartScore?: number;   // Sorting priority
};
```

### DM Policy Options

All channels support similar DM policies:

```typescript
type DmPolicy = "pairing" | "allowlist" | "open" | "disabled";

// pairing (default): Unknown senders get a pairing code; owner approves
// allowlist: Unknown senders blocked; only allowFrom can initiate
// open: Anyone can DM (requires allowFrom: ["*"])
// disabled: Ignore all DMs on this channel
```

### Pairing Flow

For channels with `dmPolicy: "pairing"`:
1. Unknown sender messages the bot
2. Bot generates a pairing code
3. Owner approves/denies in Control UI
4. Approved senders added to allowlist automatically

---

## Session Routing

### Session Key Format

```typescript
// From session-key.ts

// Main session (collapsed DMs):
`agent:${agentId}:${mainKey}`
// Example: "agent:main:main"

// Per-peer DM session:
`agent:${agentId}:dm:${peerId}`
// Example: "agent:main:dm:+15555550123"

// Per-channel-peer DM session:
`agent:${agentId}:${channel}:dm:${peerId}`
// Example: "agent:main:whatsapp:dm:+15555550123"

// Group session (always isolated):
`agent:${agentId}:${channel}:group:${groupId}`
// Example: "agent:main:discord:group:123456789"

// Channel session:
`agent:${agentId}:${channel}:channel:${channelId}`
// Example: "agent:main:slack:channel:C01234567"

// Thread session:
`${baseSessionKey}:thread:${threadId}`
```

### DM Scope Options

```typescript
type DmScope = "main" | "per-peer" | "per-channel-peer";

// main: All DMs collapse into single session (default)
// per-peer: Each unique sender gets their own session
// per-channel-peer: Each channel+sender pair gets own session
```

### Identity Links

For cross-channel user identification:

```typescript
// Config: routing.identityLinks
{
  "tyler": [
    "telegram:123456789",
    "discord:987654321",
    "+15555550123"
  ]
}

// When dmScope is per-peer, messages from any linked ID
// route to the same session
```

### Group History Key

Groups are always isolated and include account:

```typescript
// From session-key.ts - buildGroupHistoryKey()
`${channel}:${accountId}:${peerKind}:${peerId}`
// Example: "discord:default:group:123456789"
```

---

## Service Management

### macOS (launchd)

**Service label:** `com.clawdbot.gateway`

**Plist location:** `~/Library/LaunchAgents/com.clawdbot.gateway.plist`

**Log location:** `~/.clawdbot/logs/gateway.log`

```typescript
// From launchd.ts

// Install
await installLaunchAgent({
  env,
  stdout,
  programArguments,    // ["node", "/path/to/clawdbot", "gateway", "start"]
  workingDirectory,
  environment,         // CLAWDBOT_GATEWAY_PORT, etc.
});

// Key launchctl commands:
// - launchctl bootstrap gui/$UID /path/to/plist
// - launchctl kickstart -k gui/$UID/com.clawdbot.gateway
// - launchctl bootout gui/$UID/com.clawdbot.gateway

// Operations
await stopLaunchAgent({ stdout, env });
await restartLaunchAgent({ stdout, env });
await uninstallLaunchAgent({ env, stdout });

// Status check
const runtime = await readLaunchAgentRuntime(env);
// { status: "running", pid: 12345, state: "running" }
```

### Linux (systemd)

**Service name:** `clawdbot-gateway`

**Unit location:** `~/.config/systemd/user/clawdbot-gateway.service`

```typescript
// From systemd.ts

// Install
await installSystemdService({
  env,
  stdout,
  programArguments,
  workingDirectory,
  environment,
  description: "Clawdbot Gateway",
});

// Key systemctl commands:
// - systemctl --user daemon-reload
// - systemctl --user enable clawdbot-gateway.service
// - systemctl --user restart clawdbot-gateway.service

// User lingering (required for service to run after logout):
// - loginctl enable-linger $USER

// Operations
await stopSystemdService({ stdout, env });
await restartSystemdService({ stdout, env });
await uninstallSystemdService({ env, stdout });

// Status check
const runtime = await readSystemdServiceRuntime(env);
// { status: "running", pid: 12345, activeState: "active" }
```

### Windows (schtasks)

**Task name:** `Clawdbot Gateway`

```typescript
// From schtasks.ts

// Uses Windows Task Scheduler
// Requires elevated PowerShell for installation
```

### Profile Support

Multiple gateway instances can run with different profiles:

```typescript
// Env: CLAWDBOT_PROFILE=work
// Results in:
// - macOS: com.clawdbot.work
// - Linux: clawdbot-gateway-work
// - Windows: Clawdbot Gateway (work)

function resolveGatewayLaunchAgentLabel(profile?: string): string {
  const normalized = normalizeGatewayProfile(profile);
  if (!normalized) return "com.clawdbot.gateway";
  return `com.clawdbot.${normalized}`;
}
```

### Service Environment

```typescript
// From service-env.ts - buildServiceEnvironment()

const environment = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  CLAWDBOT_GATEWAY_PORT: String(port),
  CLAWDBOT_GATEWAY_TOKEN: token,           // If token auth
  CLAWDBOT_LAUNCHD_LABEL: label,           // macOS only
  CLAWDBOT_SERVICE_VERSION: version,
  // ... other relevant env vars
};
```

---

## Key Differences from Nexus

| Aspect | Upstream | Nexus |
|--------|----------|-------|
| Gateway mode | Required, always runs | Optional, CLI-centric |
| Channel plugins | Plugin architecture | TBD |
| Session routing | Complex key format | Simpler approach |
| Service management | Full launchd/systemd | TBD |
| Config location | `~/.config/clawdbot/` | `~/nexus/` |

---

## Implementation Notes for Nexus

### What to Adopt

1. **Service management** - launchd/systemd integration is solid and well-tested
2. **Channel plugin interface** - Clean separation of concerns
3. **DM policy model** - pairing/allowlist/open/disabled is intuitive
4. **Gateway config schema** - Comprehensive and well-typed

### What to Simplify

1. **Session key format** - Consider simpler key structure
2. **Identity links** - May be overkill for initial implementation
3. **Multiple accounts per channel** - Start with single account

### Dependencies

- **WhatsApp**: Uses `baileys` library for WhatsApp Web protocol
- **Telegram**: Uses official Bot API
- **Discord**: Uses `discord.js`
- **Signal**: Requires external `signal-cli`
- **iMessage**: Requires external `imsg` CLI

---

## References

- `src/gateway/server.impl.ts` - Main gateway server
- `src/gateway/server-startup.ts` - Sidecar startup (channels)
- `src/gateway/server-channels.ts` - Channel manager
- `src/gateway/auth.ts` - Gateway authentication
- `src/channels/plugins/` - Channel plugin system
- `src/channels/plugins/onboarding/` - Per-channel setup wizards
- `src/routing/session-key.ts` - Session key utilities
- `src/daemon/launchd.ts` - macOS service management
- `src/daemon/systemd.ts` - Linux service management
- `src/config/types.gateway.ts` - Gateway config types
- `src/wizard/onboarding.ts` - Onboarding wizard
