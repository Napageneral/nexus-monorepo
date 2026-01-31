# Tool Hook Mechanism (Upstream)

**Status:** Investigation Complete  
**Last Updated:** 2026-01-30

---

## Summary

**The `before_tool_call` hook exists but is NOT INVOKED anywhere in OpenClaw.**

The infrastructure exists (types, runner, merging logic), but there is no call site that runs it before tool execution.

---

## What Exists

### Hook Types

```typescript
// src/plugins/types.ts

export type PluginHookBeforeToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
};

export type PluginHookBeforeToolCallResult = {
  params?: Record<string, unknown>;  // Modify params
  block?: boolean;                   // Block execution
  blockReason?: string;              // Reason for blocking
};

export type PluginHookAfterToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs?: number;
};
```

### Hook Runner

```typescript
// src/plugins/hooks.ts

async function runBeforeToolCall(
  event: PluginHookBeforeToolCallEvent,
  ctx: PluginHookToolContext,
): Promise<PluginHookBeforeToolCallResult | undefined> {
  return runModifyingHook<"before_tool_call", PluginHookBeforeToolCallResult>(
    "before_tool_call",
    event,
    ctx,
    (acc, next) => ({
      params: next.params ?? acc?.params,
      block: next.block ?? acc?.block,
      blockReason: next.blockReason ?? acc?.blockReason,
    }),
  );
}
```

### Merging Behavior

- Hooks run sequentially (priority order)
- Later hooks override earlier ones
- Can modify `params`, set `block: true`, or provide `blockReason`

---

## What's Missing

### No Invocation

`runBeforeToolCall` is never called. Tool execution happens inside `pi-coding-agent`, which OpenClaw observes but does not intercept.

```typescript
// Tools are passed to createAgentSession
({ session } = await createAgentSession({
  // ...
  tools: builtInTools,
  customTools: allCustomTools,
  // ...
}));
```

OpenClaw receives `tool_execution_start` events AFTER execution begins.

### No Guidance Injection

The hook result can only:
- Modify `params`
- Block execution (`block: true`)
- Provide `blockReason`

There is NO field for injecting guidance text that the agent sees.

---

## What We Need for Nexus

### 1. Invoke the Hook

Wrap tools before passing to `createAgentSession`:

```typescript
function wrapToolWithHooks(tool: AnyAgentTool): AnyAgentTool {
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      // Call before hook
      const hookResult = await runBeforeToolCall({
        toolName: tool.name,
        params,
      });
      
      if (hookResult?.block) {
        return { error: hookResult.blockReason || 'Blocked by hook' };
      }
      
      const modifiedParams = hookResult?.params ?? params;
      
      // Execute tool
      const result = await tool.execute(toolCallId, modifiedParams, signal, onUpdate);
      
      // Call after hook
      await runAfterToolCall({
        toolName: tool.name,
        params: modifiedParams,
        result,
      });
      
      return result;
    },
  };
}
```

### 2. Extend Hook Result for Guidance

```typescript
export type PluginHookBeforeToolCallResult = {
  params?: Record<string, unknown>;
  block?: boolean;
  blockReason?: string;
  
  // NEW: Guidance to show to agent
  guidance?: string;
  
  // NEW: Should we pause and ask agent to reconsider?
  requestReconsideration?: boolean;
};
```

### 3. Inject Guidance into Context

When `guidance` is returned, inject it into the agent's context:

```typescript
if (hookResult?.guidance) {
  // Append guidance to the conversation
  await appendToConversation({
    role: 'system',
    content: hookResult.guidance,
  });
}
```

---

## Alternative Approaches

### Option A: Tool Description Injection

Instead of hook-based guidance, dynamically build tool descriptions:

```typescript
const messageTool = {
  name: 'message',
  description: buildMessageToolDescription(channel, capabilities),
  // Description includes formatting guidance
};
```

**Pros:** Simpler, no hook changes needed  
**Cons:** Still in system prompt, affects caching

### Option B: Skill Loading in Tool

The tool itself loads a skill when executed:

```typescript
async function messageToolExecute(params) {
  const channel = params.channel || currentChannel;
  const skill = await loadSkill(`channel-format-${channel}`);
  
  // Return skill guidance as part of tool result
  return {
    result: await sendMessage(params),
    guidance: skill.summary,
  };
}
```

**Pros:** On-demand, no hook changes  
**Cons:** Guidance shown after, not before

### Option C: Pre-Turn Context Injection

Use the existing `before_agent_start` hook which CAN inject `prependContext`:

```typescript
// This hook exists and works
async function beforeAgentStart(event, ctx) {
  const channel = extractChannel(event);
  const guide = await loadFormattingGuide(channel);
  
  return {
    prependContext: guide.summary,
  };
}
```

**Pros:** Works with existing infrastructure  
**Cons:** Happens at turn start, not tool call

---

## Recommendation for Nexus

**Short-term:** Use `before_agent_start` with `prependContext` since it already works.

Based on channel info available via `params.messageChannel` or `params.messageProvider`, inject channel-specific formatting guidance into the turn context.

**Long-term:** Implement proper tool hook invocation:

1. **Extend types in `types.ts`:**
   ```typescript
   export type PluginHookBeforeToolCallResult = {
     params?: Record<string, unknown>;
     block?: boolean;
     blockReason?: string;
     guidance?: string;  // NEW: Inject guidance to agent
   };
   
   export type PluginHookToolContext = {
     agentId?: string;
     sessionKey?: string;
     toolName: string;
     channel?: string;   // NEW: Channel context
   };
   ```

2. **Update merge function in `hooks.ts`:**
   ```typescript
   (acc, next) => ({
     params: next.params ?? acc?.params,
     block: next.block ?? acc?.block,
     blockReason: next.blockReason ?? acc?.blockReason,
     guidance: next.guidance ?? acc?.guidance,  // NEW
   }),
   ```

3. **Create tool wrapper in `attempt.ts`:**
   ```typescript
   function wrapToolWithHooks(tool: AnyAgentTool, ctx: HookContext): AnyAgentTool {
     return {
       ...tool,
       execute: async (toolCallId, params, signal, onUpdate) => {
         // Call before hook
         const hookResult = await runBeforeToolCall({
           toolName: tool.name,
           params,
         }, {
           ...ctx,
           toolName: tool.name,
         });
         
         if (hookResult?.block) {
           return { error: hookResult.blockReason || 'Blocked by hook' };
         }
         
         // TODO: Apply guidance somehow
         // Option: Inject into system message
         // Option: Return as part of tool result
         
         const modifiedParams = hookResult?.params ?? params;
         return tool.execute(toolCallId, modifiedParams, signal, onUpdate);
       },
     };
   }
   ```

4. **Wrap tools before `createAgentSession`** (around line 448 in `attempt.ts`)

---

## Channel Info Location

Channel info is available before agent runs:

1. **In `runEmbeddedAttempt` params** (line 141 in `attempt.ts`):
   - `params.messageChannel`
   - `params.messageProvider`

2. **Normalized** (line 240):
   ```typescript
   const runtimeChannel = normalizeMessageChannel(
     params.messageChannel ?? params.messageProvider
   );
   ```

3. **In `before_agent_start` hook context** (line 699):
   ```typescript
   messageProvider: params.messageProvider ?? undefined,
   ```

This means we can:
- Check channel in `before_agent_start` and inject guidance via `prependContext`
- Pass channel to `before_tool_call` if we extend `PluginHookToolContext`

---

## Related Files (Upstream)

| File | Line | Content |
|------|------|---------|
| `src/plugins/types.ts` | 386-396 | `PluginHookBeforeToolCallEvent`, `PluginHookBeforeToolCallResult` |
| `src/plugins/types.ts` | 380-384 | `PluginHookToolContext` |
| `src/plugins/types.ts` | 319-322 | `PluginHookBeforeAgentStartResult` with `prependContext` |
| `src/plugins/hooks.ts` | 284-298 | `runBeforeToolCall()` (defined but not called) |
| `src/plugins/hooks.ts` | 179-195 | `before_agent_start` merging |
| `src/agents/pi-embedded-runner/run/attempt.ts` | 141 | `messageChannel`/`messageProvider` params |
| `src/agents/pi-embedded-runner/run/attempt.ts` | 240 | Channel normalization |
| `src/agents/pi-embedded-runner/run/attempt.ts` | 448 | Where tools passed to `createAgentSession` |
| `src/agents/pi-embedded-runner/run/attempt.ts` | 688-711 | `before_agent_start` invocation |
