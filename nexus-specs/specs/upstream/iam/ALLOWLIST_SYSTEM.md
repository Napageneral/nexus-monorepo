# OpenClaw Allowlist System

**Status:** REFERENCE  
**Last Updated:** 2026-02-04  
**Source:** `src/channels/allowlist-match.ts`, `src/channels/channel-config.ts`, `src/channels/mention-gating.ts`

---

## Overview

OpenClaw's allowlist system controls who can interact with the bot across different channels. This document details the matching algorithm, policy modes, and pattern formats.

---

## Allowlist Matching Algorithm

When a message arrives, OpenClaw resolves whether the sender is allowed through a multi-step fallback algorithm:

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
│ 1. Try direct match    │────▶│ ALLOWED (direct) │
│    against allowlist   │ yes └──────────────────┘
└──────────┬─────────────┘
           │ no
           ▼
┌────────────────────────┐     ┌──────────────────┐
│ 2. Try normalized      │────▶│ ALLOWED (direct) │
│    match (lowercase,   │ yes └──────────────────┘
│    slugify, etc.)      │
└──────────┬─────────────┘
           │ no
           ▼
┌────────────────────────┐     ┌──────────────────┐
│ 3. Try parent match    │────▶│ ALLOWED (parent) │
│    (thread → channel)  │ yes └──────────────────┘
└──────────┬─────────────┘
           │ no
           ▼
┌────────────────────────┐     ┌────────────────────┐
│ 4. Wildcard "*" in     │────▶│ ALLOWED (wildcard) │
│    allowlist?          │ yes └────────────────────┘
└──────────┬─────────────┘
           │ no
           ▼
┌────────────────────────┐
│      DENIED            │
└────────────────────────┘
```

### Match Sources

When a sender matches, the system records HOW they matched:

```typescript
type AllowlistMatchSource =
  | "wildcard"        // Matched "*"
  | "id"              // Matched sender ID directly
  | "name"            // Matched sender name
  | "tag"             // Matched @username tag
  | "username"        // Matched username
  | "prefixed-id"     // Matched channel:id format
  | "prefixed-user"   // Matched user:id format
  | "prefixed-name"   // Matched name:value format
  | "slug"            // Matched normalized slug
  | "localpart";      // Matched email localpart
```

### Match Result

```typescript
type AllowlistMatch = {
  allowed: boolean;
  matchKey?: string;    // The entry that matched
  matchSource?: string; // How it matched (from above)
};
```

---

## Pattern Formats

Allowlists support multiple pattern formats:

### Simple Values

| Pattern | Matches |
|---------|---------|
| `123456789` | Telegram user ID |
| `@username` | Telegram/Discord username |
| `+14155551234` | Phone number (E.164) |
| `user@example.com` | Email address |
| `*` | Wildcard (allow all) |

### Prefixed Values

| Prefix | Format | Example |
|--------|--------|---------|
| `telegram:` | `telegram:{id}` | `telegram:123456789` |
| `discord:` | `discord:{id}` | `discord:987654321` |
| `user:` | `user:{id}` | `user:123456` |
| `name:` | `name:{value}` | `name:John Smith` |
| `tag:` | `tag:{username}` | `tag:@johndoe` |

### Channel-Specific Normalization

Each channel normalizes patterns differently:

```typescript
// Telegram: Remove prefix, lowercase
.replace(/^(telegram|tg):/i, "").toLowerCase()

// Discord: Discord slug format
.replace(/^[@#]+/, "")
.replace(/[\s_]+/g, "-")
.replace(/[^a-z0-9-]+/g, "-")

// WhatsApp: E.164 phone normalization
normalizeWhatsAppTarget(entry)

// Slack: Slack slug format
.replace(/\s+/g, "-")
.replace(/[^a-z0-9#@._+-]+/g, "-")

// Signal: E.164 normalization
normalizeE164(entry.replace(/^signal:/i, ""))

// Google Chat: Remove user/users prefix
.replace(/^user:/i, "")
.replace(/^users\//i, "")
.toLowerCase()
```

---

## DM Policy Modes

DM policies control how the bot handles direct messages from different senders.

### Policy Types

| Policy | Behavior | Use Case |
|--------|----------|----------|
| `pairing` | Unknown senders receive pairing code; owner approves to add to allowlist | Default secure mode |
| `allowlist` | Only senders in `allowFrom` list can message | Known contacts only |
| `open` | Accept all DMs (requires `allowFrom: ["*"]`) | Public bot mode |
| `disabled` | Block all DMs | Group-only bot |

### Configuration

```json
{
  "channels": {
    "telegram": {
      "dmPolicy": "pairing",
      "allowFrom": ["123456789", "@trusted_user"]
    }
  }
}
```

### Pairing Flow

When `dmPolicy: "pairing"` and sender is not in allowlist:

```
Unknown sender messages bot
          │
          ▼
Bot generates pairing code
          │
          ▼
Bot sends code to sender:
"To connect, ask Tyler to approve code: ABC123"
          │
          ▼
Owner receives notification:
"New pairing request from @newuser (code: ABC123)"
          │
          ▼
Owner approves → sender added to allowlist
```

---

## Group Policy Modes

Group policies control bot behavior in group chats.

### Policy Types

| Policy | Behavior | Use Case |
|--------|----------|----------|
| `open` | Allow all groups; mention-gating still applies | Default mode |
| `allowlist` | Only configured groups | Curated communities |
| `disabled` | Block all group messages | DM-only bot |

### Configuration

```json
{
  "channels": {
    "telegram": {
      "groupPolicy": "open",
      "groups": {
        "-1001234567890": {
          "requireMention": true,
          "allowFrom": ["admin-user"]
        },
        "*": {
          "requireMention": true
        }
      }
    }
  }
}
```

### Per-Group Allowlists

Groups can have their own sender allowlists:

```json
{
  "groups": {
    "-1001234567890": {
      "allowFrom": ["mod-1", "mod-2"],
      "denyFrom": ["spammer-id"]
    }
  }
}
```

---

## Mention Gating

In groups, bots often require @mentions to respond.

### Parameters

```typescript
type MentionGateParams = {
  requireMention: boolean;     // Config: require @mention in groups?
  canDetectMention: boolean;   // Platform supports mention detection?
  wasMentioned: boolean;       // Was the bot @mentioned?
  implicitMention?: boolean;   // Reply to bot's message?
  shouldBypassMention?: boolean; // Control command bypass?
};
```

### Resolution Logic

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

### Mention Bypass for Commands

Control commands can bypass mention requirements:

```typescript
function resolveMentionGatingWithBypass(params): MentionGateWithBypassResult {
  const shouldBypassMention =
    params.isGroup &&
    params.requireMention &&
    !params.wasMentioned &&
    !(params.hasAnyMention ?? false) &&
    params.allowTextCommands &&
    params.commandAuthorized &&
    params.hasControlCommand;
  
  return {
    ...resolveMentionGating({ ...params, shouldBypassMention }),
    shouldBypassMention,
  };
}
```

---

## Nested Allowlist Logic

For hierarchical configs (e.g., Discord guild → channel):

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

### Example: Discord Hierarchy

```json
{
  "discord": {
    "guilds": {
      "server-123": {
        "allowFrom": ["member-role"],
        "channels": {
          "channel-456": {
            "allowFrom": ["mod-role"]
          }
        }
      }
    }
  }
}
```

Evaluation:
1. Is sender in guild allowlist? No → DENY
2. Is sender in guild allowlist? Yes, continue
3. Is channel allowlist configured? No → ALLOW (inherits guild)
4. Is sender in channel allowlist? Yes → ALLOW, No → DENY

---

## Channel Entry Matching

The core matching function with fallback:

```typescript
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
  if (params.normalizeKey) {
    const normalizedKeys = params.keys.map(params.normalizeKey).filter(Boolean);
    for (const [entryKey, entry] of Object.entries(params.entries)) {
      if (normalizedKeys.includes(params.normalizeKey(entryKey))) {
        return { entry, key: entryKey, matchSource: "normalized" };
      }
    }
  }
  
  // 3. Try parent key inheritance
  if (params.parentKeys?.length > 0) {
    const parent = resolveChannelEntryMatch({ 
      entries: params.entries, 
      keys: params.parentKeys 
    });
    if (parent.entry) {
      return { entry: parent.entry, matchSource: "parent" };
    }
  }
  
  // 4. Fall back to wildcard
  if (direct.wildcardEntry) {
    return { entry: direct.wildcardEntry, matchSource: "wildcard" };
  }
  
  return { entry: null, matchSource: "none" };
}
```

---

## Mapping to Nexus IAM

### OpenClaw Allowlist → Nexus Policy

OpenClaw:
```json
{
  "channels": {
    "telegram": {
      "dmPolicy": "allowlist",
      "allowFrom": ["123456789", "@trusted"]
    }
  }
}
```

Nexus IAM:
```yaml
- name: telegram-dm-access
  match:
    principal:
      person_id_in: [user-123, user-trusted]  # Resolved via ledger
    conditions:
      - channel: telegram
        peer_kind: dm
  effect: allow
  permissions:
    tools:
      allow: [web_search, weather]
```

### Key Differences

| Aspect | OpenClaw | Nexus IAM |
|--------|----------|-----------|
| Identity | Raw IDs in config | Semantic identity via ledger |
| Matching | Pattern-based | Principal-based |
| Hierarchy | Config nesting | Policy priority |
| Permissions | Separate from allowlist | Unified in policy |

---

## Nexus Recommendations

1. **Unify identity resolution** — Match by ledger entity, not raw identifiers
2. **Explicit deny support** — Allow explicit deny rules (OpenClaw is implicit)
3. **Composable permissions** — Merge permissions from multiple policies
4. **Audit allowlist decisions** — Log why sender was allowed/denied

---

*This document maps OpenClaw's allowlist system for Nexus IAM reference.*
