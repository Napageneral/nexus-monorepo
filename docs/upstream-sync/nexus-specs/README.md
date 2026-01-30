# Nexus Fork Specifications

**Purpose:** Consolidated specs for the Nexus fork of openclaw (formerly moltbot/clawdbot).

**Last Updated:** 2026-01-27

---

## Document Index

| Document | Purpose |
|----------|---------|
| `specs/UNIFIED_SYSTEM.md` | **START HERE** — How all Nexus systems integrate |
| `OVERVIEW.md` | High-level overview of ALL nexus-unique features organized by lane |
| `FORK_PLAN.md` | Master plan: fresh fork strategy, unique commits, execution phases |
| `specs/` | Detailed specifications by lane |

---

## Core Concepts

The `UNIFIED_SYSTEM.md` document explains the key integrations:

1. **Service Name as Universal Key** — Links credentials, skills, and capabilities
2. **Status Cascade** — Credential → Skill → Capability status flow
3. **Consumer-Centric Access** — Gateway/agent configs control credential access
4. **CLI-First Philosophy** — Gateway is optional addon for agent independence

---

## Lanes

| Lane | Status | Conflict Risk | Specs |
|------|--------|---------------|-------|
| **Cross-Cutting** | IN PROGRESS | N/A | `specs/UNIFIED_SYSTEM.md` |
| **1. Branding** | DONE | Low | `specs/BRANDING.md` |
| **2. Workspace** | IN PROGRESS | Low | `specs/workspace/` |
| **3. Agent System** | IN PROGRESS | HIGH | `specs/agent-system/` |
| **4. Skills** | COMPLETE | Low | `specs/skills/` |
| **5. Memory** | DECISION MADE | Medium | `specs/memory/` |
| **6. Cloud** | DEFERRED | Low | `specs/cloud/` |
| **7. Collab** | DEFERRED | Low | `specs/collab/` |
| **8. CLI** | COMPLETE | N/A (new) | `specs/cli/` |
| **9. Credentials** | COMPLETE | Medium | `specs/credentials/` |

---

## Reading Order

### For Understanding the System

1. **Start here:** `specs/UNIFIED_SYSTEM.md` — how everything fits together
2. **Then:** `OVERVIEW.md` — what makes nexus different from openclaw
3. **Detailed specs:** Individual lane specs as needed

### For Implementation

1. `specs/UNIFIED_SYSTEM.md` — understand the integration points
2. `specs/cli/COMMANDS.md` — CLI reference
3. `specs/credentials/CREDENTIAL_SYSTEM.md` — credential architecture
4. `specs/skills/TAXONOMY.md` — skill types and capability mapping
5. `specs/workspace/PROJECT_STRUCTURE.md` — file layout

---

## Spec Status Legend

| Status | Meaning |
|--------|---------|
| DONE | Spec complete, ready to implement |
| IN PROGRESS | Actively being written |
| DESIGN DONE | High-level design settled, needs implementation spec |
| SPEC NEEDED | Needs a spec written |
| DECISION MADE | No formal spec needed, decision documented in OVERVIEW.md |

---

*This folder replaces the scattered docs in `.upstream-sync/`. Old docs will be archived.*
