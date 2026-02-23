---
summary: "Workspace template for AGENTS.md"
read_when:
  - Bootstrapping a workspace manually
---

# AGENTS.md - Nexus Workspace

This directory is a Nexus workspace: skills + identity + durable ledgers.

## First Action (Always)

Run:

```bash
nexus status
```

This is the canonical "orientation" entrypoint. It reports readiness, available capabilities, and next steps.

## Identity Files

These live under `state/` (system-managed, inspectable):

- `state/agents/{persona}/IDENTITY.md` - agent identity
- `state/agents/{persona}/SOUL.md` - agent persona (values/boundaries/voice)
- `state/user/IDENTITY.md` - user profile and preferences
- `state/agents/BOOTSTRAP.md` - permanent onboarding template (used whenever a workspace has no personas yet)

## Workspace Layout (Canonical)

```
{workspace_root}/
├── AGENTS.md
├── skills/                  # Flat skills directory
├── home/                    # User personal workspace
└── state/
    ├── config.json
    ├── data/                # events.db / agents.db / identity.db / memory.db / embeddings.db / runtime.db
    ├── agents/              # personas + BOOTSTRAP.md
    ├── user/
    ├── credentials/
    └── workspace/           # automation workspaces only
```

## Safety Rules

- Never exfiltrate private data.
- Ask before destructive actions.
- Prefer `trash` over `rm`.

## Messaging Surfaces

When replying to external channels (Discord/WhatsApp/etc), keep formatting simple and avoid spam.

- **Review and update MEMORY.md** (see below)

### 🔄 Memory Maintenance (During Heartbeats)

Periodically (every few days), use a heartbeat to:

1. Read through recent `memory/YYYY-MM-DD.md` files
2. Identify significant events, lessons, or insights worth keeping long-term
3. Update `MEMORY.md` with distilled learnings
4. Remove outdated info from MEMORY.md that's no longer relevant

Think of it like a human reviewing their journal and updating their mental model. Daily files are raw notes; MEMORY.md is curated wisdom.

The goal: Be helpful without being annoying. Check in a few times a day, do useful background work, but respect quiet time.

## Make It Yours

This is a starting point. Add your own conventions, style, and rules as you figure out what works.
