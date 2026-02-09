# Skills CLI Specification

**Status:** SPEC COMPLETE  
**Last Updated:** 2026-01-30

---

## Overview

This document specifies the `nexus skills` CLI commands for skill discovery, installation, management, and usage.

**Key decisions:**
- Unified under `nexus skills` (no separate `nexus skill` command)
- Local + hub operations in one command tree
- Modification tracking with reset/update flows
- Background update checking integrated with daemon

---

## 1. Command Grammar

```
nexus skills
├── list                              # List installed skills
│   ├── --tools                       # Filter: tools only
│   ├── --connectors                  # Filter: connectors only
│   ├── --guides                      # Filter: guides only
│   ├── --domain <domain>             # Filter: by domain
│   └── --json                        # JSON output
│
├── use <name>                        # Read SKILL.md for agent usage
│
├── info <name>                       # Detailed skill information
│   └── --json                        # JSON output
│
├── search <query>                    # Search local + hub
│   ├── --local                       # Local only
│   ├── --hub                         # Hub only
│   ├── --capability <cap>            # Filter by capability
│   ├── --service <service>           # Filter by service
│   └── --domain <domain>             # Filter by domain
│
├── install <slug>                    # Install from hub
│   ├── <slug>@<version>              # Specific version
│   ├── --force                       # Overwrite existing
│   └── --dry-run                     # Show what would install
│
├── update <slug>                     # Update specific skill
│   ├── --all                         # Update all managed skills
│   ├── --force                       # Overwrite local modifications
│   └── --dry-run                     # Show what would update
│
├── updates                           # Check for available updates
│   └── --json                        # JSON output
│
├── reset <name>                      # Reset to hub version
│   ├── --show-diff                   # Show local changes before reset
│   └── --force                       # Skip confirmation
│
├── diff <name>                       # Show local modifications
│
├── verify <name>                     # Check if requirements met
│
└── scan                              # Regenerate manifest
    └── --force                       # Force full rescan
```

---

## 2. Command Details

### `nexus skills list`

Lists all installed skills with status.

```bash
$ nexus skills list

Tools:
  ✅ gog              Google Workspace CLI                    email, calendar
  ⭐ eve              iMessage bridge                         messaging
  📥 tmux             Terminal multiplexer                    terminal

Connectors:
  ✅ google-oauth     Google OAuth setup                      enables: google
  🔧 anthropic        Anthropic API setup                     enables: anthropic

Guides:
  ✅ filesystem       File system operations                  files
  ⭐ computer-use     GUI automation guide                    automation
```

**Columns:** Status emoji, name, description, capabilities/enables

**Filters:**
```bash
nexus skills list --tools           # Only tools
nexus skills list --domain email    # Only email domain skills
```

### `nexus skills use <name>`

Returns the full SKILL.md content for agent consumption.

```bash
$ nexus skills use gog

---
name: gog
description: Google Workspace CLI for email, calendar, and drive
metadata: {"nexus":{"type":"tool","capabilities":["email","calendar"],...}}
---

# gog - Google Workspace CLI

## Quick Start
...
```

This is how agents learn to use a skill. The agent reads this, then runs the tool directly.

### `nexus skills info <name>`

Shows detailed local information about a skill.

```bash
$ nexus skills info gog

Name:           gog
Type:           tool
Version:        2.3.1
Status:         ✅ active
Source:         managed (hub)

Capabilities:   email, calendar, contacts
Requires:
  Credentials:  google — ✅ configured (tnapathy@gmail.com)
  Binaries:     gog — ✅ found

Hub:
  Slug:         gog
  Installed:    2.3.1
  Latest:       2.4.0 ⬆️
  Last checked: 2 hours ago

Modification:
  Status:       modified
  Base version: 2.3.1
  Local changes detected (use `nexus skills diff gog` to view)

Location:       ~/nexus/skills/tools/gog/
```

### `nexus skills search <query>`

Searches both local skills and hub.

```bash
$ nexus skills search email

Local:
  ✅ gog              Google Workspace CLI              [installed]

Hub:
  📦 outlook          Microsoft Outlook integration     v1.2.0
  📦 fastmail         Fastmail CLI                      v0.8.0
  📦 protonmail       ProtonMail bridge                 v1.0.0
```

**Filters:**
```bash
nexus skills search --capability email    # Skills providing email capability
nexus skills search --service google      # Skills requiring google service
nexus skills search --hub calendar        # Hub-only search
```

### `nexus skills install <slug>`

Installs a skill from the hub.

```bash
$ nexus skills install gog

Fetching gog@latest from hub...
Downloading v2.4.0 (23 KB)...
Verifying checksum... ✓
Installing to ~/nexus/skills/tools/gog/

✅ Installed gog v2.4.0

Requires:
  🔧 google credential — run: nexus skills use google-oauth
```

**Version pinning:**
```bash
nexus skills install gog@2.3.1            # Specific version
nexus skills install gog@^2.0.0           # Semver range
```

### `nexus skills update <slug>`

Updates a skill to the latest version.

```bash
$ nexus skills update gog

Current: 2.3.1
Latest:  2.4.0

Downloading v2.4.0...
✅ Updated gog to v2.4.0
```

**With local modifications:**
```bash
$ nexus skills update gog

⚠️  gog has local modifications

You've made changes to this skill since installing v2.3.1.
Updating will overwrite your changes.

Options:
  1. View diff:    nexus skills diff gog
  2. Force update: nexus skills update gog --force
  3. Cancel

To reapply your changes after updating, save the diff first:
  nexus skills diff gog > my-gog-changes.patch
```

### `nexus skills updates`

Checks all managed skills for available updates.

```bash
$ nexus skills updates

Checking for updates...

Available updates:
  ⬆️  gog           2.3.1 → 2.4.0
  ⬆️  eve           1.5.0 → 1.6.0 (modified)
  ⬆️  anthropic     1.0.0 → 1.1.0

Run `nexus skills update <name>` to update individual skills
Run `nexus skills update --all` to update all (skips modified)
```

### `nexus skills reset <name>`

Resets a managed skill to its hub version (discards local modifications).

```bash
$ nexus skills reset gog

⚠️  This will discard your local modifications to gog.

Current state:
  Base version: 2.3.1
  Local modifications: yes

To save your changes first:
  nexus skills diff gog > my-gog-changes.patch

Continue with reset? [y/N]: y

Downloading gog v2.3.1...
✅ Reset gog to v2.3.1 (modifications cleared)
```

**Show diff before reset:**
```bash
nexus skills reset gog --show-diff
# Shows diff, then prompts for confirmation
```

### `nexus skills diff <name>`

Shows what you've changed in a managed skill.

```bash
$ nexus skills diff gog

--- gog (hub v2.3.1)
+++ gog (local)

@@ SKILL.md @@
 ## Configuration
 
-Set the default account:
+Set the default account (I prefer this one):
 
 ```bash
 gog config set account tnapathy@gmail.com
+gog config set verbose true
 ```
```

This diff can be saved and reapplied after update:
```bash
nexus skills diff gog > my-changes.patch
nexus skills update gog --force
# Agent can help reapply changes from patch
```

### `nexus skills verify <name>`

Checks if a skill's requirements are met.

```bash
$ nexus skills verify gog

Checking gog requirements...

Binaries:
  ✅ gog found at /opt/homebrew/bin/gog

Credentials:
  ✅ google — configured (tnapathy@gmail.com)

Platform:
  ✅ darwin — supported

Result: ✅ All requirements met
```

```bash
$ nexus skills verify anthropic

Checking anthropic requirements...

Credentials:
  🔧 anthropic — not configured

Result: 🔧 Needs setup

To configure:
  nexus skills use anthropic
```

### `nexus skills scan`

Regenerates the skills manifest by scanning skill directories.

```bash
$ nexus skills scan

Scanning ~/nexus/skills/...
Scanning ~/nexus/home/skills/...

Found 12 managed skills
Found 2 local skills

Manifest updated.
```

---

## 3. Manifest Schema

The skills manifest tracks all installed skills.

**Location:** `~/nexus/state/skills/manifest.json`

```typescript
type SkillManifest = {
  version: number;                    // Schema version (currently 4)
  lastUpdated: string;                // ISO timestamp
  nexusVersion?: string;              // CLI version that generated this
  
  managed: {
    count: number;
    skills: Record<string, SkillManifestEntry>;
  };
  
  local: {
    count: number;
    skills: Record<string, SkillManifestEntry>;
  };
};

type SkillManifestEntry = {
  // Identity
  name: string;
  description?: string;
  type?: "tool" | "connector" | "guide";
  dirName?: string;                   // Directory name if different from name
  
  // Capabilities (renamed from provides)
  capabilities?: string[];            // What this skill provides
  
  // Requirements
  requires?: {
    credentials?: string[];           // Service names (e.g., ["google"])
    bins?: string[];                  // Required binaries
    anyBins?: string[];               // Any one of these binaries
    platform?: string[];              // Platform restrictions
  };
  
  // Connector-specific
  enables?: string[];                 // Services this connector sets up
  
  // Hub metadata
  hub?: {
    slug?: string;                    // Hub identifier
    installedVersion?: string;        // Version currently installed
    latestVersion?: string;           // Latest available (cached)
    lastCheckedAt?: string;           // When we last checked
    lastError?: string;               // Error from last operation
  };
  
  // Modification tracking
  baseChecksum?: string;              // Hub version checksum at install
  baseVersion?: string;               // Hub version at install
  localChecksum?: string;             // Current local checksum
  managedModified?: boolean;          // User has edited this skill
  
  // Metadata
  version?: string;                   // Semantic version
  homepage?: string;
  enabled: boolean;                   // User can disable without uninstalling
  source: "managed" | "local";
  installedAt?: string;               // When installed (ISO timestamp)
};
```

### Checksum Computation

Checksums are SHA256 of skill directory contents:

```typescript
const IGNORE_DIRS = [".git", ".intent", ".cursor", "node_modules", "dist", "build", ".next", ".cache", "__pycache__", ".venv"];
const IGNORE_FILES = [".DS_Store", ".nexus-skill.json"];
const IGNORE_EXTS = [".log", ".tmp", ".swp", ".pyc"];

async function computeSkillChecksum(skillDir: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  // Walk directory, hash each file with its relative path
  // Sort entries for deterministic output
  // Skip ignored dirs/files/extensions
  return hash.digest("hex");
}
```

---

## 4. Modification Detection

### How It Works

1. **On install from hub:**
   - Store `baseChecksum` (hub artifact hash)
   - Store `baseVersion` (hub version)
   - Compute and store `localChecksum`
   - Initially: `baseChecksum === localChecksum`

2. **On scan:**
   - Recompute `localChecksum`
   - If `localChecksum !== baseChecksum` → set `managedModified = true`

3. **On update (with modifications):**
   - Warn user about local changes
   - Offer to show diff
   - Require `--force` to proceed
   - After update: clear `managedModified`, update checksums

4. **On reset:**
   - Redownload `baseVersion` from hub
   - Overwrite local files
   - Clear `managedModified`
   - Update checksums

### User Flow for Reapplying Changes

```bash
# 1. Save your changes
nexus skills diff gog > my-gog-mods.patch

# 2. Update to new version
nexus skills update gog --force

# 3. Ask agent to reapply (or do manually)
# The agent can read my-gog-mods.patch and intelligently reapply
```

No automatic three-way merge. User/agent decides how to reapply.

---

## 5. Update Checking

### Triggers

| Trigger | Behavior |
|---------|----------|
| `nexus skills updates` | Force check all managed skills |
| `nexus status` | Check if cache > 1 hour, refresh in background |
| `nexus skills use <name>` | Check that skill (background) |
| Daemon heartbeat | Periodic background check |

### Caching

Update checks are cached per-skill:
- `hub.latestVersion` — Latest version from hub
- `hub.lastCheckedAt` — When we checked
- `hub.lastError` — Error message if check failed

Cache TTL: 1 hour for `nexus status`, no cache for `nexus skills updates`.

### Error Handling

`hub.lastError` stores the last error from hub operations:
- Set when hub API call fails
- Set when download/checksum fails
- Cleared on successful operation
- Shown in `nexus skills info <name>`

---

## 6. Status Integration

### `nexus status` Output

```
nexus status

...

Skills (12 installed):
  ✅ gog (email, calendar) — 2.3.1
  ⭐ eve (messaging) — 1.5.0 ⬆️ update available
  🔧 anthropic (llm) — needs credential
  📥 tmux (terminal) — binary not found

  Run `nexus skills updates` to see all available updates
```

### Status Emoji Legend

| Emoji | Status | Meaning |
|-------|--------|---------|
| ✅ | `active` | Working and has been used |
| ⭐ | `ready` | All requirements met, never used |
| 🔧 | `needs-setup` | Missing credentials or config |
| 📥 | `needs-install` | Missing binary |
| ⛔ | `unavailable` | Wrong platform |
| ❌ | `broken` | Credential verification failed |

### Update Notification

Skills with available updates show `⬆️` indicator.

---

## 7. Credential Integration

### Skill → Credential Link

Skills declare credential requirements by service name:

```yaml
# In SKILL.md frontmatter
metadata:
  nexus:
    requires:
      credentials: [google]    # Needs google service credential
```

### Resolution

```typescript
function checkCredentialRequirement(service: string): boolean {
  // Check if ANY credential exists for this service
  return hasCredentialForService(service);
}

function resolveSkillStatus(skill: SkillEntry): Status {
  const missingCreds = skill.requires?.credentials?.filter(
    s => !checkCredentialRequirement(s)
  );
  if (missingCreds?.length > 0) return "needs-setup";
  // ... other checks
}
```

### Surfacing in CLI

```bash
$ nexus skills info gog

Requires:
  Credentials:
    google — ✅ configured (tnapathy@gmail.com, work@company.com)
  Binaries:
    gog — ✅ found (/opt/homebrew/bin/gog)
```

```bash
$ nexus skills verify eve

Credentials:
  🔧 anthropic — not configured

To set up:
  nexus skills use anthropic
```

---

## 8. Pack Integration

Packs use the same installation flow.

```bash
$ nexus pack install tyler/mac-productivity

Fetching pack tyler/mac-productivity...

Skills to install:
  📦 gog — latest
  📦 eve — latest
  📦 google-oauth — latest
  📦 anthropic — latest

Installing 4 skills...
  ✅ google-oauth v1.0.0
  ✅ gog v2.4.0 (updated from 2.3.1)
  ⏭️  eve v1.5.0 (already installed)
  ✅ anthropic v1.1.0

Installed: 3
Updated: 1
Skipped: 1 (already installed at same or newer version)
```

**Behavior:**
- Install missing skills
- Update outdated skills (unless modified)
- Skip skills at same or newer version
- Report results

---

## Summary

| Command | Purpose |
|---------|---------|
| `nexus skills list` | List installed skills |
| `nexus skills use <name>` | Get SKILL.md for agent |
| `nexus skills info <name>` | Detailed local info |
| `nexus skills search` | Find skills (local + hub) |
| `nexus skills install` | Install from hub |
| `nexus skills update` | Update from hub |
| `nexus skills updates` | Check for updates |
| `nexus skills reset` | Reset to hub version |
| `nexus skills diff` | Show local modifications |
| `nexus skills verify` | Check requirements |
| `nexus skills scan` | Regenerate manifest |

**Key design points:**
- Unified `nexus skills` command (no `nexus skill`)
- Modification tracking with base/local checksums
- User-controlled update flow (no auto-update)
- Background update checking via daemon
- Clear credential integration via service names

---

*This spec covers the skills CLI. For pack operations, see HUB.md. For credential details, see CREDENTIAL_SYSTEM.md.*
