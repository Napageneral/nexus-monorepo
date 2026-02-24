# OpenClaw Data Layer — Upstream Reference

**Status:** COMPLETE  
**Last Updated:** 2026-02-04  
**Upstream Version:** v2026.2.3

---

## Overview

This folder documents how OpenClaw stores and manages ALL persistent data — configuration, credentials, sessions, transcripts, memory, and the battle-tested edge case handling that Nexus must preserve.

---

## Document Index

| Document | Purpose |
|----------|---------|
| [`DATA_LAYER_COMPLETE.md`](./DATA_LAYER_COMPLETE.md) | **Master reference** — ALL data persistence patterns |
| [`BATTLE_TESTED_PATTERNS.md`](./BATTLE_TESTED_PATTERNS.md) | Critical edge case handling: deduplication, streaming, delays, failover |
| [`../ledgers/upstream/UPSTREAM_SESSION_STORAGE.md`](../ledgers/upstream/UPSTREAM_SESSION_STORAGE.md) | JSONL session format, sessions.json index |
| [`../ledgers/upstream/UPSTREAM_COMPACTION.md`](../ledgers/upstream/UPSTREAM_COMPACTION.md) | Context compaction and summarization |
| [`../cortex/upstream/UPSTREAM_MEMORY.md`](../cortex/upstream/UPSTREAM_MEMORY.md) | Hybrid BM25+vector memory system |

---

## OpenClaw Data Model

```
~/.openclaw/
├── openclaw.json            # Main configuration (JSON5)
├── credentials/             # Provider credentials (WhatsApp, Telegram, etc.)
├── devices/                 # Device pairing state
├── agents/
│   └── {agentId}/
│       ├── agent/
│       │   └── auth-profiles.json  # OAuth + API keys
│       └── sessions/
│           ├── sessions.json       # Session index
│           └── *.jsonl             # Transcript files
├── memory/
│   └── {agentId}.sqlite     # Per-agent memory index (BM25 + vectors)
├── media/                   # Ephemeral media cache
├── skills/                  # Managed skills
├── extensions/              # Installed plugins
└── logs/                    # Gateway logs
```

See [`DATA_LAYER_COMPLETE.md`](./DATA_LAYER_COMPLETE.md) for full details on each component.

---

## What Nexus Replaces

| OpenClaw | Nexus | Why |
|----------|-------|-----|
| `sessions.json` + `*.jsonl` | Agents Ledger (SQLite) | Queryable, atomic, no file sprawl |
| Memory index (SQLite) | Cortex (derived layer) | Unified, automatic, graph-aware |
| Per-agent isolation | Unified ledgers | Cross-agent knowledge sharing |
| Manual memory writes | Automatic ingestion | Agent doesn't need to "remember" |

---

## What Nexus Preserves

These battle-tested patterns MUST be ported:

1. **Deduplication** — 20min TTL, 5000 entry limit, composite keys
2. **Block streaming** — Paragraph/sentence breaks, code fence safety
3. **Human-like delays** — 800-2500ms between chunks
4. **Compaction** — Summary + kept messages, memory flush before compact
5. **Failover** — Auth profile rotation, exponential cooldowns

See `BATTLE_TESTED_PATTERNS.md` for implementation details.

---

## Storage Comparison

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Format** | JSONL files | SQLite tables |
| **Index** | JSON file (`sessions.json`) | SQL index |
| **Queries** | Read entire file, filter in memory | SQL WHERE clauses |
| **Transactions** | File locks | SQLite transactions |
| **Backup** | Copy files | SQLite backup API |
| **Corruption** | Repair tool (`repairSessionFileIfNeeded`) | SQLite recovery |
| **Concurrency** | File locking | WAL mode |

---

## See Also

- `../ledgers/` — Nexus ledger schemas
- `../cortex/` — Nexus derived layer
- `../../runtime/upstream/` — Runtime infrastructure

---

*This folder documents what Nexus intentionally replaces, and what it must preserve.*
