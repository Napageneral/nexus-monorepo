# Nexus Context Injection System (Ideal)

**Purpose:** Define what context Nexus injects and at which layer.  
**Status:** DESIGN  
**Last Updated:** 2026-01-27

---

## Overview

Nexus uses a **layered context injection model** with three distinct levels:

1. **Workspace Level** — Universal context for ALL agents (harnesses and embedded)
2. **Manager Agent (MA)** — Communication/messaging context (embedded only)
3. **Worker Agent (WA)** — Task execution context (embedded only)

The key insight: **Most context belongs at the workspace level** since external harnesses (Cursor, Claude Code) need the same information as embedded workers. Only the MA has unique communication responsibilities.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LAYER 1: WORKSPACE CONTEXT                           │
│                                                                              │
│   Delivered via:                                                             │
│   • AGENTS.md (static, workspace root)                                      │
│   • nexus status --json (dynamic, via hooks)                                │
│   • Session hook injection (identity files)                                 │
│                                                                              │
│   WHO GETS IT: Everyone                                                      │
│   • Cursor agents                                                            │
│   • Claude Code agents                                                       │
│   • Codex agents                                                             │
│   • Embedded Manager Agent                                                   │
│   • Embedded Worker Agents                                                   │
│                                                                              │
│   CONTENTS:                                                                  │
│   ├── Nexus CLI reference                                                   │
│   ├── Safety rules (external vs internal)                                   │
│   ├── File path pointers                                                    │
│   ├── Skills discovery ("nexus skills use <name>")                          │
│   ├── Identity injection (SOUL.md, IDENTITY.md, USER IDENTITY.md)          │
│   ├── Time/timezone                                                         │
│   ├── Runtime info (OS, arch, model)                                       │
│   └── Tool call style guidance                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────────┐
│  HARNESS AGENTS     │  │  MANAGER AGENT (MA) │  │  WORKER AGENTS (WA)     │
│  (Cursor, Claude)   │  │  (Embedded only)    │  │  (Embedded only)        │
│                     │  │                     │  │                         │
│  Gets:              │  │  Gets Layer 1 PLUS: │  │  Gets Layer 1 PLUS:     │
│  • Layer 1 only     │  │  • Reply tags       │  │  • Task instructions    │
│                     │  │  • Messaging rules  │  │    (from spawn prompt)  │
│  Does NOT get:      │  │  • Group chat rules │  │                         │
│  • Reply tags       │  │  • Reactions        │  │  Does NOT get:          │
│  • Messaging        │  │  • Platform format  │  │  • Reply tags           │
│  • Reactions        │  │                     │  │  • Messaging            │
│  • Group chat       │  │  Does NOT get:      │  │  • Reactions            │
│                     │  │  • Skills details   │  │                         │
│                     │  │  • Heavy tooling    │  │                         │
└─────────────────────┘  └─────────────────────┘  └─────────────────────────┘
```

---

## Layer 1: Workspace Context

### Delivery Mechanisms

| Mechanism | What It Delivers | When |
|-----------|------------------|------|
| **AGENTS.md** | Static workspace rules, CLI reference, safety | Always available |
| **nexus status --json** | Dynamic status, capability state | On demand / hook |
| **Session hook** | Identity files (SOUL, IDENTITY, USER) | Session start |
| **nexus skills use** | Skill documentation | On demand |

### AGENTS.md Content (Workspace Root)

```markdown
# AGENTS.md - Nexus Workspace

You are operating within a Nexus workspace — a personal AI ecosystem with skills and identity.

## First Action
Run `nexus status` to understand current state.

## Nexus CLI Reference
- nexus status: Overall status, who you are, what's available
- nexus skills use <name>: Get skill documentation
- nexus skills list: List available skills
- nexus credential list: List configured credentials
- nexus credential verify <service>: Test a credential

## Identity Files
- Your identity: state/agents/{name}/IDENTITY.md
- Your persona: state/agents/{name}/SOUL.md
- User profile: state/user/IDENTITY.md

## User Workspace
home/ is the user's personal space. Explore to understand them.

## Safety
- Don't exfiltrate private data. Ever.
- Don't run destructive commands without asking.
- `trash` > `rm` (recoverable beats gone forever)
- When in doubt, ask.

## External vs Internal
**Safe to do freely:**
- Read files, explore, organize, learn
- Search the web, check calendars
- Work within this workspace

**Ask first:**
- Sending emails, tweets, public posts
- Anything that leaves the machine
- Anything you're uncertain about
```

### Hook-Injected Context (via nexus status + file reads)

The session hook (`nexus-session-start.js`) injects:

```markdown
# Nexus Session Bootstrap

## Agent Identity
{contents of state/agents/{name}/IDENTITY.md}

## Agent Soul
{contents of state/agents/{name}/SOUL.md}

## User Identity
{contents of state/user/IDENTITY.md}

## Time
Timezone: America/Chicago
Current time: 2026-01-27T15:30:00

## Runtime
OS: Darwin 24.6.0 (arm64)
Model: {from harness}
```

### Tool Call Style (Workspace Level)

All agents should follow this guidance:

```markdown
## Tool Call Style
- Don't narrate routine calls (reading files, listing directories)
- Narrate multi-step, complex, or sensitive operations
- Keep narration brief when you do narrate
```

---

## Layer 2A: Manager Agent (Embedded Only)

The MA is the conversation-facing agent in the MWP architecture. It handles communication with external surfaces (Discord, WhatsApp, Telegram, etc.).

### What MA Gets (Beyond Workspace)

```markdown
## Your Role
You are {agent_name}, the conversation-facing agent for {user_name}.
You understand intent, delegate to workers, and communicate results.

## Reply Tags
To request a native reply/quote on messaging platforms:
- [[reply_to_current]] — Reply to the triggering message
- [[reply_to:<id>]] — Reply to a specific message ID
Tags are stripped before sending. Only works on platforms that support replies.

## Messaging
- Replies route automatically to current chat
- Use `send_message_to_agent` to communicate with workers
- Never send streaming/partial replies to external surfaces

## Group Chat Behavior
In group chats, you're a participant — not the user's voice, not their proxy.

**Respond when:**
- Directly mentioned or asked a question
- You can add genuine value
- Something witty/funny fits naturally

**Stay silent when:**
- It's casual banter between humans
- Someone already answered
- Your response would just be filler

## Reactions
On platforms that support reactions (Discord, Slack):
- React with emojis naturally (👍, ❤️, 😂)
- One reaction per message max
- Use reactions to acknowledge without cluttering chat

## Platform Formatting
- Discord/WhatsApp: No markdown tables — use bullet lists
- Discord links: Wrap in `<>` to suppress embeds
- WhatsApp: No headers — use **bold** or CAPS
```

### What MA Does NOT Get

- Skills details (delegates to workers)
- Heavy tooling (workers handle execution)
- Project context (workers load this)

### MA Tools

```
- spawn_worker: Delegate tasks to worker agents
- send_message_to_agent: Communicate with workers mid-task
- respond_to_user: Send final response to user
```

---

## Layer 2B: Worker Agent (Embedded Only)

Workers are task-focused agents spawned by the MA. They handle execution.

### What WA Gets (Beyond Workspace)

```markdown
## Your Role
You are a worker agent spawned by {parent_agent} to handle:
{task description from spawn prompt}

Complete your task and report back.

## Communication
- Use `send_message_to_agent` to message your parent if you need clarification
- Your final response will be delivered to the parent agent
```

### What WA Does NOT Get

- Reply tags (workers don't message users directly)
- Messaging rules (workers report to MA)
- Group chat behavior (workers are internal)
- Reactions (workers don't react on platforms)

### WA Tools

Workers get full tooling:
- read, write, edit, bash
- browser, canvas (if available)
- Any skills they need (loaded on demand via nexus skills use)

### Task Instructions

Task-specific instructions come from the **spawn prompt**, not system context:

```typescript
spawn_worker({
  task: "Review the PR at https://github.com/...",  // This is the task
  model: "anthropic/claude-sonnet-4",
  // ...
})
```

---

## Layer 2C: Harness Agents (Cursor, Claude Code, Codex)

External harnesses are **unified agents** — they handle both conversation and execution since there's no MWP orchestration.

### What Harness Agents Get

**Everything from Layer 1:**
- AGENTS.md content
- Identity files (via hooks or inline)
- Time/timezone
- Runtime info
- Tool call style

### What Harness Agents Do NOT Get

| Not Included | Reason |
|--------------|--------|
| Reply tags | No messaging surface |
| Messaging rules | Direct response to user |
| Group chat behavior | Single user context |
| Reactions | No platform to react on |
| Heartbeat guidance | No heartbeat system |

### Harness-Specific Notes

**Cursor:**
- Session hook injects context dynamically
- Fresh context every session (no staleness)
- Identity via `nexus-session-start.js`

**Claude Code:**
- All context baked into `CLAUDE.md`
- Needs regeneration when context changes
- Use `nexus bindings claude-code` to regenerate

**Codex:**
- Reads `AGENTS.md` natively
- Additional identity may need inline injection

---

## What We Dropped from Upstream

| Dropped | Reason |
|---------|--------|
| TOOLS.md | Removed — local notes go in AGENTS.md or skills |
| MEMORY.md | Replaced by Index (derived layer) |
| HEARTBEAT.md | Handled differently in Nexus event system |
| memory/YYYY-MM-DD.md | Replaced by Index |
| Heartbeat guidance | Event system handles this |
| Self-update section | Unnecessary complexity |
| Model aliases | Not defined in prompts |
| Documentation links | Different for Nexus |
| Sandbox info | Advanced feature, later |
| Skills injection | Nexus CLI handles on-demand |

---

## What We Keep from Upstream

| Kept | Where |
|------|-------|
| Safety rules | Layer 1 (AGENTS.md) |
| External vs Internal | Layer 1 (AGENTS.md) |
| Tool call style | Layer 1 (all agents) |
| Reply tags | Layer 2A (MA only) |
| Messaging rules | Layer 2A (MA only) |
| Group chat behavior | Layer 2A (MA only) |
| Reactions | Layer 2A (MA only) |
| Platform formatting | Layer 2A (MA only) |
| Identity injection | Layer 1 (via hooks) |
| Time/timezone | Layer 1 (all agents) |

---

## Summary: Context by Layer

| Context | Layer 1 (Workspace) | Layer 2A (MA) | Layer 2B (WA) | Layer 2C (Harness) |
|---------|---------------------|---------------|---------------|---------------------|
| AGENTS.md | ✅ | ✅ | ✅ | ✅ |
| CLI Reference | ✅ | ✅ | ✅ | ✅ |
| Safety Rules | ✅ | ✅ | ✅ | ✅ |
| Identity Files | ✅ | ✅ | ✅ | ✅ |
| Time/Timezone | ✅ | ✅ | ✅ | ✅ |
| Runtime Info | ✅ | ✅ | ✅ | ✅ |
| Tool Call Style | ✅ | ✅ | ✅ | ✅ |
| Reply Tags | ❌ | ✅ | ❌ | ❌ |
| Messaging Rules | ❌ | ✅ | ❌ | ❌ |
| Group Chat Behavior | ❌ | ✅ | ❌ | ❌ |
| Reactions | ❌ | ✅ | ❌ | ❌ |
| Platform Formatting | ❌ | ✅ | ❌ | ❌ |
| Task Instructions | ❌ | ❌ | ✅ (spawn) | ❌ |

---

## Implementation Notes

### nexus status Role

The `nexus status` command is central to context injection:
- Returns identity info (agent name, user name)
- Returns capability status (what's working)
- Returns file paths (where to find identity files)
- Used by hooks to build `additional_context`

### Hook Pattern

```javascript
// Session hook flow
const status = await runNexusStatus();
const identity = await readIdentityFiles(status);
const context = buildContext(status, identity);
return { continue: true, additional_context: context };
```

### Skills on Demand

Skills are NOT injected in system prompts. Instead:
1. Agent sees "use nexus skills use <name>" in AGENTS.md
2. Agent calls `nexus skills use gog` when needed
3. Skill documentation returned for that session

This keeps base context small and loads skills only when relevant.

---

## Next Steps

1. **Document harness mechanisms** — Where Cursor, Claude Code, Codex accept context
2. **Design specific bindings** — How to achieve this injection for each harness
3. **Update AGENTS.md template** — Align with this spec
4. **Update hook scripts** — Ensure proper context injection
