# Hook Examples

This folder contains example hooks demonstrating common patterns. These examples inform the hook-authoring skill and help agents write effective hooks.

## Pattern Categories

| Pattern | Example | Description |
|---------|---------|-------------|
| **One-Shot Scheduled** | `casey-safety-check.ts` | Fires once at a specific time, queries history, self-disables |
| **Conditional LLM** | `mom-2fa-helper.ts` | Uses LLM to classify incoming messages |
| **Pure Deterministic** | `work-whatsapp-routing.ts` | Fast pattern matching, no LLM |
| **Interval Scheduled** | `heartbeat.ts` | Fires on interval (replaces upstream heartbeat) |
| **Webhook Filter** | `stripe-high-value.ts` | Filters webhook events by payload |
| **Hybrid** | `flight-checkin.ts` | Deterministic pre-filter + LLM extraction |

## Writing Hooks

### Basic Structure

```typescript
/**
 * @name Human Readable Name
 * @description What this hook does
 * @mode persistent   // or 'one-shot'
 */

export default async function(ctx: HookContext): Promise<HookResult> {
  const { event, cortex, llm, now, hook } = ctx;
  
  // 1. Fast exits for non-matching events
  if (event.channel !== 'imessage') return { fire: false };
  
  // 2. Optional: Query cortex for more context
  const history = await cortex.query({ ... });
  
  // 3. Optional: LLM evaluation
  const analysis = await llm.classify({ ... });
  
  // 4. Return result
  return {
    fire: true,
    routing: { agent_id: 'my-agent' },
    context: { prompt: 'Do the thing', extracted: analysis }
  };
}
```

### Performance Tips

1. **Exit early** — Check cheap conditions first (channel, sender) before expensive operations
2. **Use default LLM** — It's already optimized; only override for specific needs
3. **Batch cortex queries** — One query with good filters beats multiple small queries
4. **Keep scripts focused** — One hook, one job; compose via multiple hooks if needed

### Testing Hooks

Hooks can be tested in isolation:

```bash
nexus hook test casey-safety-check --event '{"channel": "imessage", ...}'
```

Or dry-run against recent events:

```bash
nexus hook dry-run casey-safety-check --last 10
```
