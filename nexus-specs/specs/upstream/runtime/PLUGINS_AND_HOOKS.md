# OpenClaw Plugin and Hook Systems - Upstream Analysis

> **Purpose:** Comprehensive analysis of OpenClaw's plugin and hook architecture for Nexus integration.
> **Last Updated:** 2026-02-04

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Plugin System](#plugin-system)
   - [Plugin Discovery](#plugin-discovery)
   - [Plugin Loading](#plugin-loading)
   - [Plugin Manifest Format](#plugin-manifest-format)
   - [Plugin API](#plugin-api)
   - [Plugin Slots](#plugin-slots)
   - [Plugin Configuration](#plugin-configuration)
3. [Hook System](#hook-system)
   - [Hook Types and Lifecycle](#hook-types-and-lifecycle)
   - [Internal Hooks](#internal-hooks)
   - [Plugin Hooks (Typed)](#plugin-hooks-typed)
   - [Hook Registration](#hook-registration)
   - [Hook Execution](#hook-execution)
   - [Bundled Hooks](#bundled-hooks)
   - [Gmail Hooks and Watchers](#gmail-hooks-and-watchers)
4. [Integration Points](#integration-points)
   - [Registering Tools](#registering-tools)
   - [Registering Hooks](#registering-hooks)
   - [Registering Channels](#registering-channels)
   - [Registering Providers](#registering-providers)
5. [Runtime Behavior](#runtime-behavior)
   - [Plugin Enable/Disable](#plugin-enabledisable)
   - [Hook Runner](#hook-runner)
   - [Global Hook Runner](#global-hook-runner)
6. [Comparison with Nexus NEX](#comparison-with-nexus-nex)
7. [Recommendations](#recommendations)

---

## Executive Summary

OpenClaw provides two complementary extension mechanisms:

| System | Purpose | Format | Execution |
|--------|---------|--------|-----------|
| **Plugin System** | Code-based extensions that register tools, channels, providers, and hooks | TypeScript modules with JSON manifests | Synchronous loading, async operations |
| **Hook System** | Event-driven callbacks for agent lifecycle, messages, and tools | Markdown (HOOK.md) with TypeScript handlers | Sequential or parallel based on hook type |

**Key Architectural Patterns:**

1. **Discovery → Load → Register** - Plugins are discovered from multiple sources, loaded via jiti, and call `register()` to contribute capabilities
2. **Dual Hook Systems** - Internal hooks (event-based) and typed plugin hooks (lifecycle-based) coexist
3. **Slot-Based Exclusivity** - Special plugin types (e.g., `memory`) use slots to ensure only one is active
4. **Priority-Ordered Execution** - Hooks can specify priority for deterministic execution order

---

## Plugin System

### Plugin Discovery

Plugins are discovered from four origins in this order (later wins for ID conflicts):

```
┌─────────────────────────────────────────────────────────────────┐
│                    Plugin Discovery Order                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. config       - Extra paths from plugins.load.paths config   │
│  2. workspace    - .openclaw/extensions/ in workspace           │
│  3. global       - ~/.openclaw/extensions/                      │
│  4. bundled      - Built-in plugins in OpenClaw package         │
│                                                                  │
│  Priority: config > workspace > global > bundled                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Discovery Logic (`discovery.ts`):**

```typescript
type PluginCandidate = {
  idHint: string;           // Derived plugin ID
  source: string;           // Absolute path to entry file
  rootDir: string;          // Plugin root directory
  origin: PluginOrigin;     // "bundled" | "global" | "workspace" | "config"
  workspaceDir?: string;    // Workspace context
  packageName?: string;     // From package.json
  packageVersion?: string;  // From package.json
  packageManifest?: OpenClawPackageManifest;
};

type PluginDiscoveryResult = {
  candidates: PluginCandidate[];
  diagnostics: PluginDiagnostic[];
};
```

**Supported Entry Files:**
- Directory with `index.ts`, `index.js`, `index.mjs`, `index.cjs`
- Standalone `.ts`, `.js`, `.mts`, `.cts`, `.mjs`, `.cjs` files
- Package.json with `openclaw.extensions` array

**Package.json Integration:**

```json
{
  "name": "@openclaw/voice-call",
  "version": "1.0.0",
  "openclaw": {
    "extensions": ["./src/index.ts"],
    "channel": {
      "id": "voice-call",
      "label": "Voice Call",
      "docsPath": "/docs/voice"
    },
    "install": {
      "npmSpec": "@openclaw/voice-call@latest",
      "localPath": "./extensions/voice-call"
    }
  }
}
```

---

### Plugin Loading

The loader (`loader.ts`) uses **jiti** for TypeScript/ESM transpilation:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Plugin Loading Flow                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Discover all plugin candidates                               │
│  2. Load manifest registry (openclaw.plugin.json files)          │
│  3. For each candidate:                                          │
│     a. Check enable state (config, allowlist, denylist)          │
│     b. Validate config schema                                    │
│     c. Load module via jiti                                      │
│     d. Resolve export (default or named register/activate)       │
│     e. Create plugin API                                         │
│     f. Call register(api)                                        │
│  4. Build registry with all tools, hooks, channels, providers    │
│  5. Initialize global hook runner                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Plugin Record Structure:**

```typescript
type PluginRecord = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  kind?: PluginKind;        // "memory" for exclusive slot plugins
  source: string;           // Path to entry file
  origin: PluginOrigin;
  workspaceDir?: string;
  enabled: boolean;
  status: "loaded" | "disabled" | "error";
  error?: string;
  
  // Registered capabilities
  toolNames: string[];
  hookNames: string[];
  channelIds: string[];
  providerIds: string[];
  gatewayMethods: string[];
  cliCommands: string[];
  services: string[];
  commands: string[];
  httpHandlers: number;
  hookCount: number;
  
  // Configuration
  configSchema: boolean;
  configUiHints?: Record<string, PluginConfigUiHint>;
  configJsonSchema?: Record<string, unknown>;
};
```

---

### Plugin Manifest Format

Each plugin requires `openclaw.plugin.json`:

```json
{
  "id": "voice-call",
  "name": "Voice Call Plugin",
  "description": "Enables voice calling capabilities",
  "version": "1.0.0",
  "kind": "memory",
  "configSchema": {
    "type": "object",
    "properties": {
      "enabled": { "type": "boolean", "default": true },
      "apiKey": { "type": "string" },
      "maxDuration": { "type": "number", "default": 300 }
    },
    "required": ["apiKey"]
  },
  "uiHints": {
    "apiKey": {
      "label": "API Key",
      "help": "Your voice service API key",
      "sensitive": true,
      "placeholder": "sk-..."
    }
  },
  "channels": ["voice-call"],
  "providers": ["voice-provider"],
  "skills": ["voice-transcription"]
}
```

**Manifest Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique plugin identifier |
| `configSchema` | object | Yes | JSON Schema for plugin config |
| `kind` | string | No | Plugin kind for slot exclusivity (e.g., "memory") |
| `name` | string | No | Human-readable name |
| `description` | string | No | Plugin description |
| `version` | string | No | Semantic version |
| `channels` | string[] | No | Channel IDs this plugin provides |
| `providers` | string[] | No | Provider IDs this plugin provides |
| `skills` | string[] | No | Skill IDs this plugin provides |
| `uiHints` | object | No | UI hints for config fields |

---

### Plugin API

The `OpenClawPluginApi` is passed to the plugin's `register` function:

```typescript
type OpenClawPluginApi = {
  // Identity
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  
  // Configuration
  config: OpenClawConfig;
  pluginConfig?: Record<string, unknown>;
  
  // Runtime utilities
  runtime: PluginRuntime;
  logger: PluginLogger;
  
  // Registration methods
  registerTool: (tool, opts?) => void;
  registerHook: (events, handler, opts?) => void;
  registerHttpHandler: (handler) => void;
  registerHttpRoute: ({ path, handler }) => void;
  registerChannel: (registration) => void;
  registerGatewayMethod: (method, handler) => void;
  registerCli: (registrar, opts?) => void;
  registerService: (service) => void;
  registerProvider: (provider) => void;
  registerCommand: (command) => void;
  
  // Typed lifecycle hooks (preferred)
  on: <K extends PluginHookName>(
    hookName: K,
    handler: PluginHookHandlerMap[K],
    opts?: { priority?: number }
  ) => void;
  
  // Utilities
  resolvePath: (input: string) => string;
};
```

**Example Plugin:**

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export const register = (api: OpenClawPluginApi) => {
  const { pluginConfig, logger } = api;
  
  // Register a tool
  api.registerTool({
    name: "my_tool",
    description: "Does something useful",
    parameters: { type: "object", properties: { input: { type: "string" } } },
    execute: async (args) => ({ result: `Processed: ${args.input}` }),
  });
  
  // Register a lifecycle hook
  api.on("before_agent_start", async (event, ctx) => {
    return { prependContext: "Extra context for the agent" };
  });
  
  // Register an internal hook
  api.registerHook("command:new", async (event) => {
    logger.info("New command issued");
  });
  
  logger.info(`${api.name} loaded`);
};

export default { register };
```

---

### Plugin Slots

Slots provide **exclusive capability selection** for plugin kinds:

```typescript
type PluginSlotKey = "memory";  // Currently only memory slot exists

const SLOT_BY_KIND: Record<PluginKind, PluginSlotKey> = {
  memory: "memory",
};

const DEFAULT_SLOT_BY_KEY: Record<PluginSlotKey, string> = {
  memory: "memory-core",  // Default memory plugin
};
```

**Slot Resolution Logic:**

1. If `plugins.slots.memory` is set to a plugin ID, that plugin wins
2. If set to `"none"`, no memory plugin is loaded
3. If unset, `memory-core` is used as default
4. All other `kind: "memory"` plugins are disabled

**Configuration:**

```json
{
  "plugins": {
    "slots": {
      "memory": "custom-memory-plugin"
    }
  }
}
```

---

### Plugin Configuration

**Enable/Disable State Resolution:**

```typescript
function resolveEnableState(
  id: string,
  origin: PluginOrigin,
  config: NormalizedPluginsConfig
): { enabled: boolean; reason?: string } {
  // 1. Global disable
  if (!config.enabled) return { enabled: false, reason: "plugins disabled" };
  
  // 2. Denylist check
  if (config.deny.includes(id)) return { enabled: false, reason: "blocked by denylist" };
  
  // 3. Allowlist check (if non-empty)
  if (config.allow.length > 0 && !config.allow.includes(id))
    return { enabled: false, reason: "not in allowlist" };
  
  // 4. Slot selection
  if (config.slots.memory === id) return { enabled: true };
  
  // 5. Explicit entry configuration
  const entry = config.entries[id];
  if (entry?.enabled === true) return { enabled: true };
  if (entry?.enabled === false) return { enabled: false, reason: "disabled in config" };
  
  // 6. Bundled plugins disabled by default (unless in BUNDLED_ENABLED_BY_DEFAULT)
  if (origin === "bundled") return { enabled: false, reason: "bundled (disabled by default)" };
  
  // 7. Default: enabled
  return { enabled: true };
}
```

**Full Plugin Configuration:**

```json
{
  "plugins": {
    "enabled": true,
    "allow": ["plugin-a", "plugin-b"],
    "deny": ["plugin-c"],
    "load": {
      "paths": ["~/custom-plugins"]
    },
    "slots": {
      "memory": "memory-core"
    },
    "entries": {
      "voice-call": {
        "enabled": true,
        "config": {
          "apiKey": "sk-...",
          "maxDuration": 600
        }
      }
    }
  }
}
```

---

## Hook System

OpenClaw has **two hook systems** that serve different purposes:

| System | Purpose | Registration | Execution |
|--------|---------|--------------|-----------|
| **Internal Hooks** | Event-based callbacks (`command:new`, `session:start`) | `registerInternalHook(eventKey, handler)` | Sequential, all handlers for matching events |
| **Plugin Hooks (Typed)** | Lifecycle hooks with type-safe payloads | `api.on(hookName, handler, opts)` | Priority-ordered, parallel or sequential |

---

### Hook Types and Lifecycle

**Plugin Hook Names (Typed):**

| Hook Name | Execution | Purpose |
|-----------|-----------|---------|
| `before_agent_start` | Sequential | Inject context into system prompt |
| `agent_end` | Parallel | Analyze completed conversations |
| `before_compaction` | Parallel | Pre-compaction notification |
| `after_compaction` | Parallel | Post-compaction notification |
| `message_received` | Parallel | Log/track incoming messages |
| `message_sending` | Sequential | Modify/cancel outgoing messages |
| `message_sent` | Parallel | Track sent messages |
| `before_tool_call` | Sequential | Modify params or block tool calls |
| `after_tool_call` | Parallel | Track tool execution |
| `tool_result_persist` | Synchronous | Transform tool results before storage |
| `session_start` | Parallel | Session initialization |
| `session_end` | Parallel | Session cleanup |
| `gateway_start` | Parallel | Gateway startup initialization |
| `gateway_stop` | Parallel | Gateway shutdown cleanup |

**Internal Hook Event Types:**

| Type | Actions | Example Key |
|------|---------|-------------|
| `command` | `new`, `reset`, `stop`, etc. | `command:new` |
| `session` | `start`, `end`, etc. | `session:start` |
| `agent` | `bootstrap` | `agent:bootstrap` |
| `gateway` | `startup`, `shutdown` | `gateway:startup` |

---

### Internal Hooks

Event-driven hooks for OpenClaw system events:

```typescript
type InternalHookEventType = "command" | "session" | "agent" | "gateway";

interface InternalHookEvent {
  type: InternalHookEventType;
  action: string;
  sessionKey: string;
  context: Record<string, unknown>;
  timestamp: Date;
  messages: string[];  // Hooks can push messages to user
}

type InternalHookHandler = (event: InternalHookEvent) => Promise<void> | void;
```

**Registration:**

```typescript
// Listen to all command events
registerInternalHook("command", async (event) => {
  console.log("Command:", event.action);
});

// Listen only to /new commands
registerInternalHook("command:new", async (event) => {
  await saveSessionToMemory(event);
});
```

**Trigger Flow:**

```typescript
async function triggerInternalHook(event: InternalHookEvent): Promise<void> {
  // Get handlers for general type and specific action
  const typeHandlers = handlers.get(event.type) ?? [];
  const specificHandlers = handlers.get(`${event.type}:${event.action}`) ?? [];
  
  // Execute all in registration order
  for (const handler of [...typeHandlers, ...specificHandlers]) {
    try {
      await handler(event);
    } catch (err) {
      console.error(`Hook error [${event.type}:${event.action}]:`, err);
    }
  }
}
```

---

### Plugin Hooks (Typed)

Lifecycle hooks with full TypeScript type safety:

```typescript
// Event types for each hook
type PluginHookBeforeAgentStartEvent = {
  prompt: string;
  messages?: unknown[];
};

type PluginHookBeforeAgentStartResult = {
  systemPrompt?: string;
  prependContext?: string;
};

// Handler signature
type BeforeAgentStartHandler = (
  event: PluginHookBeforeAgentStartEvent,
  ctx: PluginHookAgentContext
) => Promise<PluginHookBeforeAgentStartResult | void> | void;
```

**Registration via Plugin API:**

```typescript
api.on("before_agent_start", async (event, ctx) => {
  return {
    prependContext: "Today's special instructions: Be extra helpful."
  };
}, { priority: 100 });

api.on("before_tool_call", async (event, ctx) => {
  if (event.toolName === "dangerous_tool") {
    return { block: true, blockReason: "Tool blocked by policy" };
  }
});
```

---

### Hook Registration

**Two Registration Paths:**

```typescript
// 1. Via registerHook (internal hooks, legacy)
api.registerHook("command:new", async (event) => {
  // Handle event
}, {
  name: "my-hook",
  description: "Does something on /new",
  register: true  // Actually register with internal system
});

// 2. Via on() (typed hooks, preferred)
api.on("before_agent_start", handler, { priority: 100 });
```

**Hook Entry Structure (for HOOK.md-based hooks):**

```typescript
type HookEntry = {
  hook: Hook;                    // Core hook info
  frontmatter: Record<string, string>;
  metadata?: OpenClawHookMetadata;
  invocation?: HookInvocationPolicy;
};

type Hook = {
  name: string;
  description: string;
  source: "openclaw-bundled" | "openclaw-managed" | "openclaw-workspace" | "openclaw-plugin";
  pluginId?: string;
  filePath: string;      // Path to HOOK.md
  baseDir: string;       // Directory containing hook
  handlerPath: string;   // Path to handler.ts/js
};
```

---

### Hook Execution

**Hook Runner (`hooks.ts`):**

```typescript
function createHookRunner(registry: PluginRegistry, options: HookRunnerOptions) {
  
  // Void hooks run in parallel (fire-and-forget)
  async function runVoidHook<K>(hookName: K, event, ctx): Promise<void> {
    const hooks = getHooksForName(registry, hookName);
    await Promise.all(hooks.map(hook => hook.handler(event, ctx)));
  }
  
  // Modifying hooks run sequentially, results merged
  async function runModifyingHook<K, TResult>(
    hookName: K, event, ctx, mergeResults?
  ): Promise<TResult | undefined> {
    const hooks = getHooksForName(registry, hookName);
    let result: TResult | undefined;
    
    for (const hook of hooks) {  // Sorted by priority DESC
      const handlerResult = await hook.handler(event, ctx);
      if (handlerResult != null) {
        result = mergeResults?.(result, handlerResult) ?? handlerResult;
      }
    }
    return result;
  }
  
  return {
    runBeforeAgentStart,   // Sequential, merges systemPrompt/prependContext
    runAgentEnd,           // Parallel
    runMessageSending,     // Sequential, can modify content or cancel
    runBeforeToolCall,     // Sequential, can modify params or block
    runToolResultPersist,  // Synchronous, transforms message
    // ... more hooks
  };
}
```

**Execution Diagram:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Hook Execution Flow                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PARALLEL (runVoidHook)                                          │
│  ┌────────┐ ┌────────┐ ┌────────┐                               │
│  │Handler1│ │Handler2│ │Handler3│  ← All execute simultaneously │
│  └────────┘ └────────┘ └────────┘                               │
│                                                                  │
│  SEQUENTIAL (runModifyingHook)                                   │
│  ┌────────┐    ┌────────┐    ┌────────┐                         │
│  │Handler1│ -> │Handler2│ -> │Handler3│  ← Priority order       │
│  │ p=100  │    │ p=50   │    │ p=10   │                         │
│  └────────┘    └────────┘    └────────┘                         │
│       │            │             │                               │
│       ↓            ↓             ↓                               │
│    Result1  ->  Merge   ->   Final Result                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Bundled Hooks

Bundled hooks live in `src/hooks/bundled/` with this structure:

```
bundled/
├── README.md
├── session-memory/
│   ├── HOOK.md          # Hook metadata and documentation
│   └── handler.ts       # Handler implementation
├── boot-md/
│   ├── HOOK.md
│   └── handler.ts
├── command-logger/
│   ├── HOOK.md
│   └── handler.ts
└── soul-evil/
    ├── HOOK.md
    ├── handler.ts
    └── README.md
```

**HOOK.md Format:**

```yaml
---
name: session-memory
description: "Save session context to memory when /new command is issued"
homepage: https://docs.openclaw.ai/hooks#session-memory
metadata:
  openclaw:
    emoji: "💾"
    events: ["command:new"]
    requires:
      config: ["workspace.dir"]
    install:
      - id: bundled
        kind: bundled
        label: "Bundled with OpenClaw"
---

# Session Memory Hook

Automatically saves session context to your workspace memory...
```

**Hook Metadata:**

```typescript
type OpenClawHookMetadata = {
  always?: boolean;           // Bypass eligibility checks
  hookKey?: string;          // Override config key
  emoji?: string;
  homepage?: string;
  events: string[];          // Events this hook handles
  export?: string;           // Export name (default: "default")
  os?: string[];             // OS restrictions ["darwin", "linux", "win32"]
  requires?: {
    bins?: string[];         // Required binaries (all)
    anyBins?: string[];      // Required binaries (at least one)
    env?: string[];          // Required environment variables
    config?: string[];       // Required config paths
  };
  install?: HookInstallSpec[];
};
```

**Example: session-memory Handler:**

```typescript
import type { HookHandler } from "../../hooks.js";

const saveSessionToMemory: HookHandler = async (event) => {
  if (event.type !== "command" || event.action !== "new") return;
  
  const context = event.context || {};
  const cfg = context.cfg as OpenClawConfig | undefined;
  
  // Get session content and generate slug via LLM
  const sessionContent = await getRecentSessionContent(sessionFile, messageCount);
  const slug = await generateSlugViaLLM({ sessionContent, cfg });
  
  // Write memory file
  const filename = `${dateStr}-${slug}.md`;
  await fs.writeFile(memoryFilePath, entry, "utf-8");
};

export default saveSessionToMemory;
```

---

### Gmail Hooks and Watchers

OpenClaw includes a Gmail integration with push notifications:

**Gmail Watcher Service:**

```typescript
// Starts when gateway launches if hooks.gmail is configured
async function startGmailWatcher(cfg: OpenClawConfig): Promise<GmailWatcherStartResult> {
  // 1. Check gog binary is available
  // 2. Resolve runtime config from hooks.gmail
  // 3. Set up Tailscale endpoint if needed
  // 4. Register Gmail watch (API subscription)
  // 5. Spawn gog serve process for push notifications
  // 6. Set up renewal interval
}
```

**Gmail Hook Configuration:**

```json
{
  "hooks": {
    "enabled": true,
    "token": "abc123...",
    "path": "/hooks",
    "gmail": {
      "account": "user@gmail.com",
      "label": "INBOX",
      "topic": "projects/my-project/topics/gmail-watch",
      "subscription": "gmail-push-sub",
      "pushToken": "secret-push-token",
      "hookUrl": "https://example.com/hooks/gmail",
      "includeBody": true,
      "maxBytes": 20000,
      "renewEveryMinutes": 720,
      "serve": {
        "bind": "127.0.0.1",
        "port": 8788,
        "path": "/gmail-pubsub"
      },
      "tailscale": {
        "mode": "funnel",
        "path": "/gmail-pubsub"
      }
    }
  }
}
```

**Gmail Runtime Flow:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Gmail Hook Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Gmail API  ──push──>  Google Pub/Sub  ──HTTP──>  gog serve     │
│                              │                        │          │
│                              │                        ↓          │
│                              │              Parse notification   │
│                              │                        │          │
│                              │                        ↓          │
│                              └──────>  OpenClaw Gateway          │
│                                        /hooks/gmail              │
│                                             │                    │
│                                             ↓                    │
│                                    Trigger hook handlers         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Integration Points

### Registering Tools

**Method 1: Static Tool**

```typescript
api.registerTool({
  name: "search_web",
  description: "Search the web for information",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" }
    },
    required: ["query"]
  },
  execute: async (args) => {
    const results = await searchWeb(args.query);
    return { results };
  }
});
```

**Method 2: Factory Function**

```typescript
api.registerTool(
  (ctx: OpenClawPluginToolContext) => {
    // ctx.config, ctx.workspaceDir, ctx.agentId, etc.
    if (!ctx.config?.myPlugin?.enabled) return null;
    
    return {
      name: "my_contextual_tool",
      description: "A tool that adapts to context",
      execute: async (args) => { /* ... */ }
    };
  },
  { optional: true, names: ["my_contextual_tool"] }
);
```

**Tool Resolution:**

```typescript
function resolvePluginTools(params: {
  context: OpenClawPluginToolContext;
  existingToolNames?: Set<string>;
  toolAllowlist?: string[];
}): AnyAgentTool[] {
  // 1. Load plugin registry
  // 2. For each tool registration:
  //    a. Check for ID/name conflicts
  //    b. Call factory with context
  //    c. Filter optional tools by allowlist
  //    d. Add to result set
  return tools;
}
```

---

### Registering Hooks

**Internal Hooks (Event-Based):**

```typescript
api.registerHook(
  ["command:new", "command:reset"],  // Event keys
  async (event) => {
    // Handle event
  },
  {
    name: "my-command-hook",
    description: "Handles command events",
    register: true  // Actually register (vs just tracking)
  }
);
```

**Typed Hooks (Lifecycle-Based):**

```typescript
// Inject context before agent starts
api.on("before_agent_start", async (event, ctx) => {
  return {
    systemPrompt: "You are a helpful assistant.",
    prependContext: "Current user: Tyler\nTimezone: CST"
  };
}, { priority: 100 });

// Modify outgoing messages
api.on("message_sending", async (event, ctx) => {
  if (event.content.includes("REDACTED")) {
    return { cancel: true };
  }
  return { content: event.content.replace(/SECRET/g, "***") };
});

// Block dangerous tool calls
api.on("before_tool_call", async (event, ctx) => {
  if (event.toolName === "rm" && event.params.path === "/") {
    return { block: true, blockReason: "Dangerous operation blocked" };
  }
});
```

---

### Registering Channels

```typescript
api.registerChannel({
  plugin: {
    id: "my-channel",
    label: "My Channel",
    description: "A custom messaging channel",
    
    // Channel plugin implementation
    createSession: async (opts) => { /* ... */ },
    sendMessage: async (session, message) => { /* ... */ },
    receiveMessages: async (session) => { /* ... */ },
  },
  dock: myChannelDock  // Optional dock for connection management
});
```

---

### Registering Providers

```typescript
api.registerProvider({
  id: "my-provider",
  label: "My LLM Provider",
  docsPath: "/docs/providers/my-provider",
  aliases: ["myprovider", "mp"],
  envVars: ["MY_PROVIDER_API_KEY"],
  
  models: {
    "my-model-large": { contextWindow: 128000, pricing: { input: 10, output: 30 } },
    "my-model-small": { contextWindow: 32000, pricing: { input: 1, output: 3 } },
  },
  
  auth: [
    {
      id: "api_key",
      label: "API Key",
      kind: "api_key",
      run: async (ctx) => {
        const key = await ctx.prompter.text("Enter API key:");
        return {
          profiles: [{ profileId: "default", credential: { type: "api_key", key } }]
        };
      }
    },
    {
      id: "oauth",
      label: "OAuth Login",
      kind: "oauth",
      run: async (ctx) => {
        // OAuth flow implementation
      }
    }
  ],
  
  formatApiKey: (cred) => cred.key,
  refreshOAuth: async (cred) => { /* refresh token */ }
});
```

---

## Runtime Behavior

### Plugin Enable/Disable

**Enable Plugin Programmatically:**

```typescript
function enablePluginInConfig(cfg: OpenClawConfig, pluginId: string): PluginEnableResult {
  // 1. Check global plugins.enabled
  // 2. Check denylist
  // 3. Add to entries with enabled: true
  // 4. Ensure in allowlist if allowlist exists
  return { config: newConfig, enabled: true };
}
```

**Disable via Config:**

```json
{
  "plugins": {
    "entries": {
      "voice-call": { "enabled": false }
    }
  }
}
```

---

### Hook Runner

**Global Hook Runner (`hook-runner-global.ts`):**

```typescript
let globalHookRunner: HookRunner | null = null;
let globalRegistry: PluginRegistry | null = null;

// Called once during plugin loading
function initializeGlobalHookRunner(registry: PluginRegistry): void {
  globalRegistry = registry;
  globalHookRunner = createHookRunner(registry, {
    logger: createSubsystemLogger("plugins"),
    catchErrors: true
  });
}

// Available throughout the codebase
function getGlobalHookRunner(): HookRunner | null {
  return globalHookRunner;
}

function hasGlobalHooks(hookName: PluginHookName): boolean {
  return globalHookRunner?.hasHooks(hookName) ?? false;
}
```

**Usage in Agent Runtime:**

```typescript
// Before starting agent
const hookRunner = getGlobalHookRunner();
if (hookRunner?.hasHooks("before_agent_start")) {
  const result = await hookRunner.runBeforeAgentStart(
    { prompt: systemPrompt, messages },
    { agentId, sessionKey, workspaceDir }
  );
  if (result?.prependContext) {
    systemPrompt = `${result.prependContext}\n\n${systemPrompt}`;
  }
}

// Before tool execution
if (hookRunner?.hasHooks("before_tool_call")) {
  const result = await hookRunner.runBeforeToolCall(
    { toolName: tool.name, params },
    { agentId, sessionKey, toolName: tool.name }
  );
  if (result?.block) {
    return { error: result.blockReason ?? "Tool blocked by hook" };
  }
  params = result?.params ?? params;
}
```

---

### Global Hook Runner

**Lifecycle:**

```
┌─────────────────────────────────────────────────────────────────┐
│                 Global Hook Runner Lifecycle                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Gateway starts                                               │
│  2. loadOpenClawPlugins() called                                 │
│  3. Plugins discovered, loaded, registered                       │
│  4. initializeGlobalHookRunner(registry) called                  │
│  5. Hook runner now available via getGlobalHookRunner()          │
│  6. Hooks triggered throughout agent lifecycle                   │
│  7. Gateway stops → resetGlobalHookRunner()                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Comparison with Nexus NEX

| Aspect | OpenClaw Plugins | Nexus NEX Plugins |
|--------|-----------------|-------------------|
| **Discovery** | Filesystem + config paths | Skill-like discovery |
| **Manifest** | JSON schema required | YAML frontmatter |
| **Entry Point** | TypeScript `register(api)` | TypeScript module |
| **Typed Hooks** | 14 lifecycle hooks | TBD automation triggers |
| **Event Hooks** | Internal hooks (`command:*`) | Message bus events |
| **Tool Registration** | `api.registerTool()` | Skill-based capabilities |
| **Provider Auth** | Multi-method OAuth/API | Credential system |
| **Slots** | Exclusive capability (memory) | TBD |
| **Enable/Disable** | Config entries + allowlist | Skill status |

**Nexus Adaptation Opportunities:**

1. **Adopt typed hook pattern** for automation triggers
2. **Use slot concept** for exclusive capability providers (e.g., memory, calendar)
3. **Parallel/sequential execution modes** based on hook semantics
4. **Priority ordering** for hook chains
5. **Factory pattern** for context-aware tool creation

---

## Recommendations

### 1. Adopt Plugin Hook Architecture

The typed hook system (`api.on()`) provides:
- Type-safe event/result contracts
- Priority-based ordering
- Clear parallel vs sequential semantics
- Clean result merging

**Map to Nexus:**
```typescript
// Nexus automations could use similar patterns
nexus.on("message_received", async (event, ctx) => {
  // Trigger automation based on message
});

nexus.on("before_response", async (event, ctx) => {
  // Inject context or modify response
  return { prependContext: "..." };
});
```

### 2. Implement Slot-Based Exclusivity

For capabilities where only one provider should be active:
- Memory backend
- Calendar provider
- Email provider

### 3. Separate Hook Types

Follow OpenClaw's dual-system approach:
- **Lifecycle hooks** (typed) for well-defined extension points
- **Event hooks** (dynamic) for message bus integration

### 4. Use Factory Pattern for Tools

Context-aware tool creation allows:
- Per-session tool configuration
- Workspace-specific capabilities
- Optional tools with allowlists

### 5. Preserve Hook Eligibility Checking

The `shouldIncludeHook` pattern with requirements checking:
- OS restrictions
- Binary dependencies
- Config requirements
- Environment variables

This enables graceful degradation when dependencies are missing.

---

## Appendix: Key Files

| File | Purpose |
|------|---------|
| `src/plugins/discovery.ts` | Plugin candidate discovery |
| `src/plugins/loader.ts` | Plugin loading and registration |
| `src/plugins/manifest.ts` | Manifest parsing |
| `src/plugins/registry.ts` | Plugin/tool/hook registry |
| `src/plugins/types.ts` | Plugin API types and hook definitions |
| `src/plugins/hooks.ts` | Hook runner implementation |
| `src/plugins/hook-runner-global.ts` | Global hook runner singleton |
| `src/plugins/slots.ts` | Exclusive slot management |
| `src/plugins/config-state.ts` | Enable/disable state resolution |
| `src/plugins/tools.ts` | Plugin tool resolution |
| `src/hooks/internal-hooks.ts` | Internal event hook system |
| `src/hooks/loader.ts` | Hook loading from directories |
| `src/hooks/workspace.ts` | Hook discovery from workspace |
| `src/hooks/config.ts` | Hook eligibility checking |
| `src/hooks/gmail.ts` | Gmail hook configuration |
| `src/hooks/gmail-watcher.ts` | Gmail push notification service |
| `src/hooks/bundled/` | Bundled hook implementations |
