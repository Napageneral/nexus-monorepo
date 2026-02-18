# Control-Plane Authorization Taxonomy (Action/Resource)

**Status:** IMPLEMENTED (taxonomy + enforcement wiring)  
**Last Updated:** 2026-02-18  
**Related:** `SINGLE_TENANT_MULTI_USER.md`, `CONTROL_PLANE.md`, `../iam/ACCESS_CONTROL_SYSTEM.md`, `../iam/POLICIES.md`, `../iam/AUDIT.md`

---

## Summary

We standardize control-plane authorization using a canonical **action/resource taxonomy** derived from the runtime WS method surface.

This enables Option A from `SINGLE_TENANT_MULTI_USER.md`:

- Control-plane operations are **IAM-authorized + audited** directly (not as `NexusEvent`s).
- Agent work remains **pipeline-authorized** (anything that runs an agent enters `NexusEvent -> nex.processEvent(...)`).

---

## Canonical Model

Every control-plane WS method maps to:

- `path`: how the method is authorized
  - `transport`: handshake / node-only / plumbing (no IAM authorization; still authenticated)
  - `iam`: control-plane operation authorized by IAM (Option A)
  - `pipeline`: method emits a `NexusEvent` and pipeline IAM is the authority
- `action`: coarse verb
  - `read | write | admin | approve | pair`
- `resource`: stable canonical resource identifier
  - examples: `config`, `sessions.history`, `pairing.devices.tokens`, `acl.requests`
- `permission`: stable IAM tool-like permission name derived from `(resource, action)`
  - `control.<resource>.<action>`

This lets control-plane authorization reuse the existing IAM policy/grant engine by treating `permission` as a tool name in `permissions.tools.allow/deny`.

Examples:

- `config.get` → `control.config.read`
- `config.patch` → `control.config.admin`
- `sessions.preview` → `control.sessions.history.read`
- `acl.requests.approve` → `control.acl.requests.approve`
- `device.token.rotate` → `control.pairing.devices.tokens.pair`

---

## Source Of Truth (Implementation)

The taxonomy is implemented in the `nex` codebase and should be treated as canonical:

- Code: `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/authz-taxonomy.ts`
- Coverage test (ensures every registered WS handler has a taxonomy entry):
  - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/authz-taxonomy.test.ts`

The taxonomy is intentionally centralized so we do **not** scatter per-handler authz logic across the codebase.

---

## Enforcement (Implemented)

Enforcement is implemented in the control-plane dispatcher so `path=iam` methods are authorized via IAM before the handler runs:

1. Control-plane dispatcher integration:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-methods.ts`
2. IAM authorizer (centralized, taxonomy-driven):
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/iam-authorize.ts`
   - Unit tests:
     - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/iam-authorize.test.ts`

Rules:

- `path=iam`: evaluate IAM for the authenticated principal and require `permission` to be allowed
- `path=pipeline`: allow the call to proceed (the downstream `NexusEvent` will be authorized in pipeline)
- `path=transport`: authorize via the existing transport handshake/role rules

IAM is evaluated using the same policies + grants engine as event ingress by treating `permission` as a tool name (e.g. `control.sessions.read`) in `permissions.tools.allow/deny`.

### Audit Logging

Control-plane IAM decisions are written to `acl_access_log` with explicit operation metadata columns:

- `operation_kind` (set to `"control-plane"`)
- `operation` (WS method name)
- `operation_resource`
- `operation_action`
- `operation_permission`

Implementation:

- Schema + migration + insert wiring:
  - `/Users/tyler/nexus/home/projects/nexus/nex/src/iam/audit.ts`

---

## Notes

- This taxonomy is designed for **single-tenant, multi-user**: different operator principals can be granted different control-plane permissions using IAM policies/grants.
- “Uniform IAM everywhere” does **not** require turning control-plane reads/writes into `NexusEvent`s; it requires that the same IAM engine is used for authorization + audit.
