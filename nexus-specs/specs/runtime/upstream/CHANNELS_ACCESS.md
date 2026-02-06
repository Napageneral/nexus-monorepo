# OpenClaw Channels & Access Control

> **Status:** Upstream reference documentation  
> **Source:** `~/nexus/home/projects/openclaw/`  
> **Key directories:** `src/channels/`, `src/routing/`, `src/security/`

This document maps OpenClaw's channel abstraction layer, access control mechanisms, and session routing to inform Nexus's IAM system design.

---

## Table of Contents

1. [Channel System Overview](#1-channel-system-overview)
2. [Channel Registry](#2-channel-registry)
3. [Channel Dock Metadata](#3-channel-dock-metadata)
4. [Access Control](#4-access-control)
5. [Session Routing](#5-session-routing)
6. [Security Utilities](#6-security-utilities)
7. [Channel-Specific Logic](#7-channel-specific-logic)
8. [Mapping to Nexus IAM](#8-mapping-to-nexus-iam)

---

## 1. Channel System Overview

OpenClaw's channel system provides a unified abstraction over multiple messaging platforms. The architecture consists of:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Channel Layer                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Registry   │────│    Dock     │────│   Plugin    │         │
│  │ (ordering,  │    │ (metadata,  │    │ (full impl) │         │
│  │  aliases)   │    │ capabilities)│    │             │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                     Access Control Layer                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────┐       │
│  │  Allowlist   │  │   Mention     │  │   Command      │       │
│  │   Matching   │  │    Gating     │  │    Gating      │       │
│  └──────────────┘  └───────────────┘  └────────────────┘       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                      Routing Layer                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────┐       │
│  │   Bindings   │  │  Resolve      │  │   Session      │       │
│  │  (agent ↔    │  │   Route       │  │     Key        │       │
│  │   channel)   │  │               │  │   Builder      │       │
│  └──────────────┘  └───────────────┘  └────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Channel** | A messaging platform (telegram, whatsapp, discord, etc.) |
| **Account** | An instance of a channel connection (bot token, linked device) |
| **Peer** | A conversation partner (user DM, group, channel) |
| **Session** | Stateful conversation context keyed by agent+channel+peer |
| **Binding** | Rule mapping channel/account/peer to a specific agent |

---

## 2. Channel Registry

**Source:** `src/channels/registry.ts`

The registry defines core chat channels with ordering, metadata, and aliases.

### Core Channel Order

```typescript
export const CHAT_CHANNEL_ORDER = [
  "telegram",
  "whatsapp", 
  "discord",
  "googlechat",
  "slack",
  "signal",
  "imessage",
] as const;
```

### Channel Aliases

```typescript
export const CHAT_CHANNEL_ALIASES: Record<string, ChatChannelId> = {
  imsg: "imessage",
  "google-chat": "googlechat",
  gchat: "googlechat",
};
```

### Normalization Functions

| Function | Purpose |
|----------|---------|
| `normalizeChatChannelId(raw)` | Normalizes input to a valid channel ID, resolving aliases |
| `normalizeAnyChannelId(raw)` | Includes plugins from the runtime registry |
| `normalizeChannelKey(raw)` | Basic string normalization (trim, lowercase) |

### Channel Metadata Structure

```typescript
type ChannelMeta = {
  id: ChannelId;
  label: string;              // "Telegram"
  selectionLabel: string;     // "Telegram (Bot API)"
  detailLabel?: string;       // "Telegram Bot"
  docsPath: string;           // "/channels/telegram"
  blurb: string;              // Setup description
  order?: number;             // Display ordering
  aliases?: string[];         // Alternative names
  systemImage?: string;       // SF Symbol name
  quickstartAllowFrom?: boolean;
  forceAccountBinding?: boolean;
  preferSessionLookupForAnnounceTarget?: boolean;
};
```

---

## 3. Channel Dock Metadata

**Source:** `src/channels/dock.ts`

Docks provide lightweight channel behavior without loading full plugin implementations. They're used for shared code paths.

### Dock Structure

```typescript
type ChannelDock = {
  id: ChannelId;
  capabilities: ChannelCapabilities;
  commands?: ChannelCommandAdapter;
  outbound?: {
    textChunkLimit?: number;
  };
  streaming?: {
    blockStreamingCoalesceDefaults?: {
      minChars?: number;
      idleMs?: number;
    };
  };
  elevated?: ChannelElevatedAdapter;
  config?: {
    resolveAllowFrom?: (params) => Array<string | number> | undefined;
    formatAllowFrom?: (params) => string[];
  };
  groups?: ChannelGroupAdapter;
  mentions?: ChannelMentionAdapter;
  threading?: ChannelThreadingAdapter;
  agentPrompt?: ChannelAgentPromptAdapter;
};
```

### Channel Capabilities Matrix

| Channel | Chat Types | Native Commands | Polls | Reactions | Threads | Block Streaming |
|---------|-----------|-----------------|-------|-----------|---------|-----------------|
| telegram | direct, group, channel, thread | ✓ | - | - | - | ✓ |
| whatsapp | direct, group | - | ✓ | ✓ | - | - |
| discord | direct, channel, thread | ✓ | ✓ | ✓ | ✓ | - |
| googlechat | direct, group, thread | - | - | ✓ | ✓ | ✓ |
| slack | direct, channel, thread | ✓ | - | ✓ | ✓ | - |
| signal | direct, group | - | - | ✓ | - | - |
| imessage | direct, group | - | - | ✓ | - | - |

### Text Chunk Limits

| Channel | Limit |
|---------|-------|
| discord | 2000 |
| telegram, whatsapp, slack, signal, imessage, googlechat | 4000 |

---

## 4. Access Control

### 4.1 Allowlist Matching

**Source:** `src/channels/allowlist-match.ts`, `src/channels/channel-config.ts`

Allowlists control who can interact with the bot. Matching sources indicate how a match was found.

#### Match Sources

```typescript
type AllowlistMatchSource =
  | "wildcard"        // Matched "*"
  | "id"              // Matched sender ID
  | "name"            // Matched sender name
  | "tag"             // Matched @username tag
  | "username"        // Matched username
  | "prefixed-id"     // Matched channel:id format
  | "prefixed-user"   // Matched user:id format
  | "prefixed-name"   // Matched name:value format
  | "slug"            // Matched normalized slug
  | "localpart";      // Matched email localpart
```

#### Match Result

```typescript
type AllowlistMatch = {
  allowed: boolean;
  matchKey?: string;    // The entry that matched
  matchSource?: string; // How it matched
};
```

#### Channel Entry Matching Algorithm

```typescript
// src/channels/channel-config.ts

function resolveChannelEntryMatchWithFallback(params) {
  // 1. Try direct key match
  const direct = resolveChannelEntryMatch({
    entries: params.entries,
    keys: params.keys,
    wildcardKey: params.wildcardKey,
  });
  
  if (direct.entry && direct.key) {
    return { ...direct, matchSource: "direct" };
  }
  
  // 2. Try normalized key match
  if (normalizeKey) {
    const normalizedKeys = params.keys.map(normalizeKey).filter(Boolean);
    for (const [entryKey, entry] of Object.entries(params.entries)) {
      if (normalizedKeys.includes(normalizeKey(entryKey))) {
        return { ...direct, entry, matchSource: "direct" };
      }
    }
  }
  
  // 3. Try parent key inheritance
  const parentKeys = params.parentKeys ?? [];
  if (parentKeys.length > 0) {
    const parent = resolveChannelEntryMatch({ entries, keys: parentKeys });
    if (parent.entry) {
      return { ...direct, entry: parent.entry, matchSource: "parent" };
    }
  }
  
  // 4. Fall back to wildcard
  if (direct.wildcardEntry) {
    return { ...direct, entry: direct.wildcardEntry, matchSource: "wildcard" };
  }
  
  return direct;
}
```

#### Match Priority Flowchart

```
┌────────────────────────┐
│  Incoming Message      │
└──────────┬─────────────┘
           ▼
┌────────────────────────┐
│ Extract sender keys:   │
│ - senderId             │
│ - senderUsername       │
│ - senderName           │
│ - senderE164           │
└──────────┬─────────────┘
           ▼
┌────────────────────────┐     ┌──────────────────┐
│ Try direct match       │────▶│ ALLOWED (direct) │
│ against allowlist      │ yes └──────────────────┘
└──────────┬─────────────┘
           │ no
           ▼
┌────────────────────────┐     ┌──────────────────┐
│ Try normalized match   │────▶│ ALLOWED (direct) │
│ (lowercase, slugify)   │ yes └──────────────────┘
└──────────┬─────────────┘
           │ no
           ▼
┌────────────────────────┐     ┌──────────────────┐
│ Try parent match       │────▶│ ALLOWED (parent) │
│ (thread → channel)     │ yes └──────────────────┘
└──────────┬─────────────┘
           │ no
           ▼
┌────────────────────────┐     ┌────────────────────┐
│ Wildcard "*" in list?  │────▶│ ALLOWED (wildcard) │
└──────────┬─────────────┘ yes └────────────────────┘
           │ no
           ▼
┌────────────────────────┐
│      DENIED            │
└────────────────────────┘
```

#### Nested Allowlist Logic

For hierarchical configs (e.g., guild → channel in Discord):

```typescript
function resolveNestedAllowlistDecision(params: {
  outerConfigured: boolean;  // Guild allowlist exists?
  outerMatched: boolean;     // Sender matched guild?
  innerConfigured: boolean;  // Channel allowlist exists?
  innerMatched: boolean;     // Sender matched channel?
}): boolean {
  if (!params.outerConfigured) return true;  // No outer = allow
  if (!params.outerMatched) return false;    // Outer miss = deny
  if (!params.innerConfigured) return true;  // No inner = allow
  return params.innerMatched;                // Inner decides
}
```

### 4.2 Mention Gating

**Source:** `src/channels/mention-gating.ts`

Controls whether the bot responds in group chats based on @mentions.

#### Parameters

```typescript
type MentionGateParams = {
  requireMention: boolean;     // Config: require @mention in groups?
  canDetectMention: boolean;   // Platform supports mention detection?
  wasMentioned: boolean;       // Was the bot @mentioned?
  implicitMention?: boolean;   // Reply to bot's message?
  shouldBypassMention?: boolean; // Control command bypass?
};
```

#### Resolution Logic

```typescript
function resolveMentionGating(params): MentionGateResult {
  const implicit = params.implicitMention === true;
  const bypass = params.shouldBypassMention === true;
  const effectiveWasMentioned = params.wasMentioned || implicit || bypass;
  const shouldSkip = params.requireMention && 
                     params.canDetectMention && 
                     !effectiveWasMentioned;
  return { effectiveWasMentioned, shouldSkip };
}
```

#### Extended Gating with Command Bypass

```typescript
function resolveMentionGatingWithBypass(params): MentionGateWithBypassResult {
  // Bypass mention requirement for control commands
  const shouldBypassMention =
    params.isGroup &&
    params.requireMention &&
    !params.wasMentioned &&
    !(params.hasAnyMention ?? false) &&
    params.allowTextCommands &&
    params.commandAuthorized &&
    params.hasControlCommand;
  
  return {
    ...resolveMentionGating({
      requireMention: params.requireMention,
      canDetectMention: params.canDetectMention,
      wasMentioned: params.wasMentioned,
      implicitMention: params.implicitMention,
      shouldBypassMention,
    }),
    shouldBypassMention,
  };
}
```

### 4.3 Command Gating

**Source:** `src/channels/command-gating.ts`

Controls who can execute commands (slash commands, text commands).

#### Authorizer Structure

```typescript
type CommandAuthorizer = {
  configured: boolean;  // Is this authorizer set up?
  allowed: boolean;     // Does sender pass this check?
};
```

#### Resolution Logic

```typescript
function resolveCommandAuthorizedFromAuthorizers(params: {
  useAccessGroups: boolean;
  authorizers: CommandAuthorizer[];
  modeWhenAccessGroupsOff?: "allow" | "deny" | "configured";
}): boolean {
  const { useAccessGroups, authorizers } = params;
  const mode = params.modeWhenAccessGroupsOff ?? "allow";
  
  if (!useAccessGroups) {
    if (mode === "allow") return true;
    if (mode === "deny") return false;
    // mode === "configured"
    const anyConfigured = authorizers.some(e => e.configured);
    if (!anyConfigured) return true;
    return authorizers.some(e => e.configured && e.allowed);
  }
  
  return authorizers.some(e => e.configured && e.allowed);
}
```

#### Control Command Gate

```typescript
function resolveControlCommandGate(params: {
  useAccessGroups: boolean;
  authorizers: CommandAuthorizer[];
  allowTextCommands: boolean;
  hasControlCommand: boolean;
  modeWhenAccessGroupsOff?: CommandGatingModeWhenAccessGroupsOff;
}): { commandAuthorized: boolean; shouldBlock: boolean } {
  const commandAuthorized = resolveCommandAuthorizedFromAuthorizers({...});
  const shouldBlock = params.allowTextCommands && 
                      params.hasControlCommand && 
                      !commandAuthorized;
  return { commandAuthorized, shouldBlock };
}
```

### 4.4 Sender Identity Resolution

**Source:** `src/channels/sender-identity.ts`

Validates sender identity fields from message context.

```typescript
function validateSenderIdentity(ctx: MsgContext): string[] {
  const issues: string[] = [];
  
  const chatType = normalizeChatType(ctx.ChatType);
  const isDirect = chatType === "direct";
  
  // Group messages require sender identity
  if (!isDirect) {
    if (!ctx.SenderId && !ctx.SenderName && 
        !ctx.SenderUsername && !ctx.SenderE164) {
      issues.push("missing sender identity");
    }
  }
  
  // E.164 format validation (+country code + number)
  if (ctx.SenderE164 && !/^\+\d{3,}$/.test(ctx.SenderE164)) {
    issues.push(`invalid SenderE164: ${ctx.SenderE164}`);
  }
  
  // Username shouldn't include @ or whitespace
  if (ctx.SenderUsername?.includes("@")) {
    issues.push("SenderUsername should not include @");
  }
  
  return issues;
}
```

---

## 5. Session Routing

### 5.1 Bindings

**Source:** `src/routing/bindings.ts`

Bindings map channel/account/peer combinations to specific agents.

```typescript
type AgentBinding = {
  agentId: string;
  match: {
    channel?: string;
    accountId?: string;  // "*" for any account
    peer?: {
      kind?: "dm" | "group" | "channel";
      id?: string;
    };
    guildId?: string;    // Discord-specific
    teamId?: string;     // Slack-specific
  };
};
```

#### Binding Lookup

```typescript
function listBoundAccountIds(cfg, channelId): string[] {
  const ids = new Set<string>();
  for (const binding of listBindings(cfg)) {
    if (binding.match.channel === channelId) {
      const accountId = binding.match.accountId?.trim();
      if (accountId && accountId !== "*") {
        ids.add(normalizeAccountId(accountId));
      }
    }
  }
  return Array.from(ids).sorted();
}
```

### 5.2 Route Resolution

**Source:** `src/routing/resolve-route.ts`

Resolves which agent handles a message based on bindings.

#### Route Resolution Flowchart

```
┌─────────────────────────────────────────┐
│            Incoming Message             │
│  channel, accountId, peer, guild, team  │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│  Filter bindings by channel + account   │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐     ┌───────────────┐
│  1. Match peer (dm/group/channel + id)  │────▶│ binding.peer  │
└──────────────────┬──────────────────────┘     └───────────────┘
                   │ no match
                   ▼
┌─────────────────────────────────────────┐     ┌────────────────────┐
│  2. Match parent peer (for threads)     │────▶│ binding.peer.parent│
└──────────────────┬──────────────────────┘     └────────────────────┘
                   │ no match
                   ▼
┌─────────────────────────────────────────┐     ┌───────────────┐
│  3. Match guildId (Discord)             │────▶│ binding.guild │
└──────────────────┬──────────────────────┘     └───────────────┘
                   │ no match
                   ▼
┌─────────────────────────────────────────┐     ┌───────────────┐
│  4. Match teamId (Slack)                │────▶│ binding.team  │
└──────────────────┬──────────────────────┘     └───────────────┘
                   │ no match
                   ▼
┌─────────────────────────────────────────┐     ┌─────────────────┐
│  5. Match specific accountId            │────▶│ binding.account │
└──────────────────┬──────────────────────┘     └─────────────────┘
                   │ no match
                   ▼
┌─────────────────────────────────────────┐     ┌─────────────────┐
│  6. Match wildcard accountId (*)        │────▶│ binding.channel │
└──────────────────┬──────────────────────┘     └─────────────────┘
                   │ no match
                   ▼
┌─────────────────────────────────────────┐     ┌───────────────┐
│  7. Fall back to default agent          │────▶│   default     │
└─────────────────────────────────────────┘     └───────────────┘
```

#### Route Result

```typescript
type ResolvedAgentRoute = {
  agentId: string;          // Resolved agent ID
  channel: string;          // Normalized channel
  accountId: string;        // Normalized account ID
  sessionKey: string;       // Internal session key
  mainSessionKey: string;   // Agent main session key
  matchedBy:                // How the match was made
    | "binding.peer"
    | "binding.peer.parent"
    | "binding.guild"
    | "binding.team"
    | "binding.account"
    | "binding.channel"
    | "default";
};
```

### 5.3 Session Key Generation

**Source:** `src/routing/session-key.ts`

Session keys uniquely identify conversation contexts.

#### Key Format

```
agent:<agentId>:<rest>

Examples:
- agent:main:main                              (main session)
- agent:main:dm:+14155551234                   (per-peer DM)
- agent:main:telegram:group:12345678           (group)
- agent:main:discord:channel:987654321         (channel)
- agent:main:slack:default:dm:U12345           (per-account DM)
- agent:main:telegram:default:thread:12345:99  (thread)
```

#### DM Session Scope Options

```typescript
type DmScope = 
  | "main"                    // All DMs share main session
  | "per-peer"                // Per sender, cross-channel
  | "per-channel-peer"        // Per channel + sender
  | "per-account-channel-peer"; // Per account + channel + sender
```

#### Key Building Logic

```typescript
function buildAgentPeerSessionKey(params: {
  agentId: string;
  mainKey?: string;
  channel: string;
  accountId?: string | null;
  peerKind?: "dm" | "group" | "channel" | null;
  peerId?: string | null;
  dmScope?: DmScope;
  identityLinks?: Record<string, string[]>;
}): string {
  const peerKind = params.peerKind ?? "dm";
  
  if (peerKind === "dm") {
    const dmScope = params.dmScope ?? "main";
    let peerId = resolveLinkedPeerId(params) || params.peerId;
    peerId = peerId?.toLowerCase() || "";
    
    switch (dmScope) {
      case "per-account-channel-peer":
        if (peerId) {
          const channel = params.channel || "unknown";
          const accountId = normalizeAccountId(params.accountId);
          return `agent:${agentId}:${channel}:${accountId}:dm:${peerId}`;
        }
        break;
      case "per-channel-peer":
        if (peerId) {
          return `agent:${agentId}:${channel}:dm:${peerId}`;
        }
        break;
      case "per-peer":
        if (peerId) {
          return `agent:${agentId}:dm:${peerId}`;
        }
        break;
    }
    return buildAgentMainSessionKey({ agentId, mainKey });
  }
  
  // Group/channel sessions
  const channel = params.channel || "unknown";
  const peerId = params.peerId?.toLowerCase() || "unknown";
  return `agent:${agentId}:${channel}:${peerKind}:${peerId}`;
}
```

#### Identity Links

Identity links allow cross-platform peer identification:

```yaml
# Config example
session:
  identityLinks:
    tyler:
      - telegram:12345678
      - whatsapp:+14155551234
      - discord:987654321
```

When `dmScope` is not `main`, the system resolves linked identities to a canonical name for session keying.

---

## 6. Security Utilities

### 6.1 Security Audit

**Source:** `src/security/audit.ts`

Comprehensive security auditing with severity levels.

#### Severity Levels

| Severity | Meaning |
|----------|---------|
| `critical` | Immediate action required |
| `warn` | Should be addressed |
| `info` | Informational finding |

#### Audit Finding Structure

```typescript
type SecurityAuditFinding = {
  checkId: string;        // "channels.telegram.dm.open"
  severity: SecurityAuditSeverity;
  title: string;          // "Telegram DMs are open"
  detail: string;         // Explanation
  remediation?: string;   // How to fix
};
```

#### Key Audit Checks

| Check ID | Severity | Condition |
|----------|----------|-----------|
| `gateway.bind_no_auth` | critical | Non-loopback bind without auth |
| `gateway.tailscale_funnel` | critical | Public funnel exposure |
| `gateway.loopback_no_auth` | critical | Control UI exposed without auth |
| `channels.*.dm.open` | critical | DM policy is "open" |
| `tools.elevated.allowFrom.*.wildcard` | critical | Elevated exec allows "*" |
| `fs.state_dir.perms_world_writable` | critical | State dir is 777 |
| `fs.config.perms_writable` | critical | Config writable by others |
| `logging.redact_off` | warn | Sensitive data not redacted |

### 6.2 External Content Security

**Source:** `src/security/external-content.ts`

Handles untrusted content from external sources (emails, webhooks, web fetches).

#### Suspicious Patterns Detection

```typescript
const SUSPICIOUS_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(everything|all|your)\s+(instructions?|rules?|guidelines?)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /new\s+instructions?:/i,
  /system\s*:?\s*(prompt|override|command)/i,
  /elevated\s*=\s*true/i,
  /rm\s+-rf/i,
  /delete\s+all\s+(emails?|files?|data)/i,
];
```

#### Content Wrapping

```typescript
function wrapExternalContent(content: string, options: {
  source: "email" | "webhook" | "api" | "web_search" | "web_fetch" | "unknown";
  sender?: string;
  subject?: string;
  includeWarning?: boolean;
}): string {
  // Sanitize marker injection attempts
  const sanitized = replaceMarkers(content);
  
  // Add security warning header
  const warningBlock = includeWarning ? EXTERNAL_CONTENT_WARNING : "";
  
  return [
    warningBlock,
    "<<<EXTERNAL_UNTRUSTED_CONTENT>>>",
    `Source: ${sourceLabel}`,
    sender ? `From: ${sender}` : "",
    subject ? `Subject: ${subject}` : "",
    "---",
    sanitized,
    "<<<END_EXTERNAL_UNTRUSTED_CONTENT>>>",
  ].join("\n");
}
```

### 6.3 Security Fix Automation

**Source:** `src/security/fix.ts`

Automated remediation of common security issues.

#### Automated Fixes

| Issue | Fix |
|-------|-----|
| `logging.redactSensitive=off` | Set to "tools" |
| `groupPolicy=open` | Set to "allowlist" |
| State dir world-writable | chmod 700 |
| Config file world-readable | chmod 600 |
| Credentials dir exposed | chmod 700 |

---

## 7. Channel-Specific Logic

### 7.1 Per-Channel Plugins

**Source:** `src/channels/plugins/`

Each channel implements the `ChannelPlugin` interface:

```typescript
type ChannelPlugin<ResolvedAccount = any> = {
  id: ChannelId;
  meta: ChannelMeta;
  capabilities: ChannelCapabilities;
  
  // Configuration
  config: ChannelConfigAdapter<ResolvedAccount>;
  configSchema?: ChannelConfigSchema;
  
  // Lifecycle
  setup?: ChannelSetupAdapter;
  pairing?: ChannelPairingAdapter;
  gateway?: ChannelGatewayAdapter<ResolvedAccount>;
  auth?: ChannelAuthAdapter;
  
  // Security
  security?: ChannelSecurityAdapter<ResolvedAccount>;
  elevated?: ChannelElevatedAdapter;
  commands?: ChannelCommandAdapter;
  
  // Messaging
  groups?: ChannelGroupAdapter;
  mentions?: ChannelMentionAdapter;
  outbound?: ChannelOutboundAdapter;
  threading?: ChannelThreadingAdapter;
  messaging?: ChannelMessagingAdapter;
  
  // Directory
  directory?: ChannelDirectoryAdapter;
  resolver?: ChannelResolverAdapter;
  
  // Status
  status?: ChannelStatusAdapter<ResolvedAccount>;
  heartbeat?: ChannelHeartbeatAdapter;
  
  // Actions
  actions?: ChannelMessageActionAdapter;
  agentTools?: ChannelAgentToolFactory | ChannelAgentTool[];
};
```

### 7.2 Group Mention Resolution

**Source:** `src/channels/plugins/group-mentions.ts`

Channel-specific group mention behavior:

| Channel | Resolution Logic |
|---------|------------------|
| Telegram | Chat ID → Topic → Group → Default |
| Discord | Guild → Channel → Slug match → Wildcard |
| Slack | Channel ID → Channel name → Slug → Wildcard |
| WhatsApp | Generic group resolution |
| iMessage | Generic group resolution |
| Google Chat | Generic group resolution |

### 7.3 Normalization Patterns

Each channel has unique ID normalization:

```typescript
// Telegram: Remove channel prefix, lowercase
.replace(/^(telegram|tg):/i, "").toLowerCase()

// WhatsApp: E.164 normalization
normalizeWhatsAppTarget(entry)  // Handles +country codes

// Discord: Discord slug normalization
.replace(/^[@#]+/, "").replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]+/g, "-")

// Slack: Slack slug normalization
.replace(/\s+/g, "-").replace(/[^a-z0-9#@._+-]+/g, "-")

// Signal: E.164 normalization
normalizeE164(entry.replace(/^signal:/i, ""))

// Google Chat: Remove user/users prefix
.replace(/^user:/i, "").replace(/^users\//i, "").toLowerCase()
```

### 7.4 Status Issues

Channels report status issues:

```typescript
type ChannelStatusIssue = {
  channel: ChannelId;
  accountId: string;
  kind: "intent" | "permissions" | "config" | "auth" | "runtime";
  message: string;
  fix?: string;
};
```

---

## 8. Mapping to Nexus IAM

### Conceptual Mapping

| OpenClaw Concept | Nexus IAM Equivalent |
|------------------|---------------------|
| Channel allowlist | Policy with `principal` conditions |
| Sender identity | Subject in IAM context |
| Command gating | Resource-level permissions |
| Mention gating | Activation conditions |
| Bindings | Role bindings to resources |
| Session key | Resource path in IAM |
| Account | Service account or identity |
| Peer | Target resource |

### Policy Translation Example

OpenClaw config:
```yaml
channels:
  telegram:
    dm:
      allowFrom: [12345678, "@username"]
    groups:
      "-100123456789":
        allowFrom: [12345678, "@admin"]
        requireMention: true
```

Nexus IAM equivalent:
```yaml
policies:
  - name: telegram-dm-access
    effect: allow
    actions: [messaging:receive]
    resources: [arn:nexus:channel:telegram:dm/*]
    conditions:
      sender:
        anyOf: ["telegram:12345678", "telegram:@username"]

  - name: telegram-group-access
    effect: allow
    actions: [messaging:receive]
    resources: [arn:nexus:channel:telegram:group/-100123456789]
    conditions:
      sender:
        anyOf: ["telegram:12345678", "telegram:@admin"]
      mentioned: true
```

### Key Differences

1. **Explicit vs. Implicit Allow**
   - OpenClaw: Implicit allow for DMs without allowlist (depends on dmPolicy)
   - Nexus: Explicit deny-by-default, require explicit allow

2. **Hierarchical Resolution**
   - OpenClaw: Channel → Account → Group → Topic
   - Nexus: Policy inheritance with resource hierarchy

3. **Wildcard Handling**
   - OpenClaw: `*` in allowlist allows all
   - Nexus: `resource: *` in policy with conditions

4. **Session Binding**
   - OpenClaw: Bindings route to agents
   - Nexus: Role bindings grant permissions

---

## Appendix: File Reference

| File | Purpose |
|------|---------|
| `src/channels/registry.ts` | Channel ID ordering and aliases |
| `src/channels/dock.ts` | Lightweight channel metadata |
| `src/channels/allowlist-match.ts` | Allowlist match types |
| `src/channels/channel-config.ts` | Channel entry matching |
| `src/channels/mention-gating.ts` | Mention requirement logic |
| `src/channels/command-gating.ts` | Command authorization |
| `src/channels/sender-identity.ts` | Sender validation |
| `src/channels/targets.ts` | Messaging target types |
| `src/channels/session.ts` | Session recording |
| `src/routing/bindings.ts` | Agent-channel bindings |
| `src/routing/resolve-route.ts` | Route resolution |
| `src/routing/session-key.ts` | Session key generation |
| `src/security/audit.ts` | Security auditing |
| `src/security/external-content.ts` | External content handling |
| `src/security/fix.ts` | Security fix automation |
| `src/channels/plugins/types.ts` | Plugin type exports |
| `src/channels/plugins/types.core.ts` | Core plugin types |
| `src/channels/plugins/types.plugin.ts` | Plugin interface |
| `src/channels/plugins/types.adapters.ts` | Adapter interfaces |
| `src/channels/plugins/group-mentions.ts` | Group mention resolution |
| `src/channels/plugins/allowlist-match.ts` | Allowlist utilities |
| `src/channels/allowlists/resolve-utils.ts` | Allowlist merge utilities |
| `src/sessions/session-key-utils.ts` | Session key parsing |
