# Onboarding Specification

**Status:** ALIGNED WITH WORKSPACE_SYSTEM.md  
**Last Updated:** 2026-01-28

---

## Overview

Onboarding is **entirely an agent conversation**, not a CLI wizard. After `nexus init`, when the user opens `~/nexus/` in their agent harness (Cursor, Claude Code, etc.), the agent reads `AGENTS.md`, detects no identity exists, reads `BOOTSTRAP.md`, and starts the conversation.

**Philosophy:** Identity first, configuration later. Meet the agent before configuring the system.

**Key Principle:** This is an agent conversation, not a CLI wizard. The user opens `~/nexus/` in their agent harness. The agent reads `AGENTS.md`, detects no identity exists, reads `BOOTSTRAP.md`, and starts the conversation.

---

## Onboarding Flow

### 1. Agent Detection

When the user opens `~/nexus/` in their agent harness:

1. Agent reads `AGENTS.md` → sees it's a Nexus workspace
2. Agent notices: No `state/agents/*/IDENTITY.md` exists (only `BOOTSTRAP.md`)
3. Agent reads `BOOTSTRAP.md` and starts the conversation

### 2. BOOTSTRAP Conversation (Identity First)

The agent initiates a natural conversation:

**Agent:** "Hey. I just came online. Who am I? Who are you?"

Through conversation, they establish:
- **Agent identity:** Name, emoji, creature, vibe
- **User identity:** Name, timezone, email, preferences

**Example conversation flow:**

- Agent asks about its name (suggestions: Atlas, Nova, Sage)
- User responds: "Atlas"
- Agent asks about emoji representation
- User responds: "🧭"
- Agent asks about vibe/behavior
- User responds: "Direct, candid, no fluff. Pushes back when wrong."
- Agent asks about user's name
- User responds: "Tyler"
- Agent asks about timezone
- User responds: "Central (Austin, TX)"
- Agent asks about email (optional)
- User responds: "tnapathy@gmail.com"

**Key insight:** This is a conversation, not a form. The agent participates in establishing its own identity. The agent name comes from this conversation, not a CLI flag.

### 3. Write Identity Files

After the conversation, the agent writes files:

- `state/agents/{name}/IDENTITY.md` ← Directory named from conversation (lowercase, spaces → hyphens)
- `state/agents/{name}/SOUL.md`
- `state/user/IDENTITY.md`

**Important:** 
- Agent directory name comes from the conversation, not a CLI flag
- Never create `agents/default/` directory
- The `--agent` flag exists only for internal/testing purposes

### 4. Silent Detection Phase

After establishing identity, the agent silently detects:

1. **Credential scan:** `nexus credential scan --deep`
   - Discovers env vars (ANTHROPIC_API_KEY, etc.)
   - Imports Claude CLI / Codex CLI credentials
   - See `specs/credentials/CREDENTIAL_SYSTEM.md` for details

2. **Harness detection:** Uses `aix` tool (skill/tool)
   - Detects installed agent harnesses (Cursor, Claude Code, Codex, etc.)
   - Ranks by usage frequency
   - Identifies top 2 most-used harnesses

3. **OS detection:** Platform-specific suggestions
   - macOS → suggest macos-essentials skill pack
   - Linux → suggest linux-essentials skill pack

**No prompts here** — detection is silent. Results inform the next step.

### 5. Agent Bindings (Auto-created for top 2 harnesses)

Agent detects harnesses via AIX and creates bindings for top 2 supported harnesses.

```bash
# Agent runs:
nexus bindings detect --json

# Parses result, identifies top 2 supported harnesses, then:
nexus bindings create cursor
nexus bindings create claude-code
```

**Agent:** "I see you use Cursor and Claude Code most. I've set up bindings so they connect to Nexus. Want me to set up others?"

**Supported harnesses:**
- **Cursor:** `.cursor/hooks.json`, `.cursor/hooks/nexus-session-start.js`
- **Claude Code:** `CLAUDE.md`, `.claude/settings.json`
- **OpenCode:** `.opencode/plugins/nexus-bootstrap.ts`

**Not supported:**
- **Codex:** No lifecycle hooks — cannot inject or refresh context

**If AIX not available:**

```
Agent: "To auto-detect your preferred coding assistants, I need AIX installed.

        Install with: brew install Napageneral/tap/aix
        Then run: aix init && aix sync --all

        Or tell me which harnesses you use and I'll set them up:
        - Cursor
        - Claude Code  
        - OpenCode"
```

**User must open `~/nexus/` as workspace root for bindings to work.**

### 6. Follow-up Tasks (Agent suggests)

**Agent:** "Here's what else we could set up when you're ready:"

- **Channels** (WhatsApp, Telegram, Discord) → handled by gateway plugin (NOT part of onboarding)
- **Skill packs** → `nexus skills install macos-essentials`
- **Cloud sync** → `nexus-cloud setup`

These are follow-up tasks, not part of core onboarding. Channel setup is documented in `specs/agent-system/GATEWAY.md`.

### 7. Done

**Agent:** "🧭 Atlas is ready! Run `nexus status` to see what I can do. Everything else uses reasonable defaults. Customize later with `nexus configure`."

---

## What Gets Created

| File | Location | Purpose |
|------|----------|---------|
| Agent IDENTITY.md | `state/agents/{name}/IDENTITY.md` | Agent name, emoji, vibe (directory named from conversation) |
| SOUL.md | `state/agents/{name}/SOUL.md` | Persona & boundaries |
| User IDENTITY.md | `state/user/IDENTITY.md` | User profile |
| Agent bindings | Various | Auto-created for top 2 harnesses (Cursor, Claude Code, etc.) |

---

## What Is NOT Asked

Configuration details deferred to `nexus configure`:

| Aspect | Default | Configure Later |
|--------|---------|-----------------|
| Gateway port | 18789 | `nexus configure gateway.port` |
| Gateway bind | loopback | `nexus configure gateway.bind` |
| Model | claude-sonnet-4-20250514 | `nexus configure agents.defaults.model` |
| Credential storage | keychain | `nexus configure credentials.defaultStorage` |

**Rationale:** New users don't need to make infrastructure decisions upfront. Reasonable defaults work for most cases. Configs are split by domain (see `WORKSPACE_SYSTEM.md` section 7).

---

## Automatic Trigger

After `nexus init`, when the user opens `~/nexus/` in their agent harness:

1. Agent reads `AGENTS.md` → sees it's a Nexus workspace
2. Agent notices: No `state/agents/*/IDENTITY.md` exists (only `BOOTSTRAP.md`)
3. Agent reads `BOOTSTRAP.md` and starts the conversation

**Detection:** Check for existence of `state/agents/*/IDENTITY.md`

---

## Creating Additional Agents

To create additional agents, the user opens `~/nexus/` in their agent harness and the agent reads `BOOTSTRAP.md` again. The conversation establishes a new agent identity, creating a new directory `state/agents/{new-name}/`.

**Note:** The `--agent` flag exists only for internal/testing purposes. In normal operation, agent names come from the conversation.

---

## Implementation Notes

### BOOTSTRAP.md Usage

1. Lives permanently at `state/agents/BOOTSTRAP.md`
2. Read by agent when no `state/agents/*/IDENTITY.md` exists
3. NOT deleted after onboarding (kept for creating additional agents)

### Detection Tools

- **Credentials:** `nexus credential scan --deep` discovers env vars and imports CLI credentials
- **Harnesses:** `nexus bindings detect` queries AIX for harness usage, returns ranked list
- **Bindings:** `nexus bindings create <harness>` creates files from templates
- **Supported:** Cursor, Claude Code, OpenCode
- **Not supported:** Codex (no lifecycle hooks)

### Channels

Channels are **NOT part of onboarding**. They are follow-up tasks handled by the gateway plugin. See `specs/agent-system/GATEWAY.md` for channel setup details.

---

## Migration Path

### Fresh Install

1. `nexus init` → Creates structure and default config files
2. User opens `~/nexus/` in agent harness (Cursor, Claude Code, etc.)
3. Agent reads `BOOTSTRAP.md` and starts conversation
4. Complete conversation → identity files created
5. Agent runs detection → auto-creates bindings for top 2 harnesses
6. Ready

### From Upstream (clawdbot)

1. `nexus migrate` (future command)
2. Moves data to new locations
3. User opens `~/nexus/` → agent starts BOOTSTRAP conversation
4. Ready

### Existing Nexus User

Already onboarded → no action needed. Agent reads existing identity files.

---

## Relationship to Other Specs

| Spec | Relationship |
|------|--------------|
| `WORKSPACE_SYSTEM.md` | Authoritative spec — this document aligns with it |
| `BOOTSTRAP_FILES.md` | File templates used during onboarding |
| `AGENT_BINDINGS.md` | Binding details for harnesses |
| `specs/credentials/CREDENTIAL_SYSTEM.md` | Credential scan and import details |
| `specs/agent-system/GATEWAY.md` | Channel setup (follow-up, not onboarding) |

---

*This document aligns with WORKSPACE_SYSTEM.md. See that document for authoritative details.*
