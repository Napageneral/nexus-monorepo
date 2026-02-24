# OpenClaw Sender Identity Resolution

**Status:** REFERENCE  
**Last Updated:** 2026-02-04  
**Source:** `src/channels/sender-identity.ts`, `src/channels/plugins/normalize/`, `src/routing/session-key.ts`

---

## Overview

OpenClaw resolves sender identity differently per channel. This document covers how identity is extracted, normalized, and linked across platforms.

---

## Identity Fields

Each incoming message provides identity fields from the channel:

```typescript
interface SenderIdentity {
  // Primary identifiers (at least one required for groups)
  SenderId?: string;        // Platform-specific user ID
  SenderUsername?: string;  // @username (without @)
  SenderName?: string;      // Display name
  SenderE164?: string;      // Phone in E.164 format
  
  // Additional context
  SenderAvatarUrl?: string; // Profile picture URL
  SenderRole?: string;      // Platform role (admin, member)
}
```

### Validation Rules

```typescript
function validateSenderIdentity(ctx: MsgContext): string[] {
  const issues: string[] = [];
  
  const chatType = normalizeChatType(ctx.ChatType);
  const isDirect = chatType === "direct";
  
  // Group messages require at least one identity field
  if (!isDirect) {
    if (!ctx.SenderId && !ctx.SenderName && 
        !ctx.SenderUsername && !ctx.SenderE164) {
      issues.push("missing sender identity");
    }
  }
  
  // E.164 format validation
  if (ctx.SenderE164 && !/^\+\d{3,}$/.test(ctx.SenderE164)) {
    issues.push(`invalid SenderE164: ${ctx.SenderE164}`);
  }
  
  // Username should not include @
  if (ctx.SenderUsername?.includes("@")) {
    issues.push("SenderUsername should not include @");
  }
  
  return issues;
}
```

---

## Per-Channel Identity Resolution

### Telegram

| Field | Source | Format |
|-------|--------|--------|
| SenderId | `message.from.id` | Numeric string |
| SenderUsername | `message.from.username` | Without @ |
| SenderName | `first_name + last_name` | Full name |

```typescript
// Normalization
function normalizeTelegramId(raw: string): string {
  return raw.replace(/^(telegram|tg):/i, "").toLowerCase();
}

// Allowlist matching attempts:
// 1. SenderId (e.g., "123456789")
// 2. @username (e.g., "@johndoe")
// 3. telegram:123456789 (prefixed format)
```

### Discord

| Field | Source | Format |
|-------|--------|--------|
| SenderId | `message.author.id` | Snowflake string |
| SenderUsername | `user.username` | Display username |
| SenderName | `user.globalName` or `member.nick` | Display name |

```typescript
// Normalization (Discord slug)
function normalizeDiscordSlug(raw: string): string {
  return raw
    .replace(/^[@#]+/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .toLowerCase();
}

// Resolution hierarchy:
// 1. User ID → channel:userId format
// 2. Guild member nickname
// 3. Global display name
// 4. Username
```

### WhatsApp

| Field | Source | Format |
|-------|--------|--------|
| SenderId | `message.from` | `{phone}@s.whatsapp.net` |
| SenderE164 | Extracted | `+14155551234` |
| SenderName | Contact name or push name | Display name |

```typescript
// Normalization
function normalizeWhatsAppNumber(raw: string): string {
  // Remove WhatsApp suffix
  const phone = raw.replace(/@.*$/, "");
  // Normalize to E.164
  return normalizeE164(phone);
}

// Phone normalization handles:
// - Country code prefixes
// - Formatting characters (spaces, dashes)
// - Leading zeros
```

### Slack

| Field | Source | Format |
|-------|--------|--------|
| SenderId | `event.user` | `U12345678` |
| SenderUsername | User profile | Workspace username |
| SenderName | `profile.real_name` | Full name |

```typescript
// Normalization (Slack slug)
function normalizeSlackSlug(raw: string): string {
  return raw
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9#@._+-]+/g, "-")
    .toLowerCase();
}
```

### Signal

| Field | Source | Format |
|-------|--------|--------|
| SenderId | `envelope.source` | Phone or UUID |
| SenderE164 | `envelope.sourceNumber` | `+14155551234` |
| SenderName | Contact name | From address book |

```typescript
// Normalization
function normalizeSignalId(raw: string): string {
  const cleaned = raw.replace(/^signal:/i, "");
  // If it looks like a phone, normalize
  if (/^\+?\d/.test(cleaned)) {
    return normalizeE164(cleaned);
  }
  return cleaned.toLowerCase();
}
```

### iMessage

| Field | Source | Format |
|-------|--------|--------|
| SenderId | `message.sender` | Phone or email |
| SenderE164 | (if phone) | `+14155551234` |
| SenderName | Contact name | From Contacts.app |

```typescript
// Normalization
function normalizeIMessageId(raw: string): string {
  // Phone number
  if (/^\+?\d/.test(raw)) {
    return normalizeE164(raw);
  }
  // Email
  return raw.toLowerCase();
}
```

### Google Chat

| Field | Source | Format |
|-------|--------|--------|
| SenderId | `sender.name` | `users/123456789` |
| SenderName | `sender.displayName` | Full name |

```typescript
// Normalization
function normalizeGoogleChatId(raw: string): string {
  return raw
    .replace(/^user:/i, "")
    .replace(/^users\//i, "")
    .toLowerCase();
}
```

---

## Identity Normalization Summary

| Channel | Primary Format | Normalization |
|---------|---------------|---------------|
| Telegram | Numeric ID or @username | Lowercase, strip prefix |
| Discord | Snowflake ID | Slug format |
| WhatsApp | E.164 phone | Phone normalization |
| Slack | User ID (U...) | Slug format |
| Signal | E.164 phone | Phone normalization |
| iMessage | Phone or email | E.164 or lowercase |
| Google Chat | users/ID | Strip prefix, lowercase |

### E.164 Normalization

```typescript
function normalizeE164(input: string): string {
  // Remove all non-digit characters except leading +
  let cleaned = input.replace(/[^\d+]/g, "");
  
  // Ensure leading +
  if (!cleaned.startsWith("+")) {
    // Assume US if 10 digits
    if (cleaned.length === 10) {
      cleaned = "+1" + cleaned;
    } else {
      cleaned = "+" + cleaned;
    }
  }
  
  // Validate format
  if (!/^\+\d{3,15}$/.test(cleaned)) {
    return input; // Return original if invalid
  }
  
  return cleaned;
}
```

---

## Identity Links (Cross-Channel)

Identity links map the same person across platforms for session continuity.

### Configuration

```yaml
session:
  dmScope: "per-peer"  # or per-channel-peer
  identityLinks:
    tyler:
      - telegram:123456789
      - whatsapp:+14155551234
      - discord:987654321
    casey:
      - telegram:111222333
      - imessage:casey@example.com
```

### Resolution Logic

```typescript
function resolveLinkedPeerId(params: {
  channel: string;
  peerId: string;
  identityLinks: Record<string, string[]>;
}): string | null {
  const { channel, peerId, identityLinks } = params;
  const fullId = `${channel}:${peerId.toLowerCase()}`;
  
  // Find canonical name for this identity
  for (const [canonical, identities] of Object.entries(identityLinks)) {
    const normalizedIdentities = identities.map(id => id.toLowerCase());
    if (normalizedIdentities.includes(fullId)) {
      return canonical;
    }
  }
  
  return null; // No linked identity
}
```

### Session Key Impact

With identity links, session keys use canonical names:

```
Without links:
- telegram DM from 123456: agent:main:telegram:dm:123456
- discord DM from 987654:  agent:main:discord:dm:987654
(Two separate sessions for same person)

With links (canonical: "tyler"):
- telegram DM from 123456: agent:main:dm:tyler
- discord DM from 987654:  agent:main:dm:tyler
(Same session across platforms)
```

---

## What OpenClaw Knows About Senders

### From Channel Context

| Data | Source | Reliability |
|------|--------|-------------|
| User ID | Platform | Stable, unique |
| Username | Platform | Can change |
| Display name | Platform | Can change |
| Phone number | Platform | Stable for phone-based |
| Email | Platform | Stable for email-based |
| Avatar URL | Platform | Can change |
| Platform role | Platform | Context-dependent |

### What OpenClaw Does NOT Know

| Data | Reason |
|------|--------|
| Real name | Platform may have alias |
| Relationship | No semantic knowledge |
| Trust level | Not tracked |
| Cross-platform identity | Only via manual links |
| Message history | No cross-session memory |

---

## Nexus IAM Improvement

### Identity Ledger

Nexus resolves sender identity via a unified ledger:

```sql
entities (
  id TEXT PRIMARY KEY,
  type TEXT,              -- 'person' | 'persona'
  name TEXT,
  is_user INTEGER,        -- True for owner
  relationship TEXT,      -- family, partner, friend
  created_at INTEGER,
  updated_at INTEGER
);

entity_identities (
  entity_id TEXT,
  channel TEXT,           -- telegram, discord, etc.
  identifier TEXT,        -- platform-specific ID
  account_id TEXT,        -- For multi-account
  PRIMARY KEY (channel, identifier)
);

entity_tags (
  entity_id TEXT,
  tag TEXT,
  PRIMARY KEY (entity_id, tag)
);
```

### Resolution Flow

```
Message arrives: { channel: "telegram", from: "123456" }
                    │
                    ▼
         ┌─────────────────────────────┐
         │  SELECT e.*, ei.*           │
         │  FROM entities e            │
         │  JOIN entity_identities ei  │
         │    ON e.id = ei.entity_id   │
         │  WHERE ei.channel = ?       │
         │    AND ei.identifier = ?    │
         └─────────────────────────────┘
                    │
                    ▼
         Principal: {
           entity_id: "entity_abc",
           type: "person",
           name: "Casey",
           is_user: false,
           relationship: "partner",
           tags: ["trusted", "family"]
         }
```

### Benefits Over OpenClaw

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| Identity storage | Config file links | Database ledger |
| Relationship tracking | None | First-class |
| Cross-platform | Manual config | Automatic via ledger |
| Trust levels | None | Via policies |
| Learning | None | Cortex can update ledger |

---

## Sender Label Generation

For display purposes, OpenClaw generates sender labels:

```typescript
function buildSenderLabel(ctx: MsgContext): string {
  // Priority order
  if (ctx.SenderName) return ctx.SenderName;
  if (ctx.SenderUsername) return `@${ctx.SenderUsername}`;
  if (ctx.SenderE164) return ctx.SenderE164;
  if (ctx.SenderId) return `id:${ctx.SenderId}`;
  return "Unknown";
}
```

---

## Security Considerations

### Identity Spoofing

Some channels have spoofing risks:

| Channel | Risk | Mitigation |
|---------|------|------------|
| Email | High (headers) | DKIM/SPF validation |
| Telegram | Low (verified by API) | User ID is authoritative |
| Discord | Low (OAuth) | User ID is authoritative |
| WhatsApp | Medium (number change) | E.164 normalization |
| Signal | Medium (number reuse) | Safety number verification |
| iMessage | Low (Apple ID verified) | Phone/email authoritative |

### Recommendations

1. **Prefer user IDs over usernames** — IDs are stable
2. **Normalize before matching** — Handle format variations
3. **Log identity resolution** — Audit trail for disputes
4. **Verify cross-platform links** — Owner confirmation

---

*This document maps OpenClaw's sender identity handling for Nexus IAM reference.*
