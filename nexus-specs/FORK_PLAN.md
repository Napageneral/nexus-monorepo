# Nexus Fork Plan

**Goal:** Build Nexus using openclaw as a foundation, guided by our comprehensive specs.

**Created:** 2026-01-21  
**Updated:** 2026-02-02

---

## Overview

Nexus is a personal AI ecosystem forked from **openclaw** (formerly moltbot/clawdbot). Rather than grafting commits or doing incremental modifications, we're using our carefully crafted specifications to rebuild the system from the ground up — carrying over implementation details and edge case handling from upstream while architecting for our unique vision.

---

## The Approach

### 1. Specs First

The `specs/` folder contains the authoritative design for Nexus:

| Folder | Purpose |
|--------|---------|
| `architecture/` | High-level overview, entry point |
| `nex/` | Central orchestrator (NEX pipeline) |
| `ledgers/` | System of Record (Events, Agents, Identity, Nexus) |
| `cortex/` | Derived layer (episodes, facets, embeddings) |
| `iam/` | Identity & Access Management |
| `broker/` | Agent sessions, execution, orchestration |
| `hooks/` | Event-triggered automation |
| `adapters/` | Platform integrations (in/out) |
| `workspace/` | File structure, identity, bindings |
| `cli/` | `nexus` CLI commands |
| `skills/` | Skills hub and taxonomy |
| `credentials/` | Credential management |
| `project-structure/` | Codebase layout, fork mapping |

**Start here:** `specs/architecture/OVERVIEW.md`

### 2. Upstream as Reference

Openclaw is a rapidly developing project with battle-tested implementations. We:

- **Study upstream** for implementation patterns and edge cases
- **Port logic** where it aligns with our specs
- **Track changes** to incorporate valuable improvements
- **Diverge intentionally** where our architecture differs

### 3. Branding via Script

Automated branding transformation from openclaw → nexus:

| From | To |
|------|-----|
| `clawdbot` / `openclaw` | `nexus` |
| `CLAWDBOT_*` env vars | `NEXUS_*` |
| `~/.clawdbot/` | `~/nexus/state/` |
| Package/binary names | nexus |

**Script:** `scripts/rebrand.sh` (re-runnable after upstream syncs)

---

## Repository Layout

| Repo | Location | Purpose |
|------|----------|---------|
| **nexus-cli** | `~/nexus/home/projects/nexus/nexus-cli` | Nexus implementation |
| **openclaw** | `~/nexus/home/projects/openclaw` | Upstream reference |

---

## Key Architectural Differences

What makes Nexus different from openclaw:

| Aspect | Openclaw | Nexus |
|--------|----------|-------|
| **Data model** | JSONL session files | SQLite ledgers (System of Record) |
| **Memory** | File-based (MEMORY.md) | Cortex (derived layer) |
| **Access control** | Per-call permissions | Upfront IAM policies |
| **Event flow** | Direct handling | NEX pipeline (8 stages) |
| **Workspace** | Hidden `~/.clawdbot/` | Visible `~/nexus/` |
| **Skills** | Bundled | Hub-based (no bundled skills) |

---

## Upstream Sync Strategy

### What We Track

- New features and improvements
- Bug fixes and edge case handling
- Performance optimizations
- Provider SDK updates

### How We Incorporate

1. **Review upstream changes** — `git log` / `git diff` in openclaw
2. **Evaluate fit** — Does this align with our specs?
3. **Port selectively** — Adapt logic to our architecture
4. **Re-run branding** — `./scripts/rebrand.sh`

### What We Skip

- Changes to systems we've replaced (memory, permissions)
- UI/UX decisions that don't fit Nexus model
- Features that conflict with our architecture

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Branding script finalized
- [ ] Workspace structure (`~/nexus/`)
- [ ] Bootstrap files (AGENTS.md, SOUL.md, IDENTITY.md)
- [ ] Core database schema (nexus.db)

### Phase 2: Core Pipeline
- [ ] NEX orchestrator (8-stage pipeline)
- [ ] System of Record (4 ledgers)
- [ ] IAM (identity resolution, ACL policies)
- [ ] Basic adapters (timer, webhook)

### Phase 3: Agent System
- [ ] Broker implementation
- [ ] Session/turn management
- [ ] Hooks engine
- [ ] Tool registration

### Phase 4: Adapters
- [ ] In-adapters (iMessage, Gmail, Discord, etc.)
- [ ] Out-adapters (platform formatting, delivery)

### Phase 5: Cortex
- [ ] Episode extraction
- [ ] Facet analysis
- [ ] Embeddings + search
- [ ] Context assembly

### Phase 6: Polish
- [ ] CLI commands
- [ ] Skills hub
- [ ] Credential management
- [ ] Cloud sync (optional)

---

## Success Criteria

1. **Spec compliance** — Implementation matches specs
2. **Upstream parity** — Core features work as well as openclaw
3. **Edge cases covered** — Leverage upstream's battle-tested logic
4. **Clean architecture** — NEX pipeline, ledger-based data model
5. **Maintainable sync** — Can incorporate upstream improvements

---

## Related Documents

- `specs/architecture/OVERVIEW.md` — System architecture
- `specs/project-structure/FORK_MAPPING.md` — Detailed component mapping
- `specs/BRANDING.md` — Branding transformation rules

---

*This document describes the high-level fork strategy. See `specs/` for detailed implementation guidance.*
