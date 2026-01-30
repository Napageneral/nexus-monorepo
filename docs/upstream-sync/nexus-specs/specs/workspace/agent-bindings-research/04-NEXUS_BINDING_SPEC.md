# Nexus Binding Specification

This document defines the minimum viable bindings Nexus creates for each supported AI coding harness.

---

## Design Principles

1. **Minimal footprint** — Only create what's necessary for Nexus awareness
2. **Non-destructive** — Don't overwrite user's existing harness configs
3. **Workspace-scoped** — Bindings live in `~/nexus/` not global harness dirs
4. **Identical content** — Instructions files have the same content across harnesses
5. **Post-compaction injection** — Re-inject context after compaction, not before

---

## Supported Harnesses

| Harness | Support Level | Instructions | Lifecycle Hooks |
|---------|--------------|--------------|-----------------|
| **Cursor** | ✅ Full | `AGENTS.md` | `sessionStart` (startup + compact) |
| **Claude Code** | ✅ Full | `CLAUDE.md` | `SessionStart` (startup + compact) |
| **OpenCode** | ✅ Full | `AGENTS.md` | Plugin (`session.created`, `session.compacted`) |
| **Codex** | ⚠️ Limited | `AGENTS.md` | None available |

> **Note**: Codex is not recommended for use with Nexus due to lack of lifecycle hooks. Context injection relies solely on `AGENTS.md` which doesn't survive compaction or provide dynamic identity/memory loading.

---

## Binding Locations

All bindings live within the Nexus workspace to avoid conflicts with user's other projects:

```
~/nexus/
├── AGENTS.md                    # For Cursor, OpenCode, Codex
├── CLAUDE.md                    # For Claude Code (identical to AGENTS.md)
├── .cursor/
│   ├── hooks.json               # Hook configuration
│   └── hooks/
│       └── nexus-session-start.js
├── .claude/
│   └── settings.json            # Hook configuration (same format as Cursor)
└── .opencode/
    └── plugins/
        └── nexus-bootstrap.ts   # Native plugin
```

---

## 1. Instructions File (AGENTS.md / CLAUDE.md)

### Content

The instructions file provides baseline Nexus awareness. Content is identical for both filenames.

```markdown
---
summary: "Root AGENTS.md for Nexus workspaces - system behavior and CLI gateway"
read_when:
 - Bootstrapping a workspace
 - Fresh nexus install
---
# AGENTS.md - Nexus Workspace

You are operating within a Nexus workspace — a personal AI ecosystem with skills and identity.

## 🚀 First Action - Orient Yourself

Run `nexus status` to understand the current state:
\`\`\`bash
nexus status
\`\`\`

The CLI tells you who you are, what capabilities are available, and suggests next actions based on current state.

[... rest of standard AGENTS.md content ...]
```

### Generation

```bash
nexus bindings create --instructions
# Creates both ~/nexus/AGENTS.md and ~/nexus/CLAUDE.md
```

---

## 2. Cursor Bindings

### Files

```
~/nexus/.cursor/
├── hooks.json
└── hooks/
    └── nexus-session-start.js
```

### hooks.json

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

### nexus-session-start.js

Node.js script that:
1. Reads stdin payload from Cursor
2. Runs `nexus status --json`
3. Reads identity files (agent, user)
4. Reads daily memory logs
5. Outputs JSON with `additional_context` and `env`

Key behaviors:
- Runs on `startup` — fresh session
- Runs on `compact` — after compaction completes (re-injects context)
- Gracefully handles missing files
- Sets `NEXUS_ROOT` and `NEXUS_STATE_DIR` env vars

### Templates

- [`reference/cursor/hooks.json`](./reference/cursor/hooks.json)
- [`reference/cursor/nexus-session-start.js`](./reference/cursor/nexus-session-start.js)

### Generation

```bash
nexus bindings create --harness cursor
# Creates ~/nexus/.cursor/hooks.json and ~/nexus/.cursor/hooks/nexus-session-start.js
```

---

## 3. Claude Code Bindings

### Files

```
~/nexus/.claude/
└── settings.json
```

### settings.json

Claude Code uses the same hook format as Cursor (Cursor adopted Claude's system):

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

> **Note**: We reuse the same script from `.cursor/hooks/`. Claude Code can read it from that path when working in the Nexus workspace.

### Template

See [`reference/claude-code/settings.json`](./reference/claude-code/settings.json)

### Generation

```bash
nexus bindings create --harness claude-code
# Creates ~/nexus/.claude/settings.json
# Reuses ~/nexus/.cursor/hooks/nexus-session-start.js
```

---

## 4. OpenCode Bindings

### Files

```
~/nexus/.opencode/
└── plugins/
    └── nexus-bootstrap.ts
```

### nexus-bootstrap.ts

Native OpenCode plugin that handles lifecycle events and context injection via experimental hooks:

```typescript
import type { Plugin } from "@opencode-ai/plugin";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const MAX_CHARS = 120000;

function readFileSafe(path: string, limit: number): string | null {
  if (!existsSync(path)) return null;
  try {
    const content = readFileSync(path, "utf8").trim();
    if (!content) return null;
    if (content.length <= limit) return content;
    return content.slice(-limit) + "\n\n[truncated]";
  } catch {
    return null;
  }
}

function buildContext(workspaceRoot: string): string {
  const stateDir = process.env.NEXUS_STATE_DIR || join(workspaceRoot, "state");
  const sections: string[] = [];

  // Run nexus status
  try {
    const result = execSync("nexus status --json", {
      cwd: workspaceRoot,
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, NEXUS_ROOT: workspaceRoot, NEXUS_STATE_DIR: stateDir },
    });
    const status = JSON.parse(result);
    if (status?.identity) {
      sections.push(`## Nexus Status\nAgent: ${status.identity.agentName} (${status.identity.agentId})`);
    }
  } catch {}

  // Read identity files
  const agentId = process.env.NEXUS_AGENT_ID || "default";
  const agentDir = join(stateDir, "agents", agentId);
  
  const identity = readFileSafe(join(agentDir, "IDENTITY.md"), MAX_CHARS);
  const soul = readFileSafe(join(agentDir, "SOUL.md"), MAX_CHARS);
  const userIdentity = readFileSafe(join(stateDir, "user", "IDENTITY.md"), MAX_CHARS);

  if (identity) sections.push(`## Agent Identity\n${identity}`);
  if (soul) sections.push(`## Agent Soul\n${soul}`);
  if (userIdentity) sections.push(`## User Identity\n${userIdentity}`);

  // Read daily memory
  const memoryDir = join(workspaceRoot, "home", "memory");
  const today = new Date().toISOString().split("T")[0];
  const todayLog = readFileSafe(join(memoryDir, `${today}.md`), 40000);
  if (todayLog) sections.push(`## Daily Memory (${today})\n${todayLog}`);

  return sections.length > 0 ? `# Nexus Session Context\n\n${sections.join("\n\n")}` : "";
}

export const NexusBootstrap: Plugin = async ({ directory }) => {
  const workspaceRoot = process.env.NEXUS_ROOT || directory || process.cwd();

  return {
    // Inject context into system prompt BEFORE EACH LLM call
    // This ensures context survives compaction automatically
    "experimental.chat.system.transform": async (input, output) => {
      const context = buildContext(workspaceRoot);
      if (context) {
        output.system.push(context);
      }
    },

    // Also inject during compaction for explicit handling
    "experimental.session.compacting": async (input, output) => {
      const context = buildContext(workspaceRoot);
      if (context) {
        output.context.push(context);
      }
    },
  };
};
```

### OpenCode Experimental Hooks

OpenCode actually provides **better** context injection than Cursor in some ways:

| Hook | When it fires | Use |
|------|---------------|-----|
| `experimental.chat.system.transform` | Before **every** LLM call | Ensures fresh context always |
| `experimental.session.compacting` | During compaction | Inject into compaction prompt |

**Key advantage**: The `system.transform` hook fires on every LLM call, meaning context is always fresh — not just on session start or after compaction.

**Note**: These hooks are marked `experimental` and may change in future OpenCode versions.

### Template

See [`reference/opencode/nexus-bootstrap.ts`](./reference/opencode/nexus-bootstrap.ts)

### Generation

```bash
nexus bindings create --harness opencode
# Creates ~/nexus/.opencode/plugins/nexus-bootstrap.ts
```

---

## 5. Codex Bindings

### Files

```
~/nexus/AGENTS.md    # Already created by instructions step
```

### Limitation

**Codex has no lifecycle hook system.** It cannot:
- Inject context at session start
- Re-inject context after compaction
- Run arbitrary code on session events

Codex relies entirely on:
- `AGENTS.md` for instructions (static, doesn't survive compaction well)
- Skills for capabilities (user must manually invoke)

### Recommendation

> ⚠️ **Codex is not recommended for Nexus workflows** due to the inability to dynamically inject identity and memory context. Use Cursor, Claude Code, or OpenCode for full Nexus integration.

### Generation

```bash
nexus bindings create --harness codex
# Only verifies ~/nexus/AGENTS.md exists, warns about limitations
```

---

## CLI Commands

### Create All Bindings

```bash
nexus bindings create
# Creates instructions files + bindings for all detected harnesses
```

### Create Specific Harness

```bash
nexus bindings create --harness cursor
nexus bindings create --harness claude-code
nexus bindings create --harness opencode
nexus bindings create --harness codex
```

### Create Instructions Only

```bash
nexus bindings create --instructions
# Creates AGENTS.md and CLAUDE.md only
```

### List Current Bindings

```bash
nexus bindings list
# Shows which bindings exist and their status
```

### Verify Bindings

```bash
nexus bindings verify
# Checks if bindings are correctly configured
```

---

## Auto-Detection (AIX Integration)

### What is AIX?

AIX is a standalone Go CLI tool that aggregates AI session data from multiple harnesses into a SQLite database (`~/.aix/aix.db`). It's available as a Nexus skill.

**Installation**: `brew install Napageneral/tap/aix`

### How AIX Detects Harness Usage

AIX tracks sessions from all supported harnesses in its `sessions` table with a `source` column:
- `cursor`
- `claude-code`
- `opencode`
- `codex`
- `claude` (Claude Desktop — not a coding harness)

### Detection Query

```sql
SELECT source, COUNT(*) as session_count, MAX(created_at) as last_used
FROM sessions 
WHERE source IN ('cursor', 'claude-code', 'opencode', 'codex')
GROUP BY source 
ORDER BY session_count DESC 
LIMIT 2;
```

### Integration Flow

```
nexus init (opens ~/nexus/ in Cursor/Claude Code)
       ↓
Agent reads AGENTS.md → detects no identity → reads BOOTSTRAP.md
       ↓
Bootstrap conversation (identity establishment)
       ↓
Silent Detection Phase:
  1. Check if `aix` binary exists (which aix)
  2. Check if `~/.aix/aix.db` exists
  3. If yes: Query for top 2 harnesses by session count
  4. If no: AIX is required — cannot detect harnesses without it
       ↓
Auto-create bindings for detected harnesses:
  - nexus bindings create --harness cursor
  - nexus bindings create --harness claude-code
       ↓
Agent informs user: "I see you use Cursor and Claude Code most. 
I've set up bindings so they connect to Nexus."
```

### Storage Strategy

**Recommended: In-memory during onboarding.**

Detection happens during init, bindings are created immediately, no persistent storage needed.

If we want to track which harnesses have bindings:

```json
// state/bindings/config.json
{
  "harnesses": {
    "cursor": { "created": "2026-01-27T...", "version": "1.0" },
    "claude-code": { "created": "2026-01-27T...", "version": "1.0" }
  },
  "lastDetection": "2026-01-27T..."
}
```

### Implementation

```typescript
interface HarnessUsage {
  harness: "cursor" | "claude-code" | "opencode" | "codex";
  sessionCount: number;
  lastUsed: Date;
}

async function detectHarnessUsage(): Promise<HarnessUsage[]> {
  const aixDb = join(HOME, ".aix", "aix.db");
  
  if (!existsSync(aixDb)) {
    // AIX is required — cannot detect harnesses without it
    throw new Error("AIX database not found. Install AIX (brew install Napageneral/tap/aix) and sync session data before auto-detecting harnesses.");
  }
  
  // Query AIX database
  const result = execSync(`sqlite3 "${aixDb}" "
    SELECT source, COUNT(*) as cnt, MAX(created_at) as last
    FROM sessions 
    WHERE source IN ('cursor', 'claude-code', 'opencode', 'codex')
    GROUP BY source 
    ORDER BY cnt DESC 
    LIMIT 2;
  "`, { encoding: "utf8" });
  
  return parseAixResult(result);
}

// During nexus init
const topHarnesses = await detectHarnessUsage();

for (const { harness } of topHarnesses) {
  await exec(`nexus bindings create --harness ${harness}`);
}
```

---

## Summary

| Harness | Instructions | Hook Config | Hook Script | Plugin | Context Injection |
|---------|-------------|-------------|-------------|--------|-------------------|
| Cursor | `AGENTS.md` | `.cursor/hooks.json` | `.cursor/hooks/nexus-session-start.js` | — | `sessionStart` (startup + compact) |
| Claude Code | `CLAUDE.md` | `.claude/settings.json` | (reuses Cursor script) | — | `SessionStart` (startup + compact) |
| OpenCode | `AGENTS.md` | — | — | `.opencode/plugins/nexus-bootstrap.ts` | `system.transform` (every LLM call!) |
| Codex | `AGENTS.md` | — | — | — | ❌ None |

**Total files for full support:**
- 2 instructions files (AGENTS.md, CLAUDE.md)
- 1 hook script (shared by Cursor + Claude Code)
- 2 hook configs (Cursor, Claude Code)
- 1 plugin (OpenCode)

**Context injection quality:**
- **OpenCode**: Best — refreshes on every LLM call
- **Cursor/Claude Code**: Good — refreshes on session start and after compaction
- **Codex**: None — static instructions only, not recommended
