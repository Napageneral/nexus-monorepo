# Project Structure

**Status:** REFERENCE  
**Last Updated:** 2026-02-02

---

## Overview

This folder documents the codebase structure — both the upstream openclaw project and the target Nexus structure. It serves as the source of truth for understanding how the fork transforms the codebase.

---

## Documents

| Document | Purpose |
|----------|---------|
| `UPSTREAM_STRUCTURE.md` | Analysis of openclaw's codebase layout |
| `NEXUS_STRUCTURE.md` | Target Nexus project structure |
| `FORK_MAPPING.md` | How openclaw components map to Nexus |

---

## Quick Reference

### Openclaw → Nexus Key Transformations

| Openclaw | Nexus | Notes |
|----------|-------|-------|
| `packages/opencode/` | `packages/core/` | Main engine |
| `src/storage/` | `src/ledgers/` | File-based → SQLite |
| `src/session/` | `src/broker/` | Session management |
| `src/permission/` | `src/iam/` | Per-call → upfront ACL |
| `src/plugin/` | Removed | Replaced by NEX hooks + Skills |
| `src/memory/` | Removed | Replaced by Cortex |

### New Nexus Components

| Component | Purpose |
|-----------|---------|
| `src/ledgers/` | System of Record (Events, Agents, Identity, Nexus) |
| `src/cortex/` | Derived layer (episodes, facets, embeddings) |
| `src/iam/` | Identity & Access Management |
| `src/adapters/` | In/out adapters for platforms |
| `src/nex/` | Central orchestrator |

---

## Related

- `../architecture/OVERVIEW.md` — High-level system architecture
- `../workspace/` — Runtime workspace structure (`~/nexus/`)
