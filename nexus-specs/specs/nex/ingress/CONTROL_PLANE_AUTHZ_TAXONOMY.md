# Runtime Operation AuthZ Taxonomy

**Status:** SPEC LOCKED (operation registry aligned)  
**Last Updated:** 2026-02-26  
**Related:** `../UNIFIED_RUNTIME_OPERATION_MODEL.md`, `../ADAPTER_INTERFACE_UNIFICATION.md`, `SINGLE_TENANT_MULTI_USER.md`, `../../iam/ACCESS_CONTROL_SYSTEM.md`, `../../iam/POLICIES.md`, `../../iam/AUDIT.md`

---

## Summary

Authorization is operation-based.

Every mounted operation maps to:

1. `operation` (stable id)
2. `action` (`read|write|admin|approve|pair`)
3. `resource` (stable resource id)
4. `permission` (`control.<resource>.<action>`)
5. `mode` (`protocol|sync|event`)

This taxonomy is shared across WS, HTTP, internal adapters, and external adapters.

---

## Rules

1. All `sync` and `event` operations require IAM authorization.
2. `protocol` operations are transport mechanics and must not perform business-state writes outside protocol/session semantics.
3. `event` operations dispatch through canonical event normalization and `nex.processEvent(...)`.
4. Every allow/deny/fail decision writes audit records.

---

## Clock Cutover

Canonical scheduling operations are:

1. `clock.schedule.list`
2. `clock.schedule.status`
3. `clock.schedule.create`
4. `clock.schedule.update`
5. `clock.schedule.remove`
6. `clock.schedule.run`
7. `clock.schedule.runs`
8. `clock.schedule.wake`

Legacy operations removed:

1. `wake`
2. `cron.list`
3. `cron.status`
4. `cron.add`
5. `cron.update`
6. `cron.remove`
7. `cron.run`
8. `cron.runs`

---

## Source Of Truth (Code)

1. `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/authz-taxonomy.ts`
2. `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-methods-list.ts`
3. `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-methods.ts`

