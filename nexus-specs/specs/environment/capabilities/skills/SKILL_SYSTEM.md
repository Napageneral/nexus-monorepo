# Unified Skills System Overview

**Status:** SPEC COMPLETE  
**Last Updated:** 2026-01-22

This document ties together all skills-related specs and provides a single coherent view of how the skills system works.

**Start here for skills.** Then drill down into specific docs as needed.

---

## Document Map

| Spec | Purpose | Status |
|------|---------|--------|
| `TAXONOMY.md` | Domain/capability/service definitions | ✅ Complete |
| `HUB.md` | Packs, hub storage, install flows | ✅ Complete |
| `SKILL_CLI.md` | CLI commands, manifest schema, modification tracking | ✅ Complete |
| `UPSTREAM_SKILLS.md` | Upstream reference | ✅ Complete |
| `../cli/COMMANDS.md` | Full CLI reference | ✅ Updated |
| `../CAPABILITIES.md` | Capability → provider mapping | ✅ Updated |

---

## Design Decisions (Resolved)

These decisions have been made and all specs are aligned.

### 1. CLI Command: `nexus skills` (Unified)

All skill operations use `nexus skills` (plural):
```
nexus skills
├── list, use, info, verify, scan      # Local operations
├── search, install, update, updates   # Hub operations
├── reset, diff                        # Modification management
└── (pack operations are under nexus pack)
```

### 2. Field Name: `capabilities`

Skills declare what they offer using `capabilities`:
```yaml
metadata:
  nexus:
    capabilities: [email, calendar, contacts]
```

### 3. Capability Granularity: Coarse

Capabilities are abstract access types, not fine-grained permissions:
- `email` — Read and send email (not `email-read` + `email-send`)
- `messaging` — Read and send messages
- `chat` — Participate in chat platforms

**Rationale:** A skill either gives you access or it doesn't. Matches how OAuth works (you don't get "half" access).

### 4. Frontmatter Format: `metadata.nexus` Wrapper

Nexus-specific fields nest under `metadata.nexus`:
```yaml
---
name: gog
description: Google Workspace CLI
metadata:
  nexus:
    type: tool
    capabilities: [email, calendar]
    requires:
      credentials: [google]
      bins: [gog]
    platform: [darwin, linux]
---
```

### 5. Platform Field: `platform`

The field is `platform` (values match Node.js `process.platform`: darwin, linux, win32).

---

## Canonical Skill Declaration

Based on all resolutions, here's the canonical SKILL.md format:

```yaml
---
name: gog
description: Google Workspace CLI for email, calendar, and drive
version: 2.4.0
homepage: https://github.com/steipete/gog

metadata:
  nexus:
    type: tool                          # tool | connector | guide
    emoji: 📧
    capabilities: [email, calendar, contacts, cloud-storage]
    requires:
      credentials: [google]             # Service names
      bins: [gog]                       # Required binaries
    platform: [darwin, linux]            # Platform restrictions
    install:
      - id: brew
        kind: brew
        formula: steipete/tap/gogcli
---

# gog - Google Workspace CLI

## Quick Start
...
```

### Connector Example

```yaml
---
name: google-oauth
description: Set up Google OAuth credentials for Workspace access

metadata:
  nexus:
    type: connector
    emoji: 🔐
    enables: [google]                   # Services this sets up
---
```

### Guide Example

```yaml
---
name: filesystem
description: File organization and management guide

metadata:
  nexus:
    type: guide
    emoji: 📁
    capabilities: [files]
---
```

---

## Canonical Manifest Entry

```typescript
type SkillManifestEntry = {
  // Identity
  name: string;
  description?: string;
  type?: "tool" | "connector" | "guide";
  dirName?: string;
  
  // What this skill provides
  capabilities?: string[];              // For tools/guides
  enables?: string[];                   // For connectors (services)
  
  // Requirements
  requires?: {
    credentials?: string[];             // Service names
    bins?: string[];                    // Required binaries
    anyBins?: string[];                 // Any one of these
    platform?: string[];                // Platform restrictions
  };
  
  // Hub metadata
  hub?: {
    slug?: string;
    installedVersion?: string;
    latestVersion?: string;
    lastCheckedAt?: string;
    lastError?: string;
  };
  
  // Modification tracking
  baseChecksum?: string;
  baseVersion?: string;
  localChecksum?: string;
  managedModified?: boolean;
  
  // State
  version?: string;
  enabled: boolean;
  source: "managed" | "local";
  installedAt?: string;
};
```

---

## CLI Grammar (Unified)

```
nexus skills
├── list                              # List installed skills
│   ├── --tools                       # Filter by type
│   ├── --connectors
│   ├── --guides
│   └── --domain <domain>
├── use <name>                        # Get SKILL.md for agent
├── info <name>                       # Detailed local info
├── search <query>                    # Search local + hub
│   ├── --local
│   ├── --hub
│   └── --capability <cap>
├── install <slug>                    # Install from hub
├── update <slug>                     # Update from hub
│   └── --all
├── updates                           # Check available updates
├── reset <name>                      # Reset to hub version
├── diff <name>                       # Show local modifications
├── verify <name>                     # Check requirements
└── scan                              # Regenerate manifest

nexus pack
├── search <query>                    # Search hub packs
├── install <slug>                    # Install pack's skills
└── info <slug>                       # Pack details
```

---

## Status Cascade

```
Credential Status → Skill Status → Capability Status

┌─────────────────────────────────────────────────────────┐
│   CREDENTIAL          SKILL              CAPABILITY     │
│                                                         │
│   ❌ broken    ──►   🔧 needs-setup  ──►   🔧          │
│   ⭐ ready     ──►   ⭐ ready        ──►   ⭐          │
│   ✅ active    ──►   ⭐/✅           ──►   ⭐/✅       │
│                                                         │
│   📥 missing binary  ──►  📥 needs-install ──►  📥    │
│   ⛔ wrong platform  ──►  ⛔ unavailable   ──►  ⛔    │
└─────────────────────────────────────────────────────────┘
```

---

## Key Flows

### Agent Uses a Skill

```
1. nexus status                    # Agent orients, sees capabilities
2. nexus skills search <query>     # Find skill for task
3. nexus skills use <name>         # Read SKILL.md
4. Agent follows instructions      # Runs tool directly (not via CLI)
```

### Install a Skill

```
1. nexus skills search <query>     # Find on hub
2. nexus skills install <slug>     # Download, verify, install
3. Manifest updated                # Tracks version, checksums
4. nexus skills verify <name>      # Check requirements met
```

### Update with Modifications

```
1. nexus skills updates            # See available updates
2. nexus skills diff <name>        # See local changes
3. nexus skills diff <name> > p    # Save changes
4. nexus skills update <name> -f   # Force update
5. Agent reapplies changes         # From saved patch
```

### Install a Pack

```
1. nexus pack search <query>       # Find pack on hub
2. nexus pack install <slug>       # Install all skills
   - Missing → install
   - Outdated → update (unless modified)
   - Current → skip
3. No local tracking               # Pack is just install recipe
```

---

## Integration Points

### Skills → Credentials

Skills declare `requires.credentials: [service]`:
- CLI checks if credential exists for that service
- If missing → skill status = `needs-setup`
- Multiple accounts for a service are all valid

### Skills → Capabilities

Skills declare `capabilities: [cap1, cap2]`:
- Capability status = best provider status
- Multiple skills can provide same capability
- Agent picks based on context

### Connectors → Services

Connectors declare `enables: [service]`:
- Setting up a connector creates credentials for service
- Other skills requiring that service then work

---

## Files Summary

The `skills/` directory is **flat** -- all skills live directly under `skills/{name}/` regardless of type. Skill type (tool, connector, guide) is tracked in metadata, not directory hierarchy.

| File | Location | Purpose |
|------|----------|---------|
| `manifest.json` | `state/skills/manifest.json` | Track all skills |
| `.nexus-skill.json` | `skills/{name}/` | Hub provenance |
| `SKILL.md` | `skills/{name}/SKILL.md` | Skill documentation |
| `usage.log` | `state/skills/{name}/usage.log` | Usage tracking |

---

## Terminology Decisions

These are the canonical terms (specs are aligned, code alignment is separate work):

| Term | Canonical | Notes |
|------|-----------|-------|
| Field for what skill offers | `capabilities` | Not `provides` |
| Platform restriction field | `platform` | Not `os` or `platforms` |
| Capability granularity | Coarse (`email`) | Not fine (`email-read`) |
| CLI command | `nexus skills` | Not `nexus skill` (singular) |
| Skill metadata wrapper | `metadata.nexus` | Nexus-specific fields nested here |

---

## See Also

- `TAXONOMY.md` — Domain/capability/service definitions
- `HUB.md` — Pack definitions, hub storage
- `SKILL_CLI.md` — Full CLI spec, manifest schema
- `../../OVERVIEW.md` — How skills integrate with credentials
- `../credentials/CREDENTIAL_SYSTEM.md` — Credential storage and access

---

*This document provides the unified view of the skills system. When in doubt, this is the source of truth.*
