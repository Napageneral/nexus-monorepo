# Runtime Tool Isolation + Sandbox Lifecycle Hard Cutover (2026-02-27)

**Status:** ACTIVE  
**Mode:** Hard cutover (no backwards compatibility)  
**Related:**  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/UNIFIED_RUNTIME_OPERATION_MODEL.md`  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/RUNTIME_SURFACES.md`  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/ingress/CONTROL_PLANE.md`  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/iam/POLICY_ARCHITECTURE_UNIFICATION.md`

---

## 1) Customer Experience Goal (First)

Nex should expose one clear runtime-isolation model for tools:

1. File and media tools run inside a declared tool root for each run.
2. There is no separate Docker/container "sandbox world" in core Nex.
3. Operators can reason about one isolation contract: "tool root boundary + IAM/ACL approvals."
4. Exec host behavior is explicit and predictable (`runtime` or `node`), with no implicit fallback to container semantics.
5. Runtime + CLI language reflects this model directly and does not mention legacy sandbox lifecycle controls.

---

## 2) Research Baseline (2026-02-27)

### 2.1 Container sandbox subsystem still exists as a large legacy cluster

Current code footprint in `nex`:

1. `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/sandbox/*.ts`  
   - 16 production files
   - 1887 LOC
2. `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/sandbox.ts`  
   - 44 LOC
3. Production entry points still call this lifecycle:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/pi-embedded-runner/run/attempt.ts` (`resolveSandboxContext(...)`)
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/pi-embedded-runner/compact.ts` (`resolveSandboxContext(...)`)
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/reply/reply/stage-sandbox-media.ts` (`ensureSandboxWorkspaceForSession(...)`)

### 2.2 Tool-root path guarding is real and actively used

Active runtime paths:

1. Tool root assignment:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/stages/runAgent.ts`
     - worker/manager default `toolSandboxRoot`
     - ingress override via `tool_sandbox_root`
2. File tool guards:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/pi-tools.read.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/apply-patch.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/tools/image-tool.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/pi-embedded-runner/run/images.ts`
3. Media path guards:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/reply/reply/stage-sandbox-media.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/infra/outbound/message-action-runner.ts`
4. Guard implementation:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/sandbox-paths.ts`

### 2.3 CLI/doctor/docs still expose container sandbox lifecycle UX

1. CLI:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/cli/sandbox-cli.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/commands/sandbox.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/commands/sandbox-explain.ts`
2. Doctor coupling:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/commands/doctor-sandbox.ts`
3. Reply/help references:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/reply/reply/bash-command.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/reply/reply/reply-elevated.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/reply/reply/directive-handling.shared.ts`

### 2.4 Memory attachment sandbox staging path is already removed

1. `stageEpisodeAttachmentsForSandbox(...)` is no longer present in current source.
2. Memory writer contract now explicitly forbids path rewriting/staging:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/automations/meeseeks/memory-retain-episode.ts`

### 2.5 Critical exec semantics drift exists today

1. Exec defaults host to `"sandbox"`:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/bash-tools.exec.ts`
2. In non-container runs, that label can still reach host process execution path.
3. This creates an ambiguous security/UX model and must be hard-cut removed.

---

## 3) Locked Decisions

1. Remove Docker/container sandbox lifecycle from core Nex.
2. Keep tool-root path isolation as the canonical runtime boundary for file/media tools.
3. Remove the "sandbox lifecycle" operator surface (`nexus sandbox ...`, container recreate/list/explain UX).
4. Keep hard cutover: no compatibility aliases for removed sandbox CLI/method semantics.
5. Exec host contract hard-cut:
   - supported hosts: `runtime | node`
   - remove `sandbox` host value
   - default host becomes `runtime`
6. Ingress tool-root override remains allowed but bounded:
   - accepted key is canonicalized to one contract
   - value must resolve inside allowed runtime workspace root policy (no arbitrary expansion).
7. `agents.*.sandbox` container config surface is removed from canonical runtime behavior.
8. IAM/ACL remains the only authorization/approval authority; this change is isolation-model simplification, not approval-model replacement.

---

## 4) Target Runtime Model

### 4.1 Canonical concept: Tool Isolation Root

Each run resolves one tool isolation root (`toolRoot`) used for:

1. `read/write/edit/apply_patch` path bounds
2. local image path loading
3. outbound media local-path normalization
4. inbound media local staging rewrite boundaries

### 4.2 Canonical resolution order

1. explicit per-run override (validated and policy-bounded)
2. automation workspace root for worker runs
3. manager scratchpad workspace root for manager runs
4. fallback to resolved workspace dir

### 4.3 Canonical exec host model

1. `runtime` = local runtime process host execution (IAM/ACL enforced)
2. `node` = remote device host execution (IAM/ACL enforced)
3. no `sandbox` host

---

## 5) Implementation Plan

## Phase 1: Introduce canonical tool-isolation module and naming

1. Create canonical module namespace in `nex` core:
   - `src/agents/tool-isolation/*` (or equivalent final canonical path)
2. Move/rename path guard primitives out of `sandbox-*` naming:
   - current source: `src/agents/sandbox-paths.ts`
3. Replace internal symbol names:
   - `toolSandboxRoot` -> canonical `toolRoot` (runtime internal contract)
   - ingress metadata key contract aligned to canonical naming
4. Ensure all path/media guard callsites consume the canonical module.

## Phase 2: Remove container lifecycle runtime code

1. Remove container/browser lifecycle modules and exports:
   - `src/agents/sandbox/*` container lifecycle paths (`docker`, `browser`, `prune`, `manage`, `registry`, `workspace`, etc.)
   - `src/agents/sandbox.ts` legacy facade
2. Replace `resolveSandboxContext(...)` usage in embedded run paths with canonical tool-isolation context resolution.
3. Replace `ensureSandboxWorkspaceForSession(...)` usage in reply media staging with canonical tool-root workspace behavior.
4. Remove container runtime status/tool-policy plumbing tied to sandbox lifecycle mode.

## Phase 3: Remove sandbox operator/CLI/doc surfaces

1. Remove sandbox CLI command registration and handlers:
   - `src/cli/sandbox-cli.ts`
   - `src/commands/sandbox.ts`
   - `src/commands/sandbox-explain.ts`
   - related display/formatter helpers
2. Remove doctor sandbox integration:
   - `src/commands/doctor-sandbox.ts`
3. Remove sandbox references in reply/operator messaging that instructs `nexus sandbox explain`.

## Phase 4: Exec contract hard cutover

1. Remove `sandbox` from exec host schema/config/types:
   - `src/config/types.tools.ts`
   - `src/config/zod-schema.agent-runtime.ts`
   - any related config docs/help text
2. Set default exec host to `runtime`.
3. Remove any branch logic that assumes container-host exec behavior from `bash-tools.exec.ts`.
4. Ensure error/help copy references only canonical hosts (`runtime|node`).

## Phase 5: Config/schema cleanup

1. Remove deprecated `agents.defaults.sandbox` and per-agent sandbox blocks from active schema/types.
2. Remove/replace legacy config migrations that only exist for sandbox lifecycle compatibility.
3. Keep only canonical tool-isolation config required for tool-root bounds.

## Phase 6: Validation and regression hardening

1. Unit tests for:
   - tool-root resolution order
   - path guard enforcement (including symlink rejection)
   - ingress override policy bounds
   - exec host parsing/rejection for removed `sandbox`
2. E2E tests for:
   - worker/manager runs using canonical tool root
   - file/media guard behavior
   - reply flow with media paths under tool root
3. Full unit + e2e matrix sweep and failure classification.

---

## 6) Execution TODO Checklist

- [ ] Add canonical tool-isolation module and migrate path/media guard utilities to it.
- [ ] Rename runtime/internal option contract from `toolSandboxRoot` to canonical tool-root naming.
- [ ] Replace ingress metadata `tool_sandbox_root` contract with canonical tool-root contract.
- [ ] Remove `src/agents/sandbox.ts` facade and container lifecycle modules under `src/agents/sandbox/*`.
- [ ] Remove embedded runner dependencies on `resolveSandboxContext(...)`.
- [ ] Replace reply media staging dependency on `ensureSandboxWorkspaceForSession(...)`.
- [ ] Remove sandbox CLI commands and helpers (`sandbox-cli`, `commands/sandbox*`).
- [ ] Remove doctor sandbox command integration and related image build references.
- [ ] Remove sandbox explain references from reply/elevated/help command text.
- [ ] Cut exec host `sandbox` from schema/types/parsing/default behavior.
- [ ] Default exec host to `runtime`; keep `node` as explicit alternate host.
- [ ] Remove `agents.*.sandbox` config schema/types and related migration residue.
- [ ] Update docs/help text to canonical tool-isolation terminology.
- [ ] Add/adjust unit tests for tool-root resolution + guard invariants.
- [ ] Add/adjust e2e tests for worker/manager/reply flows under canonical tool-root model.
- [ ] Run full unit suite.
- [ ] Run full e2e suite.
- [ ] Log out-of-scope failures separately; fix all in-scope regressions before merge.

---

## 7) Acceptance Criteria

1. No production runtime path uses Docker/container sandbox lifecycle modules.
2. `nexus sandbox ...` command surface is absent.
3. File/media tools are bounded by canonical tool-root path guards across runtime/reply/command flows.
4. Exec host contract only allows `runtime|node`; `sandbox` is rejected.
5. Default exec host is explicit and aligned with actual runtime execution path.
6. No runtime/operator help text references legacy sandbox explain/recreate flows.
7. Full unit + e2e matrix passes at or above current baseline (excluding documented out-of-scope failures).

---

## 8) Non-Goals

1. Introducing resource/time limiter systems beyond current exec controls.
2. Re-architecting IAM/ACL approval semantics in this cutover.
3. Node ecosystem redesign beyond exec host contract cleanup already covered here.
4. Reintroducing any containerized sandbox runtime compatibility mode.

---

## 9) Risks and Mitigations

1. Risk: accidental widening of tool path access during rename/cutover.
   - Mitigation: lock path-guard tests first; keep strict invariant tests for escape + symlink.
2. Risk: ingress override can escape intended workspace.
   - Mitigation: enforce explicit bounded-root validation in ingress-to-run option mapping.
3. Risk: exec host behavior regressions after removing `sandbox` host label.
   - Mitigation: targeted exec host unit/e2e coverage for parsing/default/authorization branches.
4. Risk: stale operator docs and command hints cause confusion.
   - Mitigation: remove all sandbox-specific CLI references in runtime/reply/help/docs in same cutover.
