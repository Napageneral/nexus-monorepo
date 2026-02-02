# Nexus CLI & Capabilities Specs

**Status:** SPEC COMPLETE  
**Conflict Risk:** N/A (entirely new, no upstream equivalent)

---

## Overview

The `nexus` CLI is a **new component** that doesn't exist in clawdbot upstream. It provides:

1. **Agent orientation** - `nexus status` tells agents who they are and what they can do
2. **Capability discovery** - Abstract goals mapped to concrete providers
3. **Skill access** - `nexus skills use <name>` returns skill guides
4. **Credential management** - Secure storage with keychain/1password/env backends
5. **Onboarding guidance** - Progressive capability expansion

**Key Insight:** This is a primary reason for the fork. The CLI is the agent's interface to the Nexus ecosystem.

**See also:** Related specs for how CLI integrates with other systems:
- `../credentials/` — Credential management
- `../skills/` — Skills system
- `../workspace/` — Workspace structure

---

## Documents

| Spec | Status | Description |
|------|--------|-------------|
| `COMMANDS.md` | ✅ Complete | Full CLI command reference (50+ commands) |
| `CAPABILITIES.md` | ✅ Complete | Abstract capability → provider system |
| `CREDENTIALS.md` | ⚠️ Superseded | See `specs/credentials/CREDENTIAL_SYSTEM.md` |
| `ONBOARDING.md` | ✅ Complete | Capability onboarding journey |
| `CURRENT_CLI_RESEARCH.md` | ✅ Complete | Implementation analysis from codebase |
| `UPSTREAM_CLI.md` | ✅ Complete | Upstream clawdbot CLI for comparison |

---

## Key Concepts

### Capabilities (Abstract Goals)

```
Capability (abstract)  →  Provider (concrete)
     email-read        →  gog + google-oauth
     messaging-read    →  eve, imsg, wacli
     chat-send         →  discord, slack
```

Multiple providers can satisfy the same capability. This enables portability and choice.

### Status Levels

| Emoji | Status | Meaning |
|-------|--------|---------|
| ✅ | `active` | Configured AND has been used |
| ⭐ | `ready` | Configured, never used |
| 🔧 | `needs-setup` | Needs credential/config |
| 📥 | `needs-install` | Tool needs installation |
| ⛔ | `unavailable` | Not available on this platform |
| ❌ | `broken` | Was working, now failing |

### CLI Philosophy

The CLI is a **discovery and guidance system**, not an execution wrapper:

```bash
# This is how it works:
nexus skills use gog      # → Returns SKILL.md guide
gog gmail search "..."    # → Agent runs tool directly

# NOT this:
nexus skills run gog ...  # ❌ Not how it works
```

---

## Relationship to Other Lanes

| Lane | Relationship |
|------|--------------|
| **Workspace** | CLI reads/writes state files defined in workspace spec |
| **Skills** | CLI provides access to skills; skill taxonomy defines provides/requires |
| **Agent System** | Future: capabilities could integrate with trigger routing |

---

## Source Material

Existing specs to incorporate:

| Source | Location | Content |
|--------|----------|---------|
| Overview | `nexus-cli/.intent/specs/01_NEXUS_OVERVIEW.md` | Core concepts, philosophy |
| Commands | `nexus-cli/.intent/specs/02_CLI_REFERENCE.md` | Full command documentation |
| State | `nexus-cli/.intent/specs/03_STATE_ARCHITECTURE.md` | File paths, schemas |
| Skills | `nexus-cli/.intent/specs/04_SKILL_SPECIFICATION.md` | SKILL.md format |
| Taxonomy | `nexus-cli/.intent/specs/05_CAPABILITY_TAXONOMY.md` | Onboarding journey |
| Reference | `nexus-cli/.intent/specs/06_CAPABILITIES_REFERENCE.md` | Full capability list |

---

## Why This Matters for the Fork

1. **No upstream equivalent** - This is entirely new functionality
2. **Agent-first design** - Built for AI agents, not just humans
3. **Capability abstraction** - Enables provider swapping without changing skills
4. **Integrated credential management** - Secure by default
5. **Progressive onboarding** - Guides users from zero to full power

---

*This lane documents the Nexus CLI, which is the agent's primary interface to the ecosystem.*
