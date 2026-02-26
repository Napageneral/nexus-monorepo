# Canonical Session Routing Control-Plane Cutover (2026-02-26)

**Status:** Execution Spec (Hard Cutover)  
**Scope:** Control-plane ingress and runtime agent-dispatch session derivation  
**Related:**
- `AGENT_ENTITY_AND_PERSONA_LANGUAGE_ALIGNMENT_CUTOVER_2026-02-26.md`
- `ENTITY_SYMMETRIC_ROUTING_AND_PERSONA_BINDING.md`
- `RUNTIME_ROUTING.md`

---

## 1. Customer Experience Target

### 1.1 Session routing must be identity-first

For normal ingress and runtime dispatch:

1. Session routing defaults to canonical identity-derived keys.
2. Persona selection must not implicitly rewrite session identity.
3. Session continuity for “route back to same worker” uses explicit session labels only.

### 1.2 No hidden `agent:*` key synthesis in control-plane ingress

OpenAI/OpenResponses and runtime agent dispatch must not silently synthesize `agent:{persona}:...` labels as default routing.

---

## 2. Problem Statement (Current Drift)

Control-plane paths still construct legacy `agent:*` labels and inject them as `routing_override.session_label`, which bypasses canonical derivation:

1. OpenAI/OpenResponses ingress derives `sessionKey` from persona (`http-utils.ts`, `openai-http.ts`, `openresponses-http.ts`).
2. Runtime agent dispatch defaults missing `sessionKey` to `resolveExplicitAgentSessionKey(...)` and injects fallback labels in `_internal.event.ingest.agent`.
3. Cron bridge uses `buildAgentMainSessionKey(...)` for dispatch labels.

This keeps legacy key shape alive in the exact ingress path where identity-based canonical routing should be authoritative.

---

## 3. Locked Decisions

1. Canonical routing remains sourced from `buildSessionKey(...)` in access stage.
2. In control-plane ingress, persona selection is conveyed only via `routing_override.persona_ref`.
3. `routing_override.session_label` is only set when caller explicitly targets a session (or bridge-specific deterministic system key where required).
4. No compatibility aliasing back to synthesized `agent:*` defaults.

---

## 4. Implementation Scope

### 4.1 OpenAI/OpenResponses ingress

1. Remove default `session_label` generation from persona/user fields.
2. Keep persona selection (`persona_ref`) behavior.
3. Continue ingress integrity logging for ignored caller identity/routing hints.

### 4.2 `_internal.event.ingest.agent` runtime method

1. Remove implicit fallback to `resolveExplicitAgentSessionKey(...)` when `sessionKey` is absent.
2. If caller supplies `sessionKey`, pass it through as explicit target.
3. If caller supplies persona selector without `sessionKey`, apply persona selector only (no synthetic session label).
4. Replace legacy session-key/persona consistency checks that parse `agent:*` labels with ledger-backed checks when a session record exists.

### 4.3 Cron bridge

1. Remove `buildAgentMainSessionKey(...)` usage in control-plane cron path.
2. Keep deterministic, non-legacy system labels for cron-internal continuity where needed.

---

## 5. Non-Goals (This Pass)

1. Full repository removal of all `agent:*` helper utilities in CLI/tools/TUI.
2. DB schema rename (`sessions.persona_id`) or protocol-wide `agentId` field rename.
3. Continuity transfer policy expansion (`persona_rebind`, `key_cutover`) beyond existing entity-merge flow.

---

## 6. Acceptance Criteria

1. OpenAI/OpenResponses ingress no longer synthesizes default `agent:*` session labels.
2. `_internal.event.ingest.agent` no longer synthesizes default main session labels when `sessionKey` is omitted.
3. Control-plane runtime paths preserve explicit session targeting semantics.
4. Typecheck and targeted control-plane tests pass.

---

## 7. Validation Plan

1. `pnpm exec tsc --noEmit`
2. Targeted tests:
   - `src/nex/control-plane/openai-http.e2e.test.ts`
   - `src/nex/control-plane/openresponses-http.e2e.test.ts`
   - `src/nex/control-plane/ingress.webchat-session.e2e.test.ts`
   - `src/nex/control-plane/server-methods/agent.test.ts`
   - `src/nex/control-plane/server-methods.pipeline-dispatch.test.ts`
   - `src/nex/control-plane/server-methods.scope-authz.test.ts`

---

## 8. Implementation Update (2026-02-26, Session-Key Inference Removal Slice)

Implemented in runtime control-plane:

1. `sessions-patch` no longer infers agent/persona identity from `agent:*` label parsing.
   - Session patch model-default resolution now uses stored session metadata (`entry.agentId`) and config defaults.
2. `agent.identity.get` no longer resolves agent identity from session-label string parsing.
   - When `sessionKey` is provided, persona identity is resolved from ledger session record (`persona_id`) if present.
   - If caller also provides `agentId`, mismatch checks compare against ledger-resolved session persona.
3. WS runtime event log summarization no longer splits `sessionKey` via `agent:*` parsing.
   - Logs now keep canonical session labels as-is.

Validation executed:

1. `pnpm vitest run src/nex/control-plane/sessions-patch.test.ts src/nex/control-plane/ws-log.test.ts src/nex/control-plane/server-methods/agent.test.ts` (pass)
2. `pnpm tsc --noEmit` (known unrelated pre-existing failure remains in `src/nex/control-plane/server-methods/adapter-connections.ts` null/undefined typing)

---

## 9. Implementation Update (2026-02-26, Canonical Group Parsing + Thread-Suffix Removal Slice)

Implemented:

1. Removed thread/topic parent-session derivation helper from `sessions/session-key-utils.ts`.
2. `reply/model-selection` now only accepts explicit `parentSessionKey`; no implicit derivation from `:thread:` / `:topic:` session suffixes.
3. Group tool-policy session parsing in `agents/pi-tools.policy.ts` is now canonical-only:
   - accepts only `group:{platform}:{container_id}:{receiver_entity_id}`.
   - no legacy `agent:{id}:{platform}:group:{id}` parsing.
   - no session-label thread/topic suffix stripping.
4. `resolveAnnounceTargetFromKey` is now canonical-only:
   - accepts only canonical `group:*` labels.
   - no legacy `agent:*` parsing.
   - no `:thread:` / `:topic:` suffix extraction from session labels.
5. Restart sentinel wake path now passes session labels directly to canonical announce-target resolution and no longer extracts thread/topic from session-key suffixes.

Validation executed:

1. `pnpm vitest run src/agents/pi-tools-agent-config.test.ts src/agents/tools/sessions-announce-target.test.ts src/reply/reply/model-selection.inherit-parent.test.ts` (pass)
2. `pnpm tsc --noEmit` (same unrelated pre-existing failure in `src/nex/control-plane/server-methods/adapter-connections.ts` null/undefined typing)

---

## 10. Implementation Update (2026-02-26, Canonical Cron/Runtime Session Parsing Slice)

Implemented:

1. `agents/tools/cron-tool.ts` delivery inference now reads canonical session labels only.
   - Supported inference:
     - `group:{platform}:{container_id}:{receiver_entity_id}`
     - `email:{platform}:{container_id}:{receiver_entity_id}`
   - No inference from canonical `dm:*` keys (insufficient addressing information in key).
   - Removed legacy parsing of `agent:*` and `:thread:` suffixes.
2. `agents/tools/runtime-tool.ts` restart sentinel flow no longer parses `:thread:` from session labels.
   - Restart delivery context lookup uses the provided canonical session label directly.
   - Sentinel payload no longer derives `threadId` from session-label suffixes.
3. Updated unit tests to canonical labels and canonical inference expectations.

Validation executed:

1. `pnpm vitest run src/agents/tools/cron-tool.test.ts src/agents/nexus-runtime-tool.test.ts` (pass)
2. `pnpm tsc --noEmit` (same unrelated pre-existing failure in `src/nex/control-plane/server-methods/adapter-connections.ts` null/undefined typing)

---

## 11. Implementation Update (2026-02-26, Ledger Session Meta Persona Resolution Slice)

Implemented:

1. `sessions/ledger-session-meta.ts` no longer derives persona identity from legacy `agent:*` session-label parsing.
2. Persona selection in ledger session metadata writes now resolves from:
   - explicit `agentId` input when provided,
   - otherwise configured default agent id,
   - while preserving existing ledger `persona_id` when the session already exists.

Validation executed:

1. `pnpm vitest run src/reply/inbound.test.ts src/channels/session-ledger.guardrail.test.ts src/reply/reply/agent-runner.memory-flush.runreplyagent-memory-flush.runs-memory-flush-turn-updates-session-metadata.test.ts` (pass)
2. `pnpm tsc --noEmit` (same unrelated pre-existing failure in `src/nex/control-plane/server-methods/adapter-connections.ts` null/undefined typing)

---

## 12. Implementation Update (2026-02-26, Session Reset Type Inference Hard-Cut Slice)

Implemented:

1. Removed reset-type inference from session-label string markers in `config/sessions/reset.ts`.
   - No parsing of `:group:`, `:thread:`, or `:topic:` from session keys.
   - Thread reset classification now requires explicit thread context (`messageThreadId`, `threadLabel`, `threadStarterBody`, `parentSessionKey`).
   - Group reset classification now requires explicit `isGroup` input.
2. Updated `commands/agent/session.ts` to provide explicit group context when resolving reset policy:
   - `isGroup: sessionEntry?.chatType === "group"`.

Validation executed:

1. `pnpm vitest run src/config/sessions/reset.test.ts src/reply/inbound.test.ts src/reply/reply/session.test.ts` (pass)
2. `pnpm tsc --noEmit` (same unrelated pre-existing failure in `src/nex/control-plane/server-methods/adapter-connections.ts` null/undefined typing)

---

## 13. Implementation Update (2026-02-26, Session Reference Key Classification Slice)

Implemented:

1. Updated `agents/tools/sessions-helpers.ts` session-key detection to treat canonical labels as first-class session keys:
   - `dm:*`, `group:*`, `email:*`, `worker:*`, `system:*`.
2. Preserved non-canonical operational key-shapes used by existing sessions tooling flows:
   - `<platform>:group:*`, `<platform>:direct:*`, `<platform>:dm:*`.
3. Updated `sessions_send` ping-pong test fixtures to canonical group key labels for requester/target sessions.

Validation executed:

1. `pnpm vitest run src/agents/nexus-tools.sessions.test.ts src/agents/tools/sessions-list-tool.gating.test.ts src/agents/tools/sessions-send-tool.gating.test.ts` (pass)
2. `pnpm tsc --noEmit` (same unrelated pre-existing failure in `src/nex/control-plane/server-methods/adapter-connections.ts` null/undefined typing)

---

## 14. Implementation Update (2026-02-26, Session Tool Ownership Gating via Metadata Slice)

Implemented:

1. Runtime session rows now expose explicit owning receiver entity on `sessions.list` payloads:
   - Added optional `agentId` to control-plane runtime session row shape.
   - Ledger-backed `sessions.list` now maps `sessions.persona_id` into `agentId`.
2. Added canonical ownership helpers in `agents/tools/sessions-helpers.ts`:
   - `parseCanonicalSessionOwnerAgentId(...)`
   - `resolveSessionOwnerAgentId(...)`
   - `lookupSessionOwnerAgentIdByKey(...)`
   These resolve owner identity from row metadata first, then canonical key shape.
3. Replaced legacy `resolveAgentIdFromSessionKey(...)` gating in session tools:
   - `sessions_list`: cross-agent filtering now compares requester/entry owners via owner resolution helpers.
   - `sessions_history`: cross-agent checks now use resolved owner identity and fail closed when requester owner is unknown but target owner is known.
   - `sessions_send`: cross-agent checks now use resolved owner identity and fail closed when requester owner cannot be resolved for target-owner checks.
   - `session_status`: requester/target ownership checks now use owner metadata/canonical owner parsing, and bare-key resolve scoping no longer depends on `agent:*` prefix parsing.
4. Updated test fixtures to canonical labels and explicit owner metadata where required.

Validation executed:

1. `pnpm vitest run src/agents/tools/sessions-list-tool.gating.test.ts src/agents/tools/sessions-send-tool.gating.test.ts src/agents/nexus-tools.session-status.test.ts src/agents/nexus-tools.sessions.test.ts` (pass)
2. `pnpm tsc --noEmit` (same unrelated pre-existing failure in `src/nex/control-plane/server-methods/adapter-connections.ts` null/undefined typing)

---

## 15. Implementation Update (2026-02-26, Canonical Owner Resolution in Shared Session-Key Utilities Slice)

Implemented:

1. Extended `resolveAgentIdFromSessionKey(...)` in `routing/session-key.ts` to resolve owner identity from canonical keys:
   - `dm:{sender}:{receiver}` -> `receiver`
   - `group:{platform}:{container}:{receiver}` -> `receiver`
   - `email:{platform}:{container}:{receiver}` -> `receiver`
   - `worker:{id}` -> `id`
   - legacy `agent:*` continues to resolve from parsed agent prefix.
2. Updated agent scope resolution to use explicit-owner session-key detection:
   - `resolveSessionAgentIds(...)` now treats only explicit owner-bearing session keys (`agent:*`, `dm:*`, `group:*`, `email:*`, `worker:*`) as owner-bearing.
   - non-owner keys (`main`, `global`, arbitrary aliases) continue to fall back to configured default agent, preserving prior behavior.
3. Replaced direct `parseAgentSessionKey(...)` requester parsing in:
   - `agents/tools/agents-list-tool.ts`
   - `agents/tools/sessions-spawn-tool.ts`
   with shared `resolveAgentIdFromSessionKey(...)`, so canonical session keys now resolve requester ownership uniformly.
4. Added/updated routing tests for canonical owner extraction.

Validation executed:

1. `pnpm vitest run src/routing/session-key.test.ts src/agents/agent-scope.test.ts src/agents/pi-embedded-runner.resolvesessionagentids.test.ts src/agents/nexus-tools.agents.test.ts src/agents/tools/sessions-list-tool.gating.test.ts src/agents/tools/sessions-send-tool.gating.test.ts src/agents/nexus-tools.session-status.test.ts src/agents/nexus-tools.sessions.test.ts` (pass)
2. `pnpm tsc --noEmit` (same unrelated pre-existing failure in `src/nex/control-plane/server-methods/adapter-connections.ts` null/undefined typing)

---

## 16. Implementation Update (2026-02-26, Canonical Memory/Workspace Session Semantics Slice)

Implemented:

1. Fixed canonical group detection in memory citations auto-mode:
   - `agents/tools/memory-tool.ts` now treats `group:{platform}:{container}:{receiver}` as group chat when deciding citations behavior.
2. Fixed canonical session scope parsing in QMD manager:
   - `memory/qmd-manager.ts` now derives platform/chatType from canonical keys:
     - `group:{platform}:...` and `email:{platform}:...` provider extraction.
     - `group:*` chat-type classification as group.
3. Fixed workspace fallback owner resolution for canonical sessions:
   - `agents/workspace-run.ts` now treats canonical owner-bearing session keys (`dm/group/email/worker`) as session-owned and resolves fallback agent/workspace from the receiver owner.
   - non-owner keys (`main`, `global`, custom aliases) continue to fall back to configured default agent.
4. Improved exec tool owner resolution for canonical sessions:
   - `agents/bash-tools.exec.ts` now derives `agentId` from canonical owner-bearing session keys instead of only legacy `agent:*` keys.
5. Improved sandbox explain provider inference for canonical group/email keys:
   - `commands/sandbox-explain.ts` now infers provider from canonical labels when ledger routing metadata is unavailable.

Validation executed:

1. `pnpm vitest run src/agents/tools/memory-tool.citations.test.ts src/memory/qmd-manager.test.ts src/agents/workspace-run.test.ts src/agents/bash-tools.exec.path.test.ts` (pass)
2. `pnpm tsc --noEmit` (same unrelated pre-existing failure in `src/nex/control-plane/server-methods/adapter-connections.ts` null/undefined typing)

---

## 17. Implementation Update (2026-02-26, Canonical Group-Detection Hardening Slice)

Implemented:

1. Canonical group detection hardened in send-policy routing:
   - `sessions/send-policy.ts` now derives platform/chatType from canonical keys:
     - `group:{platform}:{container}:{receiver}` treated as group with platform `{platform}`.
   - Canonical direct detection added for send-policy chatType matching:
     - `dm:*` and `email:*` now derive `chatType=direct`.
2. Canonical group detection hardened in status rendering:
   - `reply/status.ts` now treats `sessionKey` starting with `group:` as group sessions for activation/status display logic.
3. Canonical group detection hardened in session-tool helper classification:
   - `agents/tools/sessions-helpers.ts` now classifies `group:*` as `kind=group` and derives platform from canonical group prefix.
4. Canonical group detection hardened in config session-group resolver:
   - `config/sessions/group.ts` now recognizes `From` values starting with `group:` as group-like and can recover provider/id hints from canonical shape.
5. Canonical group detection hardened in config session-key resolver:
   - `config/sessions/session-key.ts` now recognizes `group:*` as group buckets when deciding direct/main collapse behavior.

Validation executed:

1. `pnpm vitest run src/sessions/send-policy.test.ts src/reply/status.test.ts src/agents/nexus-tools.sessions.test.ts src/agents/tools/memory-tool.citations.test.ts src/memory/qmd-manager.test.ts src/agents/workspace-run.test.ts` (pass)
2. `pnpm tsc --noEmit` (currently blocked by unrelated pre-existing control-plane typing error in `src/nex/control-plane/server-methods/adapter-connections.ts` at line 1212)
