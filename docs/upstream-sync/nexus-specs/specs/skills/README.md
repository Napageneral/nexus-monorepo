# Skills Specs

**Status:** COMPLETE  
**Conflict Risk:** Low

**Start here:** `UNIFIED_SKILLS_OVERVIEW.md` for the single coherent view of how everything fits together.

**See also:** `specs/UNIFIED_SYSTEM.md` for how skills integrate with credentials and capabilities.

---

## Documents

| Spec | Status | Description |
|------|--------|-------------|
| `UNIFIED_SKILLS_OVERVIEW.md` | ✅ Complete | **Start here** — ties all specs together |
| `TAXONOMY.md` | ✅ Complete | Domain/capability/service model |
| `HUB.md` | ✅ Complete | Packs, hub storage, install flows |
| `SKILL_CLI.md` | ✅ Complete | CLI grammar, manifest schema, modification tracking |
| `UPSTREAM_SKILLS.md` | ✅ Complete | Upstream reference |

---

## Key Decisions (Settled)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Single location | `~/nexus/skills/` | Simplicity, local overrides in-place |
| Bundled skills | Minimal/NONE | Start minimal, hub-based, load via packs |
| Skill types | tools/, connectors/, guides/ | Clear classification |
| Tracking | Managed vs local via `.nexus-skill.json` | Know provenance |
| Taxonomy | Three-layer: Category → Domain → Service | Flexible, extensible |
| Capabilities | Flat domains, categories derived | No compound IDs |
| Credential linking | `requires.credentials: [service]` | Direct to credential system |

---

## Three-Layer Taxonomy Model

```
Domain (grouping - for display/search)
└── Capability (what you can access)
    └── Service (who provides it)
```

| Layer | Examples | Declared By |
|-------|----------|-------------|
| Domain | communication, productivity, ai | Derived from capabilities |
| Capability | email, calendar, chat, llm | Skill `capabilities` field |
| Service | google, discord, anthropic | Skill `requires.credentials` field |

**Connectors enable services:** `enables: [google]` means this connector sets up google credentials.

---

## Quick Reference

```bash
nexus skills list                      # List all skills
nexus skills list --type tool          # Filter by type
nexus skills list --capability email   # Filter by domain
nexus skills use <name>                # Get skill guide
nexus skills info <name>               # Skill metadata + status
nexus skills search <query>           # Search local + hub
nexus skills install <slug>           # Install from hub
```

---

## Skill Types

| Type | What it is | Examples |
|------|------------|----------|
| **Tool** | Instructions for using a binary | gog, tmux, peekaboo |
| **Connector** | Auth/credential setup, provides service | google-oauth, anthropic |
| **Guide** | Pure instructions, no external tool | filesystem, computer-use |

---

## Metadata Schema

```yaml
# For tools/guides:
metadata:
  nexus:
    type: tool                           # Required: tool, connector, or guide
    emoji: 📧                            # Optional
    capabilities: [email, calendar]      # What this skill enables
    requires:
      credentials: [google]              # Services needing auth
      bins: [gog]                        # Required binaries
    platform: [darwin, linux]            # Platform restrictions
    install:                             # How to install deps
      - kind: brew
        formula: steipete/tap/gogcli

# For connectors:
metadata:
  nexus:
    type: connector
    emoji: 🔐
    enables: [google]                    # Service this sets up credentials for
```

---

*See TAXONOMY.md for full specification.*
