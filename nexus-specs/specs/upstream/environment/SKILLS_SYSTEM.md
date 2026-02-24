# OpenClaw Skills System

**Status:** Reference Documentation  
**Last Updated:** 2026-02-04  
**Source:** OpenClaw `skills/` folder, `src/agents/skills/`

---

This document provides a complete reference for the OpenClaw skills system. Use it to understand what to port vs. redesign for Nexus.

## Table of Contents

1. [Overview](#1-overview)
2. [SKILL.md File Format](#2-skillmd-file-format)
3. [Skill Discovery & Precedence](#3-skill-discovery--precedence)
4. [Skill Types](#4-skill-types)
5. [Skill Loading & Context Injection](#5-skill-loading--context-injection)
6. [Skill Dependencies & Requirements](#6-skill-dependencies--requirements)
7. [Skill Installation System](#7-skill-installation-system)
8. [Skill Configuration](#8-skill-configuration)
9. [Bundled Skills Inventory](#9-bundled-skills-inventory)
10. [Skill Commands (Slash Commands)](#10-skill-commands-slash-commands)
11. [Skills Watcher (Live Refresh)](#11-skills-watcher-live-refresh)
12. [Type Definitions](#12-type-definitions)
13. [Source Files Reference](#13-source-files-reference)

---

## 1. Overview

OpenClaw skills are **documentation-as-capability** — markdown files that give the agent knowledge about how to use tools, services, and workflows. Skills are:

- **Progressive**: Only metadata (name + description) loads initially; full SKILL.md content loads on-demand
- **Layered**: Multiple sources with clear precedence (workspace overrides managed overrides bundled)
- **Conditional**: Requirements system ensures skills only appear when dependencies are met
- **Installable**: Built-in install specs automate dependency installation

### Key Insight

Skills are NOT tool wrappers. After reading a skill, the agent uses the tool directly:

```bash
# Agent reads the skill
nexus skill use gog

# Agent then runs the tool itself
gog gmail search "is:unread" --max 10
```

---

## 2. SKILL.md File Format

### 2.1 Basic Structure

```markdown
---
name: skill-name
description: Brief description of what the skill does and when to use it.
homepage: https://example.com
metadata: {"openclaw": {...}}
---

# Skill Title

Instructions, examples, and documentation...
```

### 2.2 Frontmatter Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | Yes | string | Unique skill identifier (lowercase, hyphens) |
| `description` | Yes | string | Triggers skill selection — describe what & when |
| `homepage` | No | string | URL to tool/documentation homepage |
| `metadata` | No | JSON | OpenClaw-specific metadata (see below) |
| `user-invocable` | No | boolean | Whether users can trigger via /command (default: true) |
| `disable-model-invocation` | No | boolean | Exclude from model prompt (default: false) |

### 2.3 Metadata Schema

The `metadata` field contains JSON with an `openclaw` key:

```yaml
metadata: {
  "openclaw": {
    "emoji": "🎮",
    "skillKey": "custom-key",
    "primaryEnv": "API_KEY_VAR",
    "always": false,
    "homepage": "https://...",
    "os": ["darwin", "linux"],
    "requires": {
      "bins": ["gog"],
      "anyBins": ["nvim", "vim"],
      "env": ["API_KEY"],
      "config": ["browser.enabled"]
    },
    "install": [{
      "id": "brew",
      "kind": "brew",
      "formula": "steipete/tap/gogcli",
      "bins": ["gog"],
      "label": "Install gog (brew)"
    }]
  }
}
```

### 2.4 Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `emoji` | string | Display emoji for the skill |
| `skillKey` | string | Override config key (defaults to name) |
| `primaryEnv` | string | Primary env var for API key |
| `always` | boolean | Always include, ignore requirements |
| `homepage` | string | Alternate homepage location |
| `os` | string[] | Platform restrictions: `"darwin"`, `"linux"`, `"win32"` |
| `requires.bins` | string[] | All binaries must be on PATH |
| `requires.anyBins` | string[] | At least one must be on PATH |
| `requires.env` | string[] | All env vars must be set |
| `requires.config` | string[] | All config paths must be truthy |
| `install` | array | Installation options (see section 7) |

### 2.5 Command Dispatch (Slash Commands)

Skills can define direct tool dispatch for slash commands:

```yaml
---
name: my-skill
description: ...
command-dispatch: tool
command-tool: exec
command-arg-mode: raw
---
```

---

## 3. Skill Discovery & Precedence

### 3.1 Directory Sources

Skills load from multiple directories in precedence order (lowest → highest):

| Priority | Source | Location | Description |
|----------|--------|----------|-------------|
| 1 (lowest) | Extra | `config.skills.load.extraDirs[]` | User-configured additional directories |
| 2 | Plugin | Resolved from installed plugins | Plugin-provided skills |
| 3 | Bundled | `<packageRoot>/skills/` | Ships with OpenClaw |
| 4 | Managed | `~/.openclaw/skills/` | Hub-installed skills |
| 5 (highest) | Workspace | `<workspaceDir>/skills/` | Per-workspace overrides |

**Key behavior:** Later sources override earlier sources with the same skill name.

### 3.2 Bundled Skills Directory Resolution

```typescript
// From src/agents/skills/bundled-dir.ts
function resolveBundledSkillsDir(): string | undefined {
  // 1. Environment override
  const override = process.env.OPENCLAW_BUNDLED_SKILLS_DIR?.trim();
  if (override) return override;

  // 2. Compiled binary: sibling `skills/` next to executable
  const execDir = path.dirname(process.execPath);
  const sibling = path.join(execDir, "skills");
  if (fs.existsSync(sibling)) return sibling;

  // 3. npm/dev: resolve `<packageRoot>/skills` relative to module
  // ... traverses up to 6 levels looking for skills/
}
```

### 3.3 Skill Directory Structure

```
skills/
├── skill-name/
│   ├── SKILL.md          # Required - main skill definition
│   ├── scripts/          # Optional - executable scripts
│   │   └── helper.py
│   ├── references/       # Optional - documentation to load on demand
│   │   └── api-docs.md
│   └── assets/           # Optional - templates, images, etc.
│       └── template.txt
```

---

## 4. Skill Types

OpenClaw doesn't formally categorize skills, but they fall into patterns:

| Type | Description | Examples |
|------|-------------|----------|
| **Guide** | Pure instructions, no external tool | `weather`, `canvas` |
| **Tool** | Instructions for using a binary | `gog`, `tmux`, `peekaboo` |
| **Connector** | Auth/credential setup | `1password`, `github` |
| **Hybrid** | Includes bundled scripts | `openai-image-gen`, `video-frames` |

### Bundled Scripts

Some skills include helper scripts in `scripts/`:

```
openai-image-gen/
├── SKILL.md
└── scripts/
    └── gen.py          # Python script the agent can run
```

---

## 5. Skill Loading & Context Injection

### 5.1 Progressive Disclosure (Three-Level Loading)

1. **Metadata (always in context):** Name + description (~100 words per skill)
2. **SKILL.md body:** Loaded when skill triggers (<5k words recommended)
3. **Bundled resources:** Loaded as needed (scripts/, references/, assets/)

### 5.2 Skills Snapshot

Skills are captured into a snapshot for consistent session state:

```typescript
type SkillSnapshot = {
  prompt: string;                                    // Formatted skills prompt
  skills: Array<{ name: string; primaryEnv?: string }>;
  resolvedSkills?: Skill[];                          // Full skill objects
  version?: number;                                  // Cache invalidation
};
```

### 5.3 Building Skills Prompt

```typescript
// From src/agents/skills/workspace.ts
function buildWorkspaceSkillSnapshot(workspaceDir, opts): SkillSnapshot {
  const skillEntries = loadSkillEntries(workspaceDir, opts);
  const eligible = filterSkillEntries(skillEntries, opts?.config, ...);
  
  // Filter out skills with disableModelInvocation: true
  const promptEntries = eligible.filter(
    (entry) => entry.invocation?.disableModelInvocation !== true
  );
  
  const resolvedSkills = promptEntries.map((entry) => entry.skill);
  const prompt = formatSkillsForPrompt(resolvedSkills);
  
  return { prompt, skills: [...], resolvedSkills, version: ... };
}
```

### 5.4 System Prompt Integration

Skills are injected with usage guidance:

```typescript
// From system prompt builder
"## Skills (mandatory)"
"Before replying: scan <available_skills> <description> entries."
"- If exactly one skill clearly applies: read its SKILL.md at <location>, then follow it."
"- If multiple could apply: choose the most specific one, then read/follow it."
"- If none clearly apply: do not read any SKILL.md."
"Constraints: never read more than one skill up front; only read after selecting."
```

### 5.5 Skills Prompt Format

The prompt uses XML-like structured output:

```xml
<available_skills>
<skill>
<name>weather</name>
<description>Get current weather and forecasts (no API key required).</description>
<location>/path/to/skills/weather/SKILL.md</location>
</skill>
<skill>
<name>gog</name>
<description>Google Workspace CLI for Gmail, Calendar, Drive...</description>
<location>/path/to/skills/gog/SKILL.md</location>
</skill>
</available_skills>
```

---

## 6. Skill Dependencies & Requirements

### 6.1 Requirement Types

```typescript
requires: {
  bins: string[];      // All must be on PATH
  anyBins: string[];   // At least one must be on PATH
  env: string[];       // All env vars must be set
  config: string[];    // All config paths must be truthy
}
os: string[];          // Platform must match: "darwin", "linux", "win32"
```

### 6.2 Eligibility Resolution

```typescript
// From src/agents/skills/config.ts
function shouldIncludeSkill({ entry, config, eligibility }): boolean {
  // 1. Explicit disable check
  if (skillConfig?.enabled === false) return false;
  
  // 2. Bundled allowlist check
  if (!isBundledSkillAllowed(entry, allowBundled)) return false;
  
  // 3. OS platform check
  if (osList.length > 0 && !osList.includes(process.platform)) return false;
  
  // 4. Always-include override
  if (entry.metadata?.always === true) return true;

  // 5. Binary requirements (all must exist)
  for (const bin of requiredBins) {
    if (!hasBinary(bin) && !eligibility?.remote?.hasBin?.(bin)) return false;
  }
  
  // 6. anyBins requirement (at least one)
  if (requiredAnyBins.length > 0) {
    const anyFound = requiredAnyBins.some(hasBinary) || ...;
    if (!anyFound) return false;
  }

  // 7. Environment variable requirements
  for (const envName of requiredEnv) {
    if (!process.env[envName] && !skillConfig?.env?.[envName] && 
        !(skillConfig?.apiKey && entry.metadata?.primaryEnv === envName)) {
      return false;
    }
  }

  // 8. Config path requirements
  for (const configPath of requiredConfig) {
    if (!isConfigPathTruthy(config, configPath)) return false;
  }

  return true;
}
```

### 6.3 Binary Check

```typescript
function hasBinary(bin: string): boolean {
  const pathEnv = process.env.PATH ?? "";
  const parts = pathEnv.split(path.delimiter).filter(Boolean);
  for (const part of parts) {
    const candidate = path.join(part, bin);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch { /* keep scanning */ }
  }
  return false;
}
```

### 6.4 Remote Node Eligibility

For distributed setups, remote nodes can provide binaries:

```typescript
type SkillEligibilityContext = {
  remote?: {
    platforms: string[];
    hasBin: (bin: string) => boolean;
    hasAnyBin: (bins: string[]) => boolean;
    note?: string;
  };
};
```

---

## 7. Skill Installation System

### 7.1 Install Spec Schema

```typescript
type SkillInstallSpec = {
  id?: string;                        // Unique installer ID
  kind: "brew" | "node" | "go" | "uv" | "download";
  label?: string;                     // Display label
  bins?: string[];                    // Binaries this installs
  os?: string[];                      // Platform restrictions
  
  // Kind-specific fields:
  formula?: string;                   // brew: Homebrew formula
  package?: string;                   // node/uv: Package name
  module?: string;                    // go: Module path
  url?: string;                       // download: URL to fetch
  archive?: string;                   // download: Archive type override
  extract?: boolean;                  // download: Auto-extract
  stripComponents?: number;           // download: tar --strip-components
  targetDir?: string;                 // download: Extraction target
};
```

### 7.2 Install Commands by Kind

| Kind | Command Generated |
|------|-------------------|
| `brew` | `brew install {formula}` |
| `node` | `{nodeManager} install -g {package}` |
| `go` | `go install {module}` |
| `uv` | `uv tool install {package}` |
| `download` | Fetch + extract to target directory |

### 7.3 Install Preferences

```typescript
type SkillsInstallPreferences = {
  preferBrew: boolean;      // Default: true
  nodeManager: "npm" | "pnpm" | "yarn" | "bun";  // Default: npm
};
```

### 7.4 Example Install Specs

**Homebrew:**
```json
{
  "id": "brew",
  "kind": "brew",
  "formula": "steipete/tap/gogcli",
  "bins": ["gog"],
  "label": "Install gog (brew)"
}
```

**Node package:**
```json
{
  "id": "npm",
  "kind": "node",
  "package": "my-cli-tool",
  "bins": ["my-cli"],
  "label": "Install via npm"
}
```

**Download:**
```json
{
  "id": "download",
  "kind": "download",
  "url": "https://example.com/tool-v1.0.tar.gz",
  "extract": true,
  "stripComponents": 1,
  "bins": ["tool"],
  "os": ["darwin", "linux"]
}
```

---

## 8. Skill Configuration

### 8.1 Config Schema

```typescript
// From src/config/types.skills.ts
type SkillConfig = {
  enabled?: boolean;                    // Enable/disable specific skill
  apiKey?: string;                      // API key for primaryEnv
  env?: Record<string, string>;         // Additional env overrides
  config?: Record<string, unknown>;     // Skill-specific config
};

type SkillsLoadConfig = {
  extraDirs?: string[];                 // Additional skill directories
  watch?: boolean;                      // Watch for changes (default: true)
  watchDebounceMs?: number;             // Debounce interval (default: 250)
};

type SkillsInstallConfig = {
  preferBrew?: boolean;                 // Prefer Homebrew for installs
  nodeManager?: "npm" | "pnpm" | "yarn" | "bun";
};

type SkillsConfig = {
  allowBundled?: string[];              // Bundled skill allowlist
  load?: SkillsLoadConfig;
  install?: SkillsInstallConfig;
  entries?: Record<string, SkillConfig>;  // Per-skill config by skillKey
};
```

### 8.2 Example Configuration

```yaml
# openclaw.yaml
skills:
  allowBundled:
    - gog
    - weather
    - tmux
  load:
    extraDirs:
      - ~/my-skills
      - /shared/team-skills
    watch: true
    watchDebounceMs: 500
  install:
    preferBrew: true
    nodeManager: pnpm
  entries:
    gog:
      enabled: true
    openai-image-gen:
      enabled: true
      apiKey: sk-...
      env:
        OPENAI_ORG_ID: org-...
    custom-skill:
      enabled: false
```

### 8.3 Environment Overrides

Skills can receive environment variables from config:

```typescript
// From src/agents/skills/env-overrides.ts
function applySkillEnvOverrides({ skills, config }) {
  for (const entry of skills) {
    const skillConfig = resolveSkillConfig(config, skillKey);
    
    // Apply env overrides
    if (skillConfig?.env) {
      for (const [envKey, envValue] of Object.entries(skillConfig.env)) {
        if (!process.env[envKey]) {
          process.env[envKey] = envValue;
        }
      }
    }

    // Apply apiKey to primaryEnv
    const primaryEnv = entry.metadata?.primaryEnv;
    if (primaryEnv && skillConfig?.apiKey && !process.env[primaryEnv]) {
      process.env[primaryEnv] = skillConfig.apiKey;
    }
  }
}
```

### 8.4 Per-Route Skill Filtering

Skills can be filtered per messaging route/channel:

```typescript
// Telegram groups, Discord channels, etc. can specify:
skills: string[]  // Only these skills available in this route
```

---

## 9. Bundled Skills Inventory

OpenClaw ships with 53 bundled skills:

### Productivity
| Skill | Description | Requirements |
|-------|-------------|--------------|
| `1password` | 1Password CLI integration | `op` binary |
| `apple-notes` | Apple Notes access | macOS |
| `apple-reminders` | Apple Reminders access | macOS |
| `bear-notes` | Bear notes app | macOS |
| `notion` | Notion API | API key |
| `obsidian` | Obsidian vault | File access |
| `things-mac` | Things 3 task manager | macOS |
| `trello` | Trello boards | API key |

### Communication
| Skill | Description | Requirements |
|-------|-------------|--------------|
| `bluebubbles` | BlueBubbles iMessage API | BlueBubbles server |
| `blucli` | BlueBubbles CLI | `blucli` binary |
| `discord` | Discord messaging | Bot token |
| `imsg` | iMessage access | macOS |
| `slack` | Slack workspace | API token |
| `wacli` | WhatsApp CLI | `wacli` binary |

### Google Workspace
| Skill | Description | Requirements |
|-------|-------------|--------------|
| `gog` | Gmail, Calendar, Drive, Contacts, Sheets, Docs | `gog` binary + OAuth |

### Development
| Skill | Description | Requirements |
|-------|-------------|--------------|
| `coding-agent` | Meta coding instructions | None |
| `github` | GitHub CLI | `gh` binary |
| `tmux` | Terminal multiplexer | `tmux` binary |

### Media
| Skill | Description | Requirements |
|-------|-------------|--------------|
| `camsnap` | Camera capture | `camsnap` binary |
| `gifgrep` | GIF search | `gifgrep` binary |
| `nano-pdf` | PDF processing | `nano-pdf` binary |
| `openai-whisper` | Local Whisper transcription | `whisper` binary |
| `openai-whisper-api` | Whisper API | API key |
| `peekaboo` | macOS UI automation | macOS + `peekaboo` binary |
| `songsee` | Music recognition | `songsee` binary |
| `spotify-player` | Spotify CLI | `spotify_player` binary |
| `video-frames` | Video frame extraction | `ffmpeg` binary |

### AI/ML
| Skill | Description | Requirements |
|-------|-------------|--------------|
| `gemini` | Google Gemini API | API key |
| `nano-banana-pro` | Banana image generation | API key |
| `openai-image-gen` | DALL-E image generation | API key |
| `oracle` | Multi-model query | Various |
| `summarize` | Text summarization | LLM access |

### Utilities
| Skill | Description | Requirements |
|-------|-------------|--------------|
| `canvas` | Canvas LMS | API key |
| `clawhub` | Skill hub management | None |
| `local-places` | Google Places API | API key |
| `model-usage` | Model usage tracking | None |
| `openhue` | Philips Hue | Bridge access |
| `session-logs` | Session logging | None |
| `sherpa-onnx-tts` | Local TTS | `sherpa-onnx` |
| `skill-creator` | Create new skills | None |
| `sonoscli` | Sonos control | `sonos` binary |
| `weather` | Weather lookup | `curl` binary |

### Specialized
| Skill | Description | Requirements |
|-------|-------------|--------------|
| `bird` | Bird scooter | API access |
| `blogwatcher` | Blog monitoring | None |
| `eightctl` | EightSleep control | API key |
| `food-order` | Food ordering | Various |
| `goplaces` | Location services | None |
| `healthcheck` | Health monitoring | None |
| `himalaya` | Email CLI | `himalaya` binary |
| `mcporter` | Minecraft | None |
| `ordercli` | Order management | `ordercli` binary |
| `sag` | Streaming analytics | None |
| `voice-call` | Voice calls | Various |

---

## 10. Skill Commands (Slash Commands)

### 10.1 Command Generation

Skills automatically become slash commands:

```typescript
function buildWorkspaceSkillCommandSpecs(workspaceDir, opts): SkillCommandSpec[] {
  const eligible = filterSkillEntries(...);
  const userInvocable = eligible.filter(
    (entry) => entry.invocation?.userInvocable !== false
  );
  
  // Sanitize names for command use
  for (const entry of userInvocable) {
    const base = sanitizeSkillCommandName(entry.skill.name);
    const unique = resolveUniqueSkillCommandName(base, used);
    // ...
  }
}
```

### 10.2 Command Name Sanitization

- Max length: 32 characters
- Lowercase alphanumeric + underscores only
- Deduplication with numeric suffixes

### 10.3 Direct Tool Dispatch

Skills can bypass LLM for direct tool invocation:

```yaml
---
name: exec-skill
command-dispatch: tool
command-tool: exec
command-arg-mode: raw
---
```

When user types `/exec-skill args`, the tool runs directly.

---

## 11. Skills Watcher (Live Refresh)

### 11.1 Watch Configuration

```typescript
// From src/agents/skills/refresh.ts
function ensureSkillsWatcher({ workspaceDir, config }) {
  const watchEnabled = config?.skills?.load?.watch !== false;
  const debounceMs = config?.skills?.load?.watchDebounceMs ?? 250;
  
  const watchPaths = [
    path.join(workspaceDir, "skills"),
    path.join(CONFIG_DIR, "skills"),
    ...extraDirs
  ];

  const watcher = chokidar.watch(watchPaths, {
    ignoreInitial: true,
    ignored: [
      /(^|[\\/])\.git([\\/]|$)/,
      /(^|[\\/])node_modules([\\/]|$)/,
      /(^|[\\/])dist([\\/]|$)/,
    ],
  });
}
```

### 11.2 Refresh Behavior

- Skills directories are watched for file changes
- Changes trigger debounced snapshot refresh (default 250ms)
- Ignored: `.git/`, `node_modules/`, `dist/`

---

## 12. Type Definitions

### Core Types

```typescript
// From @mariozechner/pi-coding-agent
type Skill = {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string;
};

// OpenClaw-specific entry with metadata
type SkillEntry = {
  skill: Skill;
  frontmatter: ParsedSkillFrontmatter;
  metadata?: OpenClawSkillMetadata;
  invocation?: SkillInvocationPolicy;
};

// Invocation control
type SkillInvocationPolicy = {
  userInvocable: boolean;           // Can be triggered via /command
  disableModelInvocation: boolean;  // Exclude from model prompt
};

// Command spec for slash commands
type SkillCommandSpec = {
  name: string;
  skillName: string;
  description: string;
  dispatch?: SkillCommandDispatchSpec;
};

// Session snapshot
type SkillSnapshot = {
  prompt: string;
  skills: Array<{ name: string; primaryEnv?: string }>;
  resolvedSkills?: Skill[];
  version?: number;
};
```

---

## 13. Source Files Reference

| File | Purpose |
|------|---------|
| `src/agents/skills/types.ts` | Core type definitions |
| `src/agents/skills/workspace.ts` | Skill loading and prompt building |
| `src/agents/skills/config.ts` | Eligibility checking and config resolution |
| `src/agents/skills/frontmatter.ts` | Frontmatter parsing |
| `src/agents/skills/bundled-dir.ts` | Bundled skills directory resolution |
| `src/agents/skills/refresh.ts` | Skills watcher for live refresh |
| `src/agents/skills/env-overrides.ts` | Environment variable injection |
| `src/agents/skills/serialize.ts` | Serialization helpers |
| `src/agents/skills/plugin-skills.ts` | Plugin skill directory resolution |
| `src/config/types.skills.ts` | Config type definitions |
| `skills/` | Bundled skills directory (53 skills) |

---

## Nexus Considerations

### What to Adopt
- Progressive disclosure (metadata → body → resources)
- Requirements system for conditional availability
- Install specs for dependency management
- Watcher for live refresh

### What to Redesign
- Metadata key should be `nexus` not `openclaw`
- Add skill types (guide/tool/connector) as first-class frontmatter
- Add skill status tracking (`ready`, `needs-setup`, `broken`)
- Integrate with Nexus credential system
- Add CLI credential verification per skill

### Example Nexus Skill Format

```yaml
---
name: gog
type: tool
description: Google Workspace CLI for Gmail, Calendar, Drive...
homepage: https://gogcli.sh
emoji: 🎮
os: [darwin, linux]
requires:
  bins: [gog]
  credentials: [google-oauth]
install:
  - kind: brew
    formula: steipete/tap/gogcli
---
```

---

*This document captures the complete OpenClaw skills system for reference in Nexus development.*
