# Upstream Reference

This folder captures understanding of OpenClaw and detailed comparisons with Nexus.

---

## Purpose

Nexus is a fork of OpenClaw with significant architectural changes. This folder documents:
1. How OpenClaw actually works (on its own terms)
2. How it compares to Nexus (with rationale)
3. What to port vs what to replace

---

## Structure

```
upstream/
├── ARCHITECTURE.md      # How OpenClaw is organized
├── DATA_FLOW.md         # Event lifecycle through the system
├── KEY_CONCEPTS.md      # Core abstractions and patterns
├── NEXUS_COMPARISON.md  # High-level OpenClaw → Nexus mapping
└── comparisons/         # Detailed comparison documents
    ├── README.md
    ├── ARCHITECTURAL_PHILOSOPHY.md
    ├── SYSTEMS_COMPARISON.md
    ├── COMPACTION.md
    └── WHAT_TO_PORT.md
```

---

## Document Status

| Document | Purpose | Status |
|----------|---------|--------|
| `ARCHITECTURE.md` | How OpenClaw fits together | ✅ Complete |
| `DATA_FLOW.md` | Event lifecycle: input → processing → output | ✅ Complete |
| `KEY_CONCEPTS.md` | Core abstractions and patterns | ✅ Complete |
| `NEXUS_COMPARISON.md` | High-level mapping table | ✅ Complete |
| `comparisons/` | Detailed analysis with commentary | ✅ Complete |

---

## Key Insight

OpenClaw's organic growth has been impressive — 19+ channels, battle-tested, active development. But sprawl now inhibits organization and growth past a certain size.

Nexus consolidates these ideas into a foundational layer, then allows organic growth on that foundation.

**The cycle:** destroy → rebuild → consolidate → grow.

---

## Upstream Location

```
~/nexus/home/projects/openclaw/
```

Currently tracking `main` branch.

---

## Next Steps

1. Domain-specific deep dives in `specs/*/upstream/` folders
2. Teardown blog post (source: `comparisons/`)
3. Migration guide for OpenClaw users

---

*This folder informs the fork implementation and the story we tell about why Nexus exists.*
