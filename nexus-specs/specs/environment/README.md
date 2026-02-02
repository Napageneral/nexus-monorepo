# Agent Environment

The context agents work within.

---

## What This Is

The agent environment is **what agents see and interact with**. It defines the workspace structure, available capabilities, and how to access them.

---

## Components

| Folder | Purpose |
|--------|---------|
| `workspace/` | File structure, identity files, AGENTS.md, harness bindings |
| `skills/` | Capabilities and how-to guides |
| `cli/` | Command-line interface to the system |
| `credentials/` | Secure secrets management |

---

## How They Fit Together

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT ENVIRONMENT                         │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Workspace   │    │    Skills    │    │ Credentials  │  │
│  │              │    │              │    │              │  │
│  │ AGENTS.md    │    │ Capabilities │    │ API keys     │  │
│  │ IDENTITY.md  │◄───│ How-to docs  │◄───│ OAuth tokens │  │
│  │ SOUL.md      │    │ Tool guides  │    │ Secrets      │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         ▲                   ▲                   ▲           │
│         │                   │                   │           │
│         └───────────────────┴───────────────────┘           │
│                             │                                │
│                      ┌──────┴──────┐                        │
│                      │     CLI     │                        │
│                      │             │                        │
│                      │ nexus       │                        │
│                      │ status      │                        │
│                      │ skills use  │                        │
│                      │ credential  │                        │
│                      └─────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Agent Bootstrap Flow

1. **Harness loads** (Cursor, Claude Code, etc.)
2. **Session hook runs** `nexus status --json`
3. **Identity injected** from workspace files
4. **Agent oriented** — knows who it is, what it can do

---

## Capabilities

Skills declare capabilities. CLI surfaces them. Credentials enable them.

```
Capability (abstract)  →  Provider (concrete)
     email-read        →  gog + google-oauth
     messaging-read    →  eve, imsg, wacli
     chat-send         →  discord, slack
```

The CLI shows what's available:
```bash
nexus status         # Am I set up?
nexus capabilities   # What can I do?
nexus skills use X   # How do I use this?
```

---

## See Also

- `../runtime/` — What processes events
- `../data/` — Where state is stored
- `../architecture/OVERVIEW.md` — System overview

---

*This directory contains specifications for the Nexus agent environment.*
