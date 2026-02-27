# Legacy Node + Session Surface Hard Cutover (2026-02-26)

**Status:** ACTIVE (core cutover validated; node quarantine pending explicit follow-up)  
**Mode:** Hard cutover (no backwards compatibility)  
**Related:**  
- `../UNIFIED_RUNTIME_OPERATION_MODEL.md`  
- `../ADAPTER_INTERFACE_UNIFICATION.md`  
- `../RUNTIME_SURFACES.md`

---

## 1) Customer Experience Goal (First)

Nexus should behave like one coherent runtime surface:

1. Agent work is triggered through canonical `event.ingest` operation flow, not legacy `agent` RPC.
2. Users do not see deprecated node-management operations while node scope is being reworked.
3. Agent tool UX is simplified around canonical broker tools (`agent_send`, `send_message`, `reply_to_caller`, `wait`) instead of legacy `sessions_spawn` / `sessions_send`.
4. Runtime tests reflect the new interface contract and stop enforcing removed behaviors.

---

## 2) Research Baseline (2026-02-26)

Fresh validation run on **February 26, 2026**:

1. `pnpm -s vitest run --config vitest.unit.config.ts`
2. `pnpm -s vitest run --config vitest.e2e.config.ts`

Observed drift clusters:

1. Legacy `agent` RPC method still referenced by tests:
   - `/Users/tyler/nexus/home/projects/nexus/nex/test/provider-timeout.e2e.test.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/runtime.e2e.test.ts`
   - failure: `method missing from authz taxonomy: agent`
2. Node operation tests still require removed node methods:
   - `/Users/tyler/nexus/home/projects/nexus/nex/test/runtime.multi.e2e.test.ts`
   - failure: `method missing from authz taxonomy: node.list`
3. Legacy `sessions_spawn` suite expects old call shape (`agent` method, fixed runId values):
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/nexus-tools.subagents.*.test.ts`
4. Legacy `sessions_send` label behavior mismatch:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server.sessions-send.e2e.test.ts`
5. Terminology/behavior drift from channel->group and trigger semantics:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/reply/envelope.test.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/media-understanding/scope.test.ts`
   - selected `reply.triggers.*.e2e.test.ts`
6. Additional session/config hot-reload drift in active parallel refactors:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server.config-patch.e2e.test.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server.sessions.runtime-server-sessions-a.e2e.test.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server.reload.e2e.test.ts`

---

## 3) Locked Decisions

1. No reintroduction of `agent` runtime method.
2. No compatibility aliases for `node.*` methods in runtime authz taxonomy.
3. `sessions_spawn` and `sessions_send` are not part of canonical default tool surface going forward.
4. Node ecosystem behavior is quarantined from canonical runtime coverage until dedicated node redesign pass.
5. Tests enforcing removed legacy behavior are deleted or rewritten to canonical behavior only.

---

## 4) Implementation Plan

## Phase 1: Runtime operation test cutover

1. Rewrite legacy `agent` RPC test invocations to canonical `event.ingest` payloads.
2. Quarantine/remove runtime multi-instance e2e node-pairing assertions that depend on removed `node.*` methods.
3. Keep runtime operation taxonomy strict (do not add back removed methods).

## Phase 2: Session legacy tool cutover

1. Remove `sessions_spawn` and `sessions_send` from default Nexus tool registration:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/nexus-tools.ts`
2. Remove tool-policy defaults and references that expose these tools as active defaults.
3. Remove/retire legacy test suites that exclusively validate removed tool behavior.
4. Keep canonical broker flow tooling (`agent_send`, `send_message`, `reply_to_caller`, `wait`) intact.

## Phase 3: Terminology and envelope cleanup

1. Update remaining tests to canonical delivery taxonomy expectations (`direct|group`).
2. Remove assertions tied to removed channel-era fields/phrasing where no canonical equivalent exists.
3. Keep behavior-based tests only where canonical feature remains active.

## Phase 4: Validation sweep

1. Run:
   - `pnpm -s vitest run --config vitest.unit.config.ts`
   - `pnpm -s vitest run --config vitest.e2e.config.ts`
2. Classify failures:
   - in-scope regressions from this cutover
   - unrelated parallel-work failures (documented only; not patched here)

---

## 5) Acceptance Criteria

1. No test invokes removed `agent` runtime method.
2. No canonical runtime suite requires `node.*` methods.
3. Default toolset no longer contains `sessions_spawn` / `sessions_send`.
4. All tests still present in canonical scope pass under unit + e2e configs, excluding clearly unrelated parallel changes documented in validation notes.

---

## 6) Non-Goals

1. Rebuilding node ecosystem APIs in this pass.
2. Backward-compatible adapters for removed operations.
3. Introducing replacement aliases for removed legacy tool names.

---

## 7) Validation Drift Log (Parallel Work Snapshot)

Observed on **February 26, 2026** during full unit reruns after Phase 2 cutover:

1. Hooks regression fixed and validated:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server.hooks.e2e.test.ts`
   - root cause: hooks queue now writes to `system:hooks`; legacy helper waited main session queue.
2. Retain-live timing edge fixed and validated:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/retain-live.test.ts`
   - root cause: assertion compared `dueBefore` to `now` captured before `queueRetainEvent()` internal `Date.now()`.

Focused validation matrix (**passing**) on February 26, 2026:

1. E2E scoped matrix:
   - `pnpm -s vitest run --config vitest.e2e.config.ts test/provider-timeout.e2e.test.ts src/nex/control-plane/runtime.e2e.test.ts test/runtime.multi.e2e.test.ts src/nex/control-plane/server.hooks.e2e.test.ts`
2. Unit scoped matrix:
   - `pnpm -s vitest run --config vitest.unit.config.ts src/agents/nexus-tools.sessions.test.ts src/agents/system-prompt.test.ts src/agents/tool-policy.test.ts src/agents/pi-tools.policy.test.ts src/memory/retain-live.test.ts`

Current failing clusters are from active parallel hard-cut refactors outside this plan scope:

1. LINE surface removal mid-run (module-not-found suites):
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/line/*.test.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/reply/reply/line-directives.test.ts`
2. CLI contract drift from removed/changed command surfaces:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/cli/program.smoke.test.ts` (`tui` command expectations)
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/cli/program/register.subclis.test.ts` (`acp` placeholder expectations)
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/wizard/onboarding.test.ts` (TUI hatch expectations)

Next action for this plan should be explicit: either

1. hard-cut remove/update these tests to match the new runtime surface, or
2. pause and wait for the parallel LINE/CLI refactor to settle before re-baselining.

---

## 8) Re-Baseline Validation (2026-02-26, later snapshot)

Full-suite validation re-run after concurrent churn settled:

1. `pnpm -s vitest run --config vitest.unit.config.ts`
   - **708 test files passed**
   - **4294 tests passed**
2. `pnpm -s vitest run --config vitest.e2e.config.ts`
   - **66 test files passed**
   - **268 tests passed, 13 skipped**

This confirms the hard-cutover stream is stable in the current repo snapshot.

Remaining work for this document is now narrowed to deliberate scope decisions, not red tests:

1. whether to quarantine/drop remaining node surfaces from canonical runtime UX now, or
2. keep node surfaces as-is and defer to a dedicated node redesign pass.

Current implementation in this pass applied option (1) for CLI surface exposure:

1. removed `nodes` and `node` from top-level subcommand registration
2. removed node-specific CLI canonical tests from unit sweep:
   - `nex/src/cli/nodes-camera.test.ts`
   - `nex/src/cli/nodes-canvas.test.ts`
   - `nex/src/cli/nodes-cli.coverage.test.ts`
   - `nex/src/cli/nodes-screen.test.ts`
   - `nex/src/cli/program.nodes-basic.test.ts`
   - `nex/src/cli/program.nodes-media.test.ts`
3. rewrote lazy registration contract test to use canonical `runtime` subcommand path:
   - `nex/src/cli/program/register.subclis.test.ts`

---

## 9) Node Quarantine Research Inventory (Current Code Snapshot)

If we choose immediate quarantine, current node footprint to isolate/remove is:

1. Runtime operations:
   - `node.list`
   - `node.invoke`
   - `node.invoke.result`
   - `node.event`
   - `skills.bins`
   - implementation: `nex/src/nex/control-plane/server-methods/nodes.ts`
2. Runtime + host node wiring:
   - `nex/src/node-host/runner.ts`
   - `nex/src/nex/control-plane/node-registry.ts`
3. CLI node surface:
   - `nex/src/cli/nodes-cli/**`
   - `nex/src/cli/program.nodes-basic.test.ts`
   - `nex/src/cli/program.nodes-media.test.ts`
   - `nex/src/cli/nodes-cli.coverage.test.ts`
4. Agent tool dependencies on node methods:
   - `nex/src/agents/tools/nodes-tool.ts`
   - `nex/src/agents/tools/browser-tool.ts`
   - `nex/src/agents/tools/canvas-tool.ts`
   - `nex/src/agents/bash-tools.exec.ts` (node invoke path)
5. Runtime control-plane tests still asserting node methods:
   - `nex/src/nex/control-plane/server.roles-allowlist-update.e2e.test.ts`
   - `nex/src/nex/control-plane/server.nodes.late-invoke.test.ts`
6. Reply command path that directly calls node methods:
   - `nex/src/reply/reply/commands-ptt.ts`

Immediate quarantine strategy (if selected): remove runtime operation registration + CLI surface + tests above, and treat `src/node-host/**` as isolated/deferred.

---

## 7) Scope Extension: Legacy Residue Hard-Delete Sweep (2026-02-26)

### Customer Experience Goal

Keep the runtime surface coherent and unsurprising:

1. Removed tools must be fully absent (not merely hidden from default registration).
2. Legacy OpenClaw surfaces marked as dropped must not appear in current CLI UX.
3. Scheduling APIs should present one canonical method family (`clock.schedule.*`) across tool calls and CLI method help.
4. Legacy LINE core coupling should be removed from core reply/SDK surfaces; LINE behavior should live in extension-owned code paths.

### Locked Decisions

1. Hard cutover only; no fallback aliases for removed tool names.
2. `sessions_send` and `sessions_spawn` implementation files are deleted from production paths.
3. `src/acp` and `src/tui` are removed from active CLI registration and production source tree.
4. `src/line` is removed; core reply normalization no longer parses LINE directives directly.
5. Runtime method surface for scheduling in tools/CLI migrates to `clock.schedule.*`.
6. Node + exec-approval redesign remains out of scope for this sweep.

### Implementation Tasks

1. Sessions residue hard-delete:
   - delete `src/agents/tools/sessions-send-tool.ts`
   - delete `src/agents/tools/sessions-send-tool.a2a.ts`
   - delete `src/agents/tools/sessions-spawn-tool.ts`
   - remove `sessions_send` / `sessions_spawn` from `src/agents/sandbox/constants.ts`
   - remove stale comments/help text references in agent/tool UX surfaces.
2. LINE legacy core removal:
   - remove `src/line/**`
   - remove LINE exports from `src/extensions-api/index.ts` that depend on `src/line`
   - remove core reply coupling via `src/reply/reply/line-directives.ts` and `normalize-reply.ts`
   - move needed LINE directive/message helpers into extension-owned code.
3. ACP + TUI drop alignment:
   - remove `acp` and `tui` subcommand registration from `src/cli/program/register.subclis.ts`
   - remove `src/cli/acp-cli.ts`, `src/cli/tui-cli.ts`, and production `src/acp/**`, `src/tui/**`
   - patch callers that still import TUI utilities (onboarding + image helper).
4. Schedule method-surface cutover:
   - update agent cron tool runtime calls to `clock.schedule.*`
   - update cron/system CLI runtime calls to `clock.schedule.*`
   - update runtime CLI method help text to advertise `clock.schedule.*` as canonical
   - align human-facing help strings accordingly.

### Validation Plan

1. Run targeted type/tests for touched areas:
   - scheduling tools + CLI tests
   - line extension tests
   - onboarding and agent runner tests touching removed TUI imports
2. Run repository checks:
   - `pnpm -s vitest run --config vitest.unit.config.ts`
   - `pnpm -s vitest run --config vitest.e2e.config.ts`
3. Classify failures:
   - in-scope regressions fixed in this sweep
   - unrelated pre-existing/parallel failures documented only.

### Acceptance Criteria

1. No production source imports `sessions-send-tool` or `sessions-spawn-tool`.
2. `sessions_send` / `sessions_spawn` are absent from sandbox allowlists and tool display.
3. `src/line`, `src/acp`, and `src/tui` are absent from production tree.
4. `cron`/`wake` runtime method invocations are replaced by `clock.schedule.*` across tools + CLI.
5. Help text no longer presents `cron.*` / `wake` as canonical runtime call methods.
