# Agent Bindings Specification

**Status:** ALIGNED WITH WORKSPACE_SYSTEM.md (partial — deep dive needed)  
**Last Updated:** 2026-01-27

---

## Overview

**Agent bindings** are the IDE and AI assistant integrations that connect external harnesses to Nexus. Each binding configures a specific harness to work with the Nexus workspace.

**Key Principles:**
1. **Nexus is the source of truth** — Bindings point to Nexus, not the other way around
2. **Workspace root required** — User must open `~/nexus/` as workspace root
3. **Auto-creation for top 2** — During onboarding, bindings are auto-created for user's top 2 harnesses
4. **Binding parity** — All bindings should provide equivalent context to agents

---

## Supported Bindings

| Binding | Command | Auto-Created | Status |
|---------|---------|--------------|--------|
| **Cursor** | `nexus bindings cursor` | ✅ If top 2 | ✅ Fully spec'd |
| **Claude Code** | `nexus bindings claude-code` | ✅ If top 2 | ⚠️ Needs detail |
| **Codex** | `nexus bindings codex` | ✅ If top 2 | ⚠️ Needs research |
| **OpenCode** | `nexus bindings opencode` | On request | ⚠️ Needs research |
| **Aider** | `nexus bindings aider` | On request | ⚠️ Needs research |
| **Droid** | `nexus bindings droid` | On request | ❌ Needs research |
| **Amp** | `nexus bindings amp` | On request | ❌ Needs research |
| **Nexus Bot** | (internal) | N/A | ⚠️ Needs spec |

---

## CLI Commands

```bash
nexus bindings list                  # Show configured bindings
nexus bindings cursor                # Create/update Cursor binding
nexus bindings claude-code           # Create/update Claude Code binding
nexus bindings codex                 # Create/update Codex binding
nexus bindings remove <harness>      # Remove binding
nexus bindings refresh               # Regenerate all bindings
```

---

## Cursor Binding

### What It Creates

```
~/nexus/
└── .cursor/
    ├── rules                        # Static rules file
    ├── hooks.json                   # Session hook registration
    └── hooks/
        └── nexus-session-start.js   # Context injection script
```

### Files Detail

#### `.cursor/rules`

Static rules file that points to AGENTS.md:

```markdown
# Nexus Workspace - Cursor Configuration

This workspace uses Nexus. Follow the root `AGENTS.md` file for all protocols.

## Cursor-Specific

- Run `nexus status` first
- Cursor sessionStart hook injects identity context (see `.cursor/hooks.json`)
- Use the Shell tool for `nexus` commands
- Skill definitions live in `~/nexus/skills/`
- Skill state and usage logs live in `~/nexus/state/skills/`
- Read `~/nexus/AGENTS.md` for full instructions
```

#### `.cursor/hooks.json`

Hook registration:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "command": "node .cursor/hooks/nexus-session-start.js"
      }
    ]
  }
}
```

#### `.cursor/hooks/nexus-session-start.js`

Session start hook script that:
1. Reads JSON payload from stdin (includes `workspace_roots`)
2. Runs `nexus status --json` to get identity info
3. Reads identity files (IDENTITY.md, SOUL.md, MEMORY.md)
4. Reads daily memory logs (today + yesterday)
5. Outputs JSON with `additional_context` for Cursor to inject

**Output format:**
```json
{
  "continue": true,
  "additional_context": "# Nexus Session Bootstrap\n\n## Agent Identity\n...",
  "env": {
    "NEXUS_ROOT": "/Users/example/nexus",
    "NEXUS_STATE_DIR": "/Users/example/nexus/state"
  }
}
```

### How It Works

1. User opens `~/nexus/` in Cursor
2. Cursor reads `.cursor/rules` — sees it's a Nexus workspace
3. Session start triggers `nexus-session-start.js` via hooks.json
4. Script runs `nexus status --json`, reads identity files
5. Context injected into session via `additional_context`
6. Agent reads AGENTS.md and has full identity context

### Context Injection

The session hook injects:

| Section | Source | Limit |
|---------|--------|-------|
| Status | `nexus status --json` | N/A |
| Bootstrap Prompt | `status.bootstrap.prompt` | N/A |
| Agent Identity | `state/agents/{name}/IDENTITY.md` | 120k chars |
| Agent Soul | `state/agents/{name}/SOUL.md` | 120k chars |
| Agent Memory | `state/agents/{name}/MEMORY.md` | 120k chars |
| User Identity | `state/user/IDENTITY.md` | 120k chars |
| Daily Memory (today) | `home/memory/YYYY-MM-DD.md` | 40k chars |
| Daily Memory (yesterday) | `home/memory/YYYY-MM-DD.md` | 40k chars |

---

## Claude Code Binding

### What It Creates

```
~/nexus/
└── CLAUDE.md
```

### CLAUDE.md Content

Generated file containing:
- Workspace overview
- All skill metadata and documentation
- Nexus CLI reference
- Agent identity information
- User identity information
- Current capability status

### Generation

```bash
nexus bindings claude-code          # Create/regenerate
```

### When to Regenerate

- Skills change (install, update, remove)
- Identity changes
- Capability status changes significantly

**TODO:** Add watcher or automatic regeneration trigger.

---

## Codex Binding

### What It Creates

```
~/nexus/
├── CODEX.md                        # Codex instructions
└── .codex/
    └── (config files TBD)
```

**TODO:** Research Codex file format and config options.

---

## Other Bindings

**TODO:** Deep dive needed for each harness:

| Harness | Config Location | File Format | Hook System |
|---------|-----------------|-------------|-------------|
| OpenCode | `.opencode/` | TBD | TBD |
| Aider | `.aider/` | YAML | TBD |
| Droid | TBD | TBD | TBD |
| Amp | TBD | TBD | TBD |

---

## Binding Parity

All bindings should provide equivalent context to agents. This is critical for consistent agent behavior across harnesses.

### Required Context

Every binding must inject:

| Context | Required | Notes |
|---------|----------|-------|
| AGENTS.md behavior | ✅ Yes | System behavior, safety rules |
| Agent identity | ✅ Yes | Name, emoji, vibe |
| Agent soul | ✅ Yes | Persona, boundaries |
| User identity | ✅ Yes | Name, timezone, preferences |
| Capability status | ⭐ Recommended | What's active, needs-setup |
| Daily memory | ⭐ Recommended | Today + yesterday logs |
| Bootstrap prompt | ⭐ Recommended | If bootstrap needed |

### Parity Matrix

| Context | Cursor | Claude Code | Codex | Others |
|---------|--------|-------------|-------|--------|
| AGENTS.md | Via rules | Inline | TBD | TBD |
| Agent identity | Hook | Inline | TBD | TBD |
| Agent soul | Hook | Inline | TBD | TBD |
| User identity | Hook | Inline | TBD | TBD |
| Capability status | Hook | Inline | TBD | TBD |
| Daily memory | Hook | Manual | TBD | TBD |
| Bootstrap prompt | Hook | Manual | TBD | TBD |

### Mechanisms

| Mechanism | Harnesses | How It Works |
|-----------|-----------|--------------|
| **Session hooks** | Cursor | Script runs at session start, injects context |
| **Inline files** | Claude Code, Codex | All context baked into single file |
| **Rules files** | Cursor | Static rules pointing to AGENTS.md |
| **Config files** | Various | Harness-specific configuration |

---

## Nexus Bot Bindings

The Nexus bot (running via gateway) also needs context injection. This is handled differently since it's not an IDE harness.

**TODO:** Spec how gateway agent gets context — this belongs in `specs/agent-system/`.

---

## Auto-Creation During Onboarding

### Detection

Uses `aix` tool to detect:
1. Which harnesses are installed
2. Which harnesses have recent usage (sessions, transcripts)
3. Ranking by frequency of use

### Auto-Creation

Top 2 harnesses get bindings automatically:

```
Agent: "I see you use Cursor and Claude Code most. I've set up 
        bindings so they connect to Nexus. Want me to set up others?"
```

### Manual Creation

For other harnesses:

```bash
nexus bindings opencode
nexus bindings aider
```

---

## Implementation Notes

### Workspace Root Requirement

**Bindings only work when `~/nexus/` is opened as the workspace root.**

This is intentional:
- Cursor reads `.cursor/` from workspace root
- Claude Code reads `CLAUDE.md` from workspace root
- Other harnesses have similar requirements

If user opens a subdirectory (e.g., `~/nexus/home/projects/foo/`), bindings won't load.

**Recommendation:** Document this clearly in AGENTS.md and during onboarding.

### Multi-Profile Support

When `NEXUS_PROFILE=work`:
- Root is `~/nexus-work/`
- Each profile has its own bindings
- The `nexus-session-start.js` script handles profile resolution

---

## Deep Dive: Harness File Formats

**TODO:** This section needs research into each harness's configuration system.

### Questions to Answer

For each harness:
1. What config files does it read?
2. What file format (JSON, YAML, TOML, MD)?
3. Does it support session hooks? If so, how?
4. Does it support rules/instructions files?
5. Does it support workspace-level config?
6. How does it handle context injection?

### Research Needed

| Harness | Config Location | File Format | Hook System | Context Injection |
|---------|-----------------|-------------|-------------|-------------------|
| Cursor | `.cursor/` | JSON, MD | sessionStart hook | `additional_context` |
| Claude Code | `CLAUDE.md` | Markdown | None (file-based) | Inline in file |
| Codex | `.codex/` | JSON? | TBD | TBD |
| OpenCode | `.opencode/` | TOML? | TBD | TBD |
| Aider | `.aider/`, `.aider.conf.yml` | YAML | None | `--read` flag? |
| Droid | TBD | TBD | TBD | TBD |
| Amp | TBD | TBD | TBD | TBD |

---

## Templates

All binding templates live in `reference/`:

```
reference/cursor/
├── rules
├── hooks.json
└── hooks/
    └── nexus-session-start.js
```

**TODO:** Add templates for other harnesses as they're spec'd.

---

## Related Specifications

- **WORKSPACE_SYSTEM.md** — Authoritative workspace spec
- **specs/credentials/CREDENTIAL_SYSTEM.md** — Credential detection
- **specs/agent-system/** — Gateway and Nexus bot context injection

---

## Open Work

| Item | Status | Priority |
|------|--------|----------|
| Claude Code CLAUDE.md generation | Needs implementation | High |
| Codex binding research | Not started | Medium |
| OpenCode binding research | Not started | Medium |
| Aider binding research | Not started | Low |
| Droid binding research | Not started | Low |
| Amp binding research | Not started | Low |
| Nexus bot context injection | Needs spec (agent-system) | High |
| Auto-regeneration triggers | Needs design | Medium |
| aix harness detection integration | Needs spec | High |
