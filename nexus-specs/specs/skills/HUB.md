# Skills Hub Specification

**Status:** SPEC COMPLETE  
**Last Updated:** 2026-01-30

---

## Overview

The Nexus Hub is the central registry for skills and packs. This document covers:
1. Pack definitions and schema
2. Hub storage (skills and packs)
3. CLI commands for hub interaction
4. Local state management (manifests, installed skills)
5. Comparison with upstream clawdbot

---

## 1. Pack Definitions

### What is a Pack?

A **pack** is a hub-managed collection of skills that can be installed together. Packs enable:
- Onboarding: "Install the mac-productivity pack to get started"
- Workflow sharing: "Here's my dev setup pack"
- Nexus core separation: Skills live in hub, not bundled with CLI

**Key simplification:** Packs are NOT tracked locally. They're just "install recipes" that live on the hub. Run `nexus pack install` again to pick up new skills/versions.

### Pack Schema (Hub-side)

```json
{
  "slug": "tyler/mac-productivity",
  "name": "mac-productivity",
  "description": "Full macOS productivity suite with email, calendar, messaging",
  "version": "1.0.0",
  "author": "tyler",
  "skills": [
    "gog",
    "eve", 
    "peekaboo",
    { "slug": "tmux", "version": "2.1.0" },
    { "slug": "anthropic", "version": ">=1.0.0", "optional": true }
  ],
  "tags": ["macos", "productivity", "email", "messaging"],
  "readme": "# Mac Productivity Pack\n\nThis pack sets up..."
}
```

Packs are created and edited on the hub website UI, not published from CLI.

### Skill Reference Schema

```typescript
type PackSkillRef = 
  | string                           // Just slug, latest version
  | {
      slug: string;                  // Hub skill slug
      version?: string;              // Exact version or semver range
      optional?: boolean;            // Don't fail if unavailable (default: false)
    };
```

### Version Resolution

| Spec | Meaning |
|------|---------|
| `gog` | Latest published version |
| `version: "1.2.3"` | Exact version |
| `version: "^1.0.0"` | Semver compatible (>=1.0.0 <2.0.0) |
| `version: ">=1.0.0"` | Minimum version |
| `version: "1.x"` | Any 1.x version |

---

## 2. Hub Storage

### Database Schema (Packs)

```sql
-- Packs table
CREATE TABLE packs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,           -- owner/pack-name
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  
  -- Current version
  latest_version_id TEXT,
  latest_version TEXT,
  
  -- Metadata
  tags_json JSONB,
  readme TEXT,
  
  -- Stats
  installs_count INTEGER DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'published',  -- draft, published, delisted
  visibility TEXT NOT NULL DEFAULT 'public', -- public, unlisted, private
  
  -- Timestamps
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Pack versions
CREATE TABLE pack_versions (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  
  -- Content
  skills_json JSONB NOT NULL,          -- Array of PackSkillRef
  readme TEXT,                         -- Version-specific notes
  
  -- Status
  status TEXT NOT NULL DEFAULT 'published',
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(pack_id, version)
);
```

### API Endpoints

```
GET  /api/packs                        # List/search packs
GET  /api/packs/:slug                  # Get pack details + resolved skills
GET  /api/packs/:slug/versions         # List pack versions
POST /api/packs/:slug/install          # Record install (for stats)
```

Packs are created/edited via the hub website UI, not via API.

### Pack Resolution Response

When fetching a pack for install, the hub returns resolved skill versions:

```json
{
  "pack": {
    "slug": "tyler/mac-productivity",
    "name": "mac-productivity",
    "version": "1.0.0",
    "description": "Full macOS productivity suite..."
  },
  "skills": [
    {
      "slug": "google-oauth",
      "version": "1.0.0",
      "downloadUrl": "...",
      "sha256": "..."
    },
    {
      "slug": "gog",
      "version": "2.3.1",
      "downloadUrl": "...",
      "sha256": "..."
    }
  ]
}
```

---

## 3. CLI Commands

### Pack Commands

Packs are simple — just fetch the skill list and install them.

```bash
# Search packs
nexus pack search <query>
nexus pack search productivity --tag macos

# Install pack (fetches skill list, installs each skill)
nexus pack install <slug>                    # Latest version
nexus pack install <slug>@1.0.0              # Specific version
nexus pack install <slug> --dry-run          # Show what would install

# Pack info
nexus pack info <slug>                       # Show pack details + skills
```

No local tracking. To "update" a pack, just run `nexus pack install <slug>` again — it will install any missing skills and update any outdated ones.

### Skills Commands

```bash
# Search
nexus skills search <query>
nexus skills search <query> --capability email

# Install
nexus skills install <slug>
nexus skills install <slug>@1.0.0             # Specific version

# Update checking
nexus skills updates                          # List available updates
nexus skills update <slug>                    # Update a specific skill
nexus skills update --all                     # Update all managed skills

# Info
nexus skills info <slug>                      # Local skill details
nexus skills use <slug>                       # Read SKILL.md for usage
```

---

## 4. Local State Management

### Directory Structure

```
~/nexus/
├── skills/                              # Installed skills (managed)
│   ├── tools/{name}/
│   ├── connectors/{name}/
│   └── guides/{name}/
│
├── home/
│   └── skills/                          # Local skills (user workspace)
│
└── state/
    └── skills/
        ├── manifest.json                # Skills manifest
        └── {name}/
            └── usage.log                # Per-skill usage tracking
```

**No pack tracking locally.** Packs are just install recipes on the hub.

### Skills Manifest (`state/skills/manifest.json`)

The manifest is the source of truth for skill inventory:

```json
{
  "version": 3,
  "lastUpdated": "2026-01-22T12:00:00Z",
  "nexusVersion": "0.1.0",
  "managed": {
    "count": 5,
    "skills": {
      "gog": {
        "name": "gog",
        "description": "Google Workspace CLI...",
        "type": "tool",
        "provides": ["email", "calendar"],
        "requires": { "credentials": ["google"] },
        "checksum": "sha256:abc123...",
        "hub": {
          "slug": "gog",
          "installedVersion": "2.3.1",
          "latestVersion": "2.4.0",
          "lastCheckedAt": "2026-01-22T12:00:00Z"
        },
        "managedModified": false,
        "enabled": true,
        "source": "managed",
        "installedAt": "2026-01-20T10:00:00Z",
        "dirName": "gog"
      }
    }
  },
  "local": {
    "count": 2,
    "skills": {
      "my-custom-skill": {
        "name": "my-custom-skill",
        "description": "My custom automation",
        "type": "guide",
        "checksum": "sha256:def456...",
        "enabled": true,
        "source": "local",
        "dirName": "my-custom-skill"
      }
    }
  }
}
```

### Key Manifest Fields

| Field | Purpose |
|-------|---------|
| `source` | `"managed"` (hub-installed) or `"local"` (workspace) |
| `checksum` | SHA256 of skill directory for modification detection |
| `hub.slug` | Hub identifier for updates |
| `hub.installedVersion` | Version currently installed |
| `hub.latestVersion` | Latest available version (cached) |
| `hub.lastCheckedAt` | When we last checked for updates |
| `managedModified` | True if user edited a managed skill locally |

### Per-Skill Provenance (`.nexus-skill.json`)

Each hub-installed skill has a provenance file:

```json
{
  "hub": {
    "slug": "gog",
    "installedVersion": "2.3.1"
  },
  "installedAt": "2026-01-22T12:00:00Z"
}
```

This file is written during install and used to restore hub metadata on manifest regeneration.

---

## 5. Installation Flows

### Skill Install Flow

```
nexus skills install gog
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Fetch skill metadata from hub                             │
│    GET /api/skills/gog                                       │
│    Returns: version, downloadUrl, sha256                     │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Download and verify                                       │
│    - Download artifact from downloadUrl                      │
│    - Verify SHA256 checksum                                  │
│    - Extract to temp directory                               │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Install to skill directory                                │
│    - Read SKILL.md frontmatter for type                      │
│    - Install to ~/nexus/skills/{type}s/{name}/               │
│    - Write .nexus-skill.json with provenance                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Update manifest                                           │
│    - Regenerate manifest with new skill                      │
│    - Preserve hub metadata from .nexus-skill.json            │
│    - Compute checksum for modification detection             │
└─────────────────────────────────────────────────────────────┘
```

### Pack Install Flow

Packs batch-install and update skills. No local tracking.

```
nexus pack install tyler/mac-productivity
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Fetch pack from hub                                       │
│    GET /api/packs/tyler/mac-productivity                     │
│    Returns: pack metadata + resolved skills list             │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. For each skill in pack:                                   │
│    - Not installed → install                                 │
│    - Installed, outdated → update (unless modified)          │
│    - Installed, same/newer version → skip                    │
│    - Modified skills → warn, skip (user can --force)         │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Report results                                            │
│    - Installed: N skills                                     │
│    - Updated: M skills                                       │
│    - Skipped: K skills (already at version or modified)      │
│    - Failed: J skills (optional skills not found)            │
│    - Suggest: nexus status to see new capabilities           │
└─────────────────────────────────────────────────────────────┘
```

### Example Output

```bash
$ nexus pack install tyler/mac-productivity

Fetching pack tyler/mac-productivity...

Skills to process:
  📦 gog — v2.4.0
  📦 eve — v1.6.0
  📦 google-oauth — v1.0.0
  📦 anthropic — v1.1.0

Installing/updating 4 skills...
  ✅ google-oauth v1.0.0 (installed)
  ✅ gog v2.4.0 (updated from 2.3.1)
  ⏭️  eve v1.6.0 (already installed)
  ✅ anthropic v1.1.0 (installed)

Summary:
  Installed: 2
  Updated: 1
  Skipped: 1 (already at version)
```

### Modified Skills

If a skill has local modifications:

```
⚠️  gog has local modifications

  Current: 2.3.1 (modified)
  Pack wants: 2.4.0

  Skipped. To update: nexus skills update gog --force
```

Pack installs skip modified skills by default to preserve user changes.

---

## 6. Update Flow

### Check for Updates

```bash
nexus skills updates
```

This:
1. Reads manifest for all managed skills with `hub.slug`
2. Fetches latest versions from hub (batch API)
3. Updates `hub.latestVersion` and `hub.lastCheckedAt` in manifest
4. Reports skills with available updates

### Update a Skill

```bash
nexus skills update gog
```

This:
1. Checks `managedModified` flag — if true, warns and exits unless `--force`
2. Downloads and installs latest version (same as install flow)
3. Updates manifest with new version

### Modification Detection

When the CLI scans skills, it computes checksums:

1. If checksum differs from previous scan AND skill is managed → set `managedModified = true`
2. On update, if `managedModified` is true → warn user their changes will be overwritten
3. User can `--force` to update anyway, or keep their modifications

---

## 7. Comparison with Upstream (Clawdbot)

| Aspect | Upstream (Clawdbot) | Nexus |
|--------|---------------------|-------|
| Hub CLI | External `clawdhub` tool | Built-in `nexus skills/pack` |
| Tracking | `.clawdhub/lock.json` (external) | `state/skills/manifest.json` |
| Modification detection | Content hash by external tool | Built-in checksum + `managedModified` flag |
| Update checking | External tool only | Built-in `skill updates` with cached versions |
| Source tracking | None in core | `source`, `hub.slug`, `.nexus-skill.json` |
| Packs | None | Hub-managed install recipes |

### Why Nexus Has Built-in Hub

1. **Simpler UX** — One tool, not two
2. **Better state tracking** — Know what's installed, what's modified, what's available
3. **Update awareness** — `nexus status` can show available updates
4. **Packs** — Install multiple skills at once for onboarding

### What Nexus Adopts from Upstream

1. **Directory scanning** — Skills discovered by scanning standard paths
2. **Precedence** — workspace > managed > bundled
3. **SKILL.md format** — Same frontmatter format (with nexus extensions)

---

## 8. Curated Taxonomy

### Initial Approach

Instead of auto-evolution, we start with:

1. **Curated taxonomy** — ~100 initial skills define domains, capabilities, services
2. **Open upload** — Users can publish skills with any capabilities they want
3. **Matching is user's job** — If you want your skill to integrate, use existing capability/service names
4. **Domains are loose** — Admin-managed for organization, not strictly enforced

### Unknown Capability Handling

When a skill is published with unknown capabilities:

1. **Accept it** — Skill is published
2. **Flag it** — Show as "uncategorized" in searches
3. **Optional review** — Admin can later add to taxonomy or ignore

No blocking, no auto-proposal complexity.

---

## Summary

| Component | Location | Purpose |
|-----------|----------|---------|
| Skills manifest | `state/skills/manifest.json` | Track installed skills, versions, checksums |
| Skill provenance | `{skill}/.nexus-skill.json` | Hub metadata for manifest regen |
| Packs | Hub database only | Install recipes (not tracked locally) |
| Taxonomy | Hub database | Curated domains/capabilities/services |

**Key decisions:**
- Packs are NOT tracked locally — just install recipes
- Run `pack install` again to pick up new skills
- Skills are version-pinned at install, updated individually
- Modification detection via checksums
- Curated taxonomy, open upload, manual matching

---

*This spec covers skills/packs hub integration, CLI commands, and local state management for the Nexus skills ecosystem.*
