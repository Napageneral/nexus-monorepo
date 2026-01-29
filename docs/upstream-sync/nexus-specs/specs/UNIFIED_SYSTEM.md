# Unified System Specification

**Status:** SPEC IN PROGRESS  
**Last Updated:** 2026-01-27

---

## Overview

This document describes how the core Nexus systems integrate into a unified whole. It serves as the conceptual guide that ties together:

- **CLI** — Agent orientation and capability discovery
- **Credentials** — Secure secret storage with consumer-centric access control
- **Skills** — Capability providers with dependency declarations
- **Workspace** — File structure and identity management

**Core Philosophy:**

| System | Upstream (Clawdbot) | Nexus |
|--------|---------------------|-------|
| **Primary focus** | Gateway-first | CLI and workspace-first |
| **Agent independence** | Requires gateway | Gateway is optional addon |
| **Configuration** | Single config file | Structured state directory |
| **Credentials** | Raw secrets in JSON | Pointers to secure backends |
| **Status tracking** | Per-skill | Unified cascade (credential → skill → capability) |

---

## 1. Service Name as Universal Linking Key

**The most important unification point.**

The **service name** is the primary key that links credentials, skills, and capabilities:

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   SKILL     │         │ CREDENTIAL  │         │ CAPABILITY  │
│             │  link   │             │  link   │             │
│ requires:   │◀───────▶│ service:    │◀───────▶│ provided by │
│ credentials:│         │ "google"    │         │ skill with  │
│ [google]    │         │             │         │ capabilities│
└─────────────┘         └─────────────┘         └─────────────┘
```

### How It Works

| Component | Uses Service Name For |
|-----------|----------------------|
| **Skill** | `requires.credentials: [google]` — declares dependency |
| **Credential** | `service: "google"` — primary identifier |
| **Connector** | `enables: [google]` — sets up credentials for service |
| **Capability** | Derived from skill's `capabilities` field |

### Service Name Conventions

| Service | Description | Example Credentials |
|---------|-------------|---------------------|
| `google` | Google Workspace (Gmail, Calendar, Drive) | OAuth, API key |
| `anthropic` | Anthropic Claude models | API key, OAuth (Claude CLI) |
| `openai` | OpenAI models and APIs | API key |
| `discord` | Discord platform | Bot token |
| `github` | GitHub version control | OAuth, PAT |
| `slack` | Slack messaging | Bot token, OAuth |

### Skill → Credential Resolution

When a skill declares `requires.credentials: [google]`:

1. **Check existence** — Does ANY credential exist for service `google`?
2. **Status determination** — If none exist, skill status = `needs-setup`
3. **At runtime** — Agent can use any available account for that service

```
gog skill
  requires.credentials: [google]
         │
         ▼
Credential store lookup: service == "google"
         │
         ├─ Found: google/tnapathy@gmail.com  → skill status = ready
         ├─ Found: google/work@company.com    → (also available)
         └─ None found                        → skill status = needs-setup
```

**Key insight:** The skill requirement check only verifies *existence* of credentials. If the user has multiple Google accounts, the agent can choose which to use at runtime based on context.

---

## 2. Status Cascade System

**Status flows from credentials through skills to capabilities.**

This cascade is fundamental to how Nexus tracks what's working:

```
┌──────────────────────────────────────────────────────────────────────┐
│                       STATUS CASCADE                                  │
│                                                                      │
│   CREDENTIAL          SKILL              CAPABILITY                  │
│   ─────────          ─────              ──────────                  │
│                                                                      │
│   ❌ broken    ──►   🔧 needs-setup  ──►   🔧 needs-setup          │
│   ⭐ ready     ──►   ⭐ ready        ──►   ⭐ ready                 │
│   ✅ active    ──►   ⭐ ready        ──►   ⭐ ready (if unused)     │
│   ✅ active    ──►   ✅ active       ──►   ✅ active (if used)      │
│                                                                      │
│   📥 missing binary  ──►  📥 needs-install ──►  📥 needs-install   │
│   ⛔ wrong platform  ──►  ⛔ unavailable   ──►  ⛔ unavailable      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Status Definitions

| Status | Emoji | Credential | Skill | Capability |
|--------|-------|------------|-------|------------|
| `active` | ✅ | Configured + used | Ready + used | Available + used |
| `ready` | ⭐ | Configured, never used | All deps met, never used | Provider ready, never used |
| `needs-setup` | 🔧 | N/A | Missing credentials/config | Provider needs setup |
| `needs-install` | 📥 | N/A | Missing binary | Provider needs install |
| `unavailable` | ⛔ | N/A | Wrong platform | No provider for platform |
| `broken` | ❌ | Verification failed | Credential broken | Provider broken |
| `cooldown` | ⏳ | Rate limited | N/A | N/A |

### Resolution Algorithm

```typescript
function resolveCapabilityStatus(capability: string): Status {
  const providers = getSkillsProvidingCapability(capability);
  
  if (providers.length === 0) return "unavailable";
  
  // Best status wins
  const statuses = providers.map(skill => resolveSkillStatus(skill));
  
  if (statuses.includes("active")) return "active";
  if (statuses.includes("ready")) return "ready";
  if (statuses.includes("needs-setup")) return "needs-setup";
  if (statuses.includes("needs-install")) return "needs-install";
  return "unavailable";
}

function resolveSkillStatus(skill: Skill): Status {
  // Platform check
  if (skill.platform && !skill.platform.includes(process.platform)) {
    return "unavailable";
  }
  
  // Binary check
  const missingBins = skill.requires?.bins?.filter(b => !hasBinary(b));
  if (missingBins?.length > 0) return "needs-install";
  
  // Credential check
  const missingCreds = skill.requires?.credentials?.filter(s => !hasCredentialForService(s));
  if (missingCreds?.length > 0) return "needs-setup";
  
  // Credential health check
  const credStatuses = skill.requires?.credentials?.map(s => getCredentialStatus(s));
  if (credStatuses?.includes("broken")) return "needs-setup";
  
  // Usage check
  if (hasUsage(skill.name)) return "active";
  
  return "ready";
}
```

### Why This Matters

This cascade enables:

1. **Single source of truth** — Fix a credential, skill and capability status update automatically
2. **Clear guidance** — Status tells you exactly what action to take
3. **Agent understanding** — Agents know what's possible without trial and error
4. **Progressive onboarding** — Track journey from zero to full power

---

## 3. Consumer-Centric Access Control

**Credentials are controlled at the consumer level, not the credential level.**

### Design Decision

| Approach | Location | Nexus Choice |
|----------|----------|--------------|
| Credential-level | Each credential has policy | ❌ Not used |
| Consumer-level | Gateway/agent config defines access | ✅ **Used** |

**Rationale:** It's more intuitive to configure "what can the Gateway access?" than "who can access this credential?"

### Access Configuration

**Location:** Gateway and agent configs, NOT credential files.

```json
// state/nexus/config.json
{
  "gateway": {
    "credentials": {
      "level": 1,
      "blocked": ["google/*", "github/*"]
    }
  }
}

// state/agents/echo/config.json (per-agent override)
{
  "credentials": {
    "level": 2,
    "allowed": ["discord/echo-bot", "anthropic/*"]
  }
}
```

### Security Levels

| Level | Name | Default | Requires |
|-------|------|---------|----------|
| 0 | Trust All | Allow everything | Nothing |
| 1 | Opt-Out | Allow, can block | Block sensitive |
| 2 | Opt-In | Deny, must allow | Allow each |
| 3 | Scoped | Deny + scope check | Allow + scopes |

**Default:** Level 1 (opt-out) — allows all user credentials, user blocks sensitive ones.

### Source of Truth

The **CREDENTIAL_SYSTEM.md** spec in `specs/credentials/` is the authoritative reference for credential access control. Other specs should reference it rather than duplicate.

---

## 4. Skills Taxonomy (High-Level)

**Skills are capability providers.** They declare what they can do, what they need, and how to use them.

### Three-Layer Model

```
Domain (grouping)
└── Capability (what you can access)
    └── Service (who provides it)
```

| Layer | Purpose | Examples |
|-------|---------|----------|
| **Domain** | Grouping for display and onboarding | communication, productivity, ai |
| **Capability** | What kind of access | email, calendar, chat, llm |
| **Service** | Credential linkage | google, discord, anthropic |

**Key insight:** Domains organize capabilities for humans. Capabilities are what agents care about. Services link to credentials.

### Capability Granularity

**Capabilities are coarse, not fine-grained.**

| Approach | Example | Nexus Choice |
|----------|---------|--------------|
| Fine-grained | `email-read`, `email-send`, `email-delete` | ❌ Not used |
| Coarse | `email` | ✅ **Used** |

**Rationale:** A skill either gives you email access or it doesn't. The skill itself handles read/write/delete. Coarse capabilities are simpler to reason about and match how credentials work (you don't get "half" OAuth access).

### Skill Types

| Type | Purpose | Key Field |
|------|---------|-----------|
| **Tool** | Binary + docs for using it | `capabilities: [...]` |
| **Connector** | Sets up credentials for a service | `enables: [...]` |
| **Guide** | Pure documentation, no external tool | `capabilities: [...]` |

### Canonical SKILL.md Format

```yaml
---
name: gog
description: Google Workspace CLI for email, calendar, and drive
metadata:
  nexus:
    type: tool
    capabilities: [email, calendar, contacts]
    requires:
      credentials: [google]
      bins: [gog]
    platform: [darwin, linux]
---
```

### Full Specification

The skills system is documented in detail in:
- **`specs/skills/UNIFIED_SKILLS_OVERVIEW.md`** — Start here for skills
- **`specs/skills/TAXONOMY.md`** — Domain/capability/service definitions
- **`specs/skills/HUB.md`** — Packs and hub integration
- **`specs/skills/SKILL_CLI.md`** — CLI commands and manifest schema

---

## 5. CLI Organization

### Decision: Unified `nexus skills`

All skill operations are unified under `nexus skills`:

```
nexus skills
├── list                    # List installed skills
├── use <name>              # Get SKILL.md for agent
├── info <name>             # Detailed local info
├── search <query>          # Search local + hub
├── install <slug>          # Install from hub
├── update <slug>           # Update from hub
├── updates                 # Check for updates
├── reset <name>            # Reset to hub version
├── diff <name>             # Show local modifications
├── verify <name>           # Check requirements
└── scan                    # Regenerate manifest
```

**Rationale:**
- Matches upstream approach (unified)
- Simpler mental model
- No confusion about `skill` vs `skills`

**Full spec:** See `specs/skills/SKILL_CLI.md`

### Related Commands

| Command | Purpose | Notes |
|---------|---------|-------|
| `nexus credential` | Credential CRUD | ✅ Good |
| `nexus gateway credentials` | Gateway access control | ✅ Separate concern |
| `nexus capabilities` | Abstract goal mapping | ✅ Good |
| `nexus status` | Orientation | ✅ Good |

---

## 6. Workspace Structure

### Directory Layout

```
~/nexus/                          # NEXUS_ROOT
├── AGENTS.md                     # System behavior (canonical)
├── skills/                       # Skill definitions
│   ├── tools/
│   ├── connectors/
│   └── guides/
├── state/                        # Runtime state (visible, not hidden)
│   ├── nexus/config.json         # Main config
│   ├── user/IDENTITY.md          # User profile
│   ├── agents/{name}/            # Agent identity + config
│   │   ├── IDENTITY.md
│   │   ├── SOUL.md
│   │   └── config.json           # Agent-specific config (access control)
│   ├── credentials/              # Credential pointers
│   │   ├── index.json
│   │   └── {service}/{account}.json
│   ├── skills/                   # Skill state
│   │   └── manifest.json
│   └── ...
└── home/                         # User's personal space
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State visibility | `state/` not hidden | Transparency, discoverability |
| Skills location | `skills/` at root | First-class, easy to browse |
| Credentials | Pointers, not secrets | Security |
| User space | `home/` directory | Clear separation from system |

---

## 7. Gateway as Optional Addon

**Core Nexus works without Gateway. Gateway enables agent independence.**

### Without Gateway

| Works | Doesn't Work |
|-------|--------------|
| `nexus status` | Scheduled tasks |
| `nexus skills use` | External messaging (Discord, Telegram) |
| `nexus credential` | Heartbeat checks |
| `nexus capabilities` | Background agent work |
| Agent in IDE | Agent outside IDE |

### With Gateway

Gateway unlocks the "Agent Independence" stage:

```
┌───────────────────────────────────────────────────────────────────┐
│                    AGENT INDEPENDENCE                              │
│                    (Requires Gateway + LLM API)                    │
│                                                                   │
│  ┌─────────────────┐         ┌─────────────────┐                  │
│  │ Agent Comms     │         │ Automation      │                  │
│  │ Discord, Tele.  │         │ Cron, triggers  │                  │
│  └─────────────────┘         └─────────────────┘                  │
│                                                                   │
│  Agent can reach you outside IDE, work while you sleep            │
└───────────────────────────────────────────────────────────────────┘
```

### Conceptual Mapping

| Upstream Concept | Nexus Equivalent |
|------------------|------------------|
| Gateway (central) | Optional addon for agent independence |
| Channels | Access planes (agent communication) |
| Config-first | Workspace + state first |

---

## 8. Integration Points Summary

### Credential → Skill

```
Skill declares: requires.credentials: [service]
                         │
                         ▼
Credential store: service/{account}.json exists?
                         │
                         ├─ Yes → Skill can work
                         └─ No  → Skill status = needs-setup
```

### Skill → Capability

```
Skill declares: capabilities: [email, calendar]
                         │
                         ▼
Capability map: email → provided by skill X
                         │
                         ▼
Capability status = best(provider skill statuses)
```

### Connector → Credential

```
Connector declares: enables: [google]
                         │
                         ▼
User runs connector → Credential created for google
                         │
                         ▼
Skills requiring google → now work
```

### CLI → State Files

```
nexus status → reads state/agents/{name}/IDENTITY.md
                     state/credentials/index.json
                     state/skills/manifest.json
                         │
                         ▼
             Computes and displays unified status
```

---

## 9. Open Items (TODO)

### Agent Bindings

**Status:** Needs investigation

Questions to resolve:
- When are bindings triggered (session start, on-demand)?
- How do generated files (CLAUDE.md) stay in sync with AGENTS.md?
- What context does each binding inject?

**Tracked in:** `specs/workspace/AGENT_BINDINGS.md`

### Unified Triggers

**Status:** Waiting on agent-system spec completion

The trigger system replaces HEARTBEAT.md with:
- Cron triggers (scheduled)
- Event triggers (reactive)
- Heartbeat triggers (periodic check-in)

**Tracked in:** `specs/agent-system/UNIFIED_TRIGGERS.md`

### skill vs skills CLI

**Status:** ✅ Decided

Unified under `nexus skills`. See `specs/skills/SKILL_CLI.md`.

---

## 10. Reading Order

For understanding the full system:

1. **This document** — Unified system overview
2. **`specs/skills/UNIFIED_SKILLS_OVERVIEW.md`** — Skills system deep-dive
3. **`specs/credentials/CREDENTIAL_SYSTEM.md`** — Credential architecture
4. **`specs/cli/COMMANDS.md`** — CLI command reference
5. **`specs/workspace/PROJECT_STRUCTURE.md`** — File layout

For skills specifically:
- Start with `specs/skills/UNIFIED_SKILLS_OVERVIEW.md`
- Then `specs/skills/TAXONOMY.md` for domain/capability/service definitions
- Then `specs/skills/SKILL_CLI.md` for CLI and manifest details
- Then `specs/skills/HUB.md` for packs and hub integration

For other topics:
- Onboarding → `specs/cli/ONBOARDING.md`
- Upstream comparison → `specs/*/UPSTREAM_*.md` files
- Agent system → `specs/agent-system/` (in progress)

---

## Summary

| Principle | Description |
|-----------|-------------|
| **Service as key** | Service name links credentials, skills, capabilities |
| **Status cascade** | Credential status → skill status → capability status |
| **Consumer access** | Gateway/agent configs control credential access |
| **CLI-first** | Workspace and CLI work without gateway |
| **Gateway as addon** | Enables agent independence, not required for core |
| **Visible state** | `state/` directory is visible, not hidden |
| **No plaintext secrets** | Credentials are pointers to secure backends |

---

*This document is the conceptual guide to Nexus. For implementation details, see the individual spec files.*
