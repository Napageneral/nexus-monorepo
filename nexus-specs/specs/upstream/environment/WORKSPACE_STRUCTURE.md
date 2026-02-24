# OpenClaw Workspace Structure

**Status:** REFERENCE DOCUMENT  
**Source:** OpenClaw upstream (`openclaw/`)  
**Last Updated:** 2026-02-04

---

## Overview

OpenClaw separates **state** (configuration, sessions, credentials) from the **workspace** (agent identity, memory, behavior). This document covers both directories and their contents.

---

## State Directory (`~/.openclaw/`)

The state directory stores mutable runtime data that should not be committed to version control.

### Location

- **Default:** `~/.openclaw/`
- **Override:** `OPENCLAW_STATE_DIR` environment variable
- **Profile support:** If `OPENCLAW_PROFILE` is set (e.g., `work`), paths may be namespaced

### Legacy Migration

OpenClaw migrates from legacy directories automatically:

```typescript
const LEGACY_STATE_DIRNAMES = [".clawdbot", ".moltbot", ".moldbot"];
const NEW_STATE_DIRNAME = ".openclaw";
```

Priority: existing `~/.openclaw/` > existing legacy dirs > create new `~/.openclaw/`

### Directory Layout

```
~/.openclaw/
├── openclaw.json              # Main configuration file
├── credentials/               # OAuth and credential storage
│   ├── oauth.json             # OAuth tokens (Anthropic, Google, etc.)
│   └── {service}.json         # Per-service credentials
├── agents/                    # Per-agent state
│   └── {agent-id}/
│       ├── sessions/          # Session transcripts
│       │   ├── transcripts/
│       │   │   └── {session-id}.jsonl
│       │   └── metadata.json
│       └── agent/             # Agent workspace (if not custom agentDir)
├── skills/                    # Managed skill installations
│   └── {skill-name}/
├── plugins/                   # User-installed plugins
├── sandboxes/                 # Per-session sandbox workspaces (when enabled)
├── logs/                      # Gateway logs
│   └── gateway.log
├── whatsapp/                  # WhatsApp credentials per account
│   └── {account-id}/
│       └── creds.json
└── workspace/                 # Default agent workspace (see below)
```

### Config File (`openclaw.json`)

The main configuration file uses JSON5 format (allows comments, trailing commas).

**Location:**
- Default: `~/.openclaw/openclaw.json`
- Override: `OPENCLAW_CONFIG_PATH`
- Legacy names checked: `clawdbot.json`, `moltbot.json`, `moldbot.json`

**Top-Level Structure:**

```json5
{
  // Metadata
  "meta": {
    "lastTouchedVersion": "2.5.0",
    "lastTouchedAt": "2026-02-04T00:00:00Z"
  },
  
  // Authentication providers
  "auth": {
    "anthropic": { /* ... */ },
    "openai": { /* ... */ },
    "google": { /* ... */ }
  },
  
  // Gateway configuration
  "gateway": {
    "port": 18789,
    "bind": "loopback",
    "auth": { "mode": "token" }
  },
  
  // Agent defaults
  "agents": {
    "defaults": {
      "workspace": "~/.openclaw/workspace",
      "model": { "primary": "claude-sonnet-4-20250514" }
    },
    "list": [
      { "id": "main", "default": true }
    ]
  },
  
  // Channel configurations
  "channels": {
    "whatsapp": { "enabled": true },
    "telegram": { "enabled": true, "botToken": "..." },
    "discord": { "enabled": false }
  },
  
  // Skills configuration
  "skills": {
    "entries": { /* per-skill config */ }
  },
  
  // Hooks configuration
  "hooks": {
    "internal": { "enabled": true, "entries": {} }
  }
}
```

### Session Storage

Sessions are stored per-agent as JSONL transcripts:

```
~/.openclaw/agents/{agent-id}/sessions/
├── transcripts/
│   └── {session-id}.jsonl      # Message history
└── metadata.json               # Session metadata index
```

### Credential Storage

OAuth and API credentials are stored in the credentials directory:

```
~/.openclaw/credentials/
├── oauth.json                  # Anthropic OAuth tokens
├── google-oauth.json           # Google OAuth tokens
└── {provider}.json             # Per-provider credentials
```

**Never commit this directory to version control.**

---

## Workspace Directory (`~/.openclaw/workspace/`)

The workspace is the agent's "home" — identity, behavior, and memory files.

### Location

- **Default:** `~/.openclaw/workspace/`
- **Override:** `agents.defaults.workspace` in config
- **Profile support:** `~/.openclaw/workspace-{profile}/` when `OPENCLAW_PROFILE` is set
- **Per-agent override:** `agents.list[].workspace` or `agents.list[].agentDir`

### Directory Layout

```
~/.openclaw/workspace/
├── AGENTS.md                   # Primary operating instructions
├── SOUL.md                     # Agent personality and boundaries
├── USER.md                     # User profile (filled during bootstrap)
├── IDENTITY.md                 # Agent identity (filled during bootstrap)
├── TOOLS.md                    # Local tool notes and conventions
├── HEARTBEAT.md                # Heartbeat checklist (minimal)
├── BOOTSTRAP.md                # First-run ritual (deleted after completion)
├── MEMORY.md                   # Long-term curated memory (optional)
├── BOOT.md                     # Gateway startup checklist (optional)
├── memory/                     # Daily memory logs
│   ├── YYYY-MM-DD.md           # Daily notes
│   └── heartbeat-state.json    # Heartbeat check timestamps
├── skills/                     # Workspace-specific skills (optional)
│   └── {skill-name}/
│       └── SKILL.md
├── canvas/                     # Canvas UI files (optional)
│   └── index.html
└── .git/                       # Git repo (auto-initialized)
```

---

## Bootstrap Files Reference

### AGENTS.md (Primary Instructions)

The main behavior file loaded every session. Key sections:

```markdown
# AGENTS.md - Your Workspace

## First Run
If `BOOTSTRAP.md` exists, follow it then delete it.

## Every Session
1. Read `SOUL.md` — who you are
2. Read `USER.md` — who you're helping  
3. Read `memory/YYYY-MM-DD.md` (today + yesterday)
4. **If in MAIN SESSION**: Also read `MEMORY.md`

## Memory
- Daily notes: `memory/YYYY-MM-DD.md`
- Long-term: `MEMORY.md`

## Safety
- Don't exfiltrate private data
- `trash` > `rm`
- Ask before external actions

## Group Chats
- Participate, don't dominate
- Use `HEARTBEAT_OK` when nothing to say

## Heartbeats
- Check email, calendar, mentions, weather
- Track in `memory/heartbeat-state.json`
```

### SOUL.md (Agent Identity)

Defines personality and boundaries:

```markdown
# SOUL.md - Who You Are

*You're not a chatbot. You're becoming someone.*

## Core Truths
- Be genuinely helpful, not performatively helpful
- Have opinions
- Be resourceful before asking
- Earn trust through competence
- Remember you're a guest

## Boundaries
- Private things stay private
- Ask before acting externally
- Never send half-baked replies
- You're not the user's voice
```

### USER.md (User Profile)

Filled during bootstrap conversation:

```markdown
# USER.md - User Profile

- **Name:** (user name)
- **Preferred address:** (how to call them)
- **Pronouns:** (optional)
- **Timezone:** (IANA timezone)
- **Notes:** (additional context)
```

### IDENTITY.md (Agent Identity)

Filled during bootstrap conversation:

```markdown
# IDENTITY.md - Agent Identity

- **Name:** (agent name)
- **Creature:** (what kind of entity)
- **Vibe:** (personality style)
- **Emoji:** (signature emoji)
- **Avatar:** (optional path)
```

### TOOLS.md (Local Notes)

Environment-specific tool details:

```markdown
# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics.

## What Goes Here
- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
```

### HEARTBEAT.md (Minimal Checklist)

Optional tiny checklist for heartbeat runs:

```markdown
# HEARTBEAT.md

Keep this file empty unless you want a tiny checklist. Keep it small.
```

### BOOTSTRAP.md (First-Run Ritual)

Only created for brand-new workspaces; deleted after completion:

```markdown
# BOOTSTRAP.md - Hello, World

*You just woke up. Time to figure out who you are.*

## The Conversation
Start with something like:
> "Hey. I just came online. Who am I? Who are you?"

Then figure out together:
1. **Your name** — What should they call you?
2. **Your nature** — What kind of creature are you?
3. **Your vibe** — Formal? Casual? Snarky? Warm?
4. **Your emoji** — Everyone needs a signature.

## After You Know Who You Are
Update:
- `IDENTITY.md` — your name, creature, vibe, emoji
- `USER.md` — their name, how to address them, timezone, notes
- `SOUL.md` — together, talk about boundaries

## When You're Done
Delete this file. You don't need a bootstrap script anymore — you're you now.
```

### BOOT.md (Gateway Startup)

Optional startup checklist executed when gateway starts:

```markdown
# BOOT.md

Startup checklist for gateway restart. Use the message tool for outbound sends.
Keep it short.
```

### MEMORY.md (Long-Term Memory)

Curated long-term memory (only loaded in main session for security):

```markdown
# MEMORY.md

Curated long-term memory. Only load in main session (direct chats with your human).
DO NOT load in shared contexts (Discord, group chats, sessions with other people).
```

---

## Bootstrap File Creation Logic

```typescript
// From workspace.ts

export async function ensureAgentWorkspace(params?: {
  dir?: string;
  ensureBootstrapFiles?: boolean;
}): Promise<WorkspaceResult> {
  const dir = resolveUserPath(rawDir);
  await fs.mkdir(dir, { recursive: true });

  if (!params?.ensureBootstrapFiles) return { dir };

  // Check if brand new workspace (no existing files)
  const isBrandNewWorkspace = await checkNoExistingFiles(paths);

  // Write files if missing (wx flag = fail if exists)
  await writeFileIfMissing(agentsPath, agentsTemplate);
  await writeFileIfMissing(soulPath, soulTemplate);
  await writeFileIfMissing(toolsPath, toolsTemplate);
  await writeFileIfMissing(identityPath, identityTemplate);
  await writeFileIfMissing(userPath, userTemplate);
  await writeFileIfMissing(heartbeatPath, heartbeatTemplate);
  
  // BOOTSTRAP.md only for brand new workspaces
  if (isBrandNewWorkspace) {
    await writeFileIfMissing(bootstrapPath, bootstrapTemplate);
  }
  
  // Git init only for brand new workspaces
  await ensureGitRepo(dir, isBrandNewWorkspace);

  return { dir, agentsPath, soulPath, ... };
}
```

### Subagent Bootstrap Filtering

Subagents only receive a subset of bootstrap files for security:

```typescript
const SUBAGENT_BOOTSTRAP_ALLOWLIST = new Set([
  "AGENTS.md",
  "TOOLS.md"
]);

// SOUL.md, MEMORY.md, USER.md excluded from subagent context
```

---

## Multi-Agent Configuration

OpenClaw supports multiple agents with separate workspaces.

### Agent List Configuration

```json5
{
  "agents": {
    "defaults": {
      "workspace": "~/.openclaw/workspace"
    },
    "list": [
      { "id": "main", "default": true },
      { 
        "id": "work",
        "workspace": "~/clawd-work",
        "model": { "primary": "claude-sonnet-4-20250514" }
      }
    ]
  }
}
```

### Agent Directory Resolution

```typescript
function resolveEffectiveAgentDir(cfg, agentId): string {
  const id = normalizeAgentId(agentId);
  
  // Check for explicit agentDir in config
  const configured = cfg.agents?.list?.find(
    agent => normalizeAgentId(agent.id) === id
  )?.agentDir;
  
  if (configured?.trim()) return resolveUserPath(configured);
  
  // Default to $STATE_DIR/agents/{id}/agent
  return path.join(stateDir, "agents", id, "agent");
}
```

### Agent Bindings

Map channels/accounts to specific agents:

```json5
{
  "bindings": [
    {
      "agentId": "work",
      "match": {
        "channel": "slack",
        "teamId": "T01234567"
      }
    },
    {
      "agentId": "main",
      "match": {
        "channel": "whatsapp",
        "accountId": "*"
      }
    }
  ]
}
```

---

## Path Resolution Functions

### State Directory

```typescript
export function resolveStateDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const override = env.OPENCLAW_STATE_DIR?.trim();
  if (override) return resolveUserPath(override);
  
  // Check for existing dirs (prefer new, fallback to legacy)
  if (fs.existsSync(newStateDir)) return newStateDir;
  const existingLegacy = legacyDirs.find(fs.existsSync);
  if (existingLegacy) return existingLegacy;
  
  return newStateDir; // ~/.openclaw
}
```

### Config Path

```typescript
export function resolveConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  stateDir: string = resolveStateDir(),
): string {
  const override = env.OPENCLAW_CONFIG_PATH?.trim();
  if (override) return resolveUserPath(override);
  
  // Check for existing configs (prefer new name, fallback to legacy)
  const candidates = [
    path.join(stateDir, "openclaw.json"),
    path.join(stateDir, "clawdbot.json"),
    path.join(stateDir, "moltbot.json"),
  ];
  
  const existing = candidates.find(fs.existsSync);
  return existing ?? path.join(stateDir, "openclaw.json");
}
```

### Workspace Path

```typescript
export function resolveDefaultAgentWorkspaceDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const profile = env.OPENCLAW_PROFILE?.trim();
  if (profile && profile.toLowerCase() !== "default") {
    return path.join(homedir(), ".openclaw", `workspace-${profile}`);
  }
  return path.join(homedir(), ".openclaw", "workspace");
}
```

---

## Environment Variables Summary

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENCLAW_STATE_DIR` | State directory | `~/.openclaw` |
| `OPENCLAW_CONFIG_PATH` | Config file path | `$STATE_DIR/openclaw.json` |
| `OPENCLAW_OAUTH_DIR` | OAuth credentials dir | `$STATE_DIR/credentials` |
| `OPENCLAW_PROFILE` | Named profile | `default` |
| `OPENCLAW_NIX_MODE` | Nix mode (disables auto-install) | `0` |
| `OPENCLAW_GATEWAY_PORT` | Gateway port | `18789` |
| `OPENCLAW_GATEWAY_TOKEN` | Gateway auth token | (generated) |
| `OPENCLAW_GATEWAY_PASSWORD` | Gateway password | (none) |
| `OPENCLAW_SKIP_CHANNELS` | Skip channel startup | `0` |

Legacy `CLAWDBOT_*` variables are supported for backward compatibility.

---

## Git Backup Recommendations

The workspace should be backed up to a **private** Git repository:

```bash
cd ~/.openclaw/workspace
git init
git add AGENTS.md SOUL.md TOOLS.md IDENTITY.md USER.md HEARTBEAT.md memory/
git commit -m "Add agent workspace"

# Create private repo and push
gh repo create openclaw-workspace --private --source . --remote origin --push
```

### Recommended `.gitignore`

```gitignore
.DS_Store
.env
**/*.key
**/*.pem
**/secrets*
```

### What NOT to Commit

- `~/.openclaw/` contents (config, credentials, sessions)
- API keys, OAuth tokens, passwords
- Raw chat dumps or sensitive attachments

---

## Comparison with Nexus

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| State location | `~/.openclaw/` | `~/nexus/state/` |
| Workspace location | `~/.openclaw/workspace/` | `~/nexus/home/` |
| Config file | Single `openclaw.json` | Multiple files in `state/` |
| Agent identity | `workspace/IDENTITY.md` | `state/agents/{id}/IDENTITY.md` |
| User identity | `workspace/USER.md` | `state/user/IDENTITY.md` |
| Session transcripts | `agents/{id}/sessions/` | `state/agents/{id}/sessions/` |
| Skills | `skills/` (bundled) + `workspace/skills/` | `~/nexus/skills/` |

---

*This document captures upstream workspace structure for comparison with Nexus. See `foundation/WORKSPACE_SYSTEM.md` for the Nexus workspace spec.*
