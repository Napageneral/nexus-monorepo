# Pipeline Language + Sender Schema Cutover

**Status:** SPEC FOR IMMEDIATE EXECUTION
**Date:** 2026-02-24
**Mode:** Hard cutover (no backwards compatibility)

---

## 1. Customer Experience Goal

Nexus should be explainable to users and operators with one consistent story:

1. Every event enters the same pipeline.
2. The agent path is conditional, not the whole pipeline.
3. Automations are hookable behaviors around pipeline work, not a single special branch.
4. `finalize` always runs so logging/audit/trace completion is guaranteed.
5. Language is consistent: use `sender` for actor identity, `agent` for agent receiver type, and `platform` for delivery taxonomy docs.

If docs and schemas do not match this story, users cannot trust the architecture.

---

## 2. Scope

### In scope

1. Core spec terminology and pipeline framing updates:
   - `nexus-specs/specs/nex/NEX.md`
   - `nexus-specs/specs/nex/NEXUS_REQUEST.md`
   - `nexus-specs/specs/nex/RUNTIME_SURFACES.md`
   - `nexus-specs/specs/iam/ACCESS_CONTROL_SYSTEM.md`
   - `nexus-specs/specs/iam/IDENTITY_RESOLUTION.md`
   - `nexus-specs/specs/memory/UNIFIED_ENTITY_STORE.md`

2. Delivery taxonomy folder-language cutover:
   - rename `nexus-specs/specs/delivery/platforms/` -> `nexus-specs/specs/delivery/platforms/`
   - update spec references to this folder path

3. At-rest DB column cutover from `principal*` to `sender*` in runtime code and schema definitions:
   - `nex/src/iam/audit.ts`
   - `nex/src/db/identity.ts`
   - `nex/src/db/nexus.ts`
   - `nex/src/nex/stages/finalize.ts`
   - `nex/src/iam/grants.ts` (`principal_query` -> `sender_query`)
   - dependent tests and call sites that reference these persisted columns

### Out of scope (this cut)

1. Global replacement of natural-language "principal" in all hosted/security docs.
2. Renaming runtime field `access.routing.persona` in code/spec.
3. Full runtime type migration of `ReceiverContext.type` literal from `"persona"` to `"agent"` in implementation code (docs will align to `agent` naming where this cut touches).

---

## 3. Canonical Pipeline Framing

### 3.1 Operational stages (runtime names)

1. `receiveEvent`
2. `resolveIdentity`
3. `resolveReceiver`
4. `resolveAccess`
5. `runAutomations`
6. `assembleContext`
7. `runAgent`
8. `deliverResponse`
9. `finalize`

### 3.2 User-facing explanation rules

1. Explain stages 2-3 together as "identity resolution" (sender + receiver).
2. Explain stages 6-8 as the "agent execution path" (conditional branch).
3. Explain `runAutomations` as the default pipeline hookpoint, and state automations can execute at other hookpoints.
4. Explain `finalize` as always-on completion/audit persistence regardless of branch outcome.

---

## 4. Identity + Entity Language Rules

1. Use `sender` for persisted actor fields and schema columns.
2. In touched specs, use `agent` for agent receiver type terminology (avoid describing receiver type as `persona`).
3. Entity typing must remain flexible:
   - no fixed "contactable-only" whitelist language
   - entities may have contacts when appropriate
   - types remain open-ended while canonical/common types are still documented

---

## 5. Delivery Folder Language Rules

1. The delivery spec taxonomy folder is `platforms/`, not `platforms/`.
2. Links and references to spec documents in that folder must use `platforms/...`.
3. `container_kind = "channel"` remains valid domain data and is not renamed.

---

## 6. DB Schema Cutover Rules

### 6.1 access_log

Rename persisted actor columns:
- `principal_id` -> `sender_entity_id`
- `principal_type` -> `sender_type`
- `principal_name` -> `sender_name`
- `principal_relationship` -> `sender_relationship`

Rename indexes accordingly.

### 6.2 nexus_requests

Rename persisted actor/session columns:
- `principal_id` -> `sender_entity_id`
- `principal_type` -> `sender_type`
- `principal_is_user` -> `sender_is_user`
- `session_persona` -> `session_agent`

Rename indexes and typed row properties accordingly.

### 6.3 grants

Rename grant query column:
- `principal_query` -> `sender_query`

Any APIs and tests reading persisted grant rows must use `sender_query`.

### 6.4 Compatibility rule

No compatibility aliases, no dual-write, no fallback reads.

---

## 7. Validation Requirements

1. Code-level grep validation:
   - no remaining `principal_*` DB column names in runtime schema SQL for `access_log`, `nexus_requests`, `grants`.
2. Targeted tests:
   - IAM audit/grants tests
   - pipeline finalize and IAM authorize tests that query persisted columns
3. Spec validation:
   - core docs above use runtime stage names and new framing
   - no `delivery/platforms/` folder references remain for spec paths

