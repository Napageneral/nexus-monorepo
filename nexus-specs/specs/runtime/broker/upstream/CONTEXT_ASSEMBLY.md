# Context Assembly Reference

**Status:** REFERENCE DOCUMENT  
**Source:** OpenClaw (`src/agents/pi-embedded-runner/`, `src/agents/pi-embedded-helpers/`)  
**Last Updated:** 2026-02-04

---

## Overview

This document covers how OpenClaw builds context for agent execution:
- Bootstrap file handling
- System prompt construction
- Skills injection
- Compaction and summary handling
- Context window management

For the execution flow itself, see `AGENT_EXECUTION.md`.

---

## Context Assembly Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CONTEXT ASSEMBLY                                       │
│                                                                               │
│  1. Resolve Workspace                                                         │
│     └── workspaceDir, agentDir from config/session                           │
│                                                                               │
│  2. Load Bootstrap Files                                                      │
│     └── AGENTS.md, identity files, workspace rules                           │
│     └── Apply size limits and truncation                                     │
│                                                                               │
│  3. Load Skills                                                               │
│     └── buildWorkspaceSkillSnapshot()                                        │
│     └── Generate skills prompt                                               │
│                                                                               │
│  4. Build System Prompt                                                       │
│     └── Combine runtime info, hints, skills, bootstrap                       │
│                                                                               │
│  5. Load Session History                                                      │
│     └── Read JSONL transcript                                                │
│     └── Apply compaction summaries if present                                │
│                                                                               │
│  6. Prepare Tools                                                             │
│     └── createOpenClawCodingTools()                                          │
│     └── Apply tool policies                                                  │
│                                                                               │
│  7. Add Event Message                                                         │
│     └── User prompt with any media/context                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Bootstrap Files

### Purpose

Bootstrap files inject workspace context into the system prompt. They provide:
- Agent behavior rules (AGENTS.md)
- User identity information
- Project-specific context
- Workspace conventions

### Loading

```typescript
// src/agents/pi-embedded-helpers/bootstrap.ts

const DEFAULT_BOOTSTRAP_MAX_CHARS = 20_000;
const BOOTSTRAP_HEAD_RATIO = 0.7;  // Keep 70% from start
const BOOTSTRAP_TAIL_RATIO = 0.2;  // Keep 20% from end

type EmbeddedContextFile = {
  path: string;
  content: string;
};

function buildBootstrapContextFiles(
  files: WorkspaceBootstrapFile[], 
  opts?: {
    warn?: (message: string) => void;
    maxChars?: number;
  }
): EmbeddedContextFile[];
```

### Truncation Strategy

Large bootstrap files are truncated to preserve both beginning and end:

```typescript
function trimBootstrapContent(
  content: string, 
  fileName: string, 
  maxChars: number
): {
  content: string;
  truncated: boolean;
  originalLength: number;
} {
  if (content.length <= maxChars) {
    return { content, truncated: false, originalLength: content.length };
  }
  
  const headChars = Math.floor(maxChars * BOOTSTRAP_HEAD_RATIO);
  const tailChars = Math.floor(maxChars * BOOTSTRAP_TAIL_RATIO);
  
  const head = content.slice(0, headChars);
  const tail = content.slice(-tailChars);
  
  return {
    content: `${head}\n\n[... content truncated ...]\n\n${tail}`,
    truncated: true,
    originalLength: content.length,
  };
}
```

### Bootstrap File Priority

Files are loaded from workspace root:

1. `AGENTS.md` — Primary agent behavior rules
2. `CLAUDE.md` — Alternative/legacy behavior rules  
3. Identity files — User/agent identity
4. Custom files — Via config or hooks

---

## System Prompt Building

### Main Function

```typescript
// src/agents/pi-embedded-runner/system-prompt.ts

function buildEmbeddedSystemPrompt(params: {
  workspaceDir: string;
  defaultThinkLevel?: ThinkLevel;
  reasoningLevel?: ReasoningLevel;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
  reasoningTagHint: boolean;
  heartbeatPrompt?: string;
  skillsPrompt?: string;
  docsPath?: string;
  ttsHint?: string;
  workspaceNotes?: string[];
  promptMode?: "full" | "minimal";  // "minimal" for subagents
  runtimeInfo: RuntimeInfo;
  sandboxInfo?: EmbeddedSandboxInfo;
  tools: AgentTool[];
  userTimezone: string;
  userTime?: string;
  contextFiles?: EmbeddedContextFile[];
}): string;
```

### Runtime Info

```typescript
type RuntimeInfo = {
  agentId?: string;
  host: string;
  os: string;
  arch: string;
  node: string;
  model: string;
  provider?: string;
  capabilities?: string[];
  channel?: string;
  channelActions?: string[];
};
```

### Prompt Structure

The system prompt is assembled in sections:

```
1. Runtime Context
   - Host, OS, architecture
   - Model and provider
   - Current time and timezone
   - Channel context

2. Agent Identity
   - From contextFiles (AGENTS.md, etc.)

3. Skills
   - Skills prompt from snapshot

4. Tools Available
   - List of tool names and descriptions

5. Behavioral Hints
   - Thinking level hints
   - Reasoning tag hints
   - TTS hints (if audio context)

6. Extra System Prompt
   - Custom injections from config/hooks
```

### Minimal Mode (Subagents)

Subagents use `promptMode: "minimal"` which omits:
- Full identity context
- Heartbeat prompts
- Proactive behavior hints

Instead, subagents get the focused `buildSubagentSystemPrompt()`:

```typescript
// src/agents/subagent-announce.ts

function buildSubagentSystemPrompt(params: {
  requesterSessionKey?: string;
  requesterOrigin?: DeliveryContext;
  childSessionKey: string;
  label?: string;
  task?: string;
}): string {
  return `
# Subagent Context

You are a **subagent** spawned by the main agent for a specific task.

## Your Role
- You were created to handle: ${taskText}
- Complete this task. That's your entire purpose.
- You are NOT the main agent. Don't try to be.

## Rules
1. **Stay focused** - Do your assigned task, nothing else
2. **Complete the task** - Your final message will be automatically reported
3. **Don't initiate** - No heartbeats, no proactive actions, no side quests
4. **Be ephemeral** - You may be terminated after task completion

## What You DON'T Do
- NO user conversations (main agent's job)
- NO external messages unless explicitly tasked
- NO cron jobs or persistent state
- NO pretending to be the main agent
- NO using the \`message\` tool directly
`;
}
```

---

## Skills Integration

### Skill Loading

```typescript
// src/agents/skills/workspace.ts

type SkillEntry = {
  skill: Skill;
  frontmatter: ParsedSkillFrontmatter;
  metadata: OpenClawSkillMetadata;
  invocation: SkillInvocationPolicy;
};

type SkillSnapshot = {
  prompt: string;
  skills: Array<{ name: string; primaryEnv?: string }>;
  resolvedSkills?: Skill[];
  version?: number;
};

function buildWorkspaceSkillSnapshot(
  workspaceDir: string, 
  opts?: {
    config?: OpenClawConfig;
    skillFilter?: string[];
    eligibility?: SkillEligibilityContext;
  }
): SkillSnapshot;
```

### Skill Loading Precedence

Later sources override earlier:

1. Extra dirs (plugins)
2. Bundled skills (OpenClaw built-in)
3. Managed skills (`~/.openclaw/skills/`)
4. Workspace skills (`./skills/`)

### Skills Prompt Format

Skills are injected as a structured prompt section:

```
## Available Skills

### filesystem
File and directory operations. Read, write, move, copy files.

### git
Git version control operations. Commits, branches, diffs.

### browser
Headless browser control for web automation.
```

---

## Compaction

### Two-Level Architecture

OpenClaw uses two levels of compaction:

1. **Gateway Line Truncation** — Truncates older transcript lines, creates `.bak` archive
2. **Pi-Agent LLM Summarization** — Uses model to summarize conversation

### Compaction Function

```typescript
// src/agents/pi-embedded-runner/compact.ts

async function compactEmbeddedPiSession(params: {
  sessionId: string;
  sessionKey?: string;
  messageChannel?: string;
  messageProvider?: string;
  agentAccountId?: string;
  sessionFile: string;
  workspaceDir: string;
  agentDir?: string;
  config?: OpenClawConfig;
  skillsSnapshot?: SkillSnapshot;
  provider?: string;
  model?: string;
  thinkLevel?: ThinkLevel;
  reasoningLevel?: ReasoningLevel;
  bashElevated?: ExecElevatedDefaults;
  customInstructions?: string;
  lane?: string;
  enqueue?: typeof enqueueCommand;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
}): Promise<EmbeddedPiCompactResult>;
```

### Compaction Result

```typescript
type EmbeddedPiCompactResult = {
  ok: boolean;
  compacted: boolean;
  reason?: string;
  result?: {
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
    details?: unknown;
  };
};
```

### Compaction Entry

Written to JSONL transcript:

```json
{
  "type": "compaction",
  "id": "uuid",
  "parentId": "uuid",
  "summary": "This conversation covered: 1) Setting up the project... 2) Debugging the auth flow...",
  "firstKeptEntryId": "uuid-of-first-kept-entry",
  "tokensBefore": 50000,
  "details": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-...",
    "timestamp": 1706000000000
  }
}
```

### Auto-Compaction Triggers

Compaction triggers when:

1. **Overflow Recovery** — Model returns context overflow error → compact → retry
2. **Threshold Maintenance** — After successful turn:
   ```
   contextTokens > contextWindow - reserveTokens
   ```
3. **Manual Trigger** — Explicit `/compact` command

### Compaction Settings

```json5
{
  compaction: {
    enabled: true,
    reserveTokens: 16384,      // Headroom for next turn
    keepRecentTokens: 20000    // Tokens to preserve after compaction
  }
}
```

**Safety Floor:**
- If `reserveTokens < reserveTokensFloor`, bump it up
- Default floor: `20000` tokens
- Configurable via `agents.defaults.compaction.reserveTokensFloor`

---

## Pre-Compaction Memory Flush

Before compaction, a silent turn can persist important context:

```yaml
agents:
  defaults:
    compaction:
      memoryFlush:
        enabled: true
        softThresholdTokens: 4000
        prompt: "Write any important context to memory files now. Respond with NO_REPLY."
        systemPrompt: "You are about to run out of context. Persist important information."
```

### Trigger Condition

```
contextTokens > contextWindow - reserveTokens - softThresholdTokens
```

### Behavior

- Uses `NO_REPLY` to suppress delivery
- Tracks `memoryFlushCompactionCount` to run once per compaction cycle
- Skipped for read-only sandbox workspaces

---

## Context After Compaction

### History Assembly

When building context after compaction:

```typescript
function buildSessionHistoryWithCompaction(
  transcript: TranscriptEntry[]
): Message[] {
  // Find latest compaction entry
  const compaction = transcript
    .filter(e => e.type === 'compaction')
    .at(-1);
  
  if (!compaction) {
    // No compaction, use full history
    return buildFullHistory(transcript);
  }
  
  // Start with compaction summary
  const messages: Message[] = [{
    role: 'system',
    content: `[Prior conversation summary]\n${compaction.summary}`,
  }];
  
  // Add entries after firstKeptEntryId
  const keptEntries = getEntriesAfter(transcript, compaction.firstKeptEntryId);
  for (const entry of keptEntries) {
    messages.push(...entryToMessages(entry));
  }
  
  return messages;
}
```

### Backup Files

When compaction truncates the transcript:

1. Original content → `<sessionId>.jsonl.bak`
2. Main transcript rewritten with:
   - Session header
   - Compaction entry
   - Entries after `firstKeptEntryId`

---

## Context Window Management

### Token Budget

```typescript
// Conceptual token allocation
interface TokenBudget {
  contextWindow: number;      // Model's limit (e.g., 200000)
  reserveResponse: number;    // For output (~8000)
  reserveTools: number;       // For tool calls (~2000)
  available: number;          // For context
  
  // Breakdown
  systemPrompt: number;       // Runtime info + identity
  bootstrap: number;          // AGENTS.md, etc.
  skills: number;             // Skills prompt
  history: number;            // Transcript
  event: number;              // Current message
}
```

### Overflow Handling

When context exceeds limits:

1. **Attempt compaction** — Summarize old history
2. **Retry with compacted context** — Re-run agent turn
3. **If still overflowing** — Error with `context_overflow` kind

---

## JSONL Transcript Format

### File Structure

First line: Session header

```json
{
  "type": "session",
  "version": 2,
  "id": "uuid",
  "timestamp": "2026-01-22T...",
  "cwd": "/path/to/workspace",
  "parentSession": "optional-parent-id"
}
```

### Entry Types

```typescript
// User/assistant/tool messages
{
  type: "message",
  id: string,
  parentId: string,
  role: "user" | "assistant" | "tool",
  content: ContentBlock[],
  api: "anthropic" | "openai-responses" | ...,
  provider: string,
  model: string,
  usage: { input, output, cacheRead, cacheWrite, totalTokens, cost },
  stopReason: string,
  timestamp: number
}

// Extension-injected messages (enters model context)
{
  type: "custom_message",
  id: string,
  parentId: string,
  role: "user",
  content: ContentBlock[],
  hidden?: boolean  // Hide from UI
}

// Extension state (does NOT enter model context)
{
  type: "custom",
  id: string,
  parentId: string,
  name: string,
  data: object
}

// Compaction summary
{
  type: "compaction",
  id: string,
  parentId: string,
  summary: string,
  firstKeptEntryId: string,
  tokensBefore: number,
  details: object
}

// Branch summary (tree navigation)
{
  type: "branch_summary",
  id: string,
  parentId: string,
  summary: string
}
```

---

## Nexus Mapping

| OpenClaw | Nexus Broker |
|----------|--------------|
| Bootstrap files | Workspace layer context |
| System prompt | Combined system prompt |
| Skills snapshot | Skills from config |
| JSONL transcript | `turns` + `messages` tables |
| Compaction entry | Compaction turn in turn tree |
| `firstKeptEntryId` | `first_kept_turn_id` |
| `.bak` archive | Full history preserved in tree |

### Key Differences

1. **Tree vs Linear** — Nexus uses turn tree, OpenClaw uses linear JSONL
2. **Compaction location** — Nexus: special turn type; OpenClaw: entry in transcript
3. **Context layers** — Nexus adds Cortex-derived context
4. **Summary storage** — Nexus: in turn record; OpenClaw: in transcript entry

---

## Key Files

| File | Purpose |
|------|---------|
| `src/agents/pi-embedded-helpers/bootstrap.ts` | Bootstrap file loading |
| `src/agents/pi-embedded-runner/system-prompt.ts` | System prompt building |
| `src/agents/pi-embedded-runner/compact.ts` | Compaction logic |
| `src/agents/skills/workspace.ts` | Skills loading |
| `src/config/sessions/transcript.ts` | JSONL transcript handling |

---

*This document covers OpenClaw context assembly for Nexus Broker reference.*
