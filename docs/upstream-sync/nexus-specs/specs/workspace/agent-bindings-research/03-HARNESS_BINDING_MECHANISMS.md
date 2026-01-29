# Harness Binding Mechanisms Research

This document catalogs the context injection mechanisms, file locations, and configuration patterns for major AI coding agent harnesses. This research informs the Nexus binding strategy.

---

## Overview Matrix

| Harness | Rules/Instructions | Skills/Commands | Hooks | Config | Memory/Context |
|---------|-------------------|-----------------|-------|--------|----------------|
| **Cursor** | `.cursor/rules/`, `AGENTS.md` | `.cursor/skills/`, `.cursor/commands/` | `hooks.json` + scripts | User settings | Rules + Context files |
| **Claude Code** | `CLAUDE.md`, `.claude/rules/` | `.claude/skills/` | `settings.json` hooks | `settings.json`, `~/.claude.json` | `CLAUDE.md` hierarchy |
| **OpenCode** | `AGENTS.md`, `opencode.json` | `.opencode/skills/` | Plugins (event-based) | `opencode.json` | `AGENTS.md` hierarchy |
| **Codex** | `AGENTS.md`, `.codex/rules/` | `.codex/skills/` | N/A (rules-based) | `config.toml` | `AGENTS.md` hierarchy |

---

## 1. Cursor

### 1.1 Rules System

**Purpose**: System-level instructions that bundle prompts, scripts, and workflows.

#### Rule Types
| Type | Behavior | Frontmatter |
|------|----------|-------------|
| `Always Apply` | Every chat session | `alwaysApply: true` |
| `Apply Intelligently` | Agent decides based on description | `alwaysApply: false`, no globs |
| `Apply to Specific Files` | When file matches pattern | `globs: ["*.tsx"]` |
| `Apply Manually` | When @-mentioned | Manual invocation only |

#### File Locations

```
# Project Rules (version-controlled)
.cursor/rules/
├── react-patterns.mdc       # Rule with frontmatter
├── api-guidelines.md        # Simple markdown rule
└── frontend/
    └── components.md        # Organized in folders

# User Rules
# Configured in Cursor Settings → Rules
# Global to Cursor environment, used by Agent

# Team Rules (Team/Enterprise plans)
# Managed from Cursor dashboard
# Auto-synced to all team members

# AGENTS.md Alternative
AGENTS.md                    # Project root - simple markdown
subdirectory/AGENTS.md       # Nested - auto-applied when working in that dir
```

#### Rule File Format
```markdown
---
description: "Rule description for agent to decide relevance"
globs:
alwaysApply: false
---

Rule content here...
```

#### Key Behaviors
- Rules included at START of model context
- Team Rules > Project Rules > User Rules (precedence)
- Supports `@filename.ts` references to include files
- `.mdc` extension for rules with frontmatter
- Nested `AGENTS.md` support in subdirectories

---

### 1.2 Commands System

**Purpose**: Reusable workflows triggered with `/` prefix in chat.

#### File Locations
```
# Project Commands
.cursor/commands/
├── address-github-pr-comments.md
├── code-review-checklist.md
├── create-pr.md
└── run-all-tests-and-fix.md

# Global Commands
~/.cursor/commands/
├── personal-workflow.md
└── common-tasks.md

# Team Commands (Team/Enterprise)
# Created in Cursor Dashboard
# Auto-available to all team members
```

#### Command Format
```markdown
# Command Title

## Overview
Description of what the command does.

## Steps
1. Step one
2. Step two
...
```

#### Key Behaviors
- Plain Markdown files with descriptive names
- Triggered via `/command-name` in chat
- Parameters: anything typed after command name goes to prompt
- Team commands auto-sync to members

---

### 1.3 Skills System (Agent Skills Standard)

**Purpose**: Portable, version-controlled packages teaching agents domain-specific tasks.

#### File Locations
```
# Project-level
.cursor/skills/<skill-name>/SKILL.md
.claude/skills/<skill-name>/SKILL.md    # Claude compatibility
.codex/skills/<skill-name>/SKILL.md     # Codex compatibility

# User-level (global)
~/.cursor/skills/<skill-name>/SKILL.md
~/.claude/skills/<skill-name>/SKILL.md   # Claude compatibility
~/.codex/skills/<skill-name>/SKILL.md    # Codex compatibility
```

#### Skill Directory Structure
```
my-skill/
├── SKILL.md              # Main instructions (required)
├── scripts/              # Executable code
│   ├── deploy.sh
│   └── validate.py
├── references/           # Additional documentation
│   └── REFERENCE.md
└── assets/               # Static resources
    └── config-template.json
```

#### SKILL.md Format
```yaml
---
name: my-skill                    # Required: lowercase, hyphens only
description: What this skill does # Required: used for relevance
license: MIT                      # Optional
compatibility: cursor             # Optional
metadata:                         # Optional: arbitrary key-value
  audience: developers
disable-model-invocation: true    # Optional: only manual invocation
---

# Skill Instructions

Detailed instructions for the agent...
```

#### Key Behaviors
- Auto-discovered from skill directories at startup
- Agent decides relevance based on description
- Manual invocation via `/skill-name`
- Scripts can be in any language
- Progressive loading: only full content when invoked

---

### 1.4 Subagents System

**Purpose**: Specialized AI assistants for delegating tasks, operating in own context window.

#### File Locations
```
# Project subagents
.cursor/agents/<name>.md
.claude/agents/<name>.md    # Claude compatibility
.codex/agents/<name>.md     # Codex compatibility

# User subagents
~/.cursor/agents/<name>.md
~/.claude/agents/<name>.md
~/.codex/agents/<name>.md
```

#### Subagent Format
```yaml
---
name: security-auditor
description: When to use this subagent
model: inherit              # fast, inherit, or specific model ID
readonly: false             # Restrict write operations
is_background: false        # Run without blocking
---

You are a security expert auditing code...

## Instructions
1. Step one
2. Step two
```

#### Built-in Subagents
- `Explore`: Codebase search/analysis (faster model)
- `Bash`: Shell command execution
- `Browser`: Browser automation via MCP

#### Key Behaviors
- Each subagent has own context window
- Can run in parallel
- Can be resumed with agent ID
- Project subagents override user when names conflict

---

### 1.5 Hooks System

**Purpose**: User-defined shell commands executing at various lifecycle points.

#### File Locations
```
# User hooks
~/.cursor/hooks.json
~/.cursor/hooks/
    └── format.sh

# Project hooks
<project>/.cursor/hooks.json
<project>/.cursor/hooks/
    └── lint-check.py

# Enterprise hooks (managed)
/Library/Application Support/Cursor/hooks.json    # macOS
/etc/cursor/hooks.json                            # Linux/WSL
C:\ProgramData\Cursor\hooks.json                  # Windows
```

#### hooks.json Format
```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [{ "command": "./hooks/init.sh" }],
    "preToolUse": [
      {
        "matcher": "Shell|Read|Write",
        "hooks": [{ "type": "command", "command": "./validate.sh" }]
      }
    ],
    "postToolUse": [{ "command": "./hooks/audit.sh" }],
    "afterFileEdit": [
      {
        "matcher": "*.ts",
        "hooks": [{ "type": "command", "command": "npx prettier --write" }]
      }
    ],
    "beforeShellExecution": [
      {
        "matcher": "curl|wget",
        "hooks": [{ "type": "command", "command": "./approve-network.sh" }]
      }
    ],
    "stop": [{ "command": "./audit.sh", "loop_limit": 5 }]
  }
}
```

#### Hook Events
| Event | When | Can Block |
|-------|------|-----------|
| `sessionStart` | Session begins/resumes | Yes |
| `sessionEnd` | Session terminates | No |
| `preToolUse` | Before any tool | Yes |
| `postToolUse` | After tool succeeds | No |
| `postToolUseFailure` | After tool fails | No |
| `subagentStart` | Spawning subagent | Yes |
| `subagentStop` | Subagent finishes | Yes (followup) |
| `beforeShellExecution` | Before shell command | Yes |
| `afterShellExecution` | After shell command | No |
| `beforeMCPExecution` | Before MCP tool | Yes |
| `afterMCPExecution` | After MCP tool | No |
| `beforeReadFile` | Before file read | Yes |
| `afterFileEdit` | After file edit | No |
| `beforeSubmitPrompt` | User submits prompt | Yes |
| `preCompact` | Before compaction | No |
| `stop` | Agent finishes | Yes (followup) |
| `beforeTabFileRead` | Tab reads file | Yes |
| `afterTabFileEdit` | Tab edits file | No |

#### Hook Types
- `command`: Shell script execution
- `prompt`: LLM-evaluated condition

#### Environment Variables
- `CURSOR_PROJECT_DIR`: Workspace root
- `CURSOR_VERSION`: Cursor version
- `CURSOR_USER_EMAIL`: Authenticated user
- `CLAUDE_PROJECT_DIR`: Alias (Claude compatibility)
- `CLAUDE_ENV_FILE`: For SessionStart env persistence

#### Claude Code Hooks Compatibility
Cursor loads hooks from `.claude/settings.json` when third-party skills enabled.

---

## 2. Claude Code

### 2.1 Memory System (CLAUDE.md)

**Purpose**: Persistent instructions loaded at startup across sessions.

#### File Locations (Hierarchy)
```
# Managed policy (highest precedence)
/Library/Application Support/ClaudeCode/CLAUDE.md    # macOS
/etc/claude-code/CLAUDE.md                           # Linux
C:\Program Files\ClaudeCode\CLAUDE.md                # Windows

# Project memory (version-controlled)
./CLAUDE.md                     # Project root
./.claude/CLAUDE.md             # Alternative location

# Project rules (modular)
./.claude/rules/*.md            # Topic-specific rules

# User memory (global)
~/.claude/CLAUDE.md

# Project memory (local, gitignored)
./CLAUDE.local.md
```

#### CLAUDE.md Imports
```markdown
See @README for project overview.
Import @docs/git-instructions.md

# Individual Preferences (not in repo)
@~/.claude/my-project-instructions.md
```

#### Rules Directory Structure
```
.claude/rules/
├── frontend/
│   ├── react.md
│   └── styles.md
├── backend/
│   ├── api.md
│   └── database.md
└── general.md
```

#### Conditional Rules (Path-scoped)
```yaml
---
paths:
  - "src/api/**/*.ts"
  - "lib/**/*.ts"
---

# API Development Rules
Rules that only apply when working with matching files...
```

---

### 2.2 Settings System

**Purpose**: Configure permissions, environment, hooks, and tool behavior.

#### File Locations
```
# User settings
~/.claude/settings.json

# Project settings (version-controlled)
.claude/settings.json

# Project settings (local, gitignored)
.claude/settings.local.json

# Managed settings (enterprise)
/Library/Application Support/ClaudeCode/managed-settings.json
```

#### settings.json Format
```json
{
  "permissions": {
    "allow": ["Bash(npm run lint)", "Bash(npm run test *)"],
    "ask": ["Bash(git push *)"],
    "deny": ["WebFetch", "Read(./.env)", "Read(./secrets/**)"]
  },
  "env": {
    "NODE_ENV": "development"
  },
  "hooks": {
    "PreToolUse": [...],
    "PostToolUse": [...]
  }
}
```

#### Permission Precedence
1. Managed settings (highest)
2. Command line arguments
3. Local project settings
4. Shared project settings
5. User settings (lowest)

---

### 2.3 Skills System

**Purpose**: Extend Claude with task-specific capabilities via SKILL.md.

#### File Locations
```
# Personal skills
~/.claude/skills/<skill-name>/SKILL.md

# Project skills
.claude/skills/<skill-name>/SKILL.md
```

#### SKILL.md Format
```yaml
---
name: my-skill
description: What this skill does
disable-model-invocation: true    # Only manual /skill-name
user-invocable: false             # Only Claude can invoke
allowed-tools: Read, Grep, Glob   # Tool restrictions
model: fast                       # Model override
context: fork                     # Run in subagent
agent: Explore                    # Subagent type
hooks:                            # Skill-scoped hooks
  PreToolUse: [...]
---

# Skill Instructions
...
```

#### Invocation Control
| Frontmatter | User Can Invoke | Claude Can Invoke |
|-------------|-----------------|-------------------|
| (default) | Yes | Yes |
| `disable-model-invocation: true` | Yes | No |
| `user-invocable: false` | No | Yes |

---

### 2.4 Hooks System

Same as documented in Cursor section - Claude Code is the source.

#### Additional Hook Events
- `Notification`: When Claude sends notifications
- `PermissionRequest`: When permission dialog appears

#### Prompt-Based Hooks
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate if Claude should stop. Check if all tasks complete.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

---

### 2.5 Plugins System

**Purpose**: Package and distribute skills, agents, hooks, and MCP servers.

#### Plugin Structure
```
enterprise-plugin/
├── .claude-plugin/
│   └── plugin.json           # Manifest
├── commands/
│   └── status.md
├── agents/
│   └── security-reviewer.md
├── skills/
│   └── code-reviewer/
│       └── SKILL.md
├── hooks/
│   └── hooks.json
├── .mcp.json                 # MCP servers
└── .lsp.json                 # LSP servers
```

#### plugin.json Format
```json
{
  "name": "plugin-name",
  "version": "1.0.0",
  "description": "Plugin description",
  "author": { "name": "Author" },
  "commands": ["./custom/commands/"],
  "agents": "./custom/agents/",
  "skills": "./custom/skills/",
  "hooks": "./config/hooks.json",
  "mcpServers": "./mcp-config.json"
}
```

---

## 3. OpenCode

### 3.1 Rules System (AGENTS.md)

**Purpose**: Custom instructions for OpenCode sessions.

#### File Locations
```
# Project rules
AGENTS.md                              # Project root
CLAUDE.md                              # Fallback (Claude compatibility)

# Global rules
~/.config/opencode/AGENTS.md           # Personal global
~/.claude/CLAUDE.md                    # Fallback
```

#### Configuration via opencode.json
```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": [
    "CONTRIBUTING.md",
    "docs/guidelines.md",
    ".cursor/rules/*.md",
    "https://example.com/shared-rules.md"
  ]
}
```

#### Precedence
1. Local files (traverse up from cwd)
2. Global file (`~/.config/opencode/AGENTS.md`)
3. Claude Code file (`~/.claude/CLAUDE.md`)

---

### 3.2 Skills System

**Purpose**: On-demand skill loading via the `skill` tool.

#### File Locations
```
# Project skills
.opencode/skills/<name>/SKILL.md

# Global skills
~/.config/opencode/skills/<name>/SKILL.md

# Claude compatibility
.claude/skills/<name>/SKILL.md
~/.claude/skills/<name>/SKILL.md
```

#### SKILL.md Format
```yaml
---
name: git-release
description: Create consistent releases and changelogs
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
---

## Instructions
...
```

#### Skill Permissions
```json
{
  "permission": {
    "skill": {
      "*": "allow",
      "pr-review": "allow",
      "internal-*": "deny",
      "experimental-*": "ask"
    }
  }
}
```

---

### 3.3 Plugins System

**Purpose**: Extend OpenCode with hooks, tools, and integrations.

#### File Locations
```
# Project plugins
.opencode/plugins/<name>.js|ts

# Global plugins
~/.config/opencode/plugins/<name>.js|ts

# NPM plugins (in opencode.json)
{
  "plugin": ["opencode-helicone-session", "@my-org/custom-plugin"]
}
```

#### Plugin Structure
```javascript
export const MyPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    // Event hooks
    "tool.execute.before": async (input, output) => { ... },
    "tool.execute.after": async (input, output) => { ... },
    "session.created": async ({ event }) => { ... },
    
    // Custom tools
    tool: {
      mytool: tool({
        description: "Custom tool",
        args: { foo: tool.schema.string() },
        async execute(args, context) { return "result" }
      })
    }
  }
}
```

#### Available Events
- `command.executed`, `file.edited`, `file.watcher.updated`
- `message.part.updated`, `message.updated`, `message.removed`
- `permission.asked`, `permission.replied`
- `session.created`, `session.compacted`, `session.deleted`, `session.idle`
- `tool.execute.before`, `tool.execute.after`
- `tui.prompt.append`, `tui.command.execute`

---

## 4. Codex (OpenAI)

### 4.1 Configuration System

**Purpose**: Control Codex behavior via TOML configuration.

#### File Locations
```
# User config
~/.codex/config.toml

# Project config (trusted projects only)
.codex/config.toml

# System config
/etc/codex/config.toml
```

#### Config Precedence
1. CLI flags and `--config` overrides
2. Profile values (`--profile <name>`)
3. Project config (closest to cwd wins)
4. User config
5. System config
6. Built-in defaults

#### config.toml Format
```toml
model = "gpt-5.2"
approval_policy = "on-request"
sandbox_mode = "workspace-write"

[features]
shell_snapshot = true
web_search_request = true

[shell_environment_policy]
include_only = ["PATH", "HOME"]

[mcp_servers.context7]
command = "npx"
args = ["-y", "@context7/mcp"]
```

---

### 4.2 Rules System

**Purpose**: Control which commands run outside sandbox.

#### File Locations
```
# User rules
~/.codex/rules/default.rules

# Project rules
.codex/rules/*.rules
```

#### Rules Format (Starlark)
```python
prefix_rule(
    pattern = ["gh", "pr", "view"],
    decision = "prompt",  # allow | prompt | forbidden
    justification = "Viewing PRs requires approval",
    match = ["gh pr view 7888"],
    not_match = ["gh pr --repo openai/codex view 7888"]
)
```

#### Decision Types
- `allow`: Run without prompting
- `prompt`: Ask before each invocation
- `forbidden`: Block without prompting

---

### 4.3 AGENTS.md System

**Purpose**: Project-specific instructions discovered at startup.

#### File Locations
```
# Global scope
~/.codex/AGENTS.md                    # Base
~/.codex/AGENTS.override.md           # Override (takes precedence)

# Project scope (walk from root to cwd)
$REPO_ROOT/AGENTS.md
$REPO_ROOT/AGENTS.override.md
subdirectory/AGENTS.md
subdirectory/AGENTS.override.md
```

#### Discovery Behavior
1. Check `AGENTS.override.md` first, then `AGENTS.md`
2. Walk from project root down to cwd
3. Concatenate files (closer to cwd = later in prompt = higher precedence)
4. Stop at `project_doc_max_bytes` limit (32KB default)

#### Config Options
```toml
project_doc_fallback_filenames = ["TEAM_GUIDE.md", ".agents.md"]
project_doc_max_bytes = 65536
```

---

### 4.4 Skills System

**Purpose**: Task-specific capabilities via SKILL.md.

#### File Locations (Precedence Order)
```
# REPO scope
$CWD/.codex/skills/
$CWD/../.codex/skills/      # Parent folders in repo
$REPO_ROOT/.codex/skills/   # Git root

# USER scope
~/.codex/skills/

# ADMIN scope
/etc/codex/skills/

# SYSTEM scope (bundled)
Built-in skills
```

#### SKILL.md Format
```yaml
---
name: skill-name
description: Helps Codex select the skill
metadata:
  short-description: Optional user-facing description
---

Skill instructions for Codex to follow...
```

#### Built-in Skills
- `$skill-creator`: Bootstrap new skills
- `$skill-installer`: Install from GitHub
- `$create-plan`: Research and plan features (experimental)

---

## 5. Cross-Harness Compatibility

### Shared Conventions

| Feature | Cursor | Claude Code | OpenCode | Codex |
|---------|--------|-------------|----------|-------|
| **Instructions file** | `AGENTS.md` | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md` |
| **Skills path** | `.cursor/skills/` | `.claude/skills/` | `.opencode/skills/` | `.codex/skills/` |
| **Agents path** | `.cursor/agents/` | `.claude/agents/` | N/A | N/A |
| **Config format** | JSON | JSON | JSON | TOML |
| **Hooks support** | Yes | Yes | Plugins | Rules |

### Claude Code Compatibility in Cursor

Cursor reads from Claude Code locations when enabled:
- `.claude/settings.json` hooks
- `.claude/skills/` directories
- `.claude/agents/` directories

### OpenCode Claude Compatibility

OpenCode reads Claude files as fallback:
- `CLAUDE.md` when no `AGENTS.md`
- `~/.claude/CLAUDE.md` when no global AGENTS.md
- `.claude/skills/` directories

---

## 6. Summary: What Nexus Bindings Must Generate

For each harness, Nexus bindings need to create:

### Cursor
- `.cursor/rules/*.md` - Always-apply rules with Nexus context
- `.cursor/hooks.json` - SessionStart hook pointing to `nexus-session-start.js`
- `~/.cursor/hooks/nexus-session-start.js` - Bootstrap script
- Optional: `.cursor/skills/` for Nexus skills

### Claude Code
- `CLAUDE.md` - Root instructions file
- `.claude/settings.json` - Hooks configuration
- `.claude/rules/*.md` - Modular rules
- Optional: `.claude/skills/` for Nexus skills

### OpenCode
- `AGENTS.md` - Root instructions file
- `opencode.json` - Instructions and plugin references
- `.opencode/plugins/` - Nexus plugin integration

### Codex
- `AGENTS.md` - Root instructions file
- `.codex/config.toml` - Configuration
- `.codex/rules/` - Command rules
- `.codex/skills/` - Nexus skills

---

## Next Steps

1. **Document exact file contents** - Template each binding file
2. **Map Nexus concepts to harness features** - Skills, identity, memory
3. **Design auto-detection** - Which harnesses are installed
4. **Create binding generator** - `nexus bindings create <harness>`
5. **Test parity** - Ensure consistent behavior across harnesses
