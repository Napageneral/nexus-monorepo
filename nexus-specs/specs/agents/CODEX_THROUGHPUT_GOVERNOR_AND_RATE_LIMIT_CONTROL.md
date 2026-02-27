# Codex Throughput Governor and Rate-Limit Control (Nex)

Status: Draft implementation spec (research-complete)
Owner: Runtime / Agents
Date: 2026-02-27

## 1) Customer Experience First

Current pain:
- When Codex load spikes, multiple running agents can fail together.
- A single benchmark/backfill can consume shared Codex capacity and starve interactive agents.
- After first 429/cooldown, tasks can keep failing in waves instead of degrading gracefully.

Target experience:
1. Interactive agents remain responsive under load.
2. Batch/backfill work slows down automatically before interactive work is impacted.
3. Hitting provider limits never creates a cascading failure storm.
4. Operators can see real-time Codex budget usage and in-flight agent counts.

Non-goals:
- This spec does not redesign memory retain/consolidate logic quality.
- This spec does not add model-specific prompt tuning.

---

## 2) Research Findings (from completed runs)

### 2.1 Local implementation state (websocket + config)

Websocket transport is implemented end-to-end in Nex for meeseeks agent execution:
- `package.json` pins websocket-capable stack:
  - `@mariozechner/pi-ai: 0.55.1`
  - `@mariozechner/pi-agent-core: 0.55.1`
- Transport plumbing exists in:
  - `src/nex/automations/meeseeks/stream-params.ts`
  - `src/nex/automations/hooks-runtime.ts`
  - `src/nex/ingress-metadata.ts`
  - `src/nex/stages/runAgent.ts`
  - `src/agents/pi-embedded-runner/extra-params.ts`
- Memory meeseeks transport default resolves to `websocket` unless overridden by env.

Conclusion: websocket setup is present and active in the request path.

Important gap:
- Today, websocket default is explicit for memory meeseeks, but not enforced as a broker-global default for all agent launches.
- Requirement going forward: broker-wide default transport must be `websocket` for all Codex-bound agent runs unless explicitly overridden.

### 2.2 Measured concurrency and in-flight peaks

From overlap analysis of `hook_invocations` windows:
- Large run (`c=32`) peak writer in-flight: `32`
- Large run (`c=24`) peak writer in-flight: `24`
- Small runs with 15 episodes capped at 15 in-flight (workload-limited, not system-limited)

Observed operational issue:
- With additional 7-8 app agents, total concurrent Codex load reached ~40.
- This correlated with global starvation behavior and cross-agent failure waves.

### 2.3 Throughput numbers we can trust right now

Small-workload sweeps (15 episodes) completed at `c=4..64`.
Best observed in that workload: ~`4.70 retain jobs/min` (`0.078 rps`) at `c=28`.

Important caveat:
- 15-episode workload cannot validate higher parallel ceilings because parallelism is naturally capped by episode count.

Large-workload sweeps (135 episodes):
- At `c=32`, high failure rate from consolidation path (`unconsolidated facts remaining`).
- At `c=24`, still non-trivial failures.

Conclusion:
- Current full pipeline practical stability limit is below the tested `24-32` range in large windows.
- For pure Codex provider ceiling, consolidation must be isolated from the measurement path.

---

## 3) OpenAI Published Limits and Protocol Support (Research)

Primary sources:
- GPT-5.2-Codex model page: https://platform.openai.com/docs/models/gpt-5.2-codex
- GPT-5.1-Codex model page: https://platform.openai.com/docs/models/gpt-5.1-codex
- Rate limits guide: https://platform.openai.com/docs/guides/rate-limits

Published model-level facts from docs:
1. Codex model pages list per-tier RPM/TPM tables (tier-dependent, not one fixed global number).
2. Example listed tiers for codex models include:
   - Tier 1: 500 RPM / 500,000 TPM
   - Tier 2: 5,000 RPM / 1,000,000 TPM
   - Tier 3: 5,000 RPM / 2,000,000 TPM
   - Tier 4: 10,000 RPM / 4,000,000 TPM
   - Tier 5: 15,000 RPM / 40,000,000 TPM
3. Realtime endpoint support is documented on codex model pages (`v1/realtime`).

Operational reality:
- Effective limits are account/tier-specific and can vary by model + org/project.
- Runtime enforcement can still trigger 429s below theoretical tables due mixed workloads and shared pools.

---

## 4) Problem Definition for Nex

Nex currently lacks a global Codex admission controller.

Failure mode:
1. Multiple launchers (interactive + automations + backfill) dispatch concurrently.
2. Provider budget is treated as implicit/unbounded at dispatch time.
3. First 429/cooldown event appears late (after saturation).
4. In-flight retries/cooldowns overlap and cause cascading failures.

Required behavior:
- Centralized pre-dispatch gate for Codex-bound tasks.
- Global visibility into in-flight count + estimated RPM/TPM consumption.
- Priority-aware throttling to protect interactive sessions.

---

## 5) Proposed Solution: Global Codex Throughput Governor

## 5.1 Architecture

Introduce a single runtime component: `CodexThroughputGovernor`.

All Codex dispatch paths must call governor before provider invocation:
- Interactive `agent` command path
- Automation/meeseeks path (retain/consolidate and others)
- CLI batch paths that dispatch agents

Hard cutover rule:
- No bypass launch path for Codex models.

## 5.2 Control model

Use a combined guard:
1. `max_inflight` hard cap (global + per-lane)
2. Token-bucket estimates for RPM and TPM
3. Dynamic cooldown if 429 burst detected

Transport policy requirement:
1. Broker-global default stream transport is `websocket`.
2. Default applies to interactive + automation + batch paths uniformly.
3. Override path remains available (`stream_params.transport`) for explicit per-run exceptions.

Lane priorities:
1. `interactive` (highest)
2. `automation` (middle)
3. `batch/backfill` (lowest)

Backpressure semantics:
- Queue/defer low-priority dispatches.
- Do not hard-fail immediately unless queue timeout expires.

## 5.3 Data model (runtime DB)

Add tables:

1. `agent_throughput_state`
- `provider` TEXT
- `model` TEXT
- `inflight` INTEGER
- `updated_at` INTEGER
- `cooldown_until` INTEGER
- `last_429_at` INTEGER
- `consecutive_429` INTEGER

2. `agent_throughput_ledger`
- `id` TEXT PK
- `timestamp` INTEGER
- `provider` TEXT
- `model` TEXT
- `lane` TEXT (`interactive|automation|batch`)
- `decision` TEXT (`admit|defer|reject`)
- `reason` TEXT
- `inflight_before` INTEGER
- `inflight_after` INTEGER
- `estimated_tokens` INTEGER

3. `agent_rate_limit_snapshots`
- `timestamp` INTEGER
- `provider` TEXT
- `model` TEXT
- `rpm_limit` INTEGER NULL
- `tpm_limit` INTEGER NULL
- `rpm_remaining` INTEGER NULL
- `tpm_remaining` INTEGER NULL
- `reset_at` INTEGER NULL
- `source` TEXT (`response_headers|config|manual`)

## 5.4 Config surface

Add runtime config keys:
- `agents.throughput.codex.enabled` (bool)
- `agents.throughput.codex.maxInflight.global`
- `agents.throughput.codex.maxInflight.interactive`
- `agents.throughput.codex.maxInflight.automation`
- `agents.throughput.codex.maxInflight.batch`
- `agents.throughput.codex.reserveInteractive` (percentage headroom)
- `agents.throughput.codex.cooldownMs.base`
- `agents.throughput.codex.cooldownMs.max`
- `agents.throughput.codex.queueTimeoutMs`

## 5.5 Admission algorithm (deterministic)

On dispatch request:
1. Determine lane + model + provider.
2. Read current inflight + cooldown state.
3. If cooldown active and lane != interactive: `defer`.
4. If lane cap/global cap exceeded: `defer`.
5. If estimated RPM/TPM would exceed configured budget: `defer`.
6. Otherwise admit and increment inflight atomically.

On completion:
- decrement inflight
- record usage actuals

On 429:
1. increment 429 counters
2. compute exponential cooldown window
3. set cooldown for low-priority lanes first
4. keep small reserved budget for interactive lane

## 5.6 UX + observability

Add CLI:
- `nexus agents throughput status`
  - global inflight, per-lane inflight
  - current cooldown state
  - rolling RPM/TPM estimates
  - defer/reject counts

Add UI card in runtime dashboard:
- live Codex load gauge
- lane split
- recent throttle events

---

## 6) Immediate safe operating policy (until governor lands)

Because user concurrently runs ~7-8 interactive Codex agents:
1. Keep batch backfill concurrency conservative (`<=12-16`) during active interactive sessions.
2. Do not run broad saturation sweeps during normal usage windows.
3. Treat any first 429 as a signal to pause batch launches and allow cooldown recovery.

---

## 7) Validation plan

Stage A: Unit tests
1. Admission decisions under cap / at cap / above cap.
2. Priority protection (interactive admitted while batch deferred).
3. Cooldown transitions after synthetic 429 bursts.

Stage B: Integration tests
1. Mixed load simulation: interactive + batch.
2. Assert no interactive starvation.
3. Assert deferred batch tasks recover after cooldown.

Stage C: Real benchmark
1. Run controlled ladder with governor enabled.
2. Capture first stable ceiling without cascade failures.
3. Confirm no cross-agent mass failure on induced 429.

Pass criteria:
- No cascading hard-fail across unrelated active sessions.
- Interactive p95 latency stable under mixed load.
- Batch tasks defer/retry gracefully rather than fail in storms.

---

## 8) Execution sequence

1. Implement throughput state tables + repository.
2. Implement `CodexThroughputGovernor` service.
3. Wire all Codex dispatch entrypoints through governor (hard cutover).
4. Add CLI/UI observability.
5. Run staged validation + controlled saturation test.
