# Extension System Comparison

OpenClaw's plugin system vs Nexus's extension model.

---

## OpenClaw Plugin System

### What a Plugin Can Provide

```typescript
// A plugin can register:
registerTool(tool | factory)           // Agent tools
registerHook("before_agent_start", handler)  // Lifecycle hooks
registerChannel(channelPlugin)         // New messaging channels
registerProvider(providerPlugin)       // New LLM providers
registerGatewayMethod("custom.method", handler)  // RPC methods
registerHttpPath("/my-webhook", handler)  // HTTP endpoints
registerCliCommand(command)            // CLI commands
registerInternalHook("event:key", handler)  // Internal events
```

### Plugin Manifest (`package.json`)

```json
{
  "name": "@openclaw/plugin-voice-call",
  "version": "1.2.3",
  "openclaw": {
    "extensions": ["./dist/index.js"]
  },
  "dependencies": {
    "twilio": "^4.0.0"
  }
}
```

### Install Sources

| Source | Example | How It Works |
|--------|---------|--------------|
| **Local file** | `./plugin.ts` | Symlinks to extensions dir |
| **Local dir** | `~/my-plugin` | Copies to extensions dir |
| **Archive** | `plugin.zip` | Extracts and installs |
| **npm** | `@openclaw/plugin-foo` | `npm pack` + extract |
| **npm with version** | `@openclaw/plugin-foo@1.2.3` | Specific version |

### Install Location

```
~/.openclaw/extensions/
├── voice-call/
│   ├── package.json
│   ├── dist/
│   │   └── index.js
│   └── node_modules/
├── my-custom/
│   └── ...
```

### Enable/Disable

```json
{
  "plugins": {
    "denylist": ["voice-call"],
    "allowlist": ["*"]
  }
}
```

### Plugin API Surface

```typescript
export function register(api: OpenClawPluginApi) {
  // Tools
  api.registerTool({ name: "my_tool", ... });
  api.registerToolFactory((ctx) => { ... });

  // Lifecycle hooks
  api.on("before_agent_start", async (event, ctx) => { ... });
  api.on("after_agent_reply", async (event, ctx) => { ... });

  // Channels
  api.registerChannel(myChannelPlugin);

  // Providers
  api.registerProvider({ id: "my-provider", ... });

  // Gateway RPC
  api.registerGatewayMethod("my.method", handler);

  // HTTP endpoints
  api.registerHttpPath("/webhook", handler);

  // CLI commands
  api.registerCliCommand(command);
}
```

### Characteristics

| Aspect | OpenClaw Approach |
|--------|-------------------|
| **Language** | TypeScript/JavaScript only |
| **Isolation** | None — runs in gateway process |
| **Discovery** | npm package or local path |
| **Dependencies** | Full npm ecosystem |
| **Failure mode** | Can crash gateway |
| **Hot reload** | No — gateway restart required |
| **Security** | Full process access |

---

## Nexus Extension Model

Nexus intentionally splits "plugins" into distinct, purpose-built extension points.

### Extension Types

| Type | Purpose | Isolation | Location |
|------|---------|-----------|----------|
| **Adapters** | Channel integrations | Separate process | `adapters/` |
| **Automations** | Pipeline hooks | Sandboxed scripts | `state/automations/` |
| **Skills** | Agent capabilities | Documentation | `skills/` |
| **Tools** | Agent actions | Broker-managed | Skill-declared |
| **Providers** | LLM backends | Config-based | `config.json` |

### Adapters (Channels)

Adapters are **separate processes** that NEX communicates with via defined protocols.

```yaml
# adapters/discord/adapter.yaml
id: discord
name: Discord
protocol: websocket
inbound:
  events: [message, reaction, mention]
outbound:
  methods: [send, reply, react]
config:
  token: ${DISCORD_TOKEN}
```

**Key difference:** Adapters crash independently. NEX can restart them without affecting other channels.

### Automations (Hooks)

Automations are **sandboxed scripts** that run at NEX pipeline hook points.

```typescript
// state/automations/mom-2fa-helper.ts
export const hook = "pre_response";
export const trigger = {
  sender: "mom",
  content: /verification code|2FA/i
};

export async function run(ctx: AutomationContext) {
  // Access to NexusRequest, limited APIs
  return { skipAgent: true, directReply: "I'll help you with that code!" };
}
```

**Key difference:** Automations have limited API access. They can't crash NEX.

### Skills (Capabilities)

Skills are **documentation files** that agents read on-demand.

```markdown
# SKILL.md - Weather

## When to use
User asks about weather, forecasts, conditions.

## How to use
Use the `weather` tool with location parameter.

## Examples
- "What's the weather in Austin?" → weather(location="Austin, TX")
```

**Key difference:** Skills don't execute code — they guide agents.

### Tools (Actions)

Tools are declared by skills and executed by Broker.

```yaml
# In skill's TOOL.yaml
name: weather
description: Get current weather
parameters:
  location: { type: string, required: true }
execute:
  type: http
  method: GET
  url: "https://api.weather.com/v1/current?q=${location}"
```

**Key difference:** Tools are declarative. Broker handles execution, sandboxing, retries.

### Providers (LLMs)

Providers are configuration, not code.

```yaml
# In config.yaml
providers:
  anthropic:
    api_key: ${ANTHROPIC_API_KEY}
    models: [claude-sonnet-4-20250514, claude-opus-4-20250514]
  openai:
    api_key: ${OPENAI_API_KEY}
    models: [gpt-4o, gpt-4-turbo]
```

**Key difference:** No provider plugin code. Standard OpenAI-compatible API assumed.

---

## Mapping OpenClaw → Nexus

| OpenClaw Plugin Feature | Nexus Equivalent | Notes |
|-------------------------|------------------|-------|
| `registerTool` | Skill TOOL.yaml | Declarative, Broker-executed |
| `registerToolFactory` | Dynamic skill loading | Based on context |
| `registerHook` | Automation script | Sandboxed, limited API |
| `registerChannel` | Adapter process | Isolated, restartable |
| `registerProvider` | Config-based | No code required |
| `registerGatewayMethod` | NEX RPC adapter | Debug/admin interface |
| `registerHttpPath` | Webhook adapter | Standard adapter pattern |
| `registerCliCommand` | Not supported | CLI is nexus-only |
| `registerInternalHook` | NEX events | Internal pub/sub |

---

## Design Philosophy

### OpenClaw: Maximum Flexibility

- Plugins can do anything
- Full TypeScript ecosystem
- Deep integration with gateway internals
- Risk: Plugins can break everything

### Nexus: Stability Over Flexibility

- Each extension type has clear boundaries
- Failures are isolated
- Declarative where possible
- Risk: Some advanced use cases harder

---

## What Nexus Gains

| Gain | How |
|------|-----|
| **Stability** | Adapter crashes don't kill NEX |
| **Security** | Automations can't access arbitrary files |
| **Simplicity** | Skills are just markdown |
| **Debugging** | Clear boundaries between components |
| **Portability** | Declarative tools work across providers |

## What Nexus Loses

| Loss | Mitigation |
|------|------------|
| **Runtime flexibility** | Automations cover most hooks |
| **Deep integration** | Core adapters handle common cases |
| **npm ecosystem** | Skills can reference external tools |
| **Custom providers** | OpenAI-compatible API covers most |

---

## Recommendation

Nexus's split approach is the right call for a personal AI system:

1. **Adapters as processes** — Battle-tested pattern (LSP, DAP, etc.)
2. **Automations as scripts** — Enough power for personalization
3. **Skills as docs** — Agents read what they need
4. **Tools as declarations** — Broker handles the hard parts

The main gap: No equivalent to `registerCliCommand`. If someone wants to extend the Nexus CLI, they'd need to contribute upstream or use shell aliases.

---

*This comparison informs Nexus's extension architecture. See `runtime/nex/automations/` for automation specs.*
