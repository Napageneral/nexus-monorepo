# Control-Plane Authorization Taxonomy (Action/Resource)

**Status:** SPEC LOCKED (legacy WS-method mapping; aligned to unified runtime operation model)
**Last Updated:** 2026-02-24  
**Related:** `../UNIFIED_RUNTIME_OPERATION_MODEL.md`, `SINGLE_TENANT_MULTI_USER.md`, `CONTROL_PLANE.md`, `../../iam/ACCESS_CONTROL_SYSTEM.md`, `../../iam/POLICIES.md`, `../../iam/AUDIT.md`

---

## Summary

Control-plane authorization maps WS/RPC methods to canonical runtime operations and IAM permissions.
This document preserves the legacy WS-method taxonomy mapping while the unified operation registry cutover lands.

---

## Canonical Model

Every control-plane WS/HTTP method maps to:

1. `kind` (legacy dispatcher grouping)
   - `protocol`: handshake/pairing/plumbing only
   - `control`: synchronous runtime management operation
   - `event`: maps to runtime `event.ingest` operation and executes event path
2. `action`
   - `read | write | admin | approve | pair`
3. `resource`
   - stable resource identifier (`config`, `sessions.history`, `pairing.devices.tokens`, `acl.requests`)
4. `permission`
   - stable IAM permission for `control`/`event`: `control.<resource>.<action>`

Rules:

1. `protocol` methods are AuthN-bound transport mechanics and must not trigger agent work.
2. `control` methods are AuthN + principal + IAM AuthZ + audit, then direct handler execution.
3. `event` methods are AuthN + principal + IAM AuthZ + audit, then dispatch runtime `event.ingest`.

Examples:

- `config.get` -> `kind=control`, `permission=control.config.read`
- `config.patch` -> `kind=control`, `permission=control.config.admin`
- `chat.send` -> `kind=event`, maps to runtime `event.ingest`
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
3. Unified target is the operation registry in `../UNIFIED_RUNTIME_OPERATION_MODEL.md`; this doc remains as an implementation bridge for WS method classification.
