# Control-Plane Authorization Taxonomy (Action/Resource)

**Status:** SPEC LOCKED (runtime cutover pending)  
**Last Updated:** 2026-02-24  
**Related:** `../SURFACE_ADAPTER_V2.md`, `SINGLE_TENANT_MULTI_USER.md`, `CONTROL_PLANE.md`, `../../iam/ACCESS_CONTROL_SYSTEM.md`, `../../iam/POLICIES.md`, `../../iam/AUDIT.md`

---

## Summary

Control-plane authorization uses one canonical operation taxonomy:

1. `protocol`
2. `control`
3. `event`

This is the hard-cutover replacement for the previous `transport | iam | pipeline` naming.

---

## Canonical Model

Every control-plane WS/HTTP method maps to:

1. `kind`
   - `protocol`: handshake/pairing/plumbing only
   - `control`: synchronous runtime management operation
   - `event`: normalize to `NexusEvent` and execute event pipeline
2. `action`
   - `read | write | admin | approve | pair`
3. `resource`
   - stable resource identifier (`config`, `sessions.history`, `pairing.devices.tokens`, `acl.requests`)
4. `permission`
   - stable IAM permission for `control`/`event`: `control.<resource>.<action>`

Rules:

1. `protocol` methods are AuthN-bound transport mechanics and must not trigger agent work.
2. `control` methods are AuthN + principal + IAM AuthZ + audit, then direct handler execution.
3. `event` methods are AuthN + principal + IAM AuthZ + audit, then `NexusEvent -> nex.processEvent(...)`.

Examples:

- `config.get` -> `kind=control`, `permission=control.config.read`
- `config.patch` -> `kind=control`, `permission=control.config.admin`
- `chat.send` -> `kind=event`, pipeline authority
- `connect.auth.challenge` -> `kind=protocol`

---

## Source Of Truth

Runtime taxonomy source remains:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/authz-taxonomy.ts`
- Coverage test:
  - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/authz-taxonomy.test.ts`

Until runtime cutover is complete, code may still contain the old enum names. This spec defines the target and blocks any new usage of legacy names.

---

## Enforcement Contract

Dispatcher behavior (normative):

1. `kind=control`
   - authorize IAM before handler execution
2. `kind=event`
   - authorize IAM, then normalize and dispatch to `nex.processEvent(...)`
3. `kind=protocol`
   - transport-role checks only; no business-state control/event execution

Centralized authorizer remains:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/iam-authorize.ts`
- Tests:
  - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/iam-authorize.test.ts`

---

## Audit Logging

All `control` and `event` decisions must write to `acl_access_log` with:

- `operation_kind` (`"control-plane"` or `"event-ingress"`)
- `operation` (method name)
- `operation_resource`
- `operation_action`
- `operation_permission`

Schema and inserts live in:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/iam/audit.ts`

---

## Notes

1. This taxonomy is for single-tenant, multi-user IAM: permissions vary by principal.
2. Uniform IAM does not require turning synchronous control CRUD into chat events.
3. Legacy taxonomy names are non-canonical and must be removed in runtime implementation.
