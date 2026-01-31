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

**Short-term:** Use Option C (`before_agent_start` with `prependContext`) since it already works.

**Long-term:** Implement proper tool hook invocation with guidance injection for on-demand, per-tool-call context.

---

## Related Files (Upstream)

- `src/plugins/types.ts` — Hook type definitions
- `src/plugins/hooks.ts` — Hook runner
- `src/agents/pi-tools.ts` — Tool creation
- `src/agents/pi-tools.abort.ts` — Tool wrapping example
- `src/agents/pi-embedded-runner/run/attempt.ts` — Agent session creation
