# OpenClaw Harness Integrations

**Status:** REFERENCE DOCUMENT  
**Source:** OpenClaw upstream (`openclaw/`)  
**Last Updated:** 2026-02-04

---

## Overview

OpenClaw is primarily a **gateway-first** system designed around messaging channels (WhatsApp, Telegram, Discord, etc.) rather than IDE integration. However, there are several ways OpenClaw can interact with coding agent harnesses.

This document covers:
1. OpenClaw's architecture (why it's gateway-first)
2. Context injection mechanisms
3. Integration patterns with IDE harnesses
4. Gateway vs standalone modes

---

## OpenClaw's Gateway-First Architecture

Unlike IDE-native tools (Cursor, Claude Code), OpenClaw runs as a **background service** that:

1. Provides a WebSocket API for clients
2. Manages multiple messaging channel connections
3. Offers a web-based Control UI
4. Handles authentication, sessions, and tools

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Gateway Server                                   │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ WebSocket    │  │ HTTP API     │  │ Control UI   │  │ OpenAI     │  │
│  │ Core         │  │ /v1/...      │  │ (Web)        │  │ Compat     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬─────┘  │
│         │                 │                 │                 │         │
│         └─────────────────┴─────────────────┴─────────────────┘         │
│                                   │                                      │
│  ┌────────────────────────────────┴────────────────────────────────┐    │
│  │                      Session Manager                             │    │
│  │    ┌────────────┐  ┌────────────┐  ┌────────────┐              │    │
│  │    │ Agent Loop │  │ Tools      │  │ Memory     │              │    │
│  │    └────────────┘  └────────────┘  └────────────┘              │    │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                   │                                      │
│  ┌────────────────────────────────┴────────────────────────────────┐    │
│  │                     Channel Manager                              │    │
│  │  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐  │    │
│  │  │WhatsApp │ │ Telegram │ │ Discord │ │ Signal │ │ iMessage │  │    │
│  │  └─────────┘ └──────────┘ └─────────┘ └────────┘ └──────────┘  │    │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Insight

**OpenClaw does NOT have built-in IDE integration.** It's designed to be a standalone runtime that clients connect to via WebSocket. The gateway handles:

- Agent session management
- Tool execution
- LLM API calls
- Channel message routing
- Memory and context

---

## Context Injection Mechanisms

### Bootstrap Files

OpenClaw injects context from workspace files into every session:

```typescript
// Files loaded at session start
const BOOTSTRAP_FILES = [
  "AGENTS.md",      // Operating instructions
  "SOUL.md",        // Personality and boundaries
  "USER.md",        // User profile
  "IDENTITY.md",    // Agent identity
  "TOOLS.md",       // Local tool notes
  "HEARTBEAT.md",   // Heartbeat checklist
  "MEMORY.md",      // Long-term memory (main session only)
];

// Subagents only get a subset for security
const SUBAGENT_ALLOWLIST = ["AGENTS.md", "TOOLS.md"];
```

### System Prompt Construction

```typescript
// From agents/system-prompt.ts

function buildAgentSystemPrompt(params): string {
  const lines = [
    "You are a personal assistant running inside OpenClaw.",
    "",
    "## Tooling",
    // ... tool list with summaries
    "",
    "## Tool Call Style",
    // ... narration guidance
    "",
    "## OpenClaw CLI Quick Reference",
    // ... CLI help
    "",
    // Skills section (if skills available)
    ...buildSkillsSection({ skillsPrompt, isMinimal, readToolName }),
    "",
    "## Workspace",
    `Your working directory is: ${params.workspaceDir}`,
    "",
    "## Workspace Files (injected)",
    "These user-editable files are loaded by OpenClaw and included below.",
    "",
    // Bootstrap file contents
    ...workspaceFiles.map(f => `### ${f.name}\n${f.content}`),
    "",
    "## Silent Replies",
    `When you have nothing to say, respond with ONLY: HEARTBEAT_OK`,
    "",
    "## Runtime",
    buildRuntimeLine(runtimeInfo),
  ];
  
  return lines.filter(Boolean).join("\n");
}
```

### Prompt Modes

```typescript
export type PromptMode = "full" | "minimal" | "none";

// full: All sections (main agent)
// minimal: Reduced sections (subagents)
// none: Just "You are a personal assistant running inside OpenClaw."
```

---

## Integration Patterns

### 1. Gateway Mode (Primary)

OpenClaw runs as a daemon, clients connect via WebSocket:

```
┌──────────────┐     WebSocket      ┌────────────────┐
│   TUI        │◄──────────────────►│                │
└──────────────┘                    │                │
                                    │    Gateway     │
┌──────────────┐     WebSocket      │    Server      │
│  Control UI  │◄──────────────────►│    (:18789)   │
└──────────────┘                    │                │
                                    │                │
┌──────────────┐     Channel        │                │
│  WhatsApp    │◄──────────────────►│                │
└──────────────┘                    └────────────────┘
```

**Use cases:**
- Messaging channel integration
- Web-based interaction
- Mobile app backends
- Multi-client scenarios

### 2. Standalone Mode

Direct CLI invocation without the gateway:

```bash
# Run a single agent session
openclaw chat

# Run a specific session
openclaw session resume <id>
```

### 3. API Mode

OpenClaw exposes OpenAI-compatible HTTP endpoints:

```bash
# Chat completions endpoint
curl http://localhost:18789/v1/chat/completions \
  -H "Authorization: Bearer $OPENCLAW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-sonnet-4-20250514", "messages": [...]}'

# Responses endpoint
curl http://localhost:18789/v1/responses \
  -H "Authorization: Bearer $OPENCLAW_TOKEN" \
  -d '{"model": "claude-sonnet-4-20250514", "input": "..."}'
```

---

## IDE Harness Integration Points

While OpenClaw doesn't have native IDE integration, there are several integration patterns:

### Pattern 1: AGENTS.md as Universal Context

Any harness that supports workspace context files can read OpenClaw's bootstrap files:

```markdown
# Reading OpenClaw workspace in Cursor

Add to .cursor/rules/openclaw.mdc:

---
description: "Load OpenClaw workspace context"
globs: ["**/*"]
---

Read these files from ~/.openclaw/workspace/ for agent context:
- AGENTS.md — Operating instructions
- SOUL.md — Agent personality
- USER.md — User profile
- TOOLS.md — Local tool notes
```

### Pattern 2: Gateway as Backend

Use the gateway's WebSocket API from IDE extensions:

```typescript
// Hypothetical Cursor extension using OpenClaw gateway
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:18789/ws');

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'session.create',
    agent_id: 'main',
  }));
});

ws.on('message', (data) => {
  const event = JSON.parse(data);
  // Handle streaming responses, tool calls, etc.
});
```

### Pattern 3: HTTP API for Tools

Use OpenClaw's HTTP API as a tool provider:

```typescript
// Cursor tool using OpenClaw API
async function callOpenClaw(prompt: string) {
  const response = await fetch('http://localhost:18789/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENCLAW_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      input: prompt,
    }),
  });
  return response.json();
}
```

---

## Comparison: OpenClaw vs IDE-Native Agents

| Aspect | OpenClaw | Claude Code | Cursor |
|--------|----------|-------------|--------|
| Primary interface | Gateway + TUI | CLI | IDE |
| Context injection | Bootstrap files | CLAUDE.md | Rules + hooks |
| Session persistence | File-based JSONL | SQLite | SQLite |
| Tool execution | Gateway-managed | Direct | Direct |
| Multi-channel | Yes (core feature) | No | No |
| IDE integration | None (gateway-first) | VS Code extension | Native |

### What OpenClaw Does Well

1. **Multi-channel messaging** — WhatsApp, Telegram, Discord, etc.
2. **Gateway as service** — Always-on daemon for background agents
3. **Web UI** — Browser-based Control UI
4. **OpenAI-compatible API** — Drop-in replacement

### What IDE-Native Tools Do Better

1. **File context** — Direct access to IDE file state
2. **LSP integration** — Language server features
3. **Real-time editing** — Streaming edits to editor
4. **Low latency** — No gateway hop

---

## Context File Formats

### AGENTS.md Format

OpenClaw expects specific sections in AGENTS.md:

```markdown
# AGENTS.md - Your Workspace

## First Run
If `BOOTSTRAP.md` exists, follow it then delete it.

## Every Session
1. Read `SOUL.md`
2. Read `USER.md`
3. Read `memory/YYYY-MM-DD.md`
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
```

### Versus CLAUDE.md

Claude Code uses a simpler format:

```markdown
# CLAUDE.md

Project-specific instructions for Claude.

## Code Style
...

## Testing
...
```

### Versus Cursor Rules

Cursor uses MDC format with frontmatter:

```markdown
---
description: "Rule description"
globs: ["*.ts", "*.tsx"]
---

Rule content here...
```

---

## Gateway Protocol

### WebSocket Messages

```typescript
// Client → Server
interface ClientMessage {
  type: 
    | 'session.create'
    | 'session.message'
    | 'session.cancel'
    | 'permission.respond'
    | 'heartbeat';
  // ... payload fields
}

// Server → Client
interface ServerMessage {
  type:
    | 'session.created'
    | 'message.delta'
    | 'message.complete'
    | 'tool.call'
    | 'tool.result'
    | 'permission.ask'
    | 'error';
  // ... payload fields
}
```

### Session Events

```typescript
// Session lifecycle
'session.created'      // New session started
'session.updated'      // Session state changed
'session.deleted'      // Session ended

// Message events
'message.delta'        // Streaming text chunk
'message.complete'     // Message finished
'part.updated'         // Message part updated

// Tool events
'tool.call'            // Tool invoked
'tool.result'          // Tool completed

// Permission events
'permission.ask'       // Tool needs approval
'permission.replied'   // User responded
```

---

## Skills Integration

OpenClaw skills are markdown files that provide tool instructions:

```markdown
# skills/weather/SKILL.md

---
name: weather
description: Get weather information
metadata: {"openclaw":{"emoji":"🌤️","requires":{"bins":["curl"]}}}
---

## Usage

Use curl to fetch weather data:

```bash
curl wttr.in/{location}?format=3
```
```

### Skills Discovery

```typescript
// Skills loaded from:
// 1. Bundled: openclaw/skills/
// 2. Managed: ~/.openclaw/skills/
// 3. Workspace: ~/.openclaw/workspace/skills/

const skillPaths = [
  path.join(bundledDir, 'skills'),
  path.join(stateDir, 'skills'),
  path.join(workspaceDir, 'skills'),
];
```

### Skills in System Prompt

```typescript
function buildSkillsSection({ skillsPrompt, availableSkills }) {
  return [
    "## Skills",
    "",
    "Skills are markdown guides for using external tools.",
    "Read a skill with: `cat ~/.openclaw/workspace/skills/{name}/SKILL.md`",
    "",
    "Available skills:",
    ...availableSkills.map(s => `- ${s.emoji} ${s.name}: ${s.description}`),
  ];
}
```

---

## Plugin System

OpenClaw supports plugins for extending functionality:

### Plugin Types

```typescript
interface ChannelPlugin {
  id: ChannelId;
  meta: ChannelMeta;
  capabilities: ChannelCapabilities;
  
  // Lifecycle
  onboarding?: ChannelOnboardingAdapter;
  setup?: ChannelSetupAdapter;
  gateway?: ChannelGatewayAdapter;
  
  // Messaging
  outbound?: ChannelOutboundAdapter;
  streaming?: ChannelStreamingAdapter;
  
  // Tools
  agentTools?: ChannelAgentTool[];
}
```

### Plugin Discovery

```typescript
const ORIGIN_PRIORITY = {
  config: 0,      // Explicit paths in config
  workspace: 1,   // ~/.openclaw/workspace/plugins/
  global: 2,      // ~/.openclaw/plugins/
  bundled: 3,     // Built-in extensions/
};
```

### Extension Directory

OpenClaw bundles channel plugins in `extensions/`:

```
extensions/
├── bluebubbles/     # BlueBubbles iMessage bridge
├── discord/         # Discord bot
├── imessage/        # Direct iMessage (macOS)
├── matrix/          # Matrix protocol
├── signal/          # Signal via signal-cli
├── slack/           # Slack bot
├── telegram/        # Telegram bot
├── whatsapp/        # WhatsApp via Baileys
├── voice-call/      # Twilio/Plivo voice calls
└── ...
```

---

## Implementing Custom Harness Bindings

If you want to integrate OpenClaw with an IDE harness:

### Option 1: Read Workspace Files

Simply read the bootstrap files and inject them as context:

```typescript
// Read OpenClaw workspace
async function getOpenClawContext(): Promise<string> {
  const workspace = path.join(os.homedir(), '.openclaw', 'workspace');
  const files = ['AGENTS.md', 'SOUL.md', 'USER.md', 'TOOLS.md'];
  
  const contents = await Promise.all(
    files.map(async (f) => {
      try {
        const content = await fs.readFile(path.join(workspace, f), 'utf-8');
        return `## ${f}\n\n${content}`;
      } catch {
        return null;
      }
    })
  );
  
  return contents.filter(Boolean).join('\n\n---\n\n');
}
```

### Option 2: Use Gateway API

Connect to the gateway for full agent functionality:

```typescript
class OpenClawClient {
  private ws: WebSocket;
  
  async connect(url: string, token: string) {
    this.ws = new WebSocket(url);
    await new Promise((resolve) => this.ws.on('open', resolve));
    
    // Authenticate
    this.ws.send(JSON.stringify({
      type: 'auth',
      token,
    }));
  }
  
  async sendMessage(sessionId: string, content: string) {
    this.ws.send(JSON.stringify({
      type: 'session.message',
      session_id: sessionId,
      content,
    }));
  }
}
```

### Option 3: Proxy Gateway Tools

Use OpenClaw's tools through HTTP API:

```typescript
// Use OpenClaw's tools via API
async function invokeOpenClawTool(tool: string, args: object) {
  const response = await fetch('http://localhost:18789/v1/tools/invoke', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tool, arguments: args }),
  });
  return response.json();
}
```

---

## Comparison with Nexus Harness Bindings

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| Harness support | None (gateway-first) | Claude Code, Cursor, OpenCode, Codex |
| Context injection | Bootstrap files via system prompt | Session hooks, AGENTS.md |
| IDE integration | Manual/external | Native harness bindings |
| Session start | WebSocket connection | Hook-triggered |
| Identity loading | Workspace files | `state/agents/{id}/` files |

### Key Difference

**OpenClaw:** Expects clients to connect to the gateway  
**Nexus:** Injects context into harness at session start

---

*This document captures OpenClaw's harness integration patterns for comparison with Nexus. See `foundation/harnesses/HARNESS_BINDINGS.md` for the Nexus harness binding spec.*
