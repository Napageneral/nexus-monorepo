# Session Routing Unification

**Status:** DESIGN
**Last Updated:** 2026-03-03

---

## Overview

Session routing determines which agent session a request gets routed to. The target is a single unified system where:

1. **The pipeline computes a canonical session key** from resolved principals and delivery context
2. **Policies can override** with an explicit session key template
3. **Automations can override** on top of that
4. **One field on NexusRequest** is the source of truth

Today there are three separate systems that don't agree with each other. This spec defines the unified target state.

---

## Current State: Three Conflicting Systems

### System A: `buildSessionKey()` (Canonical Format)

**File:** `src/nex/session.ts`

Produces deterministic session keys from sender, delivery, and receiver context. Five canonical formats:

| Format | When |
|--------|------|
| `dm:{senderEntity}:{receiverEntity}` | Direct messages (default) |
| `group:{platform}:{container_id}:{receiverEntity}` | Group containers |
| `email:{platform}:{container_id}:{receiverEntity}` | Email (gmail, email platforms) |
| `system:{purpose}` | System/webhook senders, or missing entity IDs |
| `worker:{entity_id}` | Agent-type senders |

Takes legacy IAM types (`SenderContext`, `DeliveryContext`, `ReceiverContext`) as input. Does not have access to `NexusRequest` types.

### System B: Policy Session Templates

**File:** `src/iam/policies.ts`

Each policy can define `session: { persona_ref, key }` where `key` is a template string expanded with sender/delivery variables.

**Available template variables:**
- `{sender.name}`, `{sender.id}`, `{sender.relationship}`
- `{platform}`, `{container_kind}`, `{container_id}`, `{account_id}`, `{space_id}`

**Bootstrap policy templates today:**

| Policy | Template | Produces |
|--------|----------|----------|
| owner-full-access | `dm:{sender.id}` | `dm:entity-abc` |
| operator-full-access | `dm:{sender.id}` | `dm:entity-abc` |
| system-memory-retain | `system:memory-retain:{platform}` | `system:memory-retain:discord` |
| system-default | `system:{platform}` | `system:discord` |
| member-safe-access | `dm:{sender.id}` | `dm:entity-abc` |
| customer-sandbox | `dm:{sender.id}` | `dm:entity-abc` |

**Critical mismatch:** The DM template `dm:{sender.id}` produces `dm:entity-abc` but `buildSessionKey()` produces `dm:entity-abc:entity-xyz` — fundamentally different formats. The template is missing the receiver.

**Default fallback** (no template on policy): `{platform}:{container_id}`

### System C: Ad-hoc Fallbacks

Scattered across the codebase:

| Location | Format |
|----------|--------|
| `resolvePrincipals` stage | `{platform}:{container_id}:{sender.id}` |
| hooks-runtime `toSessionKey()` | `{platform}:{container_id}` |
| resolveAccess askRequestBuilder | `""` (empty string) |

### The Discard Problem

`resolveAccessStage` calls policy evaluation which produces the full `IAMAccessContext` including `routing.session_label`, `routing.persona_ref`, and `routing.queue_mode`. Then at line 123 it builds a stripped-down `AccessContext` that **explicitly throws away the routing**:

```
AccessContext = { decision, matched_policy, permissions }
// routing is discarded
```

The control plane works around this by calling `buildSessionKey()` independently and injecting the result via an `accessMutator` callback that overrides `routing.session_label` while preserving `persona_ref`.

---

## Target State: Pipeline Computes, Policy Overrides

### Design Principle

Session key derivation follows the same "pipeline computes defaults, policy can override" pattern as other routing concerns. The canonical `buildSessionKey()` format is the default. If a policy specifies an explicit `session.key` template, it wins.

### New Field: `request.session_routing`

A new top-level field on `NexusRequest`, separate from both `access` and `agent`:

```typescript
export interface SessionRouting {
  session_key: string;        // the resolved session key
  persona_ref?: string;       // from matched policy (or automation override)
  queue_mode?: QueueMode;     // from matched policy (or automation override)
  source: 'canonical' | 'policy' | 'automation' | 'explicit';
}
```

**Why separate from `access`?** Session routing is not an access control concern — it's a session identity concern that happens to be informed by access policies.

**Why separate from `agent`?** `request.agent` is agent execution config (model, provider, role). Session routing is determined before agent execution begins.

The `source` field tracks how the session key was derived:
- `canonical` — computed by `buildSessionKey()`
- `policy` — overridden by an explicit policy `session.key` template
- `automation` — overridden by `automations.agent_overrides.session_key`
- `explicit` — set by an external caller via `routing_override.session_label`

### Resolution Order

The pipeline resolves the session key through these stages, each able to override the previous:

```
1. Explicit override (routing_override.session_label from caller)
   ↓ if not set
2. Policy template (matched policy has session.key)
   ↓ if not set
3. Canonical computation (buildSessionKey() from resolved principals)
```

After all three are evaluated:

```
4. Automation override (automations.agent_overrides.session_key)
   ↓ can override any of the above
```

### Where It Happens in the Pipeline

```
acceptRequest
  → routing_override.session_label captured if present

resolvePrincipals
  → sender entity, receiver entity resolved
  → buildSessionKey() can now be called (needs both entities)

resolveAccess
  → policy evaluation produces session template result
  → reconcile: explicit > policy template > canonical
  → write to request.session_routing

executeOperation (automations)
  → automation hooks can override via agent_overrides.session_key
  → updates request.session_routing.session_key, sets source='automation'
```

### Fixing the Template Mismatch

The bootstrap policy DM templates need to be updated to match the canonical format:

| Current | Target |
|---------|--------|
| `dm:{sender.id}` | removed — use canonical default |
| `system:{platform}` | keep — this IS the canonical format |
| `system:memory-retain:{platform}` | keep — intentional override |

For DM routing, the canonical `buildSessionKey()` already does the right thing (`dm:{sender}:{receiver}`). Bootstrap policies for owner/operator/member/customer don't need explicit session templates — the canonical default is correct. Only policies that intentionally diverge from the canonical format (like `system-memory-retain`) need templates.

This means most policies will have `session: { persona_ref: "main" }` without a `key` field. The `persona_ref` is preserved; the session key comes from canonical computation.

### `buildSessionKey()` Evolution

The function needs a new-type-aware variant that accepts `NexusRequest` fields directly instead of legacy IAM types:

```typescript
// New signature (works with pipeline types)
export function buildSessionKey(input: {
  sender: Entity;
  receiver?: Entity;
  routing: Routing;
}): string;

// Legacy signature (backward compat during migration)
export function buildSessionKey(input: {
  sender: SenderContext;
  delivery: DeliveryContext;
  receiver?: ReceiverContext;
}): string;
```

The canonical formats remain the same — just the input types change.

### `request.agent.session_key` Becomes Derived

Today `request.agent.session_key` is set ad-hoc in multiple places. In the target state:

1. `request.session_routing.session_key` is the source of truth
2. `request.agent.session_key` is derived from it (set once, when agent context is finalized)
3. No code writes to `request.agent.session_key` directly except through `request.session_routing`

This is a gradual migration — keep `request.agent.session_key` working during transition, add `request.session_routing` as the new canonical source, migrate consumers one at a time.

---

## Session Key Parsing

Several subsystems parse session keys to extract entity IDs, agent IDs, or routing information:

- `resolveAgentIdFromSessionKey()` in `src/routing/session-key.ts`
- `parseAgentSessionKey()` in `src/sessions/session-key-utils.ts`
- Agent workspace resolution in `src/agents/workspace-run.ts`
- Agent scope resolution in `src/agents/agent-scope.ts`

These all depend on the canonical format being stable. The unification doesn't change the formats — it just ensures there's one place that produces them.

---

## Naming Standardization

The codebase uses four different names for the same concept:

| Current | Standardized |
|---------|-------------|
| `session_key` | `session_key` |
| `session_label` | `session_key` |
| `sessionKey` | `sessionKey` (camelCase in TS) |
| `sessionLabel` | `sessionKey` (camelCase in TS) |

Target: `session_key` in schemas/SQL, `sessionKey` in TypeScript. The `session_label` / `sessionLabel` variants are eliminated.

---

## Policy Session Schema (Updated)

```typescript
const PolicySessionSchema = z.object({
  persona_ref: z.string(),
  key: z.string().optional(),  // explicit template override; omit to use canonical
});
```

When `key` is omitted, the canonical `buildSessionKey()` result is used. When `key` is present, the template is expanded and used instead.

This is a behavioral change from today where the default fallback is `{platform}:{container_id}`. In the target state, the default fallback is the full canonical key from `buildSessionKey()`.
