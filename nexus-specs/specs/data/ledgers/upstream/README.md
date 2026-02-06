# Upstream Reference — Data Storage

This folder captures how OpenClaw stores session and event data.

**Note:** OpenClaw uses JSONL files for sessions. Nexus replaces this with SQLite ledgers — a fundamental architectural difference.

---

## Upstream Location

```
~/nexus/home/projects/openclaw/
```

---

## Key Areas to Document

| Area | Upstream Location | Notes |
|------|-------------------|-------|
| **Session storage** | `packages/core/src/session/` | JSONL file format |
| **Session metadata** | `sessions.json` pattern | Index file structure |
| **Transcript format** | `*.jsonl` files | Message/turn format |
| **Compaction** | Session compaction logic | How context is summarized |

---

## Documents to Create

- `UPSTREAM_SESSION_STORAGE.md` — How sessions/transcripts are stored
- `UPSTREAM_COMPACTION.md` — Compaction and context management

---

## Nexus Difference

Nexus replaces JSONL files with SQLite ledgers:
- **Events Ledger** — All inbound/outbound events
- **Agents Ledger** — Sessions, turns, messages, tool calls
- **Identity Graph** — Contacts, entities, mappings
- **Nexus Ledger** — Pipeline traces

This enables structured queries, atomic transactions, and no file sprawl.

---

*This folder documents upstream patterns that Nexus intentionally replaces.*
