# CPO-010 — Native Reuse and Facet Collapse

**State:** not started
**Depends on:** CPO-007, CPO-009
**Repositories:** Nex core, nexus umbrella, MoonSleep

## Goal

Remove MoonSleep duplicates of universal Nex identities before projected Supply
objects relate to them.

## Scope

- Collapse MoonSleep Commitment into `nex.commitment`.
- Collapse MoonSleep Communication Loop into `nex.loop`.
- Resolve Supply Organization through `nex.entity` plus its Supply Facet.
- Resolve Facility through `nex.place` plus its Facility Facet.
- Preserve Fulfillment Node as a distinct domain object related to Place.
- Generate historical vocabulary and exact instance alias mappings without
  duplicate heads or fallback owners.

## Acceptance

- New Observations target only native subjects or Facet Attachments.
- Historical identifiers resolve exactly to native identities.
- Duplicate MoonSleep core-object writes stop after governed cutover.
- Existing evidence and history remain readable without cursor rewrite.

## Validation

- Exact identity census, alias collision tests, head-count parity, replay, and
  no-parallel-object assertions.
- Separate Loop closure and Commitment satisfaction proof.
