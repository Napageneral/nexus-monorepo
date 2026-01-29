# Agent Bindings Specification

**Status:** COMPLETE  
**Last Updated:** 2026-01-29

---

## Overview

**Agent bindings** connect external AI coding harnesses (Cursor, Claude Code, OpenCode, Codex) to the Nexus workspace. Each binding configures a harness to:

1. Read Nexus instructions (`AGENTS.md` or `CLAUDE.md`)
2. Inject dynamic context (identity, memory) at session start
3. Re-inject context after compaction

**Key Principles:**

1. **Nexus is the source of truth** — Bindings point to Nexus, not the other way around
2. **Workspace root required** — User must open `~/nexus/` as workspace root
3. **Auto-creation for top 2** — During onboarding, bindings are auto-created for user's most-used harnesses
4. **Dynamic detection** — No persistent binding state; scan filesystem each time

---

## Harness Support Matrix

| Harness | Instructions | Lifecycle Hooks | Context Injection | Recommendation |
|---------|-------------|-----------------|-------------------|----------------|
| **Cursor** | `AGENTS.md` | ✅ `sessionStart` (startup + compact) | `additional_context` output | ✅ Recommended |
| **Claude Code** | `CLAUDE.md` | ✅ `SessionStart` (startup + compact) | `additional_context` output | ✅ Recommended |
| **OpenCode** | `AGENTS.md` | ✅ Plugin system | `experimental.chat.system.transform` | ✅ Recommended |
| **Codex** | `AGENTS.md` | ❌ None | N/A | ⛔ Not supported |

> **Codex Limitation:** Codex has no lifecycle hook system. Context cannot be dynamically injected or refreshed after compaction. Codex is **not supported** for Nexus workflows.

---

## CLI Commands

### Command Tree

```
nexus bindings
├── detect                    # Detect installed harnesses via AIX
├── list                      # Show current binding status
├── create <harness>          # Create binding for harness
├── verify [harness]          # Verify bindings are correctly configured
├── refresh [harness]         # Regenerate binding files
└── remove <harness>          # Remove binding
```

### `nexus bindings detect`

Detect which harnesses the user has, ranked by usage frequency.

**Requires:** AIX (`aix` binary and `~/.aix/aix.db`)

```bash
nexus bindings detect
nexus bindings detect --json
```

**How it works:**

1. Checks if `aix` binary exists
2. Checks if `~/.aix/aix.db` exists
3. Queries AIX database for session counts by harness
4. Returns harnesses sorted by usage

**Output (human):**

```
Detected Harnesses (via AIX)

  1. cursor        847 sessions    (supported ✅)
  2. claude-code   312 sessions    (supported ✅)
  3. opencode       45 sessions    (supported ✅)
  4. codex          12 sessions    (not supported ⛔)

Recommendation: Create bindings for cursor and claude-code
```

**Output (JSON):**

```json
{
  "detected": [
    { "harness": "cursor", "sessions": 847, "supported": true },
    { "harness": "claude-code", "sessions": 312, "supported": true },
    { "harness": "opencode", "sessions": 45, "supported": true },
    { "harness": "codex", "sessions": 12, "supported": false }
  ],
  "recommended": ["cursor", "claude-code"]
}
```

**Error (AIX not available):**

```
Error: AIX is required for harness detection.

Install AIX:
  brew install Napageneral/tap/aix

Then sync your sessions:
  aix init
  aix sync --all
```

**AIX Query:**

```sql
SELECT source, COUNT(*) as session_count
FROM sessions 
WHERE source IN ('cursor', 'claude-code', 'opencode', 'codex')
GROUP BY source 
ORDER BY session_count DESC;
```

---

### `nexus bindings list`

Show current binding status by scanning the filesystem.

```bash
nexus bindings list
nexus bindings list --json
```

**Output:**

```
Harness Bindings

  ✅ cursor        .cursor/hooks.json, .cursor/hooks/nexus-session-start.js
  ✅ claude-code   CLAUDE.md, .claude/settings.json
  ❌ opencode      Not configured
  ⛔ codex         Not supported (no hooks available)
```

**Detection logic:**

| Harness | Files checked |
|---------|---------------|
| Cursor | `.cursor/hooks.json`, `.cursor/hooks/nexus-session-start.js` |
| Claude Code | `CLAUDE.md`, `.claude/settings.json` |
| OpenCode | `.opencode/plugins/nexus-bootstrap.ts` |
| Codex | N/A (not supported) |

---

### `nexus bindings create <harness>`

Create binding files for a specific harness.

```bash
nexus bindings create cursor
nexus bindings create claude-code
nexus bindings create opencode
nexus bindings create codex        # Returns error
```

**Supported harnesses:** `cursor`, `claude-code`, `opencode`

**Behavior:**

- Creates all required files from templates
- Idempotent — won't overwrite existing files unless `--force`
- Makes hook scripts executable
- Validates templates exist

**Options:**

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing files |

**Output (success):**

```
Creating Cursor binding...

  ✓ Created .cursor/hooks.json
  ✓ Created .cursor/hooks/nexus-session-start.js
  ✓ Made nexus-session-start.js executable
  ✓ Verified AGENTS.md exists

Cursor binding created successfully.
Open ~/nexus/ in Cursor to use Nexus.
```

**Output (codex):**

```
Error: Codex is not supported.

Codex does not have a lifecycle hook system. Context cannot be 
dynamically injected or refreshed after compaction.

Recommended alternatives:
  - Cursor: nexus bindings create cursor
  - Claude Code: nexus bindings create claude-code
  - OpenCode: nexus bindings create opencode
```

---

### `nexus bindings verify [harness]`

Verify that binding files exist and are correctly configured.

```bash
nexus bindings verify              # Verify all
nexus bindings verify cursor       # Verify specific
```

**Checks:**

| Check | Description |
|-------|-------------|
| Files exist | All required files present |
| Script executable | Hook scripts have execute permission |
| JSON valid | Config files parse correctly |
| AGENTS.md exists | Instructions file present |

**Output:**

```
Verifying Cursor binding...

  ✓ .cursor/hooks.json exists and is valid JSON
  ✓ .cursor/hooks/nexus-session-start.js exists
  ✓ nexus-session-start.js is executable
  ✓ AGENTS.md exists

Cursor binding is correctly configured.
```

---

### `nexus bindings refresh [harness]`

Regenerate binding files from latest templates.

```bash
nexus bindings refresh             # Refresh all
nexus bindings refresh cursor      # Refresh specific
```

**Use cases:**

- Template updates after `nexus update`
- Corrupted or manually edited files
- CLAUDE.md regeneration with current skills/capabilities

---

### `nexus bindings remove <harness>`

Remove binding files for a harness.

```bash
nexus bindings remove cursor
nexus bindings remove --force cursor    # Skip confirmation
```

**Behavior:**

- Prompts for confirmation (unless `--force`)
- Removes all binding files for that harness
- Does NOT remove `AGENTS.md` (shared across harnesses)

---

## Binding Specifications

### 1. Cursor Binding

#### Files Created

```
~/nexus/
├── AGENTS.md                         # Instructions (already exists)
└── .cursor/
    ├── hooks.json                    # Hook configuration
    └── hooks/
        └── nexus-session-start.js    # Context injection script
```

#### hooks.json

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "matcher": "startup|compact",
        "hooks": [
          {
            "type": "command",
            "command": ".cursor/hooks/nexus-session-start.js"
          }
        ]
      }
    ]
  }
}
```

**Key details:**

- `matcher: "startup|compact"` — runs on fresh session AND after compaction
- Hook script path is relative to workspace root

#### nexus-session-start.js

Node.js script that injects Nexus context into the session.

**Behavior:**

1. Reads JSON payload from stdin (includes workspace info)
2. Resolves workspace root (walks up looking for markers)
3. Runs `nexus status --json` to get current state
4. Reads identity files (agent IDENTITY.md, SOUL.md, user IDENTITY.md)
5. Reads daily memory logs (today + yesterday)
6. Outputs JSON with `additional_context` and `env`

**Output format:**

```json
{
  "continue": true,
  "additional_context": "# Nexus Session Bootstrap\n\n## Agent Identity\n...",
  "env": {
    "NEXUS_ROOT": "/Users/example/nexus",
    "NEXUS_STATE_DIR": "/Users/example/nexus/state",
    "NEXUS_AGENT_ID": "atlas"
  }
}
```

**Context sections injected:**

| Section | Source | Purpose |
|---------|--------|---------|
| Status | `nexus status --json` | Agent name, capabilities |
| Bootstrap prompt | `status.bootstrap.prompt` | If identity not established |
| Agent Identity | `state/agents/{name}/IDENTITY.md` | Name, emoji, vibe |
| Agent Soul | `state/agents/{name}/SOUL.md` | Persona, boundaries |
| User Identity | `state/user/IDENTITY.md` | User profile |
| Daily Memory (today) | `home/memory/YYYY-MM-DD.md` | Today's context |
| Daily Memory (yesterday) | `home/memory/YYYY-MM-DD.md` | Yesterday's context |

**Template location:** `agent-bindings-research/reference/cursor/`

---

### 2. Claude Code Binding

#### Files Created

```
~/nexus/
├── CLAUDE.md                         # Instructions (identical to AGENTS.md)
└── .claude/
    └── settings.json                 # Hook configuration
```

#### CLAUDE.md

Identical content to `AGENTS.md`. Claude Code reads `CLAUDE.md` from workspace root.

**Note:** We maintain both files with identical content. `nexus bindings create claude-code` copies the AGENTS.md content to CLAUDE.md.

#### settings.json

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|compact",
        "hooks": [
          {
            "type": "command",
            "command": ".cursor/hooks/nexus-session-start.js"
          }
        ]
      }
    ]
  }
}
```

**Key details:**

- Reuses the same hook script as Cursor (`.cursor/hooks/nexus-session-start.js`)
- Hook event name is `SessionStart` (PascalCase, unlike Cursor's camelCase)
- Same matcher pattern for startup and compact

**Template location:** `agent-bindings-research/reference/claude-code/`

---

### 3. OpenCode Binding

#### Files Created

```
~/nexus/
├── AGENTS.md                         # Instructions (already exists)
└── .opencode/
    └── plugins/
        └── nexus-bootstrap.ts        # Native TypeScript plugin
```

#### nexus-bootstrap.ts

Native OpenCode plugin using experimental hooks.

**Key hooks:**

| Hook | When | Purpose |
|------|------|---------|
| `experimental.chat.system.transform` | Before every LLM call | Injects context into system prompt |
| `experimental.session.compacting` | During compaction | Ensures context survives compaction |

**Behavior:**

1. Builds context by running `nexus status --json`
2. Reads identity files (agent, user)
3. Reads daily memory logs
4. Injects into system prompt via `output.system.push()`

**Key advantage:** OpenCode's `system.transform` hook fires on **every LLM call**, meaning context is always fresh — not just on session start.

**Note:** These hooks are marked `experimental` and may change in future OpenCode versions.

**Template location:** `agent-bindings-research/reference/opencode/`

---

### 4. Codex Binding

**⛔ Not Supported**

Codex (OpenAI) does not have a lifecycle hook system:

- ❌ No session start hook
- ❌ No post-compaction hook
- ❌ No plugin system

**Workaround (not recommended):**

Codex reads `AGENTS.md` at workspace root, but:
- Context cannot be dynamically refreshed
- Identity and memory are not injected
- After compaction, Nexus awareness is lost

**Recommendation:** Use Cursor, Claude Code, or OpenCode instead.

---

## Context Injection Comparison

| Aspect | Cursor | Claude Code | OpenCode | Codex |
|--------|--------|-------------|----------|-------|
| Instructions file | `AGENTS.md` | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md` |
| Hook trigger | Session start, after compact | Session start, after compact | Every LLM call | None |
| Context injection | `additional_context` | `additional_context` | `system.push()` | N/A |
| Script language | Node.js | Node.js (shared) | TypeScript | N/A |
| Config format | JSON | JSON | TypeScript module | N/A |

**Context freshness ranking:**

1. **OpenCode** (best) — refreshes on every LLM call
2. **Cursor / Claude Code** — refreshes on session start and after compaction
3. **Codex** — static only, no refresh

---

## AIX Integration

### What is AIX?

AIX is a standalone Go CLI tool that aggregates AI session data from multiple harnesses into a SQLite database (`~/.aix/aix.db`).

**Installation:**

```bash
brew install Napageneral/tap/aix
```

**Setup:**

```bash
aix init
aix sync --all
```

### How Detection Works

1. `nexus bindings detect` checks for AIX availability
2. Queries the `sessions` table for harness usage
3. Returns harnesses sorted by session count
4. Filters to supported harnesses only

**Database location:** `~/.aix/aix.db`

**Query:**

```sql
SELECT source, COUNT(*) as session_count
FROM sessions 
WHERE source IN ('cursor', 'claude-code', 'opencode', 'codex')
GROUP BY source 
ORDER BY session_count DESC;
```

### No Fallback Without AIX

If AIX is not installed or initialized, `nexus bindings detect` returns an error with installation instructions. There is no fallback detection mechanism.

**Rationale:**
- AIX provides accurate usage data
- Binary/directory detection is unreliable
- Better to require proper setup than give misleading results

---

## Onboarding Integration

### Flow

During onboarding (Phase 5 in WORKSPACE_SYSTEM.md), the agent:

```
1. Runs credential scan:
   nexus credential scan --deep --import --yes

2. Detects harnesses:
   nexus bindings detect --json

3. Parses result, identifies top 2 supported harnesses

4. Creates bindings for top 2:
   nexus bindings create cursor
   nexus bindings create claude-code

5. Informs user:
   "I see you use Cursor and Claude Code most. I've set up bindings 
    so they connect to Nexus. Want me to set up others?"
```

### Error Handling

If AIX is not available during onboarding:

```
Agent: "To auto-detect your preferred coding assistants, I need AIX installed.

        Install with: brew install Napageneral/tap/aix
        Then run: aix init && aix sync --all

        Or tell me which harnesses you use and I'll set them up:
        - Cursor
        - Claude Code  
        - OpenCode"
```

---

## Workspace Root Requirement

**Bindings only work when `~/nexus/` is opened as the workspace root.**

This is intentional:
- Cursor reads `.cursor/` from workspace root
- Claude Code reads `CLAUDE.md` and `.claude/` from workspace root
- OpenCode reads `.opencode/` from workspace root

If user opens a subdirectory (e.g., `~/nexus/home/projects/foo/`), bindings won't load.

**Documentation:** This is explained in AGENTS.md and during onboarding.

---

## Multi-Profile Support

When `NEXUS_PROFILE=work`:
- Root is `~/nexus-work/`
- Each profile has its own bindings
- Hook scripts handle profile resolution via environment variables

---

## Templates Reference

All binding templates live in:

```
specs/workspace/agent-bindings-research/reference/
├── cursor/
│   ├── hooks.json
│   └── nexus-session-start.js
├── claude-code/
│   └── settings.json
├── opencode/
│   └── nexus-bootstrap.ts
└── codex/
    └── README.md                     # Limitations documentation
```

The `nexus bindings create` command copies these templates to the workspace.

---

## Implementation Checklist

| Component | Status |
|-----------|--------|
| CLI: `nexus bindings detect` | TODO |
| CLI: `nexus bindings list` | TODO |
| CLI: `nexus bindings create` | TODO |
| CLI: `nexus bindings verify` | TODO |
| CLI: `nexus bindings refresh` | TODO |
| CLI: `nexus bindings remove` | TODO |
| Template: Cursor hooks.json | ✅ Complete |
| Template: Cursor nexus-session-start.js | ✅ Complete |
| Template: Claude Code settings.json | ✅ Complete |
| Template: OpenCode nexus-bootstrap.ts | ✅ Complete |
| AIX integration | TODO |

---

## Related Specifications

| Spec | Relationship |
|------|--------------|
| `WORKSPACE_SYSTEM.md` | Authoritative workspace spec, defines onboarding flow |
| `ONBOARDING.md` | Onboarding details, references binding creation |
| `agent-bindings-research/` | Deep research folder with harness mechanisms |
| `agent-bindings-research/04-NEXUS_BINDING_SPEC.md` | Detailed binding design |
| `specs/cli/COMMANDS.md` | CLI command reference (add bindings commands) |

---

*This document specifies the agent bindings system. For implementation details, see the research folder at `agent-bindings-research/`.*
