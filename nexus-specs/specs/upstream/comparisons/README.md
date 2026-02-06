# Upstream Comparisons

This folder captures detailed comparisons between OpenClaw and Nexus, with commentary on architectural decisions and rationale.

---

## Documents

### Core Comparisons

| Document | Purpose |
|----------|---------|
| `ARCHITECTURAL_PHILOSOPHY.md` | High-level design philosophy differences |
| `SYSTEMS_COMPARISON.md` | System-by-system breakdown |
| `WHAT_TO_PORT.md` | Specific patterns worth adopting |

### Data Layer

| Document | Purpose |
|----------|---------|
| `DATA_MODEL.md` | **Master reference** — Complete data model comparison with schemas |
| `SYSTEM_OF_RECORD.md` | JSONL files vs SQLite ledgers |
| `STATE_LAYOUT.md` | Workspace structure and configuration |
| `MEMORY_PHILOSOPHY.md` | Why Nexus's derived memory is fundamentally better |
| `MEMORY_SYSTEMS.md` | Technical comparison: in-flow memory vs Cortex |
| `COMPACTION.md` | Deep dive on context management |

### Runtime

| Document | Purpose |
|----------|---------|
| `EVENT_ORCHESTRATION.md` | Decentralized dispatch chain vs centralized NEX pipeline |
| `IDENTITY_RESOLUTION.md` | How identity flows: normalization vs. dedicated resolution |
| `ACCESS_CONTROL.md` | Scattered allowlists vs declarative IAM |
| `CONTEXT_ASSEMBLY.md` | How context is built for agents |
| `PIPELINE_HOOKS.md` | Scattered hooks vs 8-stage pipeline |
| `AUTOMATIONS.md` | Heartbeats vs first-class proactive/reactive automations |
| `ADAPTERS.md` | Channel abstractions |

### Other

| Document | Purpose |
|----------|---------|
| `MANAGER_WORKER_PATTERN.md` | Multi-agent orchestration |
| `SESSION_ROUTING.md` | How messages route to sessions |
| `EXTENSION_SYSTEM.md` | Plugin architecture |
| `DOCTOR_SYSTEM.md` | Health checking |

---

## Key Insight

OpenClaw's organic growth has been impressive — 19+ channels, battle-tested, active development. But that sprawl now inhibits organization and growth past a certain size.

Nexus consolidates these ideas into a more foundational layer, then allows organic growth on that foundation.

**The cycle:** destroy → rebuild → consolidate → grow.

Raw organic unplanned growth makes it hard to get foundational things like IAM right without massive refactoring — extremely difficult while maintaining OpenClaw's open-source development pace.

---

## The Bet

Nexus is: **safer, more modular, more extensible, more durable.**

Once you have a SQLite System of Record, you can build whatever memory system you want on top — not rely on files which have problems solved better by a proper data layer.

---

*These documents inform the teardown blog post and migration guide.*
