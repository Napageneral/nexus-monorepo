# Ingress Integrity

**Status:** CANONICAL
**Last Updated:** 2026-03-06
**Related:** [../COMMUNICATION_MODEL.md](../COMMUNICATION_MODEL.md), [../NEXUS_REQUEST_TARGET.md](../NEXUS_REQUEST_TARGET.md), [../../iam/ACCESS_CONTROL_SYSTEM.md](../../iam/ACCESS_CONTROL_SYSTEM.md), [../../iam/POLICIES.md](../../iam/POLICIES.md), [../ADAPTER_INTERFACE_UNIFICATION.md](../ADAPTER_INTERFACE_UNIFICATION.md)

---

## Overview

Ingress integrity defines which parts of an external inbound request are authoritative, which parts are validated platform facts, and which parts are untrusted caller claims.

This spec covers external record ingress only:

- adapter-originated `record.ingest`
- public HTTP or runtime-api ingress that becomes `record.ingest`
- any other external surface that persists a canonical `record`

This spec does **not** cover internal runtime notifications such as:

- `record.ingested`
- broker hook points
- worker lifecycle events
- cron and job runtime events

Those are internal `events`, not external ingress.

The goal is simple:

- callers cannot spoof principal identity
- callers cannot spoof privileged platforms or channels
- callers cannot spoof the communication boundary IAM should evaluate
- the runtime always evaluates ACL against daemon-stamped request context, not raw caller intent

---

## Customer and Operator Experience

From the user side:

- a message, email, webhook, or other external record arrives
- Nexus attributes it to the correct source surface and identities
- policies are evaluated against the real sender, real receiver, and real channel

From the operator side:

- adapters provide platform facts, but they do not get to redefine privileged runtime identity
- public ingress cannot claim to be a different user, platform, account, or system source
- any integrity violation is rejected or stripped and auditable

---

## Canonical Ingress Shape

External ingress is normalized into the canonical `NexusRequest` bus shape described in [../NEXUS_REQUEST_TARGET.md](../NEXUS_REQUEST_TARGET.md).

The important pieces are:

- `request.operation = "record.ingest"`
- `request.routing`
- `request.payload` as `RecordPayload`
- `request.principals` after `resolvePrincipals`
- `request.access` after `resolveAccess`

The canonical external payload is:

```typescript
type RecordPayload = {
  external_record_id: string;
  content: string;
  content_type: "text" | "reaction" | "membership";
  attachments?: Attachment[];
  recipients?: RoutingParticipant[];
  timestamp: number;
  metadata?: Record<string, unknown>;
};
```

The canonical routing shape is:

```typescript
type Routing = {
  adapter: string;
  platform: string;
  sender: RoutingParticipant;
  receiver: RoutingParticipant;
  space_id?: string;
  container_kind?: "direct" | "group";
  container_id?: string;
  thread_id?: string;
  reply_to_id?: string;
  metadata?: Record<string, unknown>;
};
```

Critical rule:

- `thread_id` and `reply_to_id` are record metadata only
- they are not trusted as conversation splitters
- conversation boundaries are derived later by `resolvePrincipals`

---

## Trust Classes

### 1. Daemon-Stamped Request Fields

These fields are always owned by the daemon/runtime boundary:

- `request_id`
- `operation`
- `routing.adapter`
- `routing.platform`
- transport metadata
- any internal source or connection identifiers the runtime attaches

If caller input disagrees with daemon-stamped values, daemon-stamped values win.

### 2. Credential-Derived Identity

For token-backed ingress such as webchat, API keys, or authenticated operator surfaces:

- principal identity is derived from the verified credential
- caller-supplied identity hints are ignored for authority
- caller hints may be recorded as metadata for debugging, but they do not affect principal resolution

Examples of untrusted caller hints:

- `user`
- `sender_id`
- persona hints
- session hints
- conversation routing hints

### 3. Adapter-Provided Platform Facts

Platform adapters may provide the external facts the daemon cannot directly infer:

- `external_record_id`
- platform timestamp
- content and attachments
- raw sender platform id
- raw receiver platform id
- `space_id`
- `container_id`
- `container_kind`
- `thread_id`
- `reply_to_id`

These are treated as trusted platform facts **only after validation**.

The daemon validates:

- shape
- platform/adapter consistency
- account or connection ownership
- impossible combinations
- reserved namespace violations

### 4. Client-Provided Claims

For direct public ingress, everything identity-sensitive or routing-sensitive in the request body is untrusted by default.

Examples:

- claimed sender identity
- claimed platform
- claimed receiver identity
- claimed privileged container
- claimed session or conversation target

The runtime either ignores these values, replaces them with stamped values, or rejects the request.

---

## Reserved Namespaces and Platforms

Some namespaces are daemon-only:

- metadata keys under `_daemon.*`
- reserved internal platform families such as `system/*`, `runtime/*`, and `runtime-api/*`

Rules:

1. external callers and external adapters may not claim reserved internal platforms
2. callers may not write `_daemon.*` metadata
3. if such a claim appears, the daemon strips or rejects it and records an integrity violation

---

## Multi-Account and Multi-Connection Boundaries

Adapters may represent multiple configured accounts or connections, but they may only emit records for identities the runtime has explicitly bound to that adapter instance.

Rules:

1. the runtime knows which accounts or connections each adapter instance is allowed to represent
2. inbound records outside that bound set are rejected
3. if the adapter supplies account-like metadata, the daemon verifies it against the bound instance
4. a caller cannot move a record across accounts or connections by changing payload fields

This prevents cross-account spoofing while preserving normal multi-account adapters.

---

## Timestamp and Record Identity Rules

### `external_record_id`

`external_record_id` is the strongest stable external identifier the source can provide.

Rules:

1. adapters should provide the native stable identifier when one exists
2. if no native stable identifier exists, the adapter must synthesize a deterministic fallback
3. callers do not choose the canonical `record_id`
4. canonical dedupe happens on the persisted record layer, not on raw caller envelopes

### Timestamps

Two timestamps may matter:

- source timestamp from the external platform
- daemon receive timestamp

Rules:

1. the runtime records daemon receive time for every external ingress
2. source timestamps may be preserved for traceability
3. policy evaluation should use daemon-controlled receive time unless a spec explicitly says otherwise
4. public callers do not get to authoritatively backdate requests

---

## Enforcement Points

Integrity is enforced in layers:

### Adapter Boundary

When ingest arrives from an adapter process:

- verify adapter identity
- verify bound platform
- verify bound account/connection scope
- strip or reject reserved metadata

### Public HTTP / Runtime API Boundary

When ingest arrives from an authenticated public surface:

- derive identity from the verified credential
- ignore caller-authored identity or routing overrides
- stamp canonical transport and routing metadata

### `acceptRequest`

At the pipeline boundary:

- validate the request shape
- ensure reserved namespaces are not caller-authored
- ensure required record and routing fields exist
- normalize any accepted source facts into canonical bus shape

### `resolvePrincipals`

After raw ingest:

- resolve sender and receiver entities from canonical routing
- derive the conversation boundary from resolved principals plus channel shape
- never trust caller-provided session or conversation targets as authoritative

---

## Audit Requirements

Ingress integrity violations must be observable.

At minimum the runtime must audit:

- reserved platform claim attempts
- reserved metadata writes
- mismatched adapter/account or adapter/platform claims
- ignored client identity overrides
- impossible channel shape combinations

The audit record should preserve:

- when it happened
- which surface or adapter it came from
- what was claimed
- what the daemon accepted instead
- whether the request was rejected or normalized

---

## Minimum Validation

1. Public HTTP ingress cannot change the resolved principal by supplying identity hints.
2. External adapters cannot emit reserved internal platforms.
3. `_daemon.*` metadata cannot be caller-authored.
4. A multi-account adapter cannot emit records for accounts outside its bound set.
5. Spoofed `thread_id` or `container_id` values cannot bypass conversation derivation rules.
6. `record.ingest` always enters the pipeline in canonical request shape before ACL evaluation.

---

## Naming Locks

- external inbound object: `record`
- canonical live ingress operation: `record.ingest`
- persisted canonical identifier: `record_id`
- external dedupe identifier: `external_record_id`
- internal downstream notification: `record.ingested`

Non-canonical here:

- external `event` as the persisted ingress noun
- `event.event_id` as the primary external identifier shape
- caller-owned session or conversation routing overrides for ordinary ingress
