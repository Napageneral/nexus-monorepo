# OpenCode Plugin System - Upstream Analysis

> **Purpose:** Comprehensive analysis of OpenCode's plugin architecture to inform Nexus integration decisions.
> **Last Updated:** 2026-01-30

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Plugin Architecture](#plugin-architecture)
3. [All Available Hooks](#all-available-hooks)
4. [Built-in Plugins](#built-in-plugins)
5. [Plugin API](#plugin-api)
6. [Plugin Configuration](#plugin-configuration)
7. [Custom Tool Registration](#custom-tool-registration)
8. [Auth Flows](#auth-flows)
9. [Event System Integration](#event-system-integration)
10. [Comparison with Nexus Skills](#comparison-with-nexus-skills)
11. [Recommendations](#recommendations)

---

## Executive Summary

OpenCode's plugin system is a **code-first, TypeScript-based** extension mechanism that allows:
- Custom OAuth authentication flows for LLM providers
- Tool registration for agent use
- Hook-based modification of chat messages, headers, permissions, and more
- Event subscription for reactive behaviors

**Key Differences from Nexus Skills:**
| Aspect | OpenCode Plugins | Nexus Skills |
|--------|-----------------|--------------|
| Format | TypeScript/JavaScript modules | Markdown (SKILL.md) with YAML frontmatter |
| Execution | Code runs in OpenCode runtime | Instructions consumed by agent |
| Discovery | npm packages or local files | Filesystem scanning |
| Capabilities | Auth, tools, hooks, events | Documentation, metadata, credential requirements |
| Complexity | High (requires JS/TS) | Low (markdown) |

---

## Plugin Architecture

### Loading Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Plugin Loading                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Instance.state() initializes plugin state                        │
│                                                                      │
│  2. Internal plugins loaded directly (CodexAuthPlugin, CopilotAuth)  │
│                                                                      │
│  3. Config plugins loaded from opencode.json "plugin" array          │
│                                                                      │
│  4. Built-in plugins installed via BunProc.install() if needed       │
│      - opencode-anthropic-auth@0.0.13                                │
│      - @gitlab/opencode-gitlab-auth@1.3.2                            │
│                                                                      │
│  5. Local plugins scanned from {plugin,plugins}/*.{ts,js}            │
│                                                                      │
│  6. Each plugin exported function called with PluginInput            │
│                                                                      │
│  7. Returned Hooks object registered for trigger/subscription        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Plugin Entry Point

```typescript
// packages/plugin/src/index.ts
export type Plugin = (input: PluginInput) => Promise<Hooks>

export type PluginInput = {
  client: ReturnType<typeof createOpencodeClient>  // SDK client for API calls
  project: Project                                  // Current project info
  directory: string                                 // Current working directory
  worktree: string                                  // Git worktree root
  serverUrl: URL                                    // OpenCode server URL
  $: BunShell                                       // Bun shell for commands
}
```

### Internal Plugin Loading

```typescript
// packages/opencode/src/plugin/index.ts
const INTERNAL_PLUGINS: PluginInstance[] = [CodexAuthPlugin, CopilotAuthPlugin]

for (const plugin of INTERNAL_PLUGINS) {
  log.info("loading internal plugin", { name: plugin.name })
  const init = await plugin(input)
  hooks.push(init)
}
```

### External Plugin Loading

Plugins can be specified as:
- **npm packages:** `"oh-my-opencode@2.4.3"` or `"@scope/plugin@1.0.0"`
- **Local files:** `"file:///path/to/plugin.js"`
- **Auto-discovered:** Files in `.opencode/{plugin,plugins}/*.{ts,js}`

```typescript
for (let plugin of plugins) {
  if (!plugin.startsWith("file://")) {
    const lastAtIndex = plugin.lastIndexOf("@")
    const pkg = lastAtIndex > 0 ? plugin.substring(0, lastAtIndex) : plugin
    const version = lastAtIndex > 0 ? plugin.substring(lastAtIndex + 1) : "latest"
    plugin = await BunProc.install(pkg, version)
  }
  const mod = await import(plugin)
  for (const [_name, fn] of Object.entries<PluginInstance>(mod)) {
    const init = await fn(input)
    hooks.push(init)
  }
}
```

---

## All Available Hooks

### Hook Categories

| Category | Hook Name | Purpose |
|----------|-----------|---------|
| **Auth** | `auth` | Provider authentication flows |
| **Config** | `config` | Access to merged configuration |
| **Events** | `event` | Subscribe to all bus events |
| **Tools** | `tool` | Register custom tools |
| **Chat** | `chat.message` | Modify incoming messages |
| **Chat** | `chat.params` | Modify LLM parameters |
| **Chat** | `chat.headers` | Modify request headers |
| **Permissions** | `permission.ask` | Intercept permission checks |
| **Commands** | `command.execute.before` | Pre-command hook |
| **Tools** | `tool.execute.before` | Pre-tool execution |
| **Tools** | `tool.execute.after` | Post-tool execution |
| **Experimental** | `experimental.chat.messages.transform` | Transform message history |
| **Experimental** | `experimental.chat.system.transform` | Modify system prompt |
| **Experimental** | `experimental.session.compacting` | Customize compaction |
| **Experimental** | `experimental.text.complete` | Post-process text output |

### Detailed Hook Signatures

```typescript
export interface Hooks {
  // === EVENT SUBSCRIPTION ===
  event?: (input: { event: Event }) => Promise<void>
  
  // === CONFIGURATION ACCESS ===
  config?: (input: Config) => Promise<void>
  
  // === CUSTOM TOOLS ===
  tool?: {
    [key: string]: ToolDefinition
  }
  
  // === AUTHENTICATION ===
  auth?: AuthHook
  
  // === CHAT LIFECYCLE ===
  "chat.message"?: (
    input: {
      sessionID: string
      agent?: string
      model?: { providerID: string; modelID: string }
      messageID?: string
      variant?: string
    },
    output: { message: UserMessage; parts: Part[] },
  ) => Promise<void>
  
  "chat.params"?: (
    input: { 
      sessionID: string
      agent: string
      model: Model
      provider: ProviderContext
      message: UserMessage 
    },
    output: { 
      temperature: number
      topP: number
      topK: number
      options: Record<string, any> 
    },
  ) => Promise<void>
  
  "chat.headers"?: (
    input: { 
      sessionID: string
      agent: string
      model: Model
      provider: ProviderContext
      message: UserMessage 
    },
    output: { headers: Record<string, string> },
  ) => Promise<void>
  
  // === PERMISSIONS ===
  "permission.ask"?: (
    input: Permission, 
    output: { status: "ask" | "deny" | "allow" }
  ) => Promise<void>
  
  // === COMMAND LIFECYCLE ===
  "command.execute.before"?: (
    input: { command: string; sessionID: string; arguments: string },
    output: { parts: Part[] },
  ) => Promise<void>
  
  // === TOOL LIFECYCLE ===
  "tool.execute.before"?: (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: any },
  ) => Promise<void>
  
  "tool.execute.after"?: (
    input: { tool: string; sessionID: string; callID: string },
    output: {
      title: string
      output: string
      metadata: any
    },
  ) => Promise<void>
  
  // === EXPERIMENTAL HOOKS ===
  "experimental.chat.messages.transform"?: (
    input: {},
    output: {
      messages: {
        info: Message
        parts: Part[]
      }[]
    },
  ) => Promise<void>
  
  "experimental.chat.system.transform"?: (
    input: { sessionID?: string; model: Model },
    output: { system: string[] },
  ) => Promise<void>
  
  "experimental.session.compacting"?: (
    input: { sessionID: string },
    output: { context: string[]; prompt?: string },
  ) => Promise<void>
  
  "experimental.text.complete"?: (
    input: { sessionID: string; messageID: string; partID: string },
    output: { text: string },
  ) => Promise<void>
}
```

### Hook Trigger Mechanism

```typescript
// packages/opencode/src/plugin/index.ts
export async function trigger<
  Name extends Exclude<keyof Required<Hooks>, "auth" | "event" | "tool">,
  Input = Parameters<Required<Hooks>[Name]>[0],
  Output = Parameters<Required<Hooks>[Name]>[1],
>(name: Name, input: Input, output: Output): Promise<Output> {
  if (!name) return output
  for (const hook of await state().then((x) => x.hooks)) {
    const fn = hook[name]
    if (!fn) continue
    await fn(input, output)  // Mutates output in place
  }
  return output
}
```

---

## Built-in Plugins

### CodexAuthPlugin (OpenAI Codex)

**Location:** `packages/opencode/src/plugin/codex.ts`

**Purpose:** Enables ChatGPT Pro/Plus OAuth authentication for Codex models.

**Key Features:**
- PKCE OAuth flow with local server on port 1455
- Device code flow for headless environments
- Token refresh management
- Account ID extraction from JWT claims
- Custom fetch wrapper that rewrites URLs to Codex endpoint

**Auth Methods:**
```typescript
methods: [
  {
    label: "ChatGPT Pro/Plus (browser)",
    type: "oauth",
    authorize: async () => {
      // Browser-based PKCE flow
      // Starts local server, opens auth URL
      // Waits for callback with authorization code
    },
  },
  {
    label: "ChatGPT Pro/Plus (headless)",
    type: "oauth",
    authorize: async () => {
      // Device code flow
      // User enters code at auth.openai.com/codex/device
      // Polls for completion
    },
  },
  {
    label: "Manually enter API Key",
    type: "api",
  },
]
```

**Model Filtering:**
```typescript
const allowedModels = new Set([
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.1-codex",
])
// Removes non-Codex models from provider
// Sets costs to 0 (included with ChatGPT subscription)
```

**Custom Headers Hook:**
```typescript
"chat.headers": async (input, output) => {
  if (input.model.providerID !== "openai") return
  output.headers.originator = "opencode"
  output.headers["User-Agent"] = `opencode/${VERSION} (${os.platform()} ...)`
  output.headers.session_id = input.sessionID
}
```

### CopilotAuthPlugin (GitHub Copilot)

**Location:** `packages/opencode/src/plugin/copilot.ts`

**Purpose:** GitHub Copilot OAuth authentication with enterprise support.

**Key Features:**
- Device code flow for GitHub OAuth
- Enterprise URL support (data residency, self-hosted)
- Vision request detection
- Agent/user initiator tracking

**Auth Configuration:**
```typescript
methods: [
  {
    type: "oauth",
    label: "Login with GitHub Copilot",
    prompts: [
      {
        type: "select",
        key: "deploymentType",
        message: "Select GitHub deployment type",
        options: [
          { label: "GitHub.com", value: "github.com", hint: "Public" },
          { label: "GitHub Enterprise", value: "enterprise", hint: "Data residency or self-hosted" },
        ],
      },
      {
        type: "text",
        key: "enterpriseUrl",
        message: "Enter your GitHub Enterprise URL or domain",
        condition: (inputs) => inputs.deploymentType === "enterprise",
        validate: (value) => { /* URL validation */ },
      },
    ],
    authorize: async (inputs = {}) => {
      // Device code flow with enterprise support
    },
  },
]
```

**Custom Fetch:**
```typescript
async fetch(request: RequestInfo | URL, init?: RequestInit) {
  // Detects vision requests from message content
  // Sets x-initiator header (agent vs user)
  // Removes standard auth, uses GitHub token
  // Sets Copilot-Vision-Request header if needed
  return fetch(request, { ...init, headers })
}
```

---

## Plugin API

### PluginInput Context

```typescript
export type PluginInput = {
  // OpenCode SDK client for API calls
  client: ReturnType<typeof createOpencodeClient>
  
  // Project metadata
  project: Project  // { name, path, ... }
  
  // Filesystem context
  directory: string   // Current working directory
  worktree: string    // Git worktree root
  
  // Server info
  serverUrl: URL      // OpenCode server URL (e.g., http://localhost:4096)
  
  // Shell access
  $: BunShell         // Bun.$ for running commands
}
```

### SDK Client Capabilities

The `client` provides access to OpenCode's REST API:

```typescript
// Session management
await client.session.get({ path: { id: sessionID } })
await client.session.create({ body: { ... } })

// Authentication
await client.auth.set({ path: { id: "openai" }, body: { type: "oauth", ... } })
await client.auth.get({ path: { id: "openai" } })

// Provider/model info
await client.provider.list()
await client.model.get({ path: { provider, model } })

// And more...
```

### Tool Context

When tools execute, they receive:

```typescript
export type ToolContext = {
  sessionID: string
  messageID: string
  agent: string
  directory: string   // Project directory
  worktree: string    // Worktree root
  abort: AbortSignal  // Cancellation signal
  
  // Update tool display
  metadata(input: { title?: string; metadata?: { [key: string]: any } }): void
  
  // Request permissions
  ask(input: AskInput): Promise<void>
}
```

### Provider Context

```typescript
export type ProviderContext = {
  source: "env" | "config" | "custom" | "api"
  info: Provider
  options: Record<string, any>
}
```

---

## Plugin Configuration

### opencode.json Schema

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  
  // Plugin array - loaded in order
  "plugin": [
    // npm packages (with optional version)
    "oh-my-opencode@2.4.3",
    "@scope/my-plugin@1.0.0",
    "some-plugin",  // defaults to @latest
    
    // Local file paths (must start with file://)
    "file:///Users/tyler/.opencode/plugins/custom.ts"
  ],
  
  // Other config that plugins can access
  "provider": { ... },
  "mcp": { ... },
  "permission": { ... }
}
```

### Local Plugin Discovery

Plugins are auto-discovered from config directories:

```typescript
const PLUGIN_GLOB = new Bun.Glob("{plugin,plugins}/*.{ts,js}")

for (const dir of await Config.directories()) {
  for await (const item of PLUGIN_GLOB.scan({
    absolute: true,
    followSymlinks: true,
    dot: true,
    cwd: dir,
  })) {
    plugins.push(pathToFileURL(item).href)
  }
}
```

**Config directories scanned (in order):**
1. `~/.config/opencode/` (global)
2. `~/.opencode/` (user home)
3. `.opencode/` directories up to worktree root (project)
4. `OPENCODE_CONFIG_DIR` if set

### Plugin Deduplication

Later plugins override earlier ones with same name:

```typescript
function deduplicatePlugins(plugins: string[]): string[] {
  const seenNames = new Set<string>()
  const uniqueSpecifiers: string[] = []
  
  for (const specifier of plugins.toReversed()) {
    const name = getPluginName(specifier)
    if (!seenNames.has(name)) {
      seenNames.add(name)
      uniqueSpecifiers.push(specifier)
    }
  }
  
  return uniqueSpecifiers.toReversed()
}
```

---

## Custom Tool Registration

### Method 1: Via Plugin Hooks

```typescript
// my-plugin.ts
import { Plugin, tool } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      my_custom_tool: tool({
        description: "Does something useful",
        args: {
          input: tool.schema.string().describe("The input to process"),
          count: tool.schema.number().optional().describe("How many times"),
        },
        async execute(args, context) {
          // context.sessionID, context.directory, etc.
          return `Processed ${args.input} ${args.count ?? 1} times`
        },
      }),
    },
  }
}
```

### Method 2: Standalone Tool Files

Tools can be defined in `.opencode/{tool,tools}/*.{js,ts}`:

```typescript
// .opencode/tools/weather.ts
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Get weather for a location",
  args: {
    location: tool.schema.string().describe("City name"),
  },
  async execute(args, ctx) {
    const response = await fetch(`https://api.weather.com/...`)
    return JSON.stringify(await response.json())
  },
})

// Multiple exports create multiple tools
export const forecast = tool({
  description: "Get weather forecast",
  args: { location: tool.schema.string() },
  async execute(args) { ... },
})
```

### Tool Registration Internals

```typescript
// packages/opencode/src/tool/registry.ts
function fromPlugin(id: string, def: ToolDefinition): Tool.Info {
  return {
    id,
    init: async (initCtx) => ({
      parameters: z.object(def.args),
      description: def.description,
      execute: async (args, ctx) => {
        const pluginCtx = {
          ...ctx,
          directory: Instance.directory,
          worktree: Instance.worktree,
        } as unknown as PluginToolContext
        const result = await def.execute(args as any, pluginCtx)
        const out = await Truncate.output(result, {}, initCtx?.agent)
        return {
          title: "",
          output: out.truncated ? out.content : result,
          metadata: { truncated: out.truncated, outputPath: out.truncated ? out.outputPath : undefined },
        }
      },
    }),
  }
}
```

---

## Auth Flows

### AuthHook Structure

```typescript
export type AuthHook = {
  provider: string  // Provider ID this auth applies to
  
  // Called when provider needs authentication
  loader?: (
    auth: () => Promise<Auth>,
    provider: Provider
  ) => Promise<Record<string, any>>  // Returns options like apiKey, baseURL, fetch
  
  // Available authentication methods
  methods: (OAuthMethod | ApiMethod)[]
}
```

### OAuth Method

```typescript
{
  type: "oauth",
  label: "Login with OAuth",
  
  // Optional prompts for user input
  prompts?: Array<TextPrompt | SelectPrompt>,
  
  // Initiate auth flow
  authorize(inputs?: Record<string, string>): Promise<AuthOauthResult>
}

type AuthOauthResult = {
  url: string           // URL to open for user
  instructions: string  // Display to user
  method: "auto" | "code"
  callback(): Promise<AuthSuccess | AuthFailed>
}
```

### API Key Method

```typescript
{
  type: "api",
  label: "Enter API Key",
  prompts?: Array<TextPrompt | SelectPrompt>,
  
  // Optional custom authorization
  authorize?(inputs?: Record<string, string>): Promise<AuthSuccess | AuthFailed>
}
```

### Auth Storage

```typescript
// packages/opencode/src/auth/index.ts
export namespace Auth {
  export const Oauth = z.object({
    type: z.literal("oauth"),
    refresh: z.string(),
    access: z.string(),
    expires: z.number(),
    accountId: z.string().optional(),
    enterpriseUrl: z.string().optional(),
  })
  
  export const Api = z.object({
    type: z.literal("api"),
    key: z.string(),
  })
  
  // Stored in ~/.local/share/opencode/auth.json
  const filepath = path.join(Global.Path.data, "auth.json")
}
```

### Custom Fetch in Auth Loader

Plugins can return a custom `fetch` function to modify all requests:

```typescript
loader: async (getAuth, provider) => {
  return {
    apiKey: OAUTH_DUMMY_KEY,
    async fetch(requestInput: RequestInfo | URL, init?: RequestInit) {
      const auth = await getAuth()
      
      // Refresh token if needed
      if (auth.expires < Date.now()) {
        const tokens = await refreshAccessToken(auth.refresh)
        await client.auth.set({ ... })
      }
      
      // Modify headers
      headers.set("authorization", `Bearer ${auth.access}`)
      
      // Rewrite URLs if needed
      const url = parsed.pathname.includes("/v1/responses")
        ? new URL(CODEX_API_ENDPOINT)
        : parsed
      
      return fetch(url, { ...init, headers })
    },
  }
}
```

---

## Event System Integration

### Event Definition

Events are defined using `BusEvent.define()`:

```typescript
// packages/opencode/src/bus/bus-event.ts
export namespace BusEvent {
  export function define<Type extends string, Properties extends ZodType>(
    type: Type, 
    properties: Properties
  ) {
    return { type, properties }
  }
}
```

### Available Events

| Event Type | Properties | Description |
|------------|------------|-------------|
| `session.created` | `{ info }` | New session created |
| `session.updated` | `{ info }` | Session metadata changed |
| `session.deleted` | `{ id }` | Session deleted |
| `session.status` | `{ sessionID, status }` | Session status change |
| `session.idle` | `{ sessionID }` | Session became idle |
| `session.compacted` | `{ sessionID }` | Session was compacted |
| `session.diff` | `{ sessionID, diff }` | Git diff in session |
| `session.error` | `{ error }` | Session error occurred |
| `message.updated` | `{ sessionID, info }` | Message content changed |
| `message.removed` | `{ sessionID, messageID }` | Message deleted |
| `message.part.updated` | `{ sessionID, messageID, part }` | Message part changed |
| `message.part.removed` | `{ sessionID, messageID, partID }` | Message part removed |
| `todo.updated` | `{ sessionID, info }` | Todo list changed |
| `file.edited` | `{ path, ... }` | File was edited |
| `file.watcher.updated` | `{ path, type }` | File system change |
| `permission.asked` | `{ ... }` | Permission requested |
| `permission.replied` | `{ id, granted }` | Permission answered |
| `pty.created` | `{ info }` | Terminal created |
| `pty.updated` | `{ info }` | Terminal output |
| `pty.exited` | `{ id, exitCode }` | Terminal exited |
| `mcp.tools.changed` | `{ name }` | MCP tools updated |
| `command.executed` | `{ name, sessionID, arguments }` | Command ran |
| `vcs.branch.updated` | `{ branch }` | Git branch changed |
| `project.updated` | `{ ... }` | Project info changed |
| `lsp.updated` | `{}` | LSP state changed |
| `installation.updated` | `{ version }` | OpenCode updated |
| `server.connected` | `{}` | Server connected |
| `global.disposed` | `{}` | Instance disposed |

### Plugin Event Subscription

```typescript
// packages/opencode/src/plugin/index.ts
export async function init() {
  const hooks = await state().then((x) => x.hooks)
  
  // Subscribe to all events and forward to plugins
  Bus.subscribeAll(async (input) => {
    const hooks = await state().then((x) => x.hooks)
    for (const hook of hooks) {
      hook["event"]?.({ event: input })
    }
  })
}
```

### Event Handler Example

```typescript
const MyPlugin: Plugin = async (ctx) => {
  return {
    event: async ({ event }) => {
      switch (event.type) {
        case "session.created":
          console.log("New session:", event.properties.info.id)
          break
        case "file.edited":
          // Auto-format or validate
          break
        case "session.idle":
          // Run cleanup
          break
      }
    },
  }
}
```

---

## Comparison with Nexus Skills

### Architectural Differences

| Aspect | OpenCode Plugins | Nexus Skills |
|--------|-----------------|--------------|
| **Language** | TypeScript/JavaScript | Markdown with YAML |
| **Execution** | Code runs in process | Agent reads instructions |
| **Discovery** | npm + local scan | Filesystem scan for SKILL.md |
| **Capabilities** | Auth, tools, hooks, events | Documentation, metadata |
| **Dependencies** | npm packages | Binary requirements, credentials |
| **Installation** | `bun add` / auto-install | Binary install, credential setup |

### Nexus Skill Format

```yaml
---
name: gog
description: Google Workspace CLI for Gmail, Calendar, Drive, etc.
homepage: https://gogcli.sh
metadata:
  nexus:
    emoji: "📧"
    type: tool
    provides:
      - email-read
      - email-send
      - calendar
    requires:
      bins: [gog]
      credentials: [google-oauth]
    install:
      - id: brew
        kind: brew
        formula: steipete/tap/gogcli
        bins: [gog]
        label: Install gog (brew)
---

# gog

[Documentation content...]
```

### OpenCode Skill Format (compatible)

OpenCode also supports `SKILL.md` files with similar structure:

```typescript
// packages/opencode/src/skill/skill.ts
const OPENCODE_SKILL_GLOB = new Bun.Glob("{skill,skills}/**/SKILL.md")
const CLAUDE_SKILL_GLOB = new Bun.Glob("skills/**/SKILL.md")

// Skills scanned from:
// - .claude/skills/**
// - ~/.claude/skills/**
// - .opencode/{skill,skills}/**
// - Config skills.paths directories
```

### Capability Mapping

| Nexus Capability | OpenCode Equivalent |
|------------------|---------------------|
| Skills (docs) | Skills (SKILL.md) |
| Credentials | Auth system |
| CLI tools | - |
| Guides | Skills/Commands |
| Connectors | Auth plugins |
| Status tracking | - |
| Install automation | - |

### What OpenCode Plugins Can Do That Skills Can't

1. **Execute code** - Plugins run TypeScript/JavaScript
2. **Modify LLM behavior** - Hook into chat lifecycle
3. **Custom authentication** - Full OAuth implementations
4. **Register tools** - Add new agent capabilities
5. **React to events** - Subscribe to system events
6. **Transform messages** - Modify chat history
7. **Custom permissions** - Override permission decisions

### What Nexus Skills Can Do That Plugins Can't

1. **Declarative setup** - No code required
2. **Capability taxonomy** - Structured provides/requires
3. **Status tracking** - Ready/needs-setup/broken states
4. **Install automation** - Brew, npm, etc.
5. **Credential management** - Pointers to secure storage
6. **Human-readable docs** - Markdown for agents and humans

---

## Recommendations

### Option 1: Adopt OpenCode Plugin System As-Is

**Pros:**
- Full compatibility with OpenCode plugins
- Access to npm plugin ecosystem
- Code-based power and flexibility

**Cons:**
- Requires TypeScript/JavaScript knowledge
- Different paradigm than current skills
- More complex to create

### Option 2: Bridge Nexus Skills to OpenCode Hooks

Create a translation layer:

```typescript
// Hypothetical nexus-skill-plugin.ts
const NexusSkillPlugin: Plugin = async (ctx) => {
  const skills = await loadNexusSkills()
  
  return {
    // Register skills as OpenCode skills
    // Map credential requirements to auth hooks
    // Convert install requirements to tool metadata
    
    "chat.message": async (input, output) => {
      // Inject relevant skill context
    },
  }
}
```

### Option 3: Extend OpenCode Plugin System for Nexus

Add Nexus-specific capabilities:

1. **Skill status tracking** - Add hooks for capability states
2. **Credential management** - Integrate with Nexus credential system  
3. **Install automation** - Add `install` hook for setup flows
4. **Capability taxonomy** - Add provides/requires metadata

### Option 4: Parallel Systems

Run both systems:
- **Nexus Skills** for documentation, credentials, and capability tracking
- **OpenCode Plugins** for code-based extensions and LLM hooks

Skills inform the agent; plugins extend the runtime.

### Recommended Approach

**Option 4 (Parallel Systems)** appears most practical:

1. Keep Nexus Skills for their unique strengths:
   - Human-readable capability documentation
   - Credential management and status tracking
   - Installation automation

2. Adopt OpenCode Plugins for code extensions:
   - Custom tools that need code execution
   - Auth flows for new providers
   - Event-driven automation

3. Create integration points:
   - Skill metadata informs plugin configuration
   - Plugins can query skill status via Nexus CLI
   - Shared credential storage

---

## Appendix: Code References

### Key Files

| File | Purpose |
|------|---------|
| `packages/plugin/src/index.ts` | Plugin types and tool helper |
| `packages/opencode/src/plugin/index.ts` | Plugin loading and hook triggering |
| `packages/opencode/src/plugin/codex.ts` | Codex OAuth implementation |
| `packages/opencode/src/plugin/copilot.ts` | Copilot OAuth implementation |
| `packages/opencode/src/tool/registry.ts` | Tool registration |
| `packages/opencode/src/config/config.ts` | Plugin configuration loading |
| `packages/opencode/src/auth/index.ts` | Auth storage |
| `packages/opencode/src/bus/index.ts` | Event system |

### Example Plugin Structure

```
.opencode/
├── plugins/
│   └── my-plugin.ts      # Custom plugin
├── tools/
│   ├── weather.ts        # Standalone tool
│   └── calculator.ts     # Another tool
├── opencode.json         # Plugin config
└── package.json          # Dependencies
```
