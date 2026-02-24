# Tool Hook Mechanism (Upstream)

**Status:** Investigation Complete  
**Last Updated:** 2026-02-04  
**Upstream Version:** v2026.2.3

---

## Summary

**UPDATE (v2026.2.2): `before_tool_call` is NOW INVOKED.**

OpenClaw now wraps all tools with the `before_tool_call` hook. This is a significant change from v2026.1.x where the hook infrastructure existed but was never called.

Additionally, a new `tool_result_persist` hook has been added that allows modifying tool results before they're persisted to the session transcript.

The `after_tool_call` hook is still defined but NOT invoked anywhere.

---

## What's Now Working

### before_tool_call Hook - INVOKED ✅

All tools are now wrapped with the before_tool_call hook via `pi-tools.ts`:

```typescript
// src/agents/pi-tools.ts (lines 433-437)
const withHooks = normalized.map((tool) =>
  wrapToolWithBeforeToolCallHook(tool, {
    agentId,
    sessionKey: options?.sessionKey,
  }),
);
```

The hook wrapper is implemented in `pi-tools.before-tool-call.ts`:

```typescript
// src/agents/pi-tools.before-tool-call.ts (lines 19-65)
export async function runBeforeToolCallHook(args: {
  toolName: string;
  params: unknown;
  toolCallId?: string;
  ctx?: HookContext;
}): Promise<HookOutcome> {
  const hookRunner = getGlobalHookRunner();
  if (!hookRunner?.hasHooks("before_tool_call")) {
    return { blocked: false, params: args.params };
  }

  const toolName = normalizeToolName(args.toolName || "tool");
  const params = args.params;
  try {
    const normalizedParams = isPlainObject(params) ? params : {};
    const hookResult = await hookRunner.runBeforeToolCall(
      { toolName, params: normalizedParams },
      { toolName, agentId: args.ctx?.agentId, sessionKey: args.ctx?.sessionKey },
    );

    if (hookResult?.block) {
      return {
        blocked: true,
        reason: hookResult.blockReason || "Tool call blocked by plugin hook",
      };
    }

    if (hookResult?.params && isPlainObject(hookResult.params)) {
      if (isPlainObject(params)) {
        return { blocked: false, params: { ...params, ...hookResult.params } };
      }
      return { blocked: false, params: hookResult.params };
    }
  } catch (err) {
    log.warn(`before_tool_call hook failed: tool=${toolName} error=${String(err)}`);
  }

  return { blocked: false, params };
}
```

### Hook Capabilities

The `before_tool_call` hook can now:
- **Modify params**: Return `{ params: {...} }` to merge/override tool parameters
- **Block execution**: Return `{ block: true, blockReason: "..." }` to prevent the tool from running
- **No-op**: Return `undefined` or empty object to allow normal execution

---

## New Hook: tool_result_persist ✅

A new hook type allows modifying tool results before they're written to the session transcript.

### Types

```typescript
// src/plugins/types.ts (lines 405-427)
export type PluginHookToolResultPersistContext = {
  agentId?: string;
  sessionKey?: string;
  toolName?: string;
  toolCallId?: string;
};

export type PluginHookToolResultPersistEvent = {
  toolName?: string;
  toolCallId?: string;
  message: AgentMessage;
  isSynthetic?: boolean;  // True when synthesized by guard/repair
};

export type PluginHookToolResultPersistResult = {
  message?: AgentMessage;
};
```

### Invocation

```typescript
// src/agents/session-tool-result-guard-wrapper.ts (lines 27-46)
const transform = hookRunner?.hasHooks("tool_result_persist")
  ? (message: any, meta: { toolCallId?: string; toolName?: string; isSynthetic?: boolean }) => {
      const out = hookRunner.runToolResultPersist(
        {
          toolName: meta.toolName,
          toolCallId: meta.toolCallId,
          message,
          isSynthetic: meta.isSynthetic,
        },
        {
          agentId: opts?.agentId,
          sessionKey: opts?.sessionKey,
          toolName: meta.toolName,
          toolCallId: meta.toolCallId,
        },
      );
      return out?.message ?? message;
    }
  : undefined;
```

### Use Cases

- Strip sensitive data from tool results before persistence
- Compress large tool outputs
- Add metadata to tool results
- Filter out non-essential fields

**Note:** This hook is synchronous (runs in hot path).

---

## What's Still Missing

### after_tool_call - NOT INVOKED ❌

The `after_tool_call` hook is defined in `hooks.ts` (lines 304-313) but is never called anywhere in the codebase.

```typescript
// src/plugins/hooks.ts (lines 308-313)
async function runAfterToolCall(
  event: PluginHookAfterToolCallEvent,
  ctx: PluginHookToolContext,
): Promise<void> {
  return runVoidHook("after_tool_call", event, ctx);
}
```

To fully implement after_tool_call, the tool wrapper would need to be extended:

```typescript
// Theoretical extension to pi-tools.before-tool-call.ts
execute: async (toolCallId, params, signal, onUpdate) => {
  const startTime = Date.now();
  const outcome = await runBeforeToolCallHook({ toolName, params, toolCallId, ctx });
  
  if (outcome.blocked) {
    throw new Error(outcome.reason);
  }
  
  let result: unknown;
  let error: string | undefined;
  try {
    result = await execute(toolCallId, outcome.params, signal, onUpdate);
  } catch (err) {
    error = String(err);
    throw err;
  } finally {
    // NEW: Call after hook
    await runAfterToolCall({
      toolName,
      params: outcome.params,
      result,
      error,
      durationMs: Date.now() - startTime,
    }, ctx);
  }
  
  return result;
}
```

### No Guidance Injection

The hook result still cannot inject guidance text that the agent sees. The only options are:
- Modify `params`
- Block execution (`block: true`)
- Provide `blockReason`

---

## Hook Types Summary

| Hook | Status | Location | Purpose |
|------|--------|----------|---------|
| `before_tool_call` | ✅ INVOKED | `pi-tools.ts:433` | Block or modify tool params |
| `after_tool_call` | ❌ NOT INVOKED | `hooks.ts:308` | Observe tool completion (unused) |
| `tool_result_persist` | ✅ INVOKED | `session-tool-result-guard-wrapper.ts:30` | Modify results before persistence |
| `before_agent_start` | ✅ INVOKED | `attempt.ts:716` | Inject context via `prependContext` |

---

## Nexus Integration Strategy

### Option 1: Use before_tool_call (Now Available)

Register a `before_tool_call` hook to intercept tool calls:

```typescript
api.on("before_tool_call", async (event, ctx) => {
  if (event.toolName === "message") {
    const channel = ctx.sessionKey?.split(":")[1];
    // Could block or modify params based on channel
    if (!isValidChannel(channel)) {
      return { block: true, blockReason: "Invalid channel" };
    }
  }
  return {};
}, { priority: 100 });
```

**Limitation:** Cannot inject guidance text to agent.

### Option 2: Use tool_result_persist (New)

Transform tool results to inject guidance for follow-up:

```typescript
api.on("tool_result_persist", (event, ctx) => {
  if (event.toolName === "message") {
    // Add formatting reminder to result
    const result = JSON.parse(event.message.content);
    result.reminder = "Remember: Use bullet lists, not tables on this channel.";
    return {
      message: { ...event.message, content: JSON.stringify(result) },
    };
  }
});
```

**Limitation:** Guidance appears after tool execution, not before.

### Option 3: Use before_agent_start (Recommended)

Still the most effective approach for channel-specific guidance:

```typescript
api.on("before_agent_start", async (event, ctx) => {
  const channel = ctx.messageProvider;
  if (channel) {
    const guide = loadFormattingGuide(channel);
    return { prependContext: guide };
  }
  return {};
});
```

**Pros:** Works with existing infrastructure, guidance appears at turn start  
**Cons:** Happens at turn start, not tool call

---

## Related Files (Upstream v2026.2.3)

| File | Lines | Content |
|------|-------|---------|
| `src/plugins/types.ts` | 384-394 | `PluginHookBeforeToolCallEvent`, `PluginHookBeforeToolCallResult` |
| `src/plugins/types.ts` | 378-382 | `PluginHookToolContext` |
| `src/plugins/types.ts` | 405-427 | `tool_result_persist` types (NEW) |
| `src/plugins/hooks.ts` | 288-302 | `runBeforeToolCall()` runner |
| `src/plugins/hooks.ts` | 308-313 | `runAfterToolCall()` (not invoked) |
| `src/plugins/hooks.ts` | 325-372 | `runToolResultPersist()` (NEW, sync) |
| `src/agents/pi-tools.before-tool-call.ts` | 19-65 | Hook invocation wrapper (NEW) |
| `src/agents/pi-tools.before-tool-call.ts` | 67-91 | `wrapToolWithBeforeToolCallHook` (NEW) |
| `src/agents/pi-tools.ts` | 433-437 | Tool wrapping with hooks |
| `src/agents/pi-tool-definition-adapter.ts` | 141-146 | Client tool hook invocation |
| `src/agents/session-tool-result-guard-wrapper.ts` | 27-46 | `tool_result_persist` invocation (NEW) |
| `src/agents/pi-embedded-runner/run/attempt.ts` | 714-737 | `before_agent_start` invocation |

---

## Changelog

### 2026-02-04 (v2026.2.3)
- Verified: no tool hook changes in v2026.2.3
- `after_tool_call` remains defined but NOT invoked
- All other findings from v2026.2.2 remain accurate

### 2026-02-04 (v2026.2.2)
- **MAJOR:** `before_tool_call` hook is now invoked for all tools
- **NEW:** `tool_result_persist` hook for modifying results before persistence
- Updated line numbers and file references
- Added new integration strategies

### 2026-01-30 (v2026.1.x)
- Initial investigation: `before_tool_call` existed but was not invoked
