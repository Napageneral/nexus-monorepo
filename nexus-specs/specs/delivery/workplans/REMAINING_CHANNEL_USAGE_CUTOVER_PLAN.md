# Remaining `channel` Usage Cutover Plan

**Status:** IMPLEMENTED
**Last Updated:** 2026-02-24
**Owner:** Runtime/Core
**Related:**
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/delivery/UNIFIED_DELIVERY_TAXONOMY.md`
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/delivery/PLATFORM_CHANNEL_TERMINOLOGY_CUTOVER.md`

---

## 1) Customer Experience Goal

Developers and operators must be able to infer semantics from names without mental translation.

- `platform` means transport/provider identity (discord, slack, imessage, etc).
- `channel` is only valid when it means container kind/value (`container_kind = "channel"`) or vendor/domain nouns.

Any remaining `channel` field that really means provider/platform creates routing and review confusion.

---

## 2) Scope

This plan covers remaining high-impact runtime usages identified in:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/routing/bindings.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/commands/agents.bindings.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/commands/agents.providers.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/tools/sessions-send-helpers.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/tools/sessions-announce-target.ts`

Plus required dependents for correctness:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/config/types.agents.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/config/zod-schema.agents.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/config/legacy.migrations.part-1.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/tools/sessions-send-tool.a2a.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/media-understanding/scope.ts`

---

## 3) What Is Valid vs Invalid

### Valid (keep)

1. `chatType: "channel"` and `container_kind = "channel"`.
2. Session-key markers like `:channel:` when they represent container kind.
3. Target-kind strings like `channel:<id>`.
4. `channels.*` config namespace and plugin folder naming (`src/platforms/*`).

### Invalid (rename)

1. `binding.match.channel` when it means provider/platform.
2. `AnnounceTarget.channel` when it means provider/platform.
3. User/runtime text saying "channel" while referring to platform id.
4. Runtime send calls passing `channel` where protocol expects `platform`.

---

## 4) Current Findings (from code)

## 4.1 Routing/Binding layer

- `AgentBinding.match.channel` is currently the provider match key.
- All routing helper logic in `bindings.ts` treats this as a provider id, not container kind.
- CLI helpers in `agents.bindings.ts` and status summaries in `agents.providers.ts` use the same field as provider identity.

Conclusion: this is pure naming drift and should be `match.platform`.

## 4.2 Announce target layer

- `sessions-send-helpers.ts` defines `AnnounceTarget.channel` but stores provider id.
- `sessions-announce-target.ts` reads `deliveryContext.platform` and writes it into `channel`.
- `sessions-send-tool.a2a.ts` forwards `announceTarget.channel` into `callRuntime({ method: "send", params: { ... }})` as `channel`.

Conclusion: this is provider/platform data flowing under a legacy field name.

## 4.3 Taxonomy kind usage

- In session key parsing, `kind === "group" || kind === "channel"` is container-kind logic and is correct.

---

## 5) Hard Cutover Changes (No Compatibility)

## 5.1 Binding model cutover

### Schema/types

- Change `AgentBinding.match.channel` -> `AgentBinding.match.platform`.
- Update zod schema to require `match.platform`.
- Remove/replace legacy migration that writes `provider -> match.channel`.

### Runtime/CLI

- Update routing/binding helpers to read/write `match.platform` only.
- Rename helper internals to `platform` naming (vars, params, labels).
- Update agent binding CLI parse/apply/display to use `platform` wording.

## 5.2 Announce target cutover

- Change `AnnounceTarget.channel` -> `AnnounceTarget.platform`.
- Update `resolveAnnounceTargetFromKey` and `resolveAnnounceTarget` return shapes.
- Update A2A send path to call runtime send with `platform` param.
- Keep container-kind parsing (`group|channel`) unchanged.

## 5.3 Prompt/context text cutover

- In A2A helper prompt text, replace provider references from "channel" to "platform".
- Keep "channel" where it refers to container kind.

---

## 6) Sequence

1. Binding schema/type cutover (`match.platform`) + dependent code updates.
2. Announce target shape cutover (`platform`) + A2A send call update.
3. Clean wording updates in helper context strings.
4. Remove temporary migration aliases for renamed fields.

---

## 7) Validation Gates

## 7.1 Unit tests

- Update/add tests for:
  - `sessions-announce-target.test.ts` expected shape `{ platform, to, accountId? }`.
  - Binding parse/describe/apply behavior using `match.platform`.
  - Routing helpers selecting bound accounts by platform.

## 7.2 Static checks

Run and confirm zero hits for platform-alias fields in this scope:

```bash
rg --line-number "match\.channel|AnnounceTarget\s*=\s*\{[\s\S]*channel|announceTarget\.channel" \
  /Users/tyler/nexus/home/projects/nexus/nex/src/routing \
  /Users/tyler/nexus/home/projects/nexus/nex/src/commands \
  /Users/tyler/nexus/home/projects/nexus/nex/src/agents/tools
```

Confirm valid taxonomy channel usages remain:

```bash
rg --line-number "container_kind\s*=\s*\"channel\"|:channel:|kind\s*!==\s*\"group\"\s*&&\s*kind\s*!==\s*\"channel\"" \
  /Users/tyler/nexus/home/projects/nexus/nex/src
```

## 7.3 Runtime sanity

- Run A2A announce flow and verify runtime `send` receives `platform` and succeeds.
- Run bindings-driven health/status flows and verify bound account resolution still works.

---

## 8) Non-Goals for This Slice

1. Renaming global `channels.*` config namespace.
2. Renaming plugin registry/module folder names under `src/platforms/*`.
3. Reworking container-kind taxonomy (`channel` as a valid kind remains intentional).

---

## 9) Acceptance Criteria

1. In this scope, provider/platform identity is represented by `platform` names only.
2. `channel` remains only for valid container-kind/domain usage.
3. No compatibility alias behavior is introduced for renamed fields.
4. All touched tests pass.

---

## 10) Implementation Record (2026-02-24)

### Completed

1. Binding schema/model cutover completed: `binding.match.channel` -> `binding.match.platform`.
2. Announce target cutover completed: `AnnounceTarget.channel` -> `AnnounceTarget.platform`.
3. A2A/runtime send path updated to pass `platform`.
4. Legacy migration alias for `bindings.match.provider -> bindings.match.channel` removed.
5. Dependent scope matcher naming cutover completed (`media-understanding` path: `match.platform`).
6. Dependent announce-format tests updated from `params.channel` assertions to `params.platform`.

### Validation Evidence

1. Static grep gate:
   - `rg "match\\.channel|announceTarget\\.channel"` over `src/routing src/commands src/agents/tools` returns no matches.
2. Lint gate:
   - `pnpm -s exec oxlint` over touched files: 0 warnings, 0 errors.
3. Focused test gate A:
   - `pnpm -s vitest run --config /tmp/nex-vitest-channel-cutover.config.ts`
   - Result: 6 files passed, 53 tests passed.
4. Focused test gate B:
   - `pnpm -s vitest run --config /tmp/nex-vitest-channel-cutover-more.config.ts`
   - Result: 5 files passed, 25 tests passed.
5. Workspace-wide `tsc --noEmit` currently fails on unrelated baseline issues outside this cutover scope; no failures were reported in the touched cutover files.
