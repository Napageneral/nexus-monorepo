# Extensions API Terminology Hard Cutover (2026-02-25)

**Status:** Implemented  
**Mode:** Hard cutover (single canonical naming)  
**Scope:** Owned docs/specs under `nexus-specs/specs/**` (excluding upstream snapshot specs)

---

## 1. Customer Experience First

Users and operators should experience:

1. One canonical naming surface: `extensions-api`.
2. No ambiguity from mixed legacy naming in active Nexus specs.
3. Cleaner implementation handoffs with less naming drift.

---

## 2. Research Findings

Before this pass, owned spec files still contained legacy extension API naming across:

1. Architecture mapping tables.
2. Delivery failure/implementation notes.
3. Prior workplan documents.

Out of scope:

1. `specs/upstream/**` snapshot documents (external fidelity preserved).
2. Runtime logs/session artifacts outside `nexus-specs/specs/**`.

---

## 3. Decisions

1. Normalize owned spec terminology to `extensions-api`.
2. Rename workplan filenames that used legacy API naming.
3. Preserve upstream snapshot wording unchanged.

---

## 4. Implementation

1. Updated owned spec documents in:
   - `specs/architecture/FORK_MAPPING.md`
   - `specs/delivery/DELIVERY_CORE_HARD_CUTOVER_FAIL_BURNDOWN_2026-02-25.md`
   - `specs/delivery/DELIVERY_CORE_HARD_CUTOVER_IMPLEMENTATION_UPDATE_2026-02-25.md`
2. Renamed workplan file to:
   - `specs/nex/workplans/EXTENSIONS_API_HARD_CUTOVER_WORKPLAN_2026-02-25.md`
3. Added this terminology cutover record.

---

## 5. Validation

1. Zero legacy API token matches in owned `nexus-specs/specs/**`.
2. Upstream snapshot files remain unchanged.
3. Canonical naming in owned specs is now `extensions-api`.
