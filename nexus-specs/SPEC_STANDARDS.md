# Spec Standards

**Purpose:** Conventions for writing and maintaining specs in this repository.

---

## Status Labels

Every spec document must have a `**Status:**` line in its header. Use exactly one of these three labels:

| Status | Meaning | When to use |
|--------|---------|-------------|
| **CANONICAL** | Locked target state. Implement from this. | Specs that define the final system shape — schemas, APIs, pipeline stages, data models. These are build targets. |
| **DESIGN** | Directionally correct. Details may evolve. | Specs that are well-thought-out but not fully locked. Architecture is settled, but specific details (field names, exact flows) may still change. |
| **REFERENCE** | Context only. Not a build target. | Ontology docs, historical decisions, comparisons, project structure, upstream analysis. Useful for understanding but not directly implemented. |

### Rules

- **One status per doc.** No compound statuses like "CANONICAL (Environment Contract)" or "DESIGN (authoritative target)".
- **Status reflects the document, not the feature.** A CANONICAL spec describes a locked contract even if the feature isn't built yet.
- **Promote deliberately.** Moving from DESIGN → CANONICAL means the spec is locked and ready for implementation. Don't promote prematurely.
- **Archive instead of demoting.** If a spec is superseded, move it to `_archive/` rather than changing its status.

---

## Document Header Format

```
# Document Title

**Status:** CANONICAL | DESIGN | REFERENCE
**Last Updated:** YYYY-MM-DD
**Related:** list of related spec files (optional)

---
```

- `Status` is required.
- `Last Updated` is required. Update it when making substantive changes.
- `Related` is optional but encouraged for specs that form clusters.

---

## File Organization

- **Active specs** live under `specs/` in domain-specific folders.
- **Archived specs** live under `specs/_archive/`. Move here when superseded — don't delete.
- **Upstream references** live under `specs/upstream/`. These are analysis of the OpenClaw codebase, not Nexus specs.
- **Workplans** live under `specs/{domain}/workplans/`. These are execution plans, not specs.

---

## Cross-References

- Use relative paths from the referencing file.
- Prefer short paths: `MEMORY_SYSTEM.md` over `specs/memory/MEMORY_SYSTEM.md` when in the same folder.
- When a referenced file is archived, update the reference or remove it.
