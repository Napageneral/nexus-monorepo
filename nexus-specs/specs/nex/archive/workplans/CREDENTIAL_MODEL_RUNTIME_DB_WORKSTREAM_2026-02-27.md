# Credential Model Runtime DB Workstream (2026-02-27)

**Status:** Discovery + planning spec  
**Mode:** Hard cutover when executed (no backwards compatibility)  
**Related:**  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/iam/ACCESS_CONTROL_SYSTEM.md`  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/iam/GRANTS.md`  
- `/Users/tyler/nexus/home/projects/nexus/nex/src/iam/grants.ts`

---

## 1) Customer Experience Goal (First)

Credential access should feel like normal IAM, not ad hoc config:

1. Owner can see which credentials exist.
2. Owner can see which principals can use each credential.
3. Runtime can audit when credentials are granted and used.
4. Credential capability naming is consistent with policy/grant resources.

---

## 2) Problem Statement

Current direction mixes:

1. Credentials managed as config pointers.
2. Access decisions managed in IAM grants/policies.

This split makes credential governance harder than tool governance.

---

## 3) Locked Direction

1. Pull credential metadata model into runtime DB.
2. Keep secrets as pointers or secure references; do not force plaintext secret storage in ledger.
3. IAM resources for credentials stay string-based and composable.
4. `CredentialPermission` remains valid as a concept, but must align with runtime DB source of truth.

---

## 4) Proposed Canonical Model

### 4.1 Credential Catalog (runtime DB)

`credentials` table:

1. `id` (stable credential id)
2. `provider` (example: github, slack, openai)
3. `account` (owner/account label)
4. `pointer_type` (env, keychain, file, 1password, vault)
5. `pointer_ref` (opaque lookup reference)
6. `status` (active, revoked, broken)
7. `declared_scopes_json` (optional list)
8. `created_at`, `updated_at`, `last_verified_at`

### 4.2 Access Resource Format

Credential IAM resources:

1. `credential:<id>`
2. Optional scoped resource: `credential:<id>:scope:<scope_name>`

### 4.3 Audit

Credential use events should include:

1. `credential_id`
2. `request_id`
3. `sender_entity_id`
4. `grant_id` (if access came from grant)
5. timestamp

---

## 5) Phased Cutover Plan

1. Phase 1: mirror existing config pointers into runtime DB rows.
2. Phase 2: route IAM evaluation to credential catalog ids.
3. Phase 3: add optional scope-aware grants/policies.
4. Phase 4: remove legacy config-only credential registry paths.

---

## 6) Open Questions To Close Before Implementation

1. Target ledger for credential catalog:
   - identity ledger vs nexus ledger
2. Scope source of truth:
   - provider-declared only vs user-annotated + provider-declared
3. Rotation UX:
   - replace pointer in place vs create new version rows
4. Failure UX:
   - automatic flag to `broken` on repeated runtime auth failure

---

## 7) Validation Requirements (When Implementing)

1. Credential list/read/update APIs use runtime DB, not config-only scans.
2. IAM grant resources referencing credential ids are enforceable in tool/runtime paths.
3. Audit log can answer:
   - who used what credential
   - under which request
   - under which policy/grant decision

