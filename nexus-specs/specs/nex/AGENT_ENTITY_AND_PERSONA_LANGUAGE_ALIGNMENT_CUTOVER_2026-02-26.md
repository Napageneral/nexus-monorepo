# Agent Entity And Persona Language Alignment Cutover (2026-02-26)

**Status:** Execution Spec (Hard Cutover)
**Scope:** Runtime semantics, IAM policy routing semantics, receiver promotion semantics
**Related:**
- `ENTITY_SYMMETRIC_ROUTING_AND_PERSONA_BINDING.md`
- `iam/IDENTITY_RESOLUTION.md`
- `NEXUS_REQUEST.md`

---

## 1. Customer Experience Target

### 1.1 Routing identity

Routing must be identity-first and stable:

1. Sender resolves to a canonical sender entity.
2. Receiver resolves to a canonical receiver entity.
3. Session key routes on sender+receiver entities.

No persona choice should change that routing identity.

### 1.2 Persona identity

Persona is presentation/behavior identity only:

1. Persona defines SOUL/IDENTITY/system-prompt profile.
2. Persona selection can vary by receiver default or sender override.
3. Persona changes do not redefine who the receiver is.

### 1.3 Language contract

When runtime surfaces say `agent_id`, that value represents the routed receiver identity (receiver entity identity), not the persona selector.

`persona_ref` is the persona selector.

---

## 2. Problem Statement (Current Drift)

Current codebase has mixed language:

1. Some policy/runtime paths still treat session persona as both runtime executor id and persona selector.
2. Routing surfaces expose `agent_id`, but in parts of code it is populated from persona values.
3. This creates ambiguity when discussing receiver identity vs persona selection.

This spec removes that ambiguity.

---

## 3. Locked Decisions

1. Receiver identity remains canonical as `receiver.entity_id`.
2. `access.routing.agent_id` is a routed receiver identity alias and MUST match canonical receiver entity when present.
3. `persona_ref` is the only persona selector used for profile/prompt behavior.
4. IAM session policy schema uses `persona_ref` (not `persona`).
5. Policy evaluation must never copy persona into `routing.agent_id`.
6. Receiver promotion (`entity` -> `agent`) remains required for `runAgent`, but promoted `receiver.agent_id` reflects receiver identity, while `receiver.persona_ref` reflects persona selector.

---

## 4. Runtime Contract After Cutover

## 4.1 Access routing fields

`access.routing` semantics:

- `agent_id`: receiver entity identity alias for routed target.
- `persona_ref`: persona selector.
- `session_label`: canonical session key.

## 4.2 Receiver promotion

For `receiver.type = "entity"` with resolved persona binding or trusted persona override:

- promote to `receiver.type = "agent"`
- preserve `receiver.entity_id`
- set `receiver.agent_id = receiver.entity_id`
- set `receiver.persona_ref = resolved persona_ref`

## 4.3 Policy session schema

Policy `session` block uses:

```yaml
session:
  persona_ref: main
  key: "dm:{sender.id}:{receiver.entity_id}"
```

No `session.persona` field.

---

## 5. Data/Bootstrap Alignment

`persona_bindings` may retain `agent_id` column for now, but seeded/default values must align to receiver identity semantics.

For default bootstrap binding:

- `receiver_entity_id = entity-assistant`
- `agent_id = entity-assistant`
- `persona_ref = main` (or deployment persona)

---

## 6. Acceptance Criteria

1. No IAM policy parser acceptance of `session.persona`.
2. No policy evaluation path mapping persona into `routing.agent_id`.
3. `resolveAccess` sets routing `agent_id` from receiver entity identity when receiver resolves.
4. Promoted receiver has `agent_id == entity_id` and persona in `persona_ref`.
5. Existing runtime agent execution still functions with persona binding resolution.

---

## 7. Non-Goals

1. Full DB column rename of `sessions.persona_id` in this cutover.
2. Removal of `agent_id` field name from all APIs in this cutover.
3. Continuity transfer policy changes in this cutover.

---

## 8. Naming-Hardening Followup (This Pass)

### 8.1 Customer impact

This pass is readability and operator-safety hardening:

1. Engineers should never confuse persona selection with routed receiver identity.
2. Debug logs, local variables, and helper type names should communicate intent directly.
3. No runtime behavior/routing semantics change in this pass.

### 8.2 Scope

1. Rename local variables/types where values are used as `persona_ref` but currently named `agentId`.
2. Focus on control-plane ingress/method modules that feed `routing_override.persona_ref`.
3. Include reply automation request builder when followup run identifiers are consumed as persona selectors.
4. Keep external request/response contract names unchanged unless already covered by prior cutover decisions.

### 8.3 Constraints

1. Hard cutover semantics remain: receiver identity is `entity_id`; persona is `persona_ref`.
2. No fallback paths or compatibility aliases are added.
3. No unrelated refactors.

### 8.4 Validation

1. `pnpm exec tsc --noEmit` passes.
2. Focused tests pass for touched control-plane paths.
