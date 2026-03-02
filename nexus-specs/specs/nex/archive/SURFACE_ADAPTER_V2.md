# Surface Adapter V2 (Historical)

**Status:** ARCHIVED — superseded by `NEXUS_REQUEST_TARGET.md` and `ADAPTER_INTERFACE_UNIFICATION.md`
**Date:** 2026-02-26
**Archived:** 2026-02-27 — Dual-role adapter model eliminated. One adapter interface, one pipeline.
**Mode:** Hard cutover (no backwards compatibility)

---

## Superseded By

1. `UNIFIED_RUNTIME_OPERATION_MODEL.md`
2. `ADAPTER_INTERFACE_UNIFICATION.md`

---

## Why This Is Archived

This V2 doc encoded a transitional dual-role model:

1. `ControlSurfaceAdapter`
2. `EventIngressAdapter`

That split is no longer canonical.

Current Nexus direction is:

1. one adapter interface
2. one operation set
3. one SDK contract
4. operation-mode metadata (`protocol|sync|event`) without adapter-role taxonomy

---

## Migration Reminder

If any implementation/spec still references this historical split, update it to the canonical docs above.

