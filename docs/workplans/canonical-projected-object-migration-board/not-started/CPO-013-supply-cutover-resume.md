# CPO-013 — Supply Parity, Cutover, and Resume

**State:** not started
**Depends on:** CPO-007, CPO-008, CPO-012
**Repositories:** MoonSleep, Nex core, nexus umbrella

## Goal

Make the canonical Supply projected objects authoritative for semantic reads
and safely resume the paused historical slate.

## Scope

- Compare every shadow canonical identity, revision, attribute, relationship,
  and lineage link against accepted current Supply meaning.
- Produce exact mismatch and unresolved reports; never fuzzy-reconcile.
- Switch canonical reads and Observation targeting to the generic substrate.
- Stop old Supply semantic projection writes while retaining required source
  custody and optional optimized reads.
- Run the governed historical-cursor release only after signoff.

## Acceptance

- Zero unexplained identity or semantic mismatch in the admitted cohort.
- Old and canonical reads agree for the cutover manifest.
- One canonical head exists per object; no parallel write path remains.
- Historical cursor resumes from its exact prior position and terminalizes with
  durable receipts.
- Production remains behind committed source and admitted artifacts.

## Validation

- CPO-008 Supply profile, restart and replay, exact counts/digests, post-cutover
  readback, rollback rehearsal, and independently reviewed cursor receipt.
