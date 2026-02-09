# Branding Specification

**Status:** ✅ DONE  
**Last Updated:** 2026-01-22

---

## Overview

Automated script to rebrand **openclaw** (formerly moltbot/clawdbot) → nexus. Re-run after each upstream sync.

---

## What Changes

### Package & Binary

| Original | Branded |
|----------|---------|
| `openclaw` (package name) | `nexus` |
| `openclaw` (binary) | `nexus` |
| Repository URLs | Updated to nexus repo |

**Note:** Upstream still ships legacy clawdbot/moltbot strings; the script replaces **openclaw**, **moltbot**, and **clawdbot** identifiers.

### Environment Variables

| Original | Branded | Fallback |
|----------|---------|----------|
| `CLAWDBOT_STATE_DIR` | `NEXUS_STATE_DIR` | Yes |
| `CLAWDBOT_CONFIG_PATH` | `NEXUS_CONFIG_PATH` | Yes |
| `CLAWDBOT_NIX_MODE` | `NEXUS_NIX_MODE` | Yes |
| `CLAWDBOT_GATEWAY_PORT` | `NEXUS_GATEWAY_PORT` | Yes |
| `CLAWDBOT_OAUTH_DIR` | `NEXUS_OAUTH_DIR` | Yes |

**Strategy:** NEXUS_* is primary, CLAWDBOT_* fallback for migration.

**Note:** Script also normalizes OPENCLAW_* and MOLTBOT_* tokens to NEXUS_*.

### Paths

| Original | Branded |
|----------|---------|
| `~/.clawdbot/` | `~/nexus/state/` |
| `~/.clawdbot/clawdbot.json` | `~/nexus/nex.yaml` |
| `~/clawd/` (workspace) | `~/nexus/home/` |

### Type Names

| Original | Branded | Alias? |
|----------|---------|--------|
| `ClawdbotConfig` | `NexusConfig` | Yes |
| `ClawdbotSchema` | `NexusSchema` | Yes |
| `STATE_DIR_CLAWDBOT` | `STATE_DIR_NEXUS` | No |
| `CONFIG_PATH_CLAWDBOT` | `CONFIG_PATH_NEXUS` | No |

**Strategy:** Keep aliases for backward compatibility.

### User-Facing Strings

- Schema title: "ClawdbotConfig" → "NexusConfig"
- UI placeholders: "/clawdbot" → "/nexus"
- Comment examples: "[clawdbot]" → "[nexus]"
- Help text: All references updated

---

## Script Location

`docs/upstream-sync/rebrand-nexus.sh`

---

## Usage

```bash
# After cloning fresh from upstream
./docs/upstream-sync/rebrand-nexus.sh

# Verify
pnpm install
pnpm build
pnpm test
```

---

## Sync Workflow

1. `git fetch upstream`
2. `git merge upstream/main`
3. `./docs/upstream-sync/rebrand-nexus.sh`
4. `pnpm test`
5. If tests pass, commit

---

## Reference Commits

Original RENAME commits (from nexus history):

```
93564e35b RENAME-1 - src/config/
1bf87a721 RENAME-2 - src/cli/
32ad67b4d RENAME-3 - src/agents/
73235a422 RENAME-4 - remaining src/
c50896fda RENAME-5 - skills/
4a794f475 RENAME-6 - docs/, test/, ui/
e52136b2a RENAME-7 - root files
```

---

*Script implementation is handled separately.*
