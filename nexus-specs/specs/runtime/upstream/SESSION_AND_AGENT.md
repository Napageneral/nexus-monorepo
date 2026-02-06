# OpenClaw Session and Agent Execution

> **Purpose:** Document OpenClaw's session management and agent execution architecture to inform Nexus Broker design.

---

## Table of Contents

1. [Session Management](#session-management)
2. [Agent Execution](#agent-execution)
3. [Agent Configuration](#agent-configuration)
4. [Tool System](#tool-system)
5. [Streaming and Subscriptions](#streaming-and-subscriptions)

---

## Session Management

### Session Key Format

OpenClaw uses hierarchical session keys to identify and route conversations. Keys encode channel, chat type, and identifiers.

```
Format: <channel>:<chatType>:<identifier>[:<modifier>:<value>]

Examples:
- telegram:dm:123456789                    # Direct message on Telegram
- discord:group:guild-id:channel:chan-id  # Discord channel in a guild
- slack:channel:C12345:thread:ts123       # Slack thread
- agent:main:telegram:dm:123456789        # Agent-scoped session
- subagent:task-abc123                    # Spawned subagent session
- agent:atlas:subagent:research-task      # Agent-specific subagent
```

**Key Parsing Utilities** (`src/sessions/session-key-utils.ts`):

```typescript
type ParsedAgentSessionKey = {
  agentId: string;
  rest: string;
};

// Parse agent-scoped keys: "agent:main:telegram:dm:123" → { agentId: "main", rest: "telegram:dm:123" }
function parseAgentSessionKey(sessionKey: string): ParsedAgentSessionKey | null;

// Check if session is a spawned subagent
function isSubagentSessionKey(sessionKey: string): boolean;

// Check if session is an ACP (Agent Communication Protocol) session
function isAcpSessionKey(sessionKey: string): boolean;

// Get parent session for threaded conversations
function resolveThreadParentSessionKey(sessionKey: string): string | null;
```

**Thread Markers:** `:thread:` and `:topic:` indicate threaded conversations.

### Session Labels

Sessions can have human-readable labels for identification (`src/sessions/session-label.ts`):

```typescript
const SESSION_LABEL_MAX_LENGTH = 64;

type ParsedSessionLabel = 
  | { ok: true; label: string } 
  | { ok: false; error: string };

function parseSessionLabel(raw: unknown): ParsedSessionLabel;
```

### Session Entry

The `SessionEntry` type (`src/config/sessions/types.ts`) tracks all session state:

```typescript
type SessionEntry = {
  sessionId: string;
  updatedAt: number;
  sessionFile?: string;
  
  // Origin tracking
  channel?: string;
  chatType?: SessionChatType;  // "dm" | "group" | "channel"
  groupId?: string;
  origin?: SessionOrigin;
  
  // Hierarchy
  spawnedBy?: string;  // Parent session for subagents
  
  // Model overrides
  providerOverride?: string;
  modelOverride?: string;
  authProfileOverride?: string;
  authProfileOverrideSource?: "auto" | "user";
  
  // Session behavior
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  sendPolicy?: "allow" | "deny";
  queueMode?: "steer" | "followup" | "collect" | "steer-backlog" | "queue" | "interrupt";
  
  // Usage tracking
  inputTokens?: number;
  outputTokens?: number;
  compactionCount?: number;
  
  // Cached state
  skillsSnapshot?: SessionSkillSnapshot;
  systemPromptReport?: SessionSystemPromptReport;
};
```

### Send Policy

The send policy (`src/sessions/send-policy.ts`) controls whether an agent can send messages:

```typescript
type SessionSendPolicyDecision = "allow" | "deny";

function resolveSendPolicy(params: {
  cfg: OpenClawConfig;
  entry?: SessionEntry;
  sessionKey?: string;
  channel?: string;
  chatType?: SessionChatType;
}): SessionSendPolicyDecision;
```

**Policy Resolution Order:**
1. Session entry override (`entry.sendPolicy`)
2. Config rules matching channel/chatType/keyPrefix
3. Config default fallback
4. System default: `"allow"`

**Config Example:**
```yaml
session:
  sendPolicy:
    default: allow
    rules:
      - match:
          chatType: group
          channel: discord
        action: deny
      - match:
          keyPrefix: "telegram:dm:"
        action: allow
```

### Transcript Events

Sessions emit events for transcript updates (`src/sessions/transcript-events.ts`):

```typescript
function onSessionTranscriptUpdate(listener: (update: { sessionFile: string }) => void): () => void;
function emitSessionTranscriptUpdate(sessionFile: string): void;
```

### Level and Model Overrides

**Verbose Level Override** (`src/sessions/level-overrides.ts`):
```typescript
type VerboseLevel = "on" | "off";

function parseVerboseOverride(raw: unknown): { ok: true; value: VerboseLevel | null } | { ok: false; error: string };
function applyVerboseOverride(entry: SessionEntry, level: VerboseLevel | null | undefined): void;
```

**Model Override** (`src/sessions/model-overrides.ts`):
```typescript
type ModelOverrideSelection = {
  provider: string;
  model: string;
  isDefault?: boolean;
};

function applyModelOverrideToSessionEntry(params: {
  entry: SessionEntry;
  selection: ModelOverrideSelection;
  profileOverride?: string;
  profileOverrideSource?: "auto" | "user";
}): { updated: boolean };
```

---

## Agent Execution

### Overview

Agent execution is handled by the `pi-embedded-runner` module. The main entry point is `runEmbeddedPiAgent()`.

```
┌─────────────────────────────────────────────────────────────────┐
│                     runEmbeddedPiAgent()                        │
├─────────────────────────────────────────────────────────────────┤
│  1. Queue Management (session lane + global lane)               │
│  2. Model Resolution                                            │
│  3. Auth Profile Selection                                      │
│  4. Context Window Guard                                        │
│  5. Retry Loop with Failover                                    │
│     └── runEmbeddedAttempt()                                    │
│         ├── Sandbox Context Resolution                          │
│         ├── Skills Loading                                      │
│         ├── Bootstrap Context Assembly                          │
│         ├── Tool Creation                                       │
│         ├── System Prompt Building                              │
│         ├── Session Manager Setup                               │
│         ├── LLM Prompt Execution                                │
│         └── Response Processing                                 │
│  6. Result Assembly                                             │
└─────────────────────────────────────────────────────────────────┘
```

### Run Parameters

The full parameter set for agent execution (`src/agents/pi-embedded-runner/run/params.ts`):

```typescript
type RunEmbeddedPiAgentParams = {
  // Session identification
  sessionId: string;
  sessionKey?: string;
  sessionFile: string;
  
  // Message context
  messageChannel?: string;
  messageProvider?: string;
  agentAccountId?: string;
  messageTo?: string;
  messageThreadId?: string | number;
  
  // Group context (for tool policies)
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  spawnedBy?: string | null;
  
  // Sender context
  senderId?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderE164?: string | null;
  
  // Workspace
  workspaceDir: string;
  agentDir?: string;
  config?: OpenClawConfig;
  
  // Input
  prompt: string;
  images?: ImageContent[];
  skillsSnapshot?: SkillSnapshot;
  
  // Model selection
  provider?: string;
  model?: string;
  authProfileId?: string;
  authProfileIdSource?: "auto" | "user";
  
  // Behavior
  thinkLevel?: ThinkLevel;
  verboseLevel?: VerboseLevel;
  reasoningLevel?: ReasoningLevel;
  toolResultFormat?: ToolResultFormat;
  disableTools?: boolean;
  
  // Execution controls
  timeoutMs: number;
  runId: string;
  abortSignal?: AbortSignal;
  
  // Streaming callbacks
  onPartialReply?: (payload: { text?: string; mediaUrls?: string[] }) => void;
  onBlockReply?: (payload: { text?: string; mediaUrls?: string[] }) => void;
  onReasoningStream?: (payload: { text?: string }) => void;
  onToolResult?: (payload: { text?: string }) => void;
  onAgentEvent?: (evt: { stream: string; data: Record<string, unknown> }) => void;
};
```

### Run Result

```typescript
type EmbeddedPiRunResult = {
  payloads?: Array<{
    text?: string;
    mediaUrl?: string;
    mediaUrls?: string[];
    replyToId?: string;
    isError?: boolean;
  }>;
  meta: {
    durationMs: number;
    agentMeta?: {
      sessionId: string;
      provider: string;
      model: string;
      usage?: { input?: number; output?: number; total?: number };
    };
    aborted?: boolean;
    error?: { kind: "context_overflow" | "compaction_failure" | "role_ordering" | "image_size"; message: string };
    stopReason?: string;
    pendingToolCalls?: Array<{ id: string; name: string; arguments: string }>;
  };
  didSendViaMessagingTool?: boolean;
  messagingToolSentTexts?: string[];
  messagingToolSentTargets?: MessagingToolSend[];
};
```

### Context Assembly and Bootstrap

Bootstrap files inject workspace context into the system prompt (`src/agents/pi-embedded-helpers/bootstrap.ts`):

```typescript
const DEFAULT_BOOTSTRAP_MAX_CHARS = 20_000;
const BOOTSTRAP_HEAD_RATIO = 0.7;  // Keep 70% from start
const BOOTSTRAP_TAIL_RATIO = 0.2;  // Keep 20% from end

// Truncates large bootstrap files with head/tail preservation
function trimBootstrapContent(content: string, fileName: string, maxChars: number): {
  content: string;
  truncated: boolean;
  originalLength: number;
};

// Build context files from workspace bootstrap files
function buildBootstrapContextFiles(files: WorkspaceBootstrapFile[], opts?: {
  warn?: (message: string) => void;
  maxChars?: number;
}): EmbeddedContextFile[];

// Ensure session file has proper header
async function ensureSessionHeader(params: {
  sessionFile: string;
  sessionId: string;
  cwd: string;
}): Promise<void>;
```

### System Prompt Building

The system prompt is assembled from multiple sources (`src/agents/pi-embedded-runner/system-prompt.ts`):

```typescript
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
  runtimeInfo: {
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
  sandboxInfo?: EmbeddedSandboxInfo;
  tools: AgentTool[];
  userTimezone: string;
  userTime?: string;
  contextFiles?: EmbeddedContextFile[];
}): string;
```

### Lanes and Queueing

Agent runs are queued through lanes to prevent concurrent execution:

```typescript
// Session-specific lane (serializes per-session operations)
function resolveSessionLane(sessionKey: string): string;

// Global lane (rate limiting across all sessions)
function resolveGlobalLane(lane?: string): string;

// Execution is double-enqueued:
// 1. Session lane ensures one prompt per session
// 2. Global lane rate-limits overall LLM calls
return enqueueSession(() =>
  enqueueGlobal(async () => {
    // ... agent execution
  })
);
```

### Failover and Retry Logic

The runner handles various failure modes:

```typescript
type FailoverReason = 
  | "auth"         // Authentication failure
  | "format"       // Request format error
  | "rate_limit"   // Rate limited
  | "billing"      // Billing/quota issue
  | "timeout"      // Request timeout
  | "unknown";

// Failover flow:
// 1. Classify error
// 2. If auth/rate-limit → mark profile in cooldown, try next profile
// 3. If thinking level unsupported → retry with lower thinking level
// 4. If context overflow → attempt auto-compaction
// 5. If all profiles exhausted → throw FailoverError for model fallback
```

---

## Agent Configuration

### Auth Profiles

Auth profiles manage API credentials with rotation and cooldown (`src/agents/auth-profiles/`):

```typescript
type AuthProfileCredential = 
  | { type: "api_key"; provider: string; key: string; email?: string }
  | { type: "token"; provider: string; token: string; expires?: number; email?: string }
  | { type: "oauth"; provider: string; access?: string; refresh?: string; clientId?: string };

type ProfileUsageStats = {
  lastUsed?: number;
  cooldownUntil?: number;
  disabledUntil?: number;
  disabledReason?: AuthProfileFailureReason;
  errorCount?: number;
  failureCounts?: Partial<Record<AuthProfileFailureReason, number>>;
};

type AuthProfileStore = {
  version: number;
  profiles: Record<string, AuthProfileCredential>;
  order?: Record<string, string[]>;  // Provider-specific order overrides
  lastGood?: Record<string, string>;
  usageStats?: Record<string, ProfileUsageStats>;
};
```

**Profile Selection Order** (`src/agents/auth-profiles/order.ts`):
1. User-specified preferred profile
2. Stored order override (per-agent)
3. Config-defined order
4. Round-robin by type (OAuth > Token > API Key)
5. Skip profiles in cooldown (append at end sorted by cooldown expiry)

```typescript
function resolveAuthProfileOrder(params: {
  cfg?: OpenClawConfig;
  store: AuthProfileStore;
  provider: string;
  preferredProfile?: string;
}): string[];
```

### Model Selection and Compatibility

```typescript
type ResolvedProviderAuth = {
  apiKey?: string;
  profileId?: string;
  source: string;
  mode: "api-key" | "oauth" | "token" | "aws-sdk";
};

// Resolve API key for a provider, trying profiles then env vars
async function resolveApiKeyForProvider(params: {
  provider: string;
  cfg?: OpenClawConfig;
  profileId?: string;
  preferredProfile?: string;
  store?: AuthProfileStore;
  agentDir?: string;
}): Promise<ResolvedProviderAuth>;
```

### Sandbox Configuration

Sandboxing isolates agent execution (`src/agents/sandbox/`):

```typescript
type SandboxConfig = {
  mode: "off" | "non-main" | "all";
  scope: "session" | "agent" | "shared";
  workspaceAccess: "none" | "ro" | "rw";
  workspaceRoot: string;
  docker: SandboxDockerConfig;
  browser: SandboxBrowserConfig;
  tools: SandboxToolPolicy;
  prune: { idleHours: number; maxAgeDays: number };
};

type SandboxContext = {
  enabled: boolean;
  sessionKey: string;
  workspaceDir: string;
  agentWorkspaceDir: string;
  workspaceAccess: "none" | "ro" | "rw";
  containerName: string;
  containerWorkdir: string;
  docker: SandboxDockerConfig;
  tools: SandboxToolPolicy;
  browserAllowHostControl: boolean;
  browser?: SandboxBrowserContext;
};
```

### Skills Integration

Skills are loaded from multiple directories and injected into prompts (`src/agents/skills/workspace.ts`):

```typescript
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

// Skill loading precedence (later overrides earlier):
// 1. Extra dirs (plugins)
// 2. Bundled skills (OpenClaw built-in)
// 3. Managed skills (~/.openclaw/skills/)
// 4. Workspace skills (./skills/)

function buildWorkspaceSkillSnapshot(workspaceDir: string, opts?: {
  config?: OpenClawConfig;
  skillFilter?: string[];
  eligibility?: SkillEligibilityContext;
}): SkillSnapshot;
```

---

## Tool System

### Tool Registration

Tools are created by `createOpenClawCodingTools()` (`src/agents/pi-tools.ts`):

```typescript
function createOpenClawCodingTools(options?: {
  exec?: ExecToolDefaults;
  sandbox?: SandboxContext | null;
  sessionKey?: string;
  config?: OpenClawConfig;
  modelProvider?: string;
  modelId?: string;
  abortSignal?: AbortSignal;
  // ... channel context, group context, etc.
}): AnyAgentTool[];
```

**Tool Creation Flow:**
1. Start with base coding tools (read, write, edit)
2. Add exec/process tools
3. Add sandboxed variants if sandbox enabled
4. Add OpenClaw-specific tools (messaging, sessions, web, etc.)
5. Add channel-specific tools
6. Apply tool policies (filter by allow/deny)
7. Normalize tool schemas
8. Wrap with hooks and abort signal

### Built-in Tool Categories

| Category | Tools | Description |
|----------|-------|-------------|
| **Filesystem** | `read`, `write`, `edit`, `apply_patch` | File operations |
| **Execution** | `exec`, `process` | Shell command execution |
| **Web** | `web_search`, `web_fetch` | Internet access |
| **Browser** | `browser` | Headless browser control |
| **Messaging** | `telegram_*`, `discord_*`, `slack_*`, `whatsapp_*` | Channel-specific actions |
| **Sessions** | `sessions_list`, `sessions_send`, `sessions_spawn`, `sessions_history` | Multi-session management |
| **Memory** | `memory_search`, `memory_get` | Long-term memory access |
| **Media** | `image`, `tts` | Media generation |
| **Admin** | `gateway`, `agents_list`, `cron` | System administration |

### Tool Policies

Tools are filtered through multiple policy layers (`src/agents/pi-tools.policy.ts`):

```typescript
type SandboxToolPolicy = {
  allow?: string[];
  deny?: string[];
};

// Policy evaluation order (later can restrict, never expand):
// 1. Profile policy (tools.profile)
// 2. Provider-specific profile (tools.byProvider.*.profile)
// 3. Global policy (tools.allow/deny)
// 4. Provider-specific policy (tools.byProvider.*.allow/deny)
// 5. Agent policy (agents.*.tools.allow/deny)
// 6. Agent provider policy (agents.*.tools.byProvider.*)
// 7. Group policy (channel-specific group restrictions)
// 8. Sandbox policy (sandbox.tools.allow/deny)
// 9. Subagent policy (default restrictions for spawned agents)
```

**Subagent Default Denies:**
```typescript
const DEFAULT_SUBAGENT_TOOL_DENY = [
  "sessions_list", "sessions_history", "sessions_send", "sessions_spawn",
  "gateway", "agents_list",
  "whatsapp_login",
  "session_status", "cron",
  "memory_search", "memory_get",
];
```

**Pattern Matching:**
```typescript
// Supports wildcards
{ allow: ["web_*"] }     // Allow all web tools
{ deny: ["*"] }          // Deny all
{ allow: ["exec"] }      // Also allows apply_patch (implicit)
```

### Tool Schema Handling

Tools schemas are normalized for provider compatibility:

```typescript
// Gemini-specific cleaning
function cleanToolSchemaForGemini(tool: AnyAgentTool): AnyAgentTool;

// General normalization (handle union types, etc.)
function normalizeToolParameters(tool: AnyAgentTool): AnyAgentTool;

// Claude Code compatibility (param name mapping)
function wrapToolParamNormalization(tool: AnyAgentTool, groups: ParamGroup[]): AnyAgentTool;
```

---

## Streaming and Subscriptions

### Subscription System

Agent execution emits events through subscriptions (`src/agents/pi-embedded-subscribe.ts`):

```typescript
type SubscribeEmbeddedPiSessionParams = {
  session: AgentSession;
  runId: string;
  verboseLevel?: VerboseLevel;
  reasoningMode?: "off" | "on" | "stream";
  toolResultFormat?: "markdown" | "plain";
  
  // Callbacks
  onPartialReply?: (payload: { text?: string; mediaUrls?: string[] }) => void;
  onBlockReply?: (payload: { text?: string; mediaUrls?: string[] }) => void;
  onReasoningStream?: (payload: { text?: string }) => void;
  onToolResult?: (payload: { text?: string }) => void;
  onAgentEvent?: (evt: { stream: string; data: Record<string, unknown> }) => void;
  
  blockReplyBreak?: "text_end" | "message_end";
  blockReplyChunking?: BlockReplyChunking;
};

function subscribeEmbeddedPiSession(params: SubscribeEmbeddedPiSessionParams): {
  assistantTexts: string[];
  toolMetas: Array<{ toolName: string; meta?: string }>;
  unsubscribe: () => void;
  waitForCompactionRetry: () => Promise<void>;
  isCompacting: () => boolean;
  didSendViaMessagingTool: () => boolean;
  getMessagingToolSentTexts: () => string[];
  getMessagingToolSentTargets: () => MessagingToolSend[];
  getLastToolError: () => string | undefined;
};
```

### Lifecycle Events

Lifecycle events are emitted for agent run phases (`src/agents/pi-embedded-subscribe.handlers.lifecycle.ts`):

```typescript
// Agent lifecycle
{ stream: "lifecycle", data: { phase: "start", startedAt: number } }
{ stream: "lifecycle", data: { phase: "end", endedAt: number } }

// Compaction lifecycle
{ stream: "compaction", data: { phase: "start" } }
{ stream: "compaction", data: { phase: "end", willRetry: boolean } }
```

### Block Chunking

Large responses are chunked for streaming delivery:

```typescript
type BlockReplyChunking = {
  mode: "soft" | "hard";
  softChunkChars?: number;      // Target chunk size
  hardChunkChars?: number;      // Maximum chunk size
  paragraphPreference?: boolean; // Break at paragraphs
};
```

### Raw Stream Logging

For debugging, raw LLM streams can be logged:

```bash
OPENCLAW_RAW_STREAM=1 openclaw ...
# Writes to ~/.openclaw/state/logs/raw-stream.jsonl
```

---

## Appendix: Key File Locations

| Component | Path |
|-----------|------|
| Session Key Utils | `src/sessions/session-key-utils.ts` |
| Session Labels | `src/sessions/session-label.ts` |
| Send Policy | `src/sessions/send-policy.ts` |
| Session Types | `src/config/sessions/types.ts` |
| Main Runner | `src/agents/pi-embedded-runner/run.ts` |
| Run Attempt | `src/agents/pi-embedded-runner/run/attempt.ts` |
| Run Params | `src/agents/pi-embedded-runner/run/params.ts` |
| Bootstrap | `src/agents/pi-embedded-helpers/bootstrap.ts` |
| System Prompt | `src/agents/pi-embedded-runner/system-prompt.ts` |
| Auth Profiles | `src/agents/auth-profiles/` |
| Model Auth | `src/agents/model-auth.ts` |
| Tool Creation | `src/agents/pi-tools.ts` |
| Tool Policy | `src/agents/pi-tools.policy.ts` |
| Sandbox Context | `src/agents/sandbox/context.ts` |
| Skills Workspace | `src/agents/skills/workspace.ts` |
| Subscription | `src/agents/pi-embedded-subscribe.ts` |
| Lifecycle Handlers | `src/agents/pi-embedded-subscribe.handlers.lifecycle.ts` |
| Built-in Tools | `src/agents/tools/` |
