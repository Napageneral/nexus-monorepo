# OpenCode Project Structure

**Upstream Repository:** `/Users/tyler/nexus/home/projects/opencode`  
**Documentation Date:** January 30, 2026  
**Purpose:** Architecture overview for Nexus fork planning

---

## Top-Level Structure

```
opencode/
├── .github/              # GitHub workflows, actions, templates
├── .opencode/            # OpenCode config (agent, command, skill, tool, themes)
├── infra/                # SST infrastructure definitions (app, console, enterprise)
├── nix/                  # Nix build configuration
├── packages/             # Monorepo packages (see below)
├── patches/              # Dependency patches
├── script/               # Build/release scripts
├── sdks/                 # SDK packages (VSCode extension)
├── specs/                # Specification documents
├── themes/               # Theme definitions
├── AGENTS.md             # Agent system documentation
├── package.json          # Root workspace config
├── turbo.json            # Turborepo configuration
├── sst.config.ts         # SST deployment config
└── tsconfig.json         # TypeScript root config
```

---

## Package Organization

OpenCode uses a **monorepo structure** managed by Bun workspaces and Turborepo. The workspace includes:

### Core Packages

#### `packages/opencode/` - **Core Engine**
The main OpenCode runtime library. Contains all core logic for sessions, tools, permissions, config, etc.

```
packages/opencode/
├── bin/                  # CLI binary entry point
├── script/               # Build scripts
├── src/
│   ├── acp/              # Agent Client Protocol integration
│   ├── agent/            # Agent definitions and prompts
│   ├── auth/             # Authentication handling
│   ├── bun/              # Bun-specific utilities
│   ├── bus/              # Event bus system (pub/sub)
│   │   ├── bus-event.ts  # Event type definitions
│   │   ├── global.ts     # Global event bus
│   │   └── index.ts      # Instance-scoped bus
│   ├── cli/              # CLI command implementations
│   │   └── cmd/
│   │       ├── tui/      # Terminal UI implementation
│   │       ├── serve.ts  # Server command
│   │       ├── session.ts
│   │       └── ...
│   ├── command/           # Command system (slash commands)
│   ├── config/           # Configuration management
│   │   ├── config.ts     # Main config loader (hierarchical merge)
│   │   └── markdown.ts   # Markdown config parser
│   ├── file/             # File operations (ignore, ripgrep, watcher)
│   ├── flag/             # Feature flags
│   ├── format/            # Code formatter integration
│   ├── global/            # Global state/paths
│   ├── id/                # ID generation (session, message, part)
│   ├── ide/               # IDE integration
│   ├── installation/      # Installation metadata
│   ├── lsp/               # Language Server Protocol client/server
│   ├── mcp/               # Model Context Protocol integration
│   ├── permission/        # Permission system
│   │   ├── index.ts       # Permission asking/approval
│   │   └── next.ts        # Next-gen permission rules
│   ├── plugin/            # Plugin system
│   │   ├── index.ts       # Plugin loader/trigger
│   │   ├── codex.ts       # Codex plugin
│   │   └── copilot.ts     # Copilot plugin
│   ├── project/           # Project instance management
│   │   ├── instance.ts    # Per-directory instance state
│   │   ├── project.ts     # Project metadata
│   │   ├── state.ts       # Instance state management
│   │   └── vcs.ts         # Version control integration
│   ├── provider/          # LLM provider abstractions
│   │   ├── provider.ts    # Provider interface
│   │   ├── models.ts      # Model definitions
│   │   └── sdk/           # Provider SDK implementations
│   ├── pty/               # Pseudo-terminal handling
│   ├── question/          # User question system
│   ├── scheduler/         # Task scheduling
│   ├── server/            # HTTP server (Hono-based)
│   │   ├── server.ts      # Main server setup
│   │   ├── event.ts       # Server events
│   │   ├── mdns.ts        # mDNS service discovery
│   │   └── routes/        # API route handlers
│   │       ├── session.ts  # Session endpoints
│   │       ├── permission.ts
│   │       ├── config.ts
│   │       ├── provider.ts
│   │       └── ...
│   ├── session/           # Session management (CORE)
│   │   ├── index.ts       # Session CRUD, fork, share
│   │   ├── processor.ts   # Message processing loop
│   │   ├── message.ts     # Message handling (legacy)
│   │   ├── message-v2.ts  # Message handling (v2)
│   │   ├── prompt.ts      # Prompt construction
│   │   ├── llm.ts         # LLM streaming
│   │   ├── compaction.ts  # Context compaction
│   │   ├── summary.ts     # Session summarization
│   │   ├── retry.ts        # Retry logic
│   │   ├── status.ts      # Session status tracking
│   │   └── prompt/         # Agent prompt templates
│   ├── share/             # Session sharing
│   ├── shell/              # Shell integration
│   ├── skill/              # Skill system
│   ├── snapshot/           # File snapshot tracking
│   ├── storage/            # Storage abstraction
│   ├── tool/               # Tool system (CORE)
│   │   ├── registry.ts     # Tool registration/discovery
│   │   ├── tool.ts         # Tool interface
│   │   ├── read.ts         # read tool
│   │   ├── write.ts        # write tool
│   │   ├── edit.ts         # edit tool
│   │   ├── bash.ts         # bash tool
│   │   ├── grep.ts         # grep tool
│   │   ├── glob.ts         # glob tool
│   │   ├── codesearch.ts   # code search tool
│   │   ├── websearch.ts    # web search tool
│   │   ├── webfetch.ts     # web fetch tool
│   │   ├── lsp.ts          # LSP tool
│   │   ├── skill.ts        # skill tool
│   │   ├── plan.ts         # plan mode tools
│   │   └── ...
│   ├── util/              # Utilities
│   └── worktree/           # Git worktree handling
└── test/                   # Test suite
```

**Key Architectural Patterns:**
- **Instance-scoped state**: `Instance.state()` provides per-directory state management
- **Event bus**: `Bus` namespace for pub/sub events (instance + global)
- **Storage abstraction**: `Storage` namespace for file-based persistence
- **Plugin hooks**: `Plugin.trigger()` for extensibility

#### `packages/app/` - **Web Application**
SolidJS-based web UI (browser client)

```
packages/app/
├── src/
│   ├── components/        # Solid components
│   │   ├── session/       # Session UI components
│   │   ├── dialog-*.tsx   # Various dialogs
│   │   └── ...
│   ├── context/           # Context providers
│   │   ├── session.tsx
│   │   ├── sdk.tsx
│   │   ├── server.tsx
│   │   └── ...
│   ├── pages/             # Page components
│   ├── hooks/             # Hooks
│   └── utils/             # Client utilities
└── e2e/                   # End-to-end tests
```

#### `packages/desktop/` - **Desktop Application**
Tauri-based desktop app (Electron alternative)

```
packages/desktop/
├── src/                   # Frontend code (SolidJS)
├── src-tauri/            # Rust backend (Tauri)
└── scripts/               # Build scripts
```

#### `packages/console/` - **Console/Web Dashboard**
SolidStart-based web application for OpenCode Cloud

```
packages/console/
├── app/                   # Main console app
│   ├── src/
│   │   ├── routes/        # SolidStart routes
│   │   │   ├── workspace/  # Workspace management
│   │   │   ├── zen/       # Zen API endpoints
│   │   │   └── ...
│   │   └── ...
├── core/                  # Core backend logic
├── function/              # Serverless functions
├── mail/                  # Email templates
└── resource/             # Resource definitions
```

### Supporting Packages

- **`packages/ui/`** - Shared UI components (icons, etc.)
- **`packages/util/`** - Shared utilities
- **`packages/sdk/`** - JavaScript SDK for OpenCode API
- **`packages/plugin/`** - Plugin SDK/definitions
- **`packages/script/`** - Script utilities
- **`packages/web/`** - Documentation site
- **`packages/docs/`** - Documentation content
- **`packages/enterprise/`** - Enterprise features
- **`packages/slack/`** - Slack integration
- **`packages/function/`** - Shared serverless functions

---

## Core Modules

### 1. Session Management (`packages/opencode/src/session/`)

**Purpose:** Manages conversation sessions, messages, and state.

**Key Files:**
- `index.ts` - Session CRUD, fork, share, message management
- `processor.ts` - **Main processing loop** - handles LLM streaming, tool calls, retries
- `message-v2.ts` - Message/part data structures
- `prompt.ts` - Constructs prompts for LLM
- `llm.ts` - LLM streaming wrapper
- `compaction.ts` - Context window compaction
- `summary.ts` - Session summarization

**Key Concepts:**
- Sessions have IDs, slugs, project associations
- Messages contain parts (text, tool, reasoning, step-start, step-finish, patch)
- Session processor handles the agent loop: stream → tool calls → results → continue/stop
- Supports child sessions (subagents)
- Session sharing via `share/` module

### 2. Tool System (`packages/opencode/src/tool/`)

**Purpose:** Defines and executes tools that agents can call.

**Key Files:**
- `registry.ts` - Tool registration, filtering, initialization
- `tool.ts` - Tool interface definition
- Individual tool files: `read.ts`, `write.ts`, `edit.ts`, `bash.ts`, etc.

**Tool Types:**
- **File operations**: `read`, `write`, `edit`, `glob`, `grep`
- **Code operations**: `lsp`, `codesearch`
- **System**: `bash`, `task`
- **Web**: `webfetch`, `websearch`
- **Planning**: `plan` (enter/exit)
- **Skills**: `skill` (custom skills)
- **Plugins**: Custom tools via plugin system

### 3. Permission System (`packages/opencode/src/permission/`)

**Purpose:** Manages user approval for tool calls.

**Key Files:**
- `index.ts` - Permission asking, approval, rejection
- `next.ts` - Next-gen permission rules (pattern-based)

**Flow:**
1. Tool execution triggers `Permission.ask()`
2. Permission stored in pending state
3. Event published via `Bus`
4. UI shows permission prompt
5. User responds: `once`, `always`, `reject`
6. Tool execution continues or aborts

### 4. Config System (`packages/opencode/src/config/`)

**Purpose:** Hierarchical configuration loading and management.

**Config Hierarchy (lowest to highest priority):**
1. Remote well-known configs (`/.well-known/opencode`)
2. Global user config (`~/.opencode/opencode.jsonc`)
3. Custom config path (`OPENCODE_CONFIG`)
4. Project configs (`.opencode/opencode.jsonc` up directory tree)
5. Inline config (`OPENCODE_CONFIG_CONTENT`)
6. Managed config (`/etc/opencode` or `/Library/Application Support/opencode`)

**Config Sources Scanned:**
- `opencode.jsonc` / `opencode.json` files
- `.opencode/agent/` - Agent definitions
- `.opencode/command/` - Command definitions
- `.opencode/plugin/` - Plugin files
- `.opencode/tool/` - Custom tools

### 5. Server (`packages/opencode/src/server/`)

**Purpose:** HTTP API server for clients (web, desktop, CLI).

**API Routes:**
- `/session` - Session management
- `/permission` - Permission handling
- `/config` - Config management
- `/provider` - Provider management
- `/project` - Project info
- `/file` - File operations
- `/pty` - Terminal operations
- `/mcp` - MCP server management
- `/tui` - TUI-specific endpoints
- `/event` - SSE event stream

### 6. Event Bus (`packages/opencode/src/bus/`)

**Purpose:** Pub/sub event system for component communication.

**Pattern:**
- `Bus.publish(eventDef, properties)` - Publish event
- `Bus.subscribe(eventDef, callback)` - Subscribe to event
- Events typed via Zod schemas

**Event Types:**
- `session.created`, `session.updated`, `session.deleted`
- `message.updated`, `part.updated`
- `permission.updated`, `permission.replied`
- `server.instance.disposed`

### 7. Plugin System (`packages/opencode/src/plugin/`)

**Purpose:** Extensibility via plugins.

**Plugin Hooks:**
- `config` - Modify config
- `permission.ask` - Intercept permission requests
- `experimental.text.complete` - Modify text output
- `event` - Listen to bus events
- `tool` - Register custom tools
- `auth` - Custom auth flows

---

## Runtime Components

### TUI (Terminal UI)
**Location:** `packages/opencode/src/cli/cmd/tui/`

- SolidJS-based terminal UI
- Routes: home, session view
- Components: dialogs, prompts, sidebar

### Web App
**Location:** `packages/app/`

- SolidJS SPA
- Connects to server via SDK
- Session management UI

### Desktop App
**Location:** `packages/desktop/`

- Tauri wrapper around web app
- Native menus, window management
- Auto-updater

### Server
**Location:** `packages/opencode/src/server/`

- Hono HTTP server
- SSE for events
- mDNS service discovery

---

## Key Architectural Patterns

### 1. Instance Scoping
- Each directory gets an `Instance` with isolated state
- `Instance.state()` provides per-instance state management
- State disposed when instance disposed
- Allows multiple projects to run simultaneously

### 2. Storage Abstraction
- `Storage` namespace provides file-based persistence
- Path-based keys: `["session", projectID, sessionID]`
- Atomic writes, reads
- Used for sessions, messages, parts, configs

### 3. Event-Driven Architecture
- Components communicate via `Bus` events
- Server streams events to clients via SSE
- UI reacts to events for real-time updates

### 4. Plugin Extensibility
- Plugins can hook into core systems
- Custom tools, auth, config modification
- Event interception

### 5. Hierarchical Config
- Multiple config sources merged in priority order
- Project-specific overrides
- Well-known remote configs for org defaults

---

## Build & Deploy

### Build System
- **Package Manager:** Bun
- **Monorepo:** Turborepo
- **TypeScript:** Native TS (via Bun)

### Infrastructure
**Location:** `infra/`

- **SST** (Serverless Stack) for deployment
- **Platform:** Cloudflare (primary), AWS (some resources)

### Release Process
**Scripts:** `script/`

- `release` - Release script
- `publish.ts` - Publishing logic
- `version.ts` - Version management
- `changelog.ts` - Changelog generation
- `beta.ts` - Beta releases

---

## Key Dependencies

### Core Runtime
- `ai` - Vercel AI SDK (LLM streaming)
- `hono` - HTTP framework
- `zod` - Schema validation
- `solid-js` - UI framework
- `bun` - Runtime/package manager

### AI Providers
- `@ai-sdk/anthropic` - Claude
- `@ai-sdk/openai` - OpenAI
- `@ai-sdk/google` - Gemini
- `@ai-sdk/azure` - Azure OpenAI
- Many more providers supported

---

## Notes for Nexus Fork

### What to Extract/Adapt

| OpenCode Component | Nexus Equivalent | Notes |
|--------------------|------------------|-------|
| `session/` | Agent Ledger + Broker | Write directly to DB, not files |
| `tool/` | Tool system | Same tools, different permission model |
| `permission/` | ACL system | ACL policies replace per-call asking |
| `bus/` | Event Handler | Similar pub/sub, different event types |
| `config/` | Workspace config | Different hierarchy, Nexus-specific |
| `plugin/` | Skills system | Markdown docs vs code plugins |
| `storage/` | Ledgers (SQLite) | File-based → DB-based |
| `server/` | Broker API | Nexus broker is more central |

### Key Differences

1. **Storage Model**
   - OpenCode: File-based (`Storage.set(path, data)`)
   - Nexus: SQLite ledgers (Event, Identity, Agent)

2. **Session Format**
   - OpenCode: JSONL files in `~/.opencode/sessions/`
   - Nexus: Direct writes to Agent Ledger tables

3. **Permission Model**
   - OpenCode: Per-call approval prompts
   - Nexus: Upfront ACL policies + grants

4. **Plugin vs Skills**
   - OpenCode: Code plugins with hooks
   - Nexus: Markdown skill docs + tool binaries

5. **Multi-Client**
   - OpenCode: Server + multiple clients (TUI, web, desktop)
   - Nexus: CLI-first with optional server

---

*This document captures the upstream structure for fork planning. See NEXUS_STRUCTURE.md for our target architecture.*
