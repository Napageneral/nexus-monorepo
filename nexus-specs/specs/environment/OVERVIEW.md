# Agent Environment

**Status:** AUTHORITATIVE  
**Last Updated:** 2026-02-02

---

## What This Is

The agent environment is **what agents see and interact with**. It defines the workspace structure, available capabilities, and how to access them.

This folder specifies three interconnected layers:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AGENT ENVIRONMENT                                   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                       THE FOUNDATION                                 │   │
│   │                                                                      │   │
│   │   Where everything lives: ~/nexus/ workspace structure               │   │
│   │   Bootstrap files, harness bindings, identity templates              │   │
│   │                                                                      │   │
│   │   Specs: foundation/                                                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                       THE CAPABILITIES                               │   │
│   │                                                                      │   │
│   │   What agents can DO: skills (how-to guides) + credentials (auth)   │   │
│   │   Skills declare capabilities, credentials enable them              │   │
│   │                                                                      │   │
│   │   Specs: capabilities/skills/, capabilities/credentials/             │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                       THE INTERFACE                                  │   │
│   │                                                                      │   │
│   │   How agents orient and discover: the nexus CLI                     │   │
│   │   Status, capabilities, skill access, credential management          │   │
│   │                                                                      │   │
│   │   Specs: interface/cli/                                              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## The Three Layers

### 1. Foundation (`foundation/`)

The workspace structure and files that give agents a place to exist.

| Component | Purpose |
|-----------|---------|
| **Workspace Structure** | `~/nexus/` layout — where skills, state, and user content live |
| **Bootstrap Process** | `nexus init` + identity conversation flow |
| **Harness Bindings** | How Cursor, Claude Code, OpenCode connect to Nexus |
| **Identity Templates** | AGENTS.md, SOUL.md, IDENTITY.md templates |

**Key Docs:**
- `WORKSPACE_SYSTEM.md` — Authoritative workspace spec (thin index)
- `harnesses/HARNESS_BINDINGS.md` — IDE/harness integrations
- `bootstrap-templates/` — Template files for init

### 2. Capabilities (`capabilities/`)

What agents can do, how capabilities map to providers, and how to access services.

| Component | Purpose |
|-----------|---------|
| **Capability System** | Abstract goals → concrete providers mapping |
| **Skills** | How-to guides for tools, connectors, and general guidance |
| **Credentials** | Secure storage and retrieval of secrets |
| **Onboarding Journey** | Progressive capability expansion path |

**Key insight:** Skills declare capabilities (`email`, `calendar`), credentials enable them via services (`google`, `anthropic`).

**Key Docs:**
- `CAPABILITIES.md` — Abstract goals → concrete providers
- `TAXONOMY.md` — Domain/capability/service model
- `CAPABILITY_JOURNEY.md` — Progressive onboarding path
- `skills/SKILL_SYSTEM.md` — Unified skills overview
- `credentials/CREDENTIAL_SYSTEM.md` — Full credential architecture

### 3. Interface (`interface/`)

How agents orient themselves and discover what's available.

| Component | Purpose |
|-----------|---------|
| **CLI** | `nexus status`, `nexus skills`, `nexus credential` commands |

**Key insight:** The CLI is a **discovery and guidance system**, not an execution wrapper. After reading a skill guide, agents run tools directly.

**Key Docs:**
- `cli/COMMANDS.md` — Full CLI reference (50+ commands)

---

## How They Fit Together

```
Agent wakes up in ~/nexus/
         │
         ▼
Reads AGENTS.md (foundation)
         │
         ▼
Runs `nexus status` (interface)
         │
         ▼
Sees capabilities and their status
         │
         ▼
Needs to do something? → `nexus skills use <name>` (capabilities)
         │
         ▼
Credential missing? → Skills guide to connector setup (capabilities)
         │
         ▼
Uses tool directly (not via CLI)
```

---

## Agent Bootstrap Flow

1. **Harness loads** (Cursor, Claude Code, etc.)
2. **Session hook runs** `nexus status --json`
3. **Identity injected** from workspace files
4. **Agent oriented** — knows who it is, what it can do

---

## Capability Status Cascade

```
Credential Status → Skill Status → Capability Status

   ❌ broken    →   🔧 needs-setup  →   🔧
   ⭐ ready     →   ⭐ ready        →   ⭐
   ✅ active    →   ⭐/✅           →   ⭐/✅
   
   📥 missing binary  →  📥 needs-install →  📥
   ⛔ wrong platform  →  ⛔ unavailable   →  ⛔
```

---

## Status Legend

Skills have status indicating readiness. See `interface/cli/COMMANDS.md` for the full legend.

Quick reference: ✅ active · ⭐ ready · 🔧 needs-setup · 📥 needs-install · ⛔ unavailable · ❌ broken

---

## Document Index

### Foundation
| Document | Purpose |
|----------|---------|
| `foundation/WORKSPACE_SYSTEM.md` | Authoritative workspace spec |
| `foundation/BOOTSTRAP_ONBOARDING.md` | Bootstrap conversation flow |
| `foundation/INIT_REFERENCE.md` | `nexus init` command details |
| `foundation/BOOTSTRAP_FILES_REFERENCE.md` | File inventory reference |
| `foundation/WORKSPACE_LAYOUT_REFERENCE.md` | Directory layout details |
| `foundation/harnesses/HARNESS_BINDINGS.md` | IDE/harness integrations |
| `foundation/harnesses/research/` | Binding research and design rationale |
| `foundation/harnesses/templates/` | Actual binding template files |
| `foundation/bootstrap-templates/` | AGENTS.md, SOUL.md, IDENTITY.md templates |
| `foundation/upstream/` | Upstream workspace references |

### Capabilities
| Document | Purpose |
|----------|---------|
| `capabilities/CAPABILITIES.md` | Abstract goals → concrete providers |
| `capabilities/TAXONOMY.md` | Domain/capability/service model |
| `capabilities/CAPABILITY_JOURNEY.md` | Progressive onboarding path |
| `capabilities/skills/SKILL_SYSTEM.md` | Unified skills overview |
| `capabilities/skills/SKILL_CLI.md` | Skills CLI commands |
| `capabilities/skills/HUB.md` | Skills hub and packs |
| `capabilities/skills/upstream/` | Upstream skills references |
| `capabilities/credentials/CREDENTIAL_SYSTEM.md` | Full credential architecture |
| `capabilities/credentials/upstream/` | Upstream credentials references |

### Interface
| Document | Purpose |
|----------|---------|
| `interface/cli/COMMANDS.md` | Full CLI reference (50+ commands) |
| `interface/cli/CURRENT_CLI_RESEARCH.md` | Research notes on CLI implementation |
| `interface/cli/upstream/` | Upstream CLI references |

---

## See Also

- `../OVERVIEW.md` — System architecture overview
- `../runtime/` — Event processing engine (NEX, adapters, broker)
- `../data/` — Where state lives (ledgers, cortex)
- `../services/` — Optional platform features (cloud, collab)

---

*This folder defines the Nexus agent environment — what agents see and interact with.*
