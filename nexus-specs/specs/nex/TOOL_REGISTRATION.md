# Tool Registration

**Status:** DESIGN COMPLETE  
**Last Updated:** 2026-01-30  
**Related:** NEX.md, CREDENTIAL_SYSTEM.md, UPSTREAM_PLUGINS.md

---

## Overview

Tools in Nexus are registered through two mechanisms:

1. **File-based** — TypeScript files in `tools/` directory
2. **MCP servers** — External or internal Model Context Protocol servers

**Design principle:** Lean towards "code mode" where possible. Provide core tools for file/shell operations, but encourage agents to write code rather than rely on specialized tools.

---

## Tool Sources

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TOOL REGISTRY                                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        Built-in Tools                                    ││
│  │                        (loaded at startup)                               ││
│  │                                                                          ││
│  │  tools/builtin/                                                         ││
│  │  ├── read.ts        # Read file                                        ││
│  │  ├── write.ts       # Write file                                       ││
│  │  ├── edit.ts        # Edit file (str_replace)                          ││
│  │  ├── bash.ts        # Execute shell command                            ││
│  │  ├── grep.ts        # Search file contents                             ││
│  │  ├── glob.ts        # Find files by pattern                            ││
│  │  ├── ls.ts          # List directory                                   ││
│  │  ├── task.ts        # Spawn subagent                                   ││
│  │  └── ...                                                                ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        Dynamic Tools                                     ││
│  │                        (hot-reload on change)                            ││
│  │                                                                          ││
│  │  tools/dynamic/                                                         ││
│  │  ├── my-custom-tool.ts                                                  ││
│  │  └── another-tool.ts                                                    ││
│  │                                                                          ││
│  │  File watcher detects changes → reloads tool                           ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        MCP Servers                                       ││
│  │                        (external protocol)                               ││
│  │                                                                          ││
│  │  Configured in nex.yaml:                                                ││
│  │  mcp:                                                                   ││
│  │    servers:                                                             ││
│  │      - name: github                                                     ││
│  │        command: npx @modelcontextprotocol/server-github                ││
│  │      - name: postgres                                                   ││
│  │        command: npx @modelcontextprotocol/server-postgres              ││
│  │      - name: custom                                                     ││
│  │        url: http://localhost:9001                                       ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Tool Definition Format

### Built-in / Dynamic Tools

```typescript
// tools/dynamic/weather.ts
import { z } from 'zod'
import { defineTool } from '@nexus/tools'

export default defineTool({
  name: 'weather',
  description: 'Get current weather for a location',
  
  parameters: z.object({
    location: z.string().describe('City name or coordinates'),
    units: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  }),
  
  // Optional: declare credential dependencies
  requires_credentials: ['weather-api'],
  
  // Execute function
  execute: async ({ location, units }, ctx) => {
    const apiKey = await ctx.credentials.get('weather-api', 'api_key')
    const response = await fetch(
      `https://api.weather.com/v1/current?q=${location}&units=${units}&key=${apiKey}`
    )
    const data = await response.json()
    return {
      location: data.location.name,
      temperature: data.current.temp,
      conditions: data.current.condition.text,
    }
  },
})
```

### Tool Context

Tools receive a context object:

```typescript
interface ToolContext {
  // Credential access
  credentials: {
    get(service: string, key: string): Promise<string>
    has(service: string): Promise<boolean>
  }
  
  // Current request info
  request: {
    request_id: string
    turn_id: string
    session_id: string
    principal: Principal
  }
  
  // Abort signal for cancellation
  signal: AbortSignal
  
  // Logging
  log: Logger
}
```

---

## Hot-Reload for Dynamic Tools

The `tools/dynamic/` directory is watched for changes:

```typescript
// File watcher behavior
watch('tools/dynamic/', async (event, path) => {
  if (event === 'add' || event === 'change') {
    const tool = await loadTool(path)
    ToolRegistry.register(tool)
    Bus.publish(Event.Tools.RegistryChanged, { 
      added: [tool.name] 
    })
  }
  
  if (event === 'unlink') {
    const name = extractToolName(path)
    ToolRegistry.unregister(name)
    Bus.publish(Event.Tools.RegistryChanged, { 
      removed: [name] 
    })
  }
})
```

**Use cases:**
- Agent creates a custom tool by writing a file
- User adds a tool without restarting Nexus
- Quick iteration during development

---

## MCP Integration

For complex tool suites, use MCP servers:

```yaml
# nex.yaml
mcp:
  servers:
    # NPM package
    - name: github
      command: npx @modelcontextprotocol/server-github
      env:
        GITHUB_TOKEN: ${credentials:github/token}
    
    # Local script
    - name: custom
      command: node ./mcp-servers/my-server.js
    
    # External service
    - name: remote
      url: https://mcp.example.com
      headers:
        Authorization: Bearer ${credentials:example/token}
```

**When to use MCP:**
- Tool suite with multiple related tools
- External service integration
- Complex stateful operations
- Shared infrastructure (multiple agents use same server)

**When to use file-based:**
- Simple single-purpose tool
- Quick prototype
- Agent-created tool

---

## Built-in Tools (Minimal Core)

Following the principle of "lean towards code mode":

| Tool | Purpose | Why Built-in |
|------|---------|--------------|
| `read` | Read file contents | Core file operation |
| `write` | Write file contents | Core file operation |
| `edit` | String replace in file | Core file operation |
| `bash` | Execute shell command | Core execution |
| `grep` | Search file contents | Core search |
| `glob` | Find files by pattern | Core search |
| `ls` | List directory | Core navigation |
| `task` | Spawn subagent | Core orchestration |
| `web_search` | Search the web | External knowledge |
| `web_fetch` | Fetch URL content | External knowledge |

**NOT built-in (use code instead):**
- JSON parsing → Use bash + jq, or write code
- API calls → Use bash + curl, or write code
- Data processing → Write code
- Complex workflows → Write code

**Philosophy:** Provide primitives, not conveniences. Agents can write code for anything else.

---

## Credential Integration

Tools can declare credential dependencies:

```typescript
export default defineTool({
  name: 'github_search',
  requires_credentials: ['github'],
  
  execute: async (args, ctx) => {
    // Credentials validated before execute is called
    const token = await ctx.credentials.get('github', 'token')
    // ... use token
  },
})
```

**Runtime behavior:**
1. Before tool execution, check `requires_credentials`
2. If credential missing → error with setup instructions
3. If credential expired → attempt refresh (if OAuth)
4. If refresh fails → error with re-auth instructions

---

## Agent Tool Creation

Agents can create tools by writing files:

```typescript
// Agent uses write tool to create a new tool
await write({
  path: 'tools/dynamic/slack-notify.ts',
  content: `
import { z } from 'zod'
import { defineTool } from '@nexus/tools'

export default defineTool({
  name: 'slack_notify',
  description: 'Send a Slack notification',
  parameters: z.object({
    channel: z.string(),
    message: z.string(),
  }),
  requires_credentials: ['slack'],
  execute: async ({ channel, message }, ctx) => {
    const token = await ctx.credentials.get('slack', 'bot_token')
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 
        'Authorization': \`Bearer \${token}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel, text: message }),
    })
    return { success: true }
  },
})
`
})
```

Hot-reload picks up the new tool immediately.

---

## Tool Availability by Context

Not all tools are available in all contexts:

```typescript
interface ToolAvailability {
  // Always available
  core: ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'ls']
  
  // Available based on permissions
  restricted: {
    'task': requires_permission('spawn_subagent'),
    'web_search': requires_permission('internet_access'),
    'web_fetch': requires_permission('internet_access'),
  }
  
  // Available based on credentials
  credential_gated: {
    'github_search': requires_credential('github'),
    'slack_notify': requires_credential('slack'),
  }
}
```

ACL policies can restrict tool access by principal:

```yaml
# iam/policies/tool-restrictions.yaml
policies:
  - name: "Limit external tools for unknown senders"
    match:
      principal:
        relationship: unknown
    permissions:
      tools:
        deny: [web_search, web_fetch, task]
```

---

## Comparison with OpenCode Plugins

| OpenCode Plugin Feature | Nexus Equivalent |
|------------------------|------------------|
| `tools()` function | `tools/dynamic/` + MCP |
| Runtime registration | Hot-reload watcher |
| Auth bundling | `requires_credentials` + Credentials system |
| Request modification | NEX plugins |

**Key difference:** OpenCode bundles tools with plugins. Nexus separates:
- **Tools** = What the agent can do
- **Credentials** = Auth for external services
- **NEX Plugins** = Pipeline modification

This separation is cleaner and more modular.

---

## File Locations

```
packages/core/src/
├── tools/
│   ├── registry.ts       # Tool registry
│   ├── loader.ts         # Load tools from directory
│   ├── watcher.ts        # Hot-reload watcher
│   ├── types.ts          # Tool interface
│   └── builtin/          # Built-in tools
│       ├── read.ts
│       ├── write.ts
│       └── ...
│
├── mcp/
│   ├── manager.ts        # MCP server lifecycle
│   ├── client.ts         # MCP protocol client
│   └── types.ts          # MCP types

~/nexus/
├── tools/
│   └── dynamic/          # User/agent created tools
│       └── *.ts
```

---

## Summary

1. **Built-in tools** — Minimal core, file/shell primitives
2. **Dynamic tools** — Hot-reloaded from `tools/dynamic/`
3. **MCP servers** — Complex/external tool suites
4. **Lean towards code** — Agents write code for most tasks
5. **Credential integration** — Tools declare dependencies, runtime validates

This approach provides flexibility without complexity. Simple tools are files, complex integrations are MCP, and agents can create their own tools.
