# Internal Ingress Receiver Binding And Persona Override Cutover

**Status:** Execution Spec (Hard Cutover)  
**Last Updated:** 2026-02-24  
**Canonical Parents:**
- `ENTITY_SYMMETRIC_ROUTING_AND_PERSONA_BINDING.md`
- `iam/IDENTITY_RESOLUTION.md`
- `SINGLE_TENANT_MULTI_USER.md`

---

## 1. Customer Experience Target

1. Control-plane chat, webchat, OpenAI, OpenResponses, hooks, and node ingress all execute through the same NEX pipeline and produce real agent runs (not silent no-op responses).
2. Ingress remains fail-closed for unknown receiver ownership; no implicit default-agent fallback is reintroduced.
3. Trusted operator flows can still intentionally target a specific agent/persona (for example via control-plane/OpenAI headers where allowed by ingress integrity rules).
4. Anonymous/customer ingress remains constrained by IAM policy envelope; trusted operator override behavior is not granted to customer ingress tokens.

---

## 2. Current Runtime Gap (Research)

Observed behavior in current code:

1. `resolveReceiver` hard-requires `(platform, account_id)` account receiver binding and fails closed when missing.
2. `resolveAccess` requires persona binding for `receiver.type="entity"`; without binding it denies and runAgent does not execute.
3. Runtime bootstrap seeds owner + contacts, but does not seed account receiver bindings or default persona bindings for internal ingress platforms.
4. Explicit trusted ingress routing overrides (`_nex_ingress.routing_override.agent_id/persona_ref`) are currently overwritten by persona binding selection.

Impact:

- Ingress/control e2e suites show request acceptance but no primary agent execution (`agentCommand` never called) and fallback text (`No response from Nexus.`).

---

## 3. Locked Decisions

1. **No compatibility fallback in `resolveReceiver`.** Keep fail-closed behavior.
2. **Bootstrap deterministic internal account receiver bindings** for internal ingress platform/account pairs used by runtime dispatch.
3. **Bootstrap default persona binding** for the canonical internal receiver entity.
4. **Trusted explicit routing override precedence:**
   - For trusted senders (owner/system/control-plane trusted path), explicit ingress routing identity (`agent_id/persona_ref`) may supersede default persona binding.
   - For untrusted ingress/customer tokens, existing integrity rules remain (caller hints ignored where configured).
5. **Receiver must still become `type="agent"` before `runAgent` stage.**

---

## 4. Canonical Bootstrap Seed Contract

### 4.1 Receiver entity

Seed a canonical internal receiver entity:

- `entity_id = "entity-assistant"`
- `type = "agent"`
- `source = "bootstrap"`
- `is_user = 0`

### 4.2 Internal account receiver bindings

Seed `(platform, account_id) -> receiver_entity_id` for internal ingress platforms with `account_id="default"`:

- `control-plane`
- `webchat`
- `openai`
- `openresponses`
- `hooks`
- `node`
- `runtime`
- `cron`

All bind to `receiver_entity_id="entity-assistant"`.

### 4.3 Default persona binding

Seed a default persona binding for `entity-assistant`:

- `sender_entity_id = NULL` (receiver default)
- `agent_id = "main"`
- `persona_ref = "atlas"`
- deterministic binding id (stable, non-random) for idempotent bootstrap

---

## 5. Runtime Resolution Rules After Cutover

1. `resolveReceiver` remains account-binding authoritative.
2. `resolveAccess` resolves persona in this order:
   - trusted explicit routing identity override (if present and authorized)
   - sender-specific persona binding
   - receiver default persona binding
3. If none of the above yields an agent/persona for `receiver.type="entity"`, deny.
4. If trusted explicit routing identity is used, receiver is promoted to `type="agent"` from routed `(agent_id, persona_ref)` so `runAgent` can execute.

---

## 6. Implementation Plan

1. Update bootstrap identity seeding to include:
   - internal receiver entity
   - internal account receiver bindings
   - default persona binding
2. Keep bootstrap idempotent:
   - do not destroy/replace non-bootstrap manual bindings.
3. Update `resolveAccess` precedence logic so trusted explicit ingress routing identity is not clobbered by default persona binding.
4. Ensure receiver promotion to `type="agent"` occurs for trusted explicit routing identity paths.
5. Update e2e expectations where canonical DM key shape changed (`dm:{sender_entity_id}:{receiver_entity_id}`).

---

## 7. Validation Matrix

### Targeted e2e (must pass)

1. `openai-http.e2e.test.ts`
2. `openresponses-http.e2e.test.ts`
3. `server.chat.runtime-server-chat.e2e.test.ts`
4. `server.agent.runtime-server-agent-a.e2e.test.ts`
5. `server.agent.runtime-server-agent-b.e2e.test.ts`
6. `ingress.bootstrap-policy.e2e.test.ts`
7. `ingress.webchat-session.e2e.test.ts`

### Focus assertions

1. Primary `agentCommand` call exists for accepted runs.
2. No `system:missing_account_receiver_binding` canonical session labels in accepted ingress flows.
3. Control-plane/OpenAI trusted override paths still route to requested `agent_id` where allowed.
4. Unknown/default-deny policy remains denied.

---

## 8. Non-Goals

1. Do not weaken ingress integrity or allow caller-controlled identity spoofing.
2. Do not add backward-compatibility bypasses in receiver resolution.
3. Do not broaden customer ingress privileges in this cutover.
