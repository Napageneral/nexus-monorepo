# State Layout Comparison

**Status:** COMPLETE  
**Last Updated:** 2026-02-04

---

## Overview

This document compares how OpenClaw and Nexus organize their workspaces — where files live, how configuration is structured, and what users can see.

**Key Insight:** OpenClaw hides everything in `~/.openclaw/` with one monolithic config. Nexus exposes everything in `~/nexus/` with domain-split configuration. Visibility is a design principle, not an afterthought.

---

## Philosophy

### OpenClaw: Hidden by Default

The workspace is invisible to users:
- Dot-prefixed directory (`~/.openclaw/`)
- Single config file contains everything
- Internals are "implementation details"
- Users interact through CLI, not files

**Rationale:** Users shouldn't need to understand internals.

**Problem:** When things break, users can't debug. The system feels like "magic" — until it doesn't work.

### Nexus: Visible by Default

The workspace is front and center:
- Regular directory (`~/nexus/`)
- Split configuration by domain
- Files are the interface
- Users can explore, understand, modify

**Rationale:** Transparency builds trust. Users who understand their tools use them better.

---

## Workspace Structure

### OpenClaw

```
~/.openclaw/
├── config.json          # EVERYTHING lives here
├── workspace/
│   └── sessions/        # Session transcripts (JSONL)
├── agents/
│   └── <agentId>/
│       └── sessions/    # Per-agent session storage
└── ...
```

All configuration in one JSON5 file:
- Agent definitions
- Channel credentials  
- Access policies
- Model selection
- Skill configuration
- Identity links
- Send policies

**Location:** Hidden from normal view. Users forget it exists until something breaks.

### Nexus

```
~/nexus/
├── state/
│   ├── nexus.db              # System of Record (SQLite)
│   ├── agents/{id}/          # Per-agent configuration
│   │   ├── IDENTITY.md       # Who the agent is
│   │   ├── SOUL.md           # Agent values/boundaries
│   │   ├── MEMORY.md         # Long-term memory
│   │   └── config.yaml       # Agent settings
│   ├── credentials/          # Credential pointers
│   │   └── {service}.yaml    # Per-service credentials
│   ├── config/               # Domain-split config
│   │   ├── adapters.yaml     # Adapter settings
│   │   ├── access.yaml       # Access policies
│   │   └── capabilities.yaml # Capability registry
│   └── skills/               # Per-skill state
│       └── {skill}/
│           └── state.yaml    # Usage, last run, etc.
├── skills/                   # Installed skill definitions
│   ├── tools/{name}/
│   ├── connectors/{name}/
│   └── guides/{name}/
└── home/                     # User's personal space
    ├── projects/
    ├── me/
    └── ...
```

**Location:** Visible in home directory. Users see it, explore it, understand it.

---

## The Monolith Problem

### OpenClaw's config.json

Everything in one file:

```json5
{
  // Agent configuration
  "agents": [
    {
      "agentId": "atlas",
      "defaultSystemPrompt": "...",
      "defaultModel": { "provider": "anthropic", "model": "..." },
      "personas": [...],
      // ... more agent config
    }
  ],
  
  // Channel credentials
  "channels": {
    "discord": {
      "botToken": "...",
      "clientId": "...",
    },
    "imessage": {
      "signingKey": "..."
    }
  },
  
  // Access control (scattered)
  "discordDmPolicy": "allowlist",
  "discordGroupPolicy": "allowlist",
  "imessageDmPolicy": "pairing",
  "imessageGroupPolicy": "disabled",
  "discordDmAllowlist": ["user1", "user2"],
  "discordGroupAllowlist": [...],
  
  // Skill configuration
  "skills": [...],
  
  // Identity links
  "identityLinks": [...],
  
  // Send policies
  "sendPolicies": [...],
  
  // More scattered settings...
}
```

**Problems:**

1. **No separation of concerns** — Agent config mixed with credentials mixed with access control
2. **Hard to audit** — "Who has access?" requires grep-ing through the file
3. **Merge conflicts** — Any change touches the same file
4. **Credential sprawl** — Secrets mixed with configuration
5. **No discoverability** — Must know the schema to find settings

### Nexus's Domain Split

Each concern has its own place:

```yaml
# state/agents/atlas/config.yaml
id: atlas
default_model:
  provider: anthropic
  model: claude-sonnet-4-20250514
personas:
  - id: default
    system_prompt: ...
```

```yaml
# state/config/access.yaml
policies:
  - name: dm-allowlist
    subjects: [user:tyler, user:casey]
    actions: [message:send]
    resources: [adapter:imessage:dm:*]
    effect: allow
```

```yaml
# state/credentials/discord.yaml
type: bot-token
source: env
key: DISCORD_BOT_TOKEN
verified_at: 2026-02-04T12:00:00Z
```

**Benefits:**

1. **Clear boundaries** — Each file has one responsibility
2. **Easy auditing** — `cat state/config/access.yaml` shows all access policies
3. **Safe changes** — Modify credentials without touching agent config
4. **No secrets in config** — Credentials are pointers, not values
5. **Discoverable** — File structure reveals system structure

---

## Credential Management

### OpenClaw: Inline in Config

Credentials scattered through `config.json`:

```json5
{
  "channels": {
    "discord": {
      "botToken": "MTIz...actual_token_here",
      "clientId": "123456789"
    }
  },
  "anthropicApiKey": "sk-ant-...",
  "openaiApiKey": "sk-..."
}
```

**Problems:**
- Secrets in plaintext
- Config file can't be shared
- No credential lifecycle (rotation, expiration)
- No verification status

### Nexus: Credential Pointers

Credentials stored separately with metadata:

```yaml
# state/credentials/anthropic.yaml
service: anthropic
account: default
type: api-key
source: env          # Where to get the value
key: ANTHROPIC_API_KEY
verified_at: 2026-02-04T10:30:00Z
last_used: 2026-02-04T14:22:00Z
status: active
```

```yaml
# state/credentials/google.yaml
service: google
account: tyler@gmail.com
type: oauth
source: keychain     # macOS Keychain
key: nexus-google-oauth
scopes: [gmail, calendar]
expires_at: 2026-03-04T00:00:00Z
```

**Benefits:**
- Secrets never written to files (pointers only)
- Clear provenance (where did this credential come from?)
- Status tracking (working, expired, broken)
- Can share workspace config without exposing secrets

---

## Debugging Experience

### OpenClaw: "Magic" Until It Breaks

When something goes wrong:

```bash
# Where is the config?
ls ~/.openclaw/
# Oh, there it is

# Why did my message get rejected?
# Check config... grep through sessions... 
# No audit trail. No pipeline traces.
# Guess and check.

# Why is this credential failing?
# Is it expired? Wrong format? 
# Config just has the raw value — no metadata.
```

### Nexus: Files Tell the Story

```bash
# System of record
sqlite3 ~/nexus/state/nexus.db \
  "SELECT stage, status, error_message FROM nexus_requests 
   WHERE event_id = 'imessage:...' ORDER BY timestamp"
# → Shows exact pipeline stage that failed

# Credential status
cat ~/nexus/state/credentials/discord.yaml
# → Shows last verified, expiration, status

# Access decision
cat ~/nexus/state/config/access.yaml
# → Shows all policies in one place

# Agent state
ls ~/nexus/state/agents/atlas/
# → IDENTITY.md, SOUL.md, MEMORY.md, config.yaml
# Everything about this agent in one folder
```

---

## What Lives Where

### OpenClaw

| Data | Location | Format |
|------|----------|--------|
| All config | `~/.openclaw/config.json` | JSON5 |
| Sessions | `~/.openclaw/workspace/sessions/` | JSONL files |
| Agent sessions | `~/.openclaw/agents/{id}/sessions/` | JSONL files |
| Credentials | Mixed in `config.json` | Raw values |
| Access policies | Scattered in `config.json` | Various keys |

### Nexus

| Data | Location | Format |
|------|----------|--------|
| System of Record | `state/nexus.db` | SQLite |
| Agent config | `state/agents/{id}/` | YAML + Markdown |
| Credentials | `state/credentials/` | YAML (pointers) |
| Access policies | `state/config/access.yaml` | YAML |
| Adapter config | `state/config/adapters.yaml` | YAML |
| Skill definitions | `skills/{type}/{name}/` | Markdown |
| Skill state | `state/skills/{name}/` | YAML |
| User space | `home/` | User-managed |

---

## The Visibility Trade-off

### Arguments for Hidden (OpenClaw)

- Users don't need to understand internals
- Prevents accidental modification
- Cleaner home directory
- Implementation can change without user impact

### Arguments for Visible (Nexus)

- **Transparency builds trust** — Users understand what the system does
- **Debugging is possible** — Look at the files, see the state
- **Education** — Users learn by exploring
- **Ownership** — Users can modify, extend, backup their way
- **Clear contracts** — File structure is the API

### Nexus's Bet

Visibility is worth the clutter. Users who understand their tools:
- Debug problems faster
- Extend capabilities more easily
- Trust the system more
- Feel ownership, not dependency

The cost (visible folder, more files) is worth the benefit (understanding, debuggability, trust).

---

## Single File vs Domain Split

### The Monolith Trap

```json5
// OpenClaw: One change, one file
{
  "agents": [...],           // Modified yesterday
  "channels": {...},         // Modified last week  
  "discordDmPolicy": "...",  // Never touched
  "skills": [...]            // Modified today
}
```

Every save creates a new version of the entire config. Git diffs are noisy. Merge conflicts are common.

### Domain Split Benefits

```
state/config/
├── access.yaml       # Last modified: 2 weeks ago
├── adapters.yaml     # Last modified: today
└── capabilities.yaml # Last modified: 1 month ago
```

- Each file has independent history
- Changes are scoped
- Merge conflicts are localized
- Easier to reason about "what changed when"

---

## Summary

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| Workspace location | `~/.openclaw/` (hidden) | `~/nexus/` (visible) |
| Configuration | Single `config.json` | Domain-split YAML files |
| Credentials | Inline in config | Separate pointers |
| Sessions/Events | JSONL file sprawl | Single SQLite database |
| Debugging | Grep and guess | Read files, query database |
| Visibility | Hidden by default | Transparent by default |
| User relationship | Black box | Glass box |

---

## The Design Principle

**OpenClaw says:** "Users don't need to see the internals."

**Nexus says:** "Users *should* see the internals."

Transparency isn't just about debugging — it's about trust. A system you can explore is a system you can understand. A system you understand is a system you trust. A system you trust is a system you use fully.

Hide nothing. Let users look. They'll thank you when something breaks.

---

## Related Documents

- `ARCHITECTURAL_PHILOSOPHY.md` — Broader design philosophy comparison
- `SYSTEM_OF_RECORD.md` — SQLite vs JSONL deep dive
- `specs/workspace/` — Nexus workspace specification
- `specs/data/` — Data layer specifications

