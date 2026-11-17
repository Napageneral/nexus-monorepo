# Nex Core Graph and Entity Enforcement Board

**Status:** WORKPLAN
**Last Updated:** 2026-08-14
**Canonical spec:** [Nex Core Real-World Graph and Domain Facets](../../specs/core-real-world-graph-and-domain-facets.md)
**Registry:** [Shared object registry](../../../contracts/object-registry/v1/README.md)

---

## Outcome

Golden-corpus extraction and live adapters target one universal Nex foundation:
Entity, Place, Contact, Channel, Loop, Commitment, Facet Definition, and Facet
Attachment. MoonSleep retains independent domain Resources and builds business
workspaces as projections over both layers.

This board closes the gap between the canonical target and deployed reality. It
does not authorize production mutation merely because a ticket is ready.

## Sequencing rule

The implementation order is strict:

1. lock the canonical model;
2. update registry ownership and aliases;
3. build and independently review the Nex core foundation;
4. adopt the small deployed MoonSleep Loop and Commitment cohort;
5. enforce Entity, Contact, and Facet boundaries across sources in parallel;
6. adopt Place and Facility mappings;
7. update workspaces after the underlying reads are stable.

No historical compiler or backfill may invent temporary identity semantics to
get ahead of the foundation.

## Phase 1 — canonical model lock

- [x] Define Entity versus Place.
- [x] Define Loop versus Commitment and their independent closure evidence.
- [x] Define Facet Definition and Facet Attachment.
- [x] Reduce role, profile, and interface language to the Facet contract.
- [x] Define the domain Resource identity test.
- [x] Define the three-layer core, domain, and workspace model.
- [x] Define Customer Issue and historical thread nouns as projections.
- [x] Preserve the rule that no accepted evidence or projection grants action
      authority.

## Phase 2 — registry and aliases

- [x] Register planned `nex.place`.
- [x] Register planned `nex.loop` and `nex.commitment`.
- [x] Register planned `nex.facet_definition` and `nex.facet_attachment`.
- [x] Redirect Entity role tags to Facet compatibility.
- [x] Redirect MoonSleep Loop and Commitment storage to compatibility custody.
- [x] Register Customer Issue as a workspace read projection.
- [x] Register Partner as a saved Organizations view.
- [x] Redirect Facility to Nex Place plus a MoonSleep Facility Facet.
- [x] Keep Fulfillment Node as an independent Dispatch Resource related to Place.
- [x] Register explicit foundation, adoption, Entity Enforcement, and Place gaps.

## Phase 3 — Nex core foundation

### Core schema and invariants

- [ ] Publish versioned contracts for Place, Loop, Commitment, Facet Definition,
      and Facet Attachment in the Nex core repository.
- [ ] Add monotonic storage migrations with immutable history, merge or
      supersession semantics, typed relationship cardinality, and exact indexes.
- [ ] Enforce that one Facet Attachment targets one registered subject and one
      immutable Facet Definition version.
- [ ] Enforce that definitions declare compatible subject classes and
      single-valued or set-valued attachment slots.
- [ ] Enforce Loop and Commitment action authority as structurally false.
- [ ] Keep Entity and Place distinct while allowing typed Entity-to-Place
      relationships.
- [ ] Reject unregistered target classes, relationships, Facet versions, and
      semantic predecessor gaps.

### API and runtime surface

- [ ] Add create, get, list, search, history, and resolve APIs for the five new
      primitives.
- [ ] Add Facet definition discovery and attachment validation APIs.
- [ ] Add exact alias and compatibility-resolution reads.
- [ ] Integrate new targets with Nex Observation heads and projection receipts.
- [ ] Redact public DTOs and preserve stable reason codes.
- [ ] Add runtime catalogs so apps and domains discover contracts instead of
      hard-coding private tables.

### Proof

- [ ] Focused storage, migration, API, concurrency, idempotency, and restart
      suites.
- [ ] Adversarial tests for duplicate Entity/Place ownership, malformed Facet
      attachment, alias collision, stale semantic predecessor, and unauthorized
      action fields.
- [ ] One cleanroom golden journey: ingest Records, resolve Contacts and Entity,
      create Place, attach a domain Facet, accept a Loop and Commitment through
      Observations, close the Loop, satisfy the Commitment separately, and read
      the composed graph after restart.
- [ ] Fresh independent review before integration.

### Ownership recommendation

Use one primary integration owner for the core schema, migration, and public
contract because the five primitives share identity, relationship, Observation,
and restart invariants. Parallelize bounded support work around that owner:

- one contract and migration reviewer;
- one API/DTO/catalog reviewer;
- one adversarial cleanroom reviewer.

Do not assign independent authors to invent separate Place, Facet, Loop, and
Commitment foundations without the primary owner controlling the shared schema
and final composition.

## Phase 4 — Loop and Commitment adoption

- [ ] Inventory the exact deployed MoonSleep cohort and freeze identities,
      Observations, evidence, and receipts.
- [ ] Create identity-preserving Nex objects and deterministic crosswalks.
- [ ] Recompile supplier Chapters 1 and 2 source-only: preserve 385 Records,
      two Episodes, 54 Facts, their exact memberships, and reviewed meanings;
      redirect four Loops and one Commitment; keep the 82 genuine MoonSleep
      Supply Resources.
- [ ] Prove read parity and independent Loop versus Commitment closure.
- [ ] Stop new semantic writes to MoonSleep Loop and Commitment owners.
- [ ] Retain only aliases, receipts, and compatibility reads that still have
      referenced custody value.

## Phase 5 — Entity Enforcement lanes

These lanes can run in parallel after the common Entity and Facet contract is
deployed. Each lane has one source owner and an independent cross-Entity
collision review.

### Shopify universal Contacts

- [ ] Accept source commit
      `8252313b53480a434412fa55dd9c5abb90591ebe` as behaviorally unchanged
      inside deployed runtime source
      `111649e39c24260f8532545efc1feba26340de14`, then reconcile it with the
      Facet contract; do not duplicate its implementation.
- [x] Record Revision prerequisite is terminal: the independent current
      readback was `434,231 / 434,231` with zero missing.
- [ ] Keep historical Shopify repair state explicitly **not started** until a
      terminal receipt exists. Migration 19 being deployed does not prove the
      replay ran; there is no 50, 500, or 5,000 canary, checkpoint,
      bounded-progress receipt, or terminal Shopify history receipt.
- [ ] Replay stored Nex Records and Revisions only; do not refetch Shopify.
- [ ] Preserve Shopify customer ID or GID Contact and materialize normalized
      universal email and phone Contacts on the same Entity.
- [ ] Preserve append-only source provenance and never replace newer active
      email or phone during historical replay.
- [ ] Quarantine a universal Contact already owned by another canonical Entity.
- [ ] Repair only legacy `customer:<id>` aliases whose shell has no other
      identity-bearing Contacts.
- [ ] Preserve Order relationships and Customer Facet semantics.
- [ ] Cover historical changes, shared values, guest checkout, deleted
      customers, invalid values, aliases, replay, and Entity merge chains.
- [ ] Re-derive the current standby census at admission. Historical counts in
      the transfer packet are planning seeds, not final eligible, promoted,
      conflicted, or unresolved totals.
- [ ] Run provider-free dry run, exact conflict and non-merge plan, 50/500/5000
      canaries, health gates, idempotent replay, and post-state census.
- [ ] Return a terminal governed backfill and live-sync receipt; current source
      deployment alone is not historical completion. The receipt must include
      exact eligible/promoted/conflicted/unresolved and alias outcomes, final
      cursors, preserved Shopify Contacts and Order relationships, zero
      duplicate active normalized anchors, `provider_calls = 0`, and
      `provider_mutations = 0`.

### Gmail and communication identity

- [ ] Complete bounded native Channel, participant Contact, and Entity replay.
- [ ] Preserve provider threads as native Channels and Entity histories as
      derived reads.
- [ ] Quarantine ambiguous participant resolution rather than minting domain
      customer or partner identities.

### Organizations, Supply, Finance, creators, and media

- [ ] Treat the deployed Organization corpus as a top-down candidate inventory.
- [ ] Crosswalk Organization and Person rows to canonical Entities and Contacts.
- [ ] Replace partner, supplier, creator, lender, media, and customer role rows
      with registered Facet Attachments or saved views.
- [ ] Enforce Supply organization and Finance AP party crosswalks without
      deleting their independent domain/subledger identities.
- [ ] Reuse accepted Supply Episodes, Facts, and Observations for Surewal rather
      than independently reinterpreting the same Alibaba evidence.

## Phase 6 — Place adoption

- [ ] Register the MoonSleep Facility Facet Definition.
- [ ] Resolve current facility rows into canonical Places with explicit address
      and operator evidence.
- [ ] Attach Facility Facets and preserve existing facility ID aliases.
- [ ] Relink Inventory Positions and Fulfillment Nodes to Place.
- [ ] Keep node routing, wave, package, and execution lifecycle inside Dispatch.

## Phase 7 — workspace convergence

- [ ] Simplify navigation around durable workspaces rather than every noun.
- [ ] Keep Organizations as the main Entity relationship workspace.
- [ ] Make Partners, Suppliers, Creators, Finance, and Media saved views or
      typed profiles unless an independently important workflow justifies a tab.
- [ ] Rebuild Customer Issues from registered inclusion and closure rules over
      Entity, Loops, Commitments, and domain exceptions.
- [ ] Preserve historical URLs through aliases.

## Global acceptance rules

- No schema adds a field named `kind`.
- No source replay silently reassigns a Contact or merges Entities.
- No domain duplicates Entity, Place, Channel, Loop, or Commitment identity.
- No Facet owns the core identity it extends.
- No workspace owns the truth it composes.
- No projection, Loop, Commitment, Observation, or receipt grants external
  action authority by implication.
- Source release, schema enablement, historical adoption, projection promotion,
  and UI activation remain independently terminal production transactions.
