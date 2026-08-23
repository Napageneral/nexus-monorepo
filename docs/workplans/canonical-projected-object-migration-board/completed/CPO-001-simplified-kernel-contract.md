# CPO-001 — Simplified Kernel Contract

**State:** completed
**Depends on:** none
**Repository:** nexus umbrella

## Goal

Lock the smallest generative architecture before implementation.

## Delivered

- Canonical target-state specification at
  `docs/specs/canonical-projected-objects.md`.
- One Canonical Object Kernel with two primary operations:
  `objects.publish_revision` and `objects.resolve_many`.
- Agents established as first-class projecting producers.
- Historical interpretation defined as projection-time vocabulary handling,
  not a permanent decoder subsystem.
- Six-ticket foundation board replacing the earlier 20-ticket migration plan.

## Acceptance

- Registration immediately grants the complete generic object behavior.
- The registry does not permanently bind object types to projectors.
- Native-object resolution is contained behind the shared resolution seam.
- `reuse | alias | create` is a per-candidate vocabulary decision, not a
  migration phase.
- Objects can converge independently without a domain-family framework.
- Disabled or superseded projectors and decoders are removal candidates.
- No production, schema, packet, or historical cursor state was mutated.

## Validation

- Normative spec and board agree on vocabulary and operations.
- All six ticket links and dependencies resolve.
- Markdown, Mermaid, repository corpus, and prohibited-field checks pass.
