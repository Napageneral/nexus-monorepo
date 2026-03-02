# ResolveAccess UX + Policy Clarification Hard Cutover (2026-02-27)

**Status:** ARCHIVED — absorbed into `../NEXUS_REQUEST_TARGET.md`
**Archived:** 2026-02-27 — AccessContext (binary allow/deny, permissions, grants/permission_requests internal) is canonical in TARGET.
**Mode:** Hard cutover (no backwards compatibility)
**Related:**
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/iam/ACCESS_CONTROL_SYSTEM.md`  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/iam/IDENTITY_RESOLUTION.md`  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/iam/GRANTS.md`

---

## 1) Customer Experience Goal (First)

Access behavior must be predictable:

1. Unknown or unauthorized requests fail closed.
2. Owner approval path is explicit and inspectable.
3. Grants are understandable and reviewable.
4. Access decisions are computed from one policy source of truth.

---

## 2) Research Baseline (Current Runtime)

Current behavior in code:

1. `resolveAccess` compiles policy + grants into `access` and can emit permission requests:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/stages/resolveAccess.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/iam/authorize.ts`
2. On `ask`, runtime currently creates `permission_requests` and then denies current request:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/iam/authorize.ts`
3. Policy source is either:
   - configured YAML path (`policyPath`) or
   - bootstrap defaults
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/iam/policy-loader.ts`
4. Grants and permission requests are persisted in identity ledger:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/iam/grants.ts`
5. Owner approval APIs exist (`acl.requests.*`, `acl.approval.request`):
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-methods/acl-requests.ts`

---

## 3) Direct Answers To Unresolved Questions

1. Who creates grants?  
   Owner approval does. `acl.requests.approve` with mode `day` or `forever` creates grant rows. Mode `once` approves request without standing grant.

2. Does request freeze in `resolveAccess` until approved?  
   No in canonical pipeline. Current request stops with `denied`, and approval applies to next attempt or replay workflow.

3. How do resolved principals turn into access?  
   `resolvePrincipals` produces sender/receiver; `resolveAccess` matches policies against sender + delivery + optional receiver and then applies active grants.

4. Are policies YAML or scripts?  
   YAML policy documents (or bootstrap defaults when no path is configured).

5. Where are policies defined and stored?  
   File path configured in runtime options (`policy_path`). If absent, bootstrap policy set is used.

---

## 4) Locked Access Model Decisions

1. Keep one access result object: `access`.
2. Remove overloaded naming such as `ACLGrantResource`; use `PermissionResource`.
3. `PermissionResource` is a simple string namespace:
   - `tool:<name>`
   - `credential:<id>`
   - `data:<scope>` (only if/when data access is reintroduced with enforcement)
4. `resolveAccess` must never silently allow unresolved receiver binding.
5. Deny and ask must be explicit:
   - `deny`: immediate stop
   - `ask`: create permission request, then stop current request

---

## 5) Canonical ResolveAccess Flow

1. Input:
   - `sender` from `resolvePrincipals`
   - `receiver` from `resolvePrincipals`
   - `delivery` + event context
2. Evaluate policies in priority order.
3. Apply matching active grants.
4. Produce `access`:
   - `decision`: `allow | deny | ask`
   - `matched_policies`: string[]
   - `permissions`: resolved allow/deny sets
   - `routing`: session/persona routing metadata
5. If decision is `ask`:
   - create `permission_requests` row
   - mark request denied for this run
6. Emit audit row.

---

## 6) Approval UX Contract

Owner-facing approval lifecycle:

1. Pending request is visible through `acl.requests.list`.
2. Owner chooses one decision:
   - `allow-once`
   - `allow-always` (time-bound or permanent grant)
   - `deny`
3. Resolution is persisted and broadcast via control-plane events.
4. No hidden side channels for approval state.

Requester behavior:

1. Current request ends denied when approval is required.
2. Follow-up request or replay executes under newly approved grant context.

---

## 7) Hard Deletions For This Workstream

1. Remove any docs that imply implicit freeze/resume inside `resolveAccess`.
2. Remove ambiguous grant resource object naming (`ACLGrantResource`).
3. Remove language that suggests policy source is spread across scripts and YAML for one decision path.

---

## 8) Validation Requirements

1. Ask policy path:
   - request row denied
   - permission request row created
2. Approve once path:
   - permission request status approved
   - no standing grant row
3. Approve always path:
   - permission request status approved
   - standing grant row created
4. Deny path:
   - permission request status denied
5. Request replay/follow-up under grant should pass without second approval prompt.

