---
title: Broker WebSocket Default Cutover
status: implemented
owners: [nexus-runtime]
last_updated: 2026-02-27
---

# Goal
Make websocket transport the default globally for broker/agent executions.

# Customer Experience
- Agent runs should use websocket transport by default without per-automation wiring.
- Explicit transport overrides must still work when intentionally set.
- No legacy compatibility branch; hard cutover to websocket default behavior.

# Problem
Transport defaults were fragmented:
- Memory meeseeks had websocket defaults in automation-specific wiring.
- General broker/agent execution did not enforce a default transport.
- Result: inconsistent transport behavior across execution paths.

# Decision
Centralize defaulting in the shared execution path (`runAgentExecution`) and always resolve:
- `streamParams.transport = "websocket"` when unspecified.
- Preserve caller-provided explicit transport (`sse`, `websocket`, `auto`).

# Implementation
- File: `nex/src/commands/agent.ts`
  - Add `resolveAgentStreamParams()` resolver.
  - Apply resolver once per run.
  - Pass resolved params to both:
    - `runCliAgent(...)`
    - `runEmbeddedPiAgent(...)`

# Validation
- File: `nex/src/commands/agent.test.ts`
  - Added test: defaults to websocket with no stream params.
  - Added test: explicit override (`sse`) is preserved.

# Out of Scope
- Throughput governor / rate-limit control.
- Model/thinking policy changes.
- Provider-specific transport optimizations.
