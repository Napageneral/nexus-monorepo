# ACL Grants + Exec Approvals Hard Cutover (2026-02-26)

**Status:** ACTIVE  
**Mode:** Hard cutover (no backwards compatibility)  
**Related:**  
- `../ingress/CONTROL_PLANE.md`  
- `../../iam/TOOL_APPROVALS.md`  
- `../../iam/GRANTS.md`  
- `../../iam/POLICY_ARCHITECTURE_UNIFICATION.md`

---

## 1) Customer Experience Goal (First)

Nex should expose one obvious approval model:

1. Every sensitive tool action (including `exec`) uses the same ACL/IAM request and grant flow.
2. Approve once / deny / allow always behaviors are consistent across runtime, node, CLI, and chat command surfaces.
3. No hidden secondary approval state causes surprises; operators can inspect the whole approval/grant state in canonical ACL surfaces.
4. Runtime behavior is predictable across host modes (`sandbox`, `runtime`, `node`) with the same decision semantics.

---

## 2) Research Baseline (2026-02-26)

Current implementation snapshot:

1. Canonical ACL request + grant RPC is active:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-methods/acl-requests.ts`
   - `acl.approval.request`, `acl.requests.list/show/approve/deny`
2. Canonical grants + permission request persistence is active in identity ledger:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/iam/grants.ts`
   - Tables: `grants`, `permission_requests`
3. Runtime exec now requests ACL approvals and can consume grant resources:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/bash-tools.exec.ts`
4. Remaining legacy residue still exists in production code paths:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/infra/exec-approvals.ts`
   - file state: `~/nexus/state/exec-approvals.json` and `~/nexus/state/exec-approvals.sock`
   - node host still imports `resolveExecApprovals` from this module:
     `/Users/tyler/nexus/home/projects/nexus/nex/src/node-host/runner.ts`
   - ACL CLI still includes `grants import-exec-approvals` legacy bridge:
     `/Users/tyler/nexus/home/projects/nexus/nex/src/cli/acl-cli.ts`
5. Approval request construction is duplicated between runtime tool and node CLI entrypoint:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/bash-tools.exec.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/cli/nodes-cli/register.invoke.ts`
6. Config residue exists for exec-approval forwarding that is not part of canonical IAM path:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/config/types.approvals.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/config/zod-schema.approvals.ts`

---

## 3) Locked Decisions

1. IAM ACL (`permission_requests` + `grants`) is the only approval authority.
2. `exec-approvals.json` is removed from production authorization paths.
3. No legacy `exec.approval.*` RPC, no file-allowlist fallback, no compatibility aliases.
4. Standing approvals are represented only as grants (`resources`), including `exec:*` resources.
5. Request/approve/deny surfaces remain canonical:
   - runtime RPC: `acl.approval.request`, `acl.requests.*`
   - CLI: `nexus acl requests ...`, `nexus acl grants ...`
   - chat command bridge: `/approve` -> `acl.requests.approve|deny`
6. If local socket auth is needed for macOS app exec host bridging, it must be isolated from approval policy state (separate host-channel state).

---

## 4) Implementation Plan

## Phase 1: Remove approval-policy dependency on legacy exec approvals file

1. Remove runtime/node authorization dependence on `resolveExecApprovals` file-backed policy.
2. Keep only explicit config (`tools.exec.*`) + IAM grants + ACL requests as decision inputs.
3. Decouple any remaining socket/token transport metadata from approval policy state.

## Phase 2: Consolidate approval request construction

1. Introduce a shared helper for building `acl.approval.request` payloads for `exec`.
2. Use the shared helper in:
   - `bash-tools.exec` runtime path
   - `nodes-cli/register.invoke` node-run path
3. Ensure requester/summary/context/resource derivation is consistent across both paths.

## Phase 3: Remove dead legacy surfaces

1. Remove legacy ACL CLI import command for `exec-approvals.json`.
2. Remove config schema/types for non-canonical `approvals.exec` forwarding residue.
3. Remove or replace stale docs/tests that still describe file-based approvals as active behavior.

## Phase 4: Validation + hardening

1. Validate approval lifecycle e2e:
   - create request
   - approve once
   - approve forever (grant creation)
   - deny
2. Validate grant short-circuit:
   - existing matching `exec:*` grant suppresses prompt
3. Validate node host + runtime parity:
   - same decisions, same request fields, same denial behavior.

---

## 5) Execution TODO Checklist

- [x] Replace production imports of `infra/exec-approvals.ts` policy/file APIs.
- [x] Remove `exec-approvals.json` as production approval state source.
- [x] Isolate/replace socket auth state used for mac app exec host bridge.
- [x] Add shared helper for `acl.approval.request` payload construction.
- [x] Cut duplicate node CLI/runtime approval request logic to shared helper.
- [x] Remove `acl grants import-exec-approvals` command and related code.
- [x] Remove non-canonical `approvals.exec` config types/schemas if unused.
- [x] Update tests and docs to reflect IAM-only approval model.
- [x] Run focused unit + e2e suites for ACL requests/grants/exec/node paths.
- [x] Re-run full unit + e2e matrix and log any out-of-scope failures.

### Implementation Snapshot (2026-02-26)

Completed in this pass:

1. Added shared approval request builder used by runtime exec + node CLI:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/infra/exec-approval-request.ts`
2. Updated runtime exec approval callsites to use shared payload construction:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/bash-tools.exec.ts`
3. Updated node CLI approval flow to use shared payload construction:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/cli/nodes-cli/register.invoke.ts`
4. Removed legacy CLI grant import surface for `exec-approvals.json`:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/cli/acl-cli.ts`
5. Removed non-canonical `approvals.exec` config surface:
   - deleted `/Users/tyler/nexus/home/projects/nexus/nex/src/config/types.approvals.ts`
   - deleted `/Users/tyler/nexus/home/projects/nexus/nex/src/config/zod-schema.approvals.ts`
   - updated config roots in `types.nexus.ts`, `types.ts`, `zod-schema.ts`
6. Decoupled node-host socket auth lookup from approval-policy resolver:
   - added `/Users/tyler/nexus/home/projects/nexus/nex/src/infra/exec-host-auth.ts`
   - updated `/Users/tyler/nexus/home/projects/nexus/nex/src/node-host/runner.ts`
7. Hard-cutover renamed exec-host transport auth state to dedicated paths:
   - `~/nexus/state/exec-host-auth.json`
   - `~/nexus/state/exec-host.sock`
   - updated `/Users/tyler/nexus/home/projects/nexus/nex/src/infra/exec-host-auth.ts`
8. Updated macOS companion bridge to use dedicated exec-host auth state and canonical ACL approval methods/events:
   - updated `/Users/tyler/nexus/home/projects/nexus/nex/apps/macos/Sources/Nexus/ExecApprovalsSocket.swift`
   - updated `/Users/tyler/nexus/home/projects/nexus/nex/apps/macos/Sources/Nexus/ExecApprovalsRuntimePrompter.swift`
   - updated `/Users/tyler/nexus/home/projects/nexus/nex/apps/macos/Sources/Nexus/RuntimeConnection.swift`
9. Updated high-signal docs to IAM-native approval model:
   - `/Users/tyler/nexus/home/projects/nexus/nex/docs/tools/exec.md`
   - `/Users/tyler/nexus/home/projects/nexus/nex/docs/nodes/index.md`
   - `/Users/tyler/nexus/home/projects/nexus/nex/docs/runtime/protocol.md`
   - `/Users/tyler/nexus/home/projects/nexus/nex/docs/cli/nodes.md`
10. Full matrix validation completed:
   - unit: `708 files`, `4294 tests` passed
   - e2e: `66 files`, `268 tests` passed (`13 skipped`), no failures
11. macOS companion build validation completed:
   - `swift build` succeeded in `/Users/tyler/nexus/home/projects/nexus/nex/apps/macos`

---

## 6) Validation Plan

Target command matrix:

1. `pnpm -s vitest run --config vitest.unit.config.ts src/iam/grants.test.ts src/iam/authorize.test.ts`
2. `pnpm -s vitest run --config vitest.e2e.config.ts src/nex/control-plane/server.acl-requests.e2e.test.ts`
3. `pnpm -s vitest run --config vitest.unit.config.ts src/agents/bash-tools.exec.approval-id.test.ts src/cli/nodes-cli.coverage.test.ts`
4. `pnpm -s vitest run --config vitest.e2e.config.ts src/nex/control-plane/server.nodes.late-invoke.test.ts`
5. `pnpm -s vitest run --config vitest.unit.config.ts`
6. `pnpm -s vitest run --config vitest.e2e.config.ts`

---

## 7) Acceptance Criteria

1. No production approval decision depends on `~/nexus/state/exec-approvals.json`.
2. Runtime and node exec approvals both use canonical ACL request/grant lifecycle.
3. `allow-always` creates grants; subsequent matching exec calls do not re-prompt.
4. No active CLI/runtime contract references legacy exec approval file import/set surfaces.
5. Unit + e2e coverage for ACL request/grant + exec approval paths passes at or above current baseline.

---

## 8) Non-Goals

1. Full node surface redesign.
2. Full exec sandbox redesign or resource/time limiter introduction.
3. New multi-tenant trust model or marketplace-style permission system.
