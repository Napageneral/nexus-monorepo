# Upstream Skills System Reference

**Status:** REFERENCE DOCUMENT  
**Last Updated:** 2026-01-22  
**Source:** Clawdbot upstream analysis

---

This document captures the complete implementation of the skills system in upstream Clawdbot. It serves as the definitive reference for understanding how skills work and guiding Nexus fork development.

## Table of Contents

1. [Skills Storage & Discovery](#1-skills-storage--discovery)
2. [SKILL.md Format](#2-skillmd-format)
3. [Skills Injection into Agent Context](#3-skills-injection-into-agent-context)
4. [Skills Configuration](#4-skills-configuration)
5. [ClawdHub (Skill Hub)](#5-clawdhub-skill-hub)
6. [Bundled Skills](#6-bundled-skills)
7. [Skills CLI](#7-skills-cli)
8. [Dependencies & Requirements](#8-dependencies--requirements)
9. [Skills Install System](#9-skills-install-system)
10. [Gateway/Server Integration](#10-gatewayserver-integration)

---

## 1. Skills Storage & Discovery

### 1.1 File Locations

Skills are loaded from multiple directories in a defined precedence order (lowest to highest):

```typescript
// From src/agents/skills/workspace.ts
const loadSkillEntries = (workspaceDir, opts) => {
  const managedSkillsDir = opts?.managedSkillsDir ?? path.join(CONFIG_DIR, "skills");
  const workspaceSkillsDir = path.join(workspaceDir, "skills");
  const bundledSkillsDir = opts?.bundledSkillsDir ?? resolveBundledSkillsDir();
  const extraDirs = opts?.config?.skills?.load?.extraDirs ?? [];

  // Precedence: extra < bundled < managed < workspace
  // Later sources override earlier sources with same skill name
}
```

**Directory Precedence (lowest → highest):**

| Priority | Source | Location | Description |
|----------|--------|----------|-------------|
| 1 (lowest) | Extra | `config.skills.load.extraDirs[]` | User-configured additional directories |
| 2 | Bundled | `<packageRoot>/skills/` | Ships with Clawdbot |
| 3 | Managed | `~/.clawdbot/skills/` | ClawdHub installed skills |
| 4 (highest) | Workspace | `<workspaceDir>/skills/` | Per-workspace overrides |

### 1.2 Bundled Skills Directory Resolution

```typescript
// From src/agents/skills/bundled-dir.ts
export function resolveBundledSkillsDir(): string | undefined {
  // 1. Environment override
  const override = process.env.CLAWDBOT_BUNDLED_SKILLS_DIR?.trim();
  if (override) return override;

  // 2. Compiled binary: sibling `skills/` next to executable
  const execDir = path.dirname(process.execPath);
  const sibling = path.join(execDir, "skills");
  if (fs.existsSync(sibling)) return sibling;

  // 3. npm/dev: relative to module `<packageRoot>/skills`
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(moduleDir, "..", "..", "..");
  const candidate = path.join(root, "skills");
  if (fs.existsSync(candidate)) return candidate;

  return undefined;
}
```

### 1.3 Skill Discovery Process

Skills are discovered by scanning each directory for subdirectories containing `SKILL.md`:

```typescript
// Uses @mariozechner/pi-coding-agent loadSkillsFromDir
const loadSkills = (params: { dir: string; source: string }): Skill[] => {
  const loaded = loadSkillsFromDir(params);
  // Returns array of Skill objects with:
  // - name, description, filePath, baseDir, source
};
```

**Skill Directory Structure:**

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

### 1.4 Skills Watcher (Live Refresh)

Skills directories are watched for changes with debounced refresh:

```typescript
// From src/agents/skills/refresh.ts
export function ensureSkillsWatcher(params: { 
  workspaceDir: string; 
  config?: ClawdbotConfig 
}) {
  const watchEnabled = params.config?.skills?.load?.watch !== false;
  const debounceMs = params.config?.skills?.load?.watchDebounceMs ?? 250;
  
  const watchPaths = [
    path.join(workspaceDir, "skills"),
    path.join(CONFIG_DIR, "skills"),
    ...extraDirs
  ];

  // Uses chokidar with ignored patterns
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

---

## 2. SKILL.md Format

### 2.1 Core Frontmatter Schema

SKILL.md files use YAML frontmatter with the following schema:

```yaml
---
name: skill-name                    # Required - unique identifier
description: |                      # Required - triggers skill selection
  Brief description of what the skill does and when to use it.
homepage: https://example.com       # Optional - tool homepage
metadata: {"clawdbot": {...}}       # Optional - Clawdbot-specific metadata (JSON)
---

# Skill Title

Instructions and documentation...
```

### 2.2 Standard Frontmatter Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | Yes | string | Unique skill identifier (lowercase, hyphens) |
| `description` | Yes | string | Triggers skill selection - describe what & when |
| `homepage` | No | string | URL to tool/documentation homepage |
| `metadata` | No | JSON string | Clawdbot-specific metadata (see below) |

### 2.3 Clawdbot Metadata Schema

The `metadata` field contains a JSON object with a `clawdbot` key:

```typescript
// From src/agents/skills/types.ts
export type ClawdbotSkillMetadata = {
  always?: boolean;           // Always include, ignore requirements
  skillKey?: string;          // Override config key (defaults to name)
  primaryEnv?: string;        // Primary env var for API key
  emoji?: string;             // Display emoji
  homepage?: string;          // Alternate homepage location
  os?: string[];              // Platform restrictions: "darwin", "linux", "win32"
  requires?: {
    bins?: string[];          // Required binaries on PATH
    anyBins?: string[];       // At least one must be present
    env?: string[];           // Required environment variables
    config?: string[];        // Required config paths (e.g., "browser.enabled")
  };
  install?: SkillInstallSpec[]; // Installation options (see section 9)
};
```

### 2.4 Skill Invocation Policy

Additional frontmatter fields control how skills can be triggered:

```typescript
// From src/agents/skills/frontmatter.ts
export type SkillInvocationPolicy = {
  userInvocable: boolean;           // Default: true - users can trigger via /command
  disableModelInvocation: boolean;  // Default: false - exclude from model prompt
};

// Parsed from frontmatter:
// user-invocable: yes/no/true/false
// disable-model-invocation: yes/no/true/false
```

### 2.5 Command Dispatch (Slash Commands)

Skills can define direct tool dispatch for slash commands:

```yaml
---
name: my-skill
description: ...
command-dispatch: tool           # Enable direct tool dispatch
command-tool: exec               # Tool to invoke
command-arg-mode: raw            # How to forward args (only "raw" supported)
---
```

### 2.6 Example SKILL.md Files

**Simple Tool Skill:**

```yaml
---
name: weather
description: Get current weather and forecasts (no API key required).
homepage: https://wttr.in/:help
metadata: {"clawdbot":{"emoji":"🌤️","requires":{"bins":["curl"]}}}
---

# Weather

Two free services, no API keys needed.

## wttr.in (primary)

Quick one-liner:
```bash
curl -s "wttr.in/London?format=3"
```
...
```

**Complex Tool Skill with Install:**

```yaml
---
name: gog
description: Google Workspace CLI for Gmail, Calendar, Drive, Contacts, Sheets, and Docs.
homepage: https://gogcli.sh
metadata: {"clawdbot":{
  "emoji":"🎮",
  "requires":{"bins":["gog"]},
  "install":[{
    "id":"brew",
    "kind":"brew",
    "formula":"steipete/tap/gogcli",
    "bins":["gog"],
    "label":"Install gog (brew)"
  }]
}}
---
```

**Platform-Restricted Skill:**

```yaml
---
name: peekaboo
description: Capture and automate macOS UI with the Peekaboo CLI.
homepage: https://peekaboo.boo
metadata: {"clawdbot":{
  "emoji":"👀",
  "os":["darwin"],
  "requires":{"bins":["peekaboo"]},
  "install":[{
    "id":"brew",
    "kind":"brew",
    "formula":"steipete/tap/peekaboo",
    "bins":["peekaboo"],
    "label":"Install Peekaboo (brew)"
  }]
}}
---
```

### 2.7 Frontmatter Parsing

Frontmatter is parsed with fallback strategies:

```typescript
// From src/markdown/frontmatter.ts
export function parseFrontmatterBlock(content: string): ParsedFrontmatter {
  // Must start with ---
  if (!normalized.startsWith("---")) return {};
  
  // Find closing ---
  const endIndex = normalized.indexOf("\n---", 3);
  const block = normalized.slice(4, endIndex);

  // Try YAML parsing, fall back to line-by-line
  const yamlParsed = parseYamlFrontmatter(block);
  const lineParsed = parseLineFrontmatter(block);
  
  // Merge: YAML values + JSON strings from line parsing
  const merged = { ...yamlParsed };
  for (const [key, value] of Object.entries(lineParsed)) {
    if (value.startsWith("{") || value.startsWith("[")) {
      merged[key] = value;  // Preserve JSON strings
    }
  }
  return merged;
}
```

---

## 3. Skills Injection into Agent Context

### 3.1 Skills Snapshot

Skills are captured into a snapshot for consistent session state:

```typescript
// From src/agents/skills/types.ts
export type SkillSnapshot = {
  prompt: string;                                    // Formatted skills prompt
  skills: Array<{ name: string; primaryEnv?: string }>;  // Skill metadata
  resolvedSkills?: Skill[];                          // Full skill objects
  version?: number;                                  // Snapshot version for cache invalidation
};
```

### 3.2 Building Skills Prompt

Skills are formatted for the system prompt using the pi-coding-agent library:

```typescript
// From src/agents/skills/workspace.ts
import { formatSkillsForPrompt } from "@mariozechner/pi-coding-agent";

export function buildWorkspaceSkillSnapshot(workspaceDir, opts): SkillSnapshot {
  const skillEntries = loadSkillEntries(workspaceDir, opts);
  const eligible = filterSkillEntries(skillEntries, opts?.config, opts?.skillFilter);
  
  // Filter out skills with disableModelInvocation: true
  const promptEntries = eligible.filter(
    (entry) => entry.invocation?.disableModelInvocation !== true
  );
  
  const resolvedSkills = promptEntries.map((entry) => entry.skill);
  const prompt = formatSkillsForPrompt(resolvedSkills);
  
  return {
    prompt,
    skills: eligible.map((entry) => ({
      name: entry.skill.name,
      primaryEnv: entry.clawdbot?.primaryEnv,
    })),
    resolvedSkills,
    version: opts?.snapshotVersion,
  };
}
```

### 3.3 System Prompt Integration

Skills are injected into the system prompt with usage guidance:

```typescript
// From src/agents/system-prompt.ts
function buildSkillsSection(params: {
  skillsPrompt?: string;
  isMinimal: boolean;
  readToolName: string;
}) {
  if (params.isMinimal) return [];
  const trimmed = params.skillsPrompt?.trim();
  if (!trimmed) return [];
  
  return [
    "## Skills (mandatory)",
    "Before replying: scan <available_skills> <description> entries.",
    `- If exactly one skill clearly applies: read its SKILL.md at <location> with \`${params.readToolName}\`, then follow it.`,
    "- If multiple could apply: choose the most specific one, then read/follow it.",
    "- If none clearly apply: do not read any SKILL.md.",
    "Constraints: never read more than one skill up front; only read after selecting.",
    trimmed,  // The formatted skills list
    "",
  ];
}
```

### 3.4 Skills Prompt Format (from pi-coding-agent)

The `formatSkillsForPrompt` function produces XML-like structured output:

```xml
<available_skills>
<skill>
<name>weather</name>
<description>Get current weather and forecasts (no API key required).</description>
<location>/path/to/skills/weather/SKILL.md</location>
</skill>
<skill>
<name>gog</name>
<description>Google Workspace CLI for Gmail, Calendar, Drive, Contacts, Sheets, and Docs.</description>
<location>/path/to/skills/gog/SKILL.md</location>
</skill>
</available_skills>
```

### 3.5 Progressive Disclosure

Skills use a three-level loading system:

1. **Metadata (always in context):** Name + description (~100 words per skill)
2. **SKILL.md body:** Loaded when skill triggers (<5k words recommended)
3. **Bundled resources:** Loaded as needed by agent (scripts/, references/, assets/)

---

## 4. Skills Configuration

### 4.1 Config Schema

```typescript
// From src/config/types.skills.ts
export type SkillConfig = {
  enabled?: boolean;                    // Enable/disable specific skill
  apiKey?: string;                      // API key for primaryEnv
  env?: Record<string, string>;         // Additional env overrides
  config?: Record<string, unknown>;     // Skill-specific config
};

export type SkillsLoadConfig = {
  extraDirs?: string[];                 // Additional skill directories
  watch?: boolean;                      // Watch for changes (default: true)
  watchDebounceMs?: number;             // Debounce interval (default: 250)
};

export type SkillsInstallConfig = {
  preferBrew?: boolean;                 // Prefer Homebrew for installs
  nodeManager?: "npm" | "pnpm" | "yarn" | "bun";  // Node package manager
};

export type SkillsConfig = {
  allowBundled?: string[];              // Bundled skill allowlist
  load?: SkillsLoadConfig;
  install?: SkillsInstallConfig;
  entries?: Record<string, SkillConfig>;  // Per-skill config by skillKey
};
```

### 4.2 Zod Schema

```typescript
// From src/config/zod-schema.ts
skills: z.object({
  allowBundled: z.array(z.string()).optional(),
  load: z.object({
    extraDirs: z.array(z.string()).optional(),
    watch: z.boolean().optional(),
    watchDebounceMs: z.number().int().min(0).optional(),
  }).strict().optional(),
  install: z.object({
    preferBrew: z.boolean().optional(),
    nodeManager: z.union([
      z.literal("npm"), 
      z.literal("pnpm"), 
      z.literal("yarn"), 
      z.literal("bun")
    ]).optional(),
  }).strict().optional(),
  entries: z.record(z.string(), z.object({
    enabled: z.boolean().optional(),
    apiKey: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  }).strict()).optional(),
}).strict().optional()
```

### 4.3 Example Configuration

```yaml
# clawdbot.yaml
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

### 4.4 Per-Route Skill Filtering

Skills can be filtered per messaging route/channel:

```typescript
// From src/config/zod-schema.providers-core.ts
// Telegram groups, topics, Discord channels, etc. can specify:
skills: z.array(z.string()).optional()  // Only these skills available in this route
```

### 4.5 Skill Eligibility Resolution

```typescript
// From src/agents/skills/config.ts
export function shouldIncludeSkill(params: {
  entry: SkillEntry;
  config?: ClawdbotConfig;
  eligibility?: SkillEligibilityContext;
}): boolean {
  const { entry, config, eligibility } = params;
  const skillKey = resolveSkillKey(entry.skill, entry);
  const skillConfig = resolveSkillConfig(config, skillKey);

  // Explicit disable check
  if (skillConfig?.enabled === false) return false;
  
  // Bundled allowlist check
  if (!isBundledSkillAllowed(entry, allowBundled)) return false;
  
  // OS platform check
  if (osList.length > 0 && !osList.includes(process.platform)) return false;
  
  // Always-include override
  if (entry.clawdbot?.always === true) return true;

  // Binary requirements
  for (const bin of requiredBins) {
    if (!hasBinary(bin) && !eligibility?.remote?.hasBin?.(bin)) return false;
  }
  
  // anyBins requirement (at least one)
  if (requiredAnyBins.length > 0) {
    const anyFound = requiredAnyBins.some(hasBinary) || 
                     eligibility?.remote?.hasAnyBin?.(requiredAnyBins);
    if (!anyFound) return false;
  }

  // Environment variable requirements
  for (const envName of requiredEnv) {
    if (!process.env[envName] && 
        !skillConfig?.env?.[envName] &&
        !(skillConfig?.apiKey && entry.clawdbot?.primaryEnv === envName)) {
      return false;
    }
  }

  // Config path requirements
  for (const configPath of requiredConfig) {
    if (!isConfigPathTruthy(config, configPath)) return false;
  }

  return true;
}
```

### 4.6 Environment Overrides

Skills can receive environment variables from config:

```typescript
// From src/agents/skills/env-overrides.ts
export function applySkillEnvOverrides(params: { 
  skills: SkillEntry[]; 
  config?: ClawdbotConfig 
}) {
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
    const primaryEnv = entry.clawdbot?.primaryEnv;
    if (primaryEnv && skillConfig?.apiKey && !process.env[primaryEnv]) {
      process.env[primaryEnv] = skillConfig.apiKey;
    }
  }
}
```

---

## 5. ClawdHub (Skill Hub)

### 5.1 Overview

ClawdHub is a skill distribution platform at https://clawdhub.com. Skills can be:
- Searched and discovered
- Installed with version pinning
- Updated with hash-based matching
- Published by users

### 5.2 ClawdHub CLI

```bash
# Installation
npm i -g clawdhub

# Authentication (for publishing)
clawdhub login
clawdhub whoami

# Search skills
clawdhub search "postgres backups"

# Install skills
clawdhub install my-skill
clawdhub install my-skill --version 1.2.3

# Update skills
clawdhub update my-skill
clawdhub update my-skill --version 1.2.3
clawdhub update --all
clawdhub update my-skill --force
clawdhub update --all --no-input --force

# List installed skills
clawdhub list

# Publish skills
clawdhub publish ./my-skill \
  --slug my-skill \
  --name "My Skill" \
  --version 1.2.0 \
  --changelog "Fixes + docs"
```

### 5.3 Configuration

```bash
# Environment variables
CLAWDHUB_REGISTRY=https://clawdhub.com    # Override registry
CLAWDHUB_WORKDIR=./skills                  # Override install directory

# CLI flags
--registry <url>     # Override registry
--workdir <path>     # Override working directory
--dir <path>         # Override install directory
```

### 5.4 Update Mechanism

The update command uses content hashing to determine version matches:
1. Hash local skill files
2. Resolve matching version from registry
3. Upgrade to latest (or specified version)
4. `--force` skips hash matching

---

## 6. Bundled Skills

### 6.1 Location

Bundled skills ship with Clawdbot in the `skills/` directory at the repository root.

### 6.2 Available Bundled Skills

| Category | Skills |
|----------|--------|
| **Productivity** | 1password, apple-notes, apple-reminders, bear-notes, notion, obsidian, things-mac, trello |
| **Communication** | bluebubbles, blucli, discord, imsg, slack, wacli |
| **Google** | gog (Gmail, Calendar, Drive, Contacts, Sheets, Docs) |
| **Development** | coding-agent, github, tmux |
| **Media** | camsnap, gifgrep, nano-pdf, openai-whisper, openai-whisper-api, peekaboo, songsee, spotify-player, video-frames |
| **AI/ML** | gemini, nano-banana-pro, openai-image-gen, oracle, summarize |
| **Utilities** | canvas, clawdhub, local-places, model-usage, openhue, session-logs, sherpa-onnx-tts, skill-creator, sonoscli, weather |
| **Specialized** | bird, blogwatcher, eightctl, food-order, goplaces, himalaya, mcporter, ordercli, sag, voice-call |

### 6.3 Bundled vs User Skills

| Aspect | Bundled | User (Managed/Workspace) |
|--------|---------|--------------------------|
| Location | `<package>/skills/` | `~/.clawdbot/skills/` or `<workspace>/skills/` |
| Updates | With Clawdbot updates | Via ClawdHub or manual |
| Override | Can be overridden by user skills | Final precedence |
| Allowlist | Subject to `config.skills.allowBundled` | Always allowed |

---

## 7. Skills CLI

### 7.1 Commands

```bash
# List all skills
clawdbot skills list
clawdbot skills list --json
clawdbot skills list --eligible        # Only ready-to-use skills
clawdbot skills list --verbose         # Include missing requirements

# Get skill info
clawdbot skills info <name>
clawdbot skills info <name> --json

# Check skills status
clawdbot skills check
clawdbot skills check --json
```

### 7.2 List Output

```
Skills (12/45 ready)
┌──────────────┬────────────────────┬─────────────────────────────────────────┬──────────────────┐
│ Status       │ Skill              │ Description                             │ Source           │
├──────────────┼────────────────────┼─────────────────────────────────────────┼──────────────────┤
│ ✓ ready      │ 🌤️ weather         │ Get current weather and forecasts...    │ clawdbot-bundled │
│ ✓ ready      │ 🎮 gog             │ Google Workspace CLI for Gmail...       │ clawdbot-bundled │
│ ✗ missing    │ 👀 peekaboo        │ Capture and automate macOS UI...        │ clawdbot-bundled │
│ ⏸ disabled   │ 📦 custom-skill    │ My custom skill                         │ clawdbot-workspace│
└──────────────┴────────────────────┴─────────────────────────────────────────┴──────────────────┘

Tip: use `npx clawdhub` to search, install, and sync skills.
```

### 7.3 Info Output

```
👀 peekaboo ✗ Missing requirements

Capture and automate macOS UI with the Peekaboo CLI.

Details:
  Source: clawdbot-bundled
  Path: /path/to/skills/peekaboo/SKILL.md
  Homepage: https://peekaboo.boo

Requirements:
  Binaries: ✗ peekaboo
  OS: ✓ darwin

Install options:
  → Install Peekaboo (brew)
```

### 7.4 Check Output

```
Skills Status Check

Total: 45
✓ Eligible: 12
⏸ Disabled: 2
🚫 Blocked by allowlist: 5
✗ Missing requirements: 26

Ready to use:
  🌤️ weather
  🎮 gog
  📝 apple-notes
  ...

Missing requirements:
  👀 peekaboo (bins: peekaboo)
  🔐 1password (bins: op)
  ...
```

---

## 8. Dependencies & Requirements

### 8.1 Requirement Types

```typescript
requires: {
  bins: string[];      // All must be on PATH
  anyBins: string[];   // At least one must be on PATH
  env: string[];       // All env vars must be set
  config: string[];    // All config paths must be truthy
}
os: string[];          // Platform must match: "darwin", "linux", "win32"
```

### 8.2 Binary Check

```typescript
// From src/agents/skills/config.ts
export function hasBinary(bin: string): boolean {
  const pathEnv = process.env.PATH ?? "";
  const parts = pathEnv.split(path.delimiter).filter(Boolean);
  for (const part of parts) {
    const candidate = path.join(part, bin);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      // keep scanning
    }
  }
  return false;
}
```

### 8.3 Config Path Check

```typescript
// From src/agents/skills/config.ts
const DEFAULT_CONFIG_VALUES: Record<string, boolean> = {
  "browser.enabled": true,
};

export function isConfigPathTruthy(config: ClawdbotConfig | undefined, pathStr: string): boolean {
  const value = resolveConfigPath(config, pathStr);
  if (value === undefined && pathStr in DEFAULT_CONFIG_VALUES) {
    return DEFAULT_CONFIG_VALUES[pathStr] === true;
  }
  return isTruthy(value);
}
```

### 8.4 Remote Node Eligibility

For distributed setups, remote nodes can provide binaries:

```typescript
export type SkillEligibilityContext = {
  remote?: {
    platforms: string[];
    hasBin: (bin: string) => boolean;
    hasAnyBin: (bins: string[]) => boolean;
    note?: string;
  };
};
```

---

## 9. Skills Install System

### 9.1 Install Spec Schema

```typescript
// From src/agents/skills/types.ts
export type SkillInstallSpec = {
  id?: string;                        // Unique installer ID
  kind: "brew" | "node" | "go" | "uv" | "download";
  label?: string;                     // Display label
  bins?: string[];                    // Binaries this installs
  os?: string[];                      // Platform restrictions
  
  // Kind-specific:
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

### 9.2 Install Commands

```typescript
// From src/agents/skills-install.ts
function buildInstallCommand(spec: SkillInstallSpec, prefs: SkillsInstallPreferences) {
  switch (spec.kind) {
    case "brew":
      return { argv: ["brew", "install", spec.formula] };
    case "node":
      // Uses prefs.nodeManager: npm/pnpm/yarn/bun
      return { argv: ["npm", "install", "-g", spec.package] };
    case "go":
      return { argv: ["go", "install", spec.module] };
    case "uv":
      return { argv: ["uv", "tool", "install", spec.package] };
    case "download":
      // Handled separately with fetch + extract
  }
}
```

### 9.3 Download Install

For `kind: "download"`:

1. Fetch file from URL
2. Detect archive type (tar.gz, zip, etc.)
3. Extract to target directory
4. Handle `stripComponents` for tar archives

```typescript
async function installDownloadSpec(params: {
  entry: SkillEntry;
  spec: SkillInstallSpec;
  timeoutMs: number;
}): Promise<SkillInstallResult> {
  const targetDir = resolveDownloadTargetDir(entry, spec);
  await downloadFile(url, archivePath, timeoutMs);
  
  if (shouldExtract) {
    await extractArchive({
      archivePath,
      archiveType,  // tar.gz, zip, etc.
      targetDir,
      stripComponents: spec.stripComponents,
      timeoutMs,
    });
  }
}
```

### 9.4 Install Preferences

```typescript
// From src/agents/skills.ts
export function resolveSkillsInstallPreferences(config?: ClawdbotConfig) {
  return {
    preferBrew: config?.skills?.install?.preferBrew ?? true,
    nodeManager: config?.skills?.install?.nodeManager ?? "npm",
  };
}
```

---

## 10. Gateway/Server Integration

### 10.1 Gateway Methods

```typescript
// From src/gateway/server-methods/skills.ts
export const skillsHandlers: GatewayRequestHandlers = {
  "skills.status": ({ params, respond }) => {
    // Returns SkillStatusReport with all skills and their status
    const report = buildWorkspaceSkillStatus(workspaceDir, { config, eligibility });
    respond(true, report, undefined);
  },

  "skills.bins": ({ params, respond }) => {
    // Returns all binaries required by skills
    const bins = collectSkillBins(entries);
    respond(true, { bins }, undefined);
  },

  "skills.install": async ({ params, respond }) => {
    // Installs a skill's dependency
    const result = await installSkill({
      workspaceDir,
      skillName: params.name,
      installId: params.installId,
      timeoutMs: params.timeoutMs,
      config,
    });
    respond(result.ok, result, ...);
  },

  "skills.update": async ({ params, respond }) => {
    // Updates skill config (enabled, apiKey, env)
    const nextConfig = {
      ...cfg,
      skills: {
        ...skills,
        entries: {
          ...entries,
          [params.skillKey]: {
            enabled: params.enabled,
            apiKey: params.apiKey,
            env: params.env,
          },
        },
      },
    };
    await writeConfigFile(nextConfig);
    respond(true, { ok: true, skillKey, config: current }, undefined);
  },
};
```

### 10.2 UI Integration

The web UI provides a skills management interface:

- List all skills with status
- Filter by name/description
- Enable/disable skills
- Install missing dependencies
- Configure API keys

```typescript
// From ui/src/ui/controllers/skills.ts
export type SkillsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  skillsLoading: boolean;
  skillsReport: SkillStatusReport | null;
  skillsError: string | null;
  skillsBusyKey: string | null;
  skillEdits: Record<string, string>;
  skillMessages: SkillMessageMap;
};
```

---

## Appendix A: Type Definitions Summary

```typescript
// Core skill type (from pi-coding-agent)
type Skill = {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string;
};

// Clawdbot skill entry with metadata
type SkillEntry = {
  skill: Skill;
  frontmatter: ParsedSkillFrontmatter;
  clawdbot?: ClawdbotSkillMetadata;
  invocation?: SkillInvocationPolicy;
};

// Skill status for CLI/UI
type SkillStatusEntry = {
  name: string;
  description: string;
  source: string;
  filePath: string;
  baseDir: string;
  skillKey: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: { bins, anyBins, env, config, os };
  missing: { bins, anyBins, env, config, os };
  configChecks: SkillStatusConfigCheck[];
  install: SkillInstallOption[];
};

// Skills snapshot for session
type SkillSnapshot = {
  prompt: string;
  skills: Array<{ name: string; primaryEnv?: string }>;
  resolvedSkills?: Skill[];
  version?: number;
};
```

---

## Appendix B: File Reference

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
| `src/agents/skills-status.ts` | Status report building |
| `src/agents/skills-install.ts` | Dependency installation |
| `src/agents/skills.ts` | Public exports |
| `src/agents/system-prompt.ts` | System prompt building with skills |
| `src/config/types.skills.ts` | Config type definitions |
| `src/config/zod-schema.ts` | Config validation schema |
| `src/cli/skills-cli.ts` | CLI commands |
| `src/gateway/server-methods/skills.ts` | Gateway API handlers |
| `src/markdown/frontmatter.ts` | Generic frontmatter parsing |

---

*This document provides a comprehensive reference for the upstream Clawdbot skills system. Use it to guide Nexus fork development and ensure compatibility with upstream conventions.*
