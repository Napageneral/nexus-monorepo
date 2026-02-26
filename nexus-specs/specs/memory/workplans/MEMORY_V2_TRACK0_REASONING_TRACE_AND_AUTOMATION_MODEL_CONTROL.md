# MEMORY V2 Track 0: Reasoning Trace + Per-Automation Model/Thinking Control

## Status
Draft for implementation

## Objective
Make memory meeseeks (writer + consolidator) independently configurable for model/thinking, and capture reasoning telemetry end-to-end in Nexus ledgers.

## Customer Experience Goal
When memory meeseeks run, operators can:
1. Configure model and thinking level per automation (writer vs consolidator independently).
2. See non-zero reasoning token telemetry when provider/runtime returns it.
3. Inspect persisted reasoning text/summaries (when available) in `agents.db`.
4. Trust that telemetry reflects real runtime behavior, not hardcoded zero placeholders.

## Current Problems

### 1) No per-automation model/thinking control on the memory hook path
- Automation hook rows support `config_json`.
- Hook runtime currently loads `config_json` but does not map memory hook-level model/thinking config into the broker request in a canonical way.
- Memory meeseeks are effectively pinned by session-key-based forcing in `/Users/tyler/nexus/home/projects/nexus/nex/src/commands/agent.ts`.

### 2) Reasoning telemetry is dropped
- `runAgent` usage path uses a shape that defaults `reasoning_tokens` to zero in common paths.
- Usage normalization excludes reasoning fields.
- `messages.thinking` remains empty even when reasoning-style content exists in transcript content.

### 3) Incomplete runtime bridge
- pi/embedded stack contains reasoning/thinking constructs.
- Nexus usage + persistence layer does not carry those fields end-to-end.

## Hard Cutover Principle
No backwards compatibility layer for Track 0 behavior. Once implemented:
- Memory hook execution uses the new automation-level override path.
- Reasoning usage schema includes reasoning metrics as first-class fields.
- No silent fallback to hardcoded zero reasoning fields in standard success paths.

## Scope

### In Scope
1. Per-automation runtime overrides for memory hooks:
   - `agent.model`
   - `agent.thinking`
   - optional `agent.reasoning_mode`
2. End-to-end reasoning usage telemetry:
   - parse
   - normalize
   - accumulate
   - persist in `turns.reasoning_tokens`
3. Reasoning text/summaries persistence where available:
   - `messages.thinking` for assistant messages
4. Effective config snapshot visibility:
   - include thinking/reasoning mode fields in `effective_config_json`

### Out of Scope
- Changing provider internals.
- Inventing provider reasoning data that is not returned.
- Any non-memory automation behavior changes beyond shared plumbing.

## Canonical Configuration Model

### Hook Config JSON Shape (memory hooks)
```json
{
  "agent": {
    "model": "openai-codex/gpt-5.3-codex",
    "thinking": "medium",
    "reasoning_mode": "on"
  }
}
```

- `memory-writer` and `memory-consolidator` may have different values.
- Seeder owns default values for bundled memory hooks.

## Runtime Wiring Design

### A) Automation hook config -> ingress metadata
In hook runtime request derivation:
- read `hook.config_json.agent`
- inject into derived request metadata ingress envelope:
  - `_nex_ingress.agent.model`
  - `_nex_ingress.agent.thinking`
  - `_nex_ingress.agent.reasoning_mode`

### B) Ingress metadata -> runAgent options
- Extend ingress parser to accept `agent.model` and `agent.reasoning_mode`.
- Extend `AgentCommandOpts` to carry:
  - `model?: string`
  - `reasoningMode?: "off" | "on" | "stream"`
- `toAgentCommandOptions` maps ingress values into `AgentCommandOpts`.

### C) runAgentExecution -> embedded runner
- `runAgentExecution` passes `opts.model` through to `runEmbeddedPiAgent`.
- `runAgentExecution` passes `opts.reasoningMode` to `runEmbeddedPiAgent`.
- Memory meeseeks session-key forcing must no longer override explicit per-hook model.
  - Explicit hook model wins.
  - If absent, existing default selection applies.

## Reasoning Telemetry Design

### A) Usage schema extension
Update normalized usage shapes to include reasoning metrics:
- `reasoning?: number`

### B) Accumulator extension
Usage accumulators in embedded runner include:
- `reasoning`

### C) Persistence
Map normalized usage to `ResponseContext.usage.reasoning_tokens` and persist to:
- `turns.reasoning_tokens`

### D) Effective config snapshot
Persist the applied thinking/reasoning settings in turn config snapshot:
- `effective_config_json.thinking`
- `effective_config_json.reasoning_mode`

## Reasoning Text Persistence

When provider/runtime exposes reasoning text/summaries:
- populate assistant message `thinking` column (`messages.thinking`).
- do not store hidden chain-of-thought that provider marks non-exportable.
- store only export-safe reasoning stream/summary text.

## Files Expected to Change
- `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/automations/hooks-runtime.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/ingress-metadata.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/commands/agent/types.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/stages/runAgent.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/usage.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/pi-embedded-runner/run.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/pi-embedded-subscribe.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/pi-embedded-runner/types.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/automations/bundled/registry.ts` (or seeder defaults)

## Validation Plan

### Unit/Integration
1. Ingress parser accepts `agent.model` and `agent.reasoning_mode`.
2. `toAgentCommandOptions` emits model/thinking/reasoning mode.
3. Embedded runner usage accumulator preserves reasoning tokens.
4. `persistAgentRun` stores non-zero `reasoning_tokens` when present.
5. `effective_config_json` contains applied thinking settings.

### Runtime Verification
Run memory writer + consolidator and verify:
```sql
SELECT t.id, t.model, t.reasoning_tokens, t.effective_config_json
FROM turns t
JOIN sessions s ON s.thread_id = t.id
WHERE s.label LIKE 'meeseeks:memory-writer:%'
ORDER BY s.created_at DESC
LIMIT 20;
```

Expected:
- model matches hook-level configured model
- thinking/reasoning mode visible in effective config
- reasoning_tokens non-zero when provider returns it

## Acceptance Criteria
1. Memory writer and consolidator can be configured independently for model + thinking.
2. Reasoning token telemetry no longer hardcodes to zero in normal success path.
3. `messages.thinking` gets populated when reasoning text/summaries are available.
4. Turn config snapshots include applied reasoning/thinking settings.
5. Existing memory flows (retain/consolidate/recall) still pass full test suite.
