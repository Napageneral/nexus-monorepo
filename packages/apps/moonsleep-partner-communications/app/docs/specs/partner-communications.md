---
summary: "Partner Desk domain design for source-linked partner identity, communication facts, reviewed open loops, and evidence-backed operational projections."
read_when:
  - You are changing Partner Desk ingestion, extraction, resolution, review, or projection behavior
  - You are adding Gmail, Alibaba, or iMessage evidence to Partner Desk
  - You are designing or validating partner open-loop lifecycle behavior
  - You are planning a Partner Desk backfill, profile migration, activation, or rollback
title: "MoonSleep Partner Desk Domain Design"
---

# MoonSleep Partner Desk Domain Design

**Status:** CANONICAL DOMAIN DESIGN

**Owner:** MoonSleep Partner Desk

**Last updated:** 2026-07-29

## Governing Nex Contract

This design implements, and does not redefine, the canonical Nex continuous
evidence model:

- core commit:
  `0d1abf1b99c35c17cbed4cc5f0d539fdb657b5e8`
- core tree:
  `d01746ebe755b12054de88fc34a3a65888d1a924`
- core specification:
  `docs/specs/memory/continuous-evidence-and-domain-resolution.md`
- core specification SHA-256:
  `3c91f28fbda0754e295e51f1d3060ebec479cf08d57c54c867aca5608ba8c40b`

The Partner Desk flow is:

```text
immutable Gmail, Alibaba, or iMessage record revision
  -> immutable Partner fact elements
  -> versioned Partner observation elements
  -> Partner-owned open-loop and relationship projections
  -> reviewed queue, conversation, context, and audit views
```

Partner Desk does not create another observation store. It uses Nex records,
facts, observations, sealed memory sets, links, identities, jobs, receipts,
and deterministic head semantics.

## Purpose

Partner Desk gives MoonSleep one evidence-backed workspace for relationships
and independently closable work with suppliers, factories, fulfillment nodes,
logistics providers, marketplaces, professional-service firms, and creators.

Provider-native conversations are evidence containers. They are not task
containers. One Alibaba thread with Surewal can simultaneously contain
independent work about production timing, samples, materials, defects,
packaging, freight, payments, and future product design. Each independently
closable question, commitment, decision, or blocker is tracked as its own
partner open loop.

The initial product is read, classify, review, and project. It helps Tyler
understand:

- which partner relationships are active;
- what MoonSleep owes each partner;
- what each partner owes MoonSleep;
- what evidence supports each conclusion;
- what is blocked, overdue, unresolved, or awaiting review;
- how one issue evolved across Alibaba, Gmail, and later iMessage.

## Authority Ceiling

The initial Partner Desk authority ceiling permits:

- reading already admitted immutable source records and attachments;
- observing exact provider-native accounts, contacts, and participants;
- creating immutable facts and shadow observation candidates;
- presenting identity, classification, coverage, and open-loop proposals;
- promoting reviewed Partner observations;
- rebuilding Partner-owned read projections;
- recording internal review, queue, assignment, and follow-up workflow;
- displaying source-linked partner context.

It does not permit:

- sending, editing, deleting, archiving, labeling, or reacting to provider
  messages;
- creating or changing purchase orders, production batches, shipments,
  routing, inventory, invoices, payments, refunds, or customer promises;
- merging canonical entities from name, email, phone, or model similarity;
- converting a partner statement into Finance, Supply, Dispatch, or Control
  Tower truth;
- closing a loop without exact evidence or reviewed operator disposition;
- promoting unreviewed model output into canonical Partner state;
- acquiring provider credentials outside the owning adapter connection;
- granting reply or operational execution authority through identity,
  classification, extraction, observation, or projection state.

Reply drafting and sending are a later, separately authorized domain phase.
They require provider-specific methods, explicit operator review, immutable
send receipts, post-send readback, and independent capability grants.

## Domain Boundaries

### Nex Core Owns

Nex core owns:

- immutable records and durable record events;
- adapter connections, provider-account identity, and method authority;
- jobs, queues, schedules, retries, single-flight execution, and dead letters;
- contacts, contact observations, entities, reviewed merge chains, and element
  entity links;
- fact and observation elements;
- element definitions and profile validation;
- sealed memory sets and member digests;
- evidence, contradiction, supersession, derivation, and version links;
- atomic expected-head comparison and observation-head advancement;
- review, promotion, and projection-outbox receipts;
- search and generic communication observation primitives.

### Source Adapters Own

Each source adapter owns:

- authenticated provider reads;
- provider-native account, thread, message, object, and revision identities;
- bounded capture and pagination;
- attachment custody and sanitization;
- opaque cursor and overlap behavior;
- provider read and write authority declarations;
- continuous-source run receipts and source-health checkpoints.

The adapter never decides Partner identity, open-loop lifecycle, or operational
truth.

### Partner Desk Owns

Partner Desk owns:

- Partner admission rules;
- Partner fact and observation profiles;
- Partner resolver policies and evidence precedence;
- partner workspace and open-loop subject references;
- model proposal and operator-review boundaries;
- open-loop semantic lifecycle;
- source-coverage requirements;
- Partner queue and review workflow;
- Partner read projections and UI;
- Partner-specific historical comparisons and promotion policy.

### Other Domains Retain Authority

- Finance owns supplier documents, accounts payable, payment matching, and
  payment state.
- Supply and Control Tower own purchase-order, production, inventory,
  shipment, and provenance truth.
- Dispatch owns routing, fulfillment execution, labels, and physical movement.
- Helpdesk owns customer cases, customer queue behavior, remedies, and
  customer-order authority.

Partner Desk may link to their stable subject references and display their
read observations. It may not promote a communication claim into their
canonical state.

## Source Contracts

### Shared Requirements

Every admitted source record revision binds:

- provider and adapter package identity;
- authenticated connection and provider-account identity;
- provider-native record identity;
- provider-native revision identity when available;
- logical source-record identity across revisions;
- canonical payload digest;
- source time and capture time;
- exact attachment references and digests;
- source-run receipt reference;
- provider read and write authority declarations.

An updated provider message creates another immutable revision. Facts continue
to reference the exact revision from which they were extracted.

Partner facts embed the core-registered `SourceRevisionRefV1`; they do not
define a Partner-specific replacement. Continuous capture binds the shared
`continuous_source_run_receipt_v1` contract and retains that receipt by
reference and digest on admitted source revisions.

### Gmail

Partner Desk consumes the existing shared Gmail ingestion substrate. It does
not create another Gmail adapter, polling loop, OAuth connection, or message
store.

Required Gmail source fields include:

- Gmail connection and observed mailbox;
- provider message and thread IDs;
- source revision digest;
- sender, recipients, and direction;
- source timestamp;
- bounded body and attachment references;
- exact record-ingest and source-run receipts.

Existing generic communication classification may emit relationship and topic
facts consumed by Partner Desk. Customer Helpdesk admission and Partner Desk
admission remain separate policies over the same source evidence.

### Alibaba

Partner Desk consumes sanitized, completed Alibaba browser-capture projections
through the Alibaba evidence adapter.

Required Alibaba source fields include:

- MoonSleep Alibaba buyer-account connection;
- supplier conversation and provider message identities;
- exact sanitized provider JSON line and SHA-256;
- snapshot, projection, and adapter completion receipts;
- message direction and provider timestamp;
- attachment and orphan-attachment evidence;
- capture authority proving read-only behavior.

Raw browser exports, cookies, signed URLs, chat tokens, encrypted session
identifiers, passwords, and second-factor material are never valid Nex record
payloads.

Continuous capture uses bounded rolling overlap. A checkpoint advances only
after all admitted revisions and the run receipt commit durably.

### Future iMessage

iMessage uses the same domain flow when an approved source adapter exists.
It preserves:

- exact service/account connection;
- native chat and message identifiers;
- sender and recipient handles;
- source timestamp and direction;
- text and attachment evidence;
- exact revision and capture receipts.

Phone numbers, email handles, and Apple identifiers are provider contacts.
They do not automatically merge with Gmail or Alibaba contacts. Provider
native chats remain separate evidence containers after reviewed cross-channel
identity binding.

## Shared Communication Normalization

Partner Desk reuses Nex communication observation and review primitives. It
does not implement another generic message or stream store.

For Gmail, Alibaba, and future iMessage records, shared normalization
materializes:

- stable logical message identity across immutable source revisions;
- provider-native conversation identity;
- authenticated account and participant references;
- inbound or outbound direction;
- source and observation timestamps;
- attachment references;
- deterministic latest-inbound and latest-outbound state;
- deterministic awaiting-response state;
- exact source record and revision provenance.

Deterministic awaiting-response state answers only whether a newer inbound
message lacks a later outbound response, or vice versa. It does not decide
whether a partner commitment is fulfilled, whether a business question is
closed, or whether an open loop is resolved.

Provider-native conversations remain distinct. A Partner entity timeline may
compose normalized messages from several providers after reviewed identity
binding, but it never creates a synthetic universal thread.

Generic communication classification may emit reusable relationship and topic
facts. Partner admission, Partner topic vocabulary, open-loop association, and
semantic lifecycle remain Partner-owned resolver policy.

## Identity And Subject Resolution

Identity and authority are independent.

### Connection And Account

A connection identifies one authenticated provider account and its admitted
read methods. Partner Desk records the connection ID but never copies its
credential.

The provider-account principal is observed at ingress. Examples include:

- the MoonSleep Gmail mailbox;
- the MoonSleep Alibaba buyer account;
- a future MoonSleep iMessage service account.

### Contacts

Every exact provider anchor produces or reuses a deterministic contact through
the public Nex identity operations.

Examples include:

- Gmail mailbox plus normalized email address;
- Alibaba account plus provider-native supplier/contact ID;
- iMessage account plus exact phone, email, or service handle.

Contact presentation may evolve without changing its entity binding.
Replaying the same contact observation produces the same receipt and no
duplicate contact history.

### Entities

Canonical entities represent people and organizations separately.

For example:

- Surewal is an organization entity;
- Rebecca is a person entity;
- Rebecca's relationship to Surewal is an explicit reviewed relationship;
- Rebecca's Alibaba and Gmail contacts may link to her person entity;
- the Surewal partner workspace is anchored to the Surewal organization
  entity.

An exact provider anchor may create a new provisional entity. Names,
similar-looking addresses, email similarity, phone similarity, message
content, or model inference may only create a merge proposal. They never apply
an entity merge.

Source records, facts, and historical observations retain their originally
observed entity references. Canonical reads may follow reviewed Nex merge
chains.

### Partner Workspace Resolution

One Partner workspace is anchored to one reviewed canonical organization or
individual partner entity.

Workspace admission statuses are:

- `confirmed`
- `probable`
- `unresolved`
- `ambiguous`

Only an exact provider anchor or operator review can create a `confirmed` or
operationally admitted `probable` binding. Model-only or similarity-only
results stay in review.

One provider-native thread cannot resolve to multiple canonical partner
workspaces without an explicit split review. A single message cannot silently
cross canonical partner entities.

### Stable Subject References

Partner Desk uses stable subject references rather than display text.

Required Partner subject families are:

- partner workspace: canonical partner entity ID;
- source message: logical source-record identity plus exact revision;
- native conversation: provider, connection, and provider thread identity;
- open loop: immutable Partner-generated open-loop ID;
- external operational object: owning domain plus stable external subject ID.

Examples of external operational subjects include a purchase order, invoice,
payment, shipment, production batch, sample, product, component, or document.
Partner Desk may retain the reference without claiming authority over the
external subject.

## Shared Fact Envelope

Every Partner fact follows the core fact-element contract and binds:

- `fact_profile_id`
- `fact_profile_version`
- `fact_type`
- `subject_reference`
- canonical typed payload and `payload_sha256`
- one or more exact source revision and fragment references
- producer package, producer version, and source-manifest digest
- deterministic parser, model, prompt, taxonomy, and policy versions as
  applicable
- entity and contact links
- review state and review receipt when required

Facts are immutable. Improved extraction creates new facts or an idempotent
replay receipt; it never edits an existing fact.

## Partner Fact Profiles

### `moonsleep.partner.communication-classification.v1`

Purpose: classify one exact communication revision without admitting it to a
Partner workspace or queue.

Typed payload:

- `relationship_labels`: one or more bounded relationship labels;
- `topic_labels`: zero or more bounded Partner topic labels;
- `partner_relevance`: `included`, `excluded`, or `review_required`;
- `confidence_millionths`: integer from 0 through 1,000,000;
- `rationale`: bounded source-grounded explanation;
- `language_code`: optional normalized language code;
- `contains_actionable_signal`: boolean;
- `classifier_review_reason`: optional explicit review reason.

Initial Partner topic vocabulary:

- `production_schedule`
- `purchase_order`
- `shipment_freight`
- `payment_balance`
- `sample_prototype`
- `product_specification`
- `material_fabric`
- `quality_defect`
- `inventory_allocation`
- `packaging_labeling`
- `compliance_testing`
- `pricing_quote`
- `document_attachment`
- `general_relationship`

This fact never establishes identity or open-loop state.

### `moonsleep.partner.open-loop-signal.v1`

Purpose: preserve one atomic source-grounded signal that may create, update, or
close an open loop.

Typed payload:

- `signal_type`: `question`, `request`, `commitment`, `decision`, `blocker`,
  `progress`, `closure_candidate`, or `informational`;
- `responsible_side`: `moonsleep`, `partner`, `shared`, or `unclear`;
- `statement_summary`: bounded source-grounded summary;
- `explicitness`: `explicit`, `strongly_implied`, or `ambiguous`;
- `candidate_open_loop_id`: optional existing loop subject;
- `candidate_title`: optional concise title;
- `candidate_action`: `create`, `attach`, `transition`,
  `propose_resolution`, `informational_only`, or `needs_review`;
- `referenced_subjects`: stable subject references;
- `evidence_fragment_refs`: exact source fragments;
- `requires_human_review`: boolean;
- `review_reason`: optional explicit reason.

One message may produce several atomic signal facts. One signal fact cannot
silently update several open loops.

### `moonsleep.partner.structured-claim.v1`

Purpose: preserve one atomic date, amount, quantity, document, or external
subject claim from a communication or attachment.

Typed payload:

- `claim_type`: `money`, `quantity`, `date`, `time_window`, `document`,
  `external_subject`, or `status_statement`;
- `claim_role`: a Partner-owned bounded role such as `amount_due`,
  `promised_completion`, `shipment_departure`, `ordered_quantity`, or
  `invoice_reference`;
- `value_text`: exact normalized string representation;
- `currency_code`: optional ISO currency code;
- `minor_units`: optional integer represented as a decimal string;
- `quantity_text`: optional exact decimal string;
- `unit_code`: optional canonical unit;
- `date_value`: optional exact calendar date;
- `timestamp_value`: optional exact UTC timestamp;
- `time_window_start` and `time_window_end`: optional exact bounds;
- `external_subject_reference`: optional stable subject reference;
- `source_quote_digest`: digest of the exact supporting fragment;
- `explicitness`: `explicit`, `strongly_implied`, or `ambiguous`.

Amounts and quantities use exact strings where provider values could exceed
safe integer precision. A claim reported in a partner message remains a claim;
it does not become Finance or Supply truth.

### `moonsleep.partner.source-coverage.v1`

Purpose: give every in-scope current source revision an explicit disposition.

Typed payload:

- `source_logical_record_id`
- `source_revision_sha256`
- `coverage_disposition`: `open_loop_evidence`, `informational`,
  `provider_system`, `attachment_only`, or `needs_review`;
- `candidate_open_loop_ids`
- `coverage_reason`
- `coverage_policy_version`
- `requires_human_review`

`open_loop_evidence` requires at least one candidate or reviewed open-loop
reference. Other dispositions cannot carry open-loop references.

### `moonsleep.partner.workspace-admission.v1`

Purpose: propose or record Partner workspace admission for one exact source
revision after identity ingress.

Typed payload:

- `canonical_partner_entity_id`
- `contact_id`
- `partner_category`: `vendor`, `fulfillment_partner`, `logistics_partner`,
  `packaging_partner`, `marketplace_partner`, `professional_service`, or
  `creator_partner`;
- `admission_status`: `confirmed`, `probable`, `unresolved`, or `ambiguous`;
- `decision_origin`: `exact_provider_anchor`, `operator_review`,
  `model_proposal`, or `none`;
- `evidence_fragment_refs`
- `requires_human_review`

Only exact-provider-anchor and operator-review decisions are eligible for
canonical Partner admission.

## Partner Observation Profiles

Observations are immutable interpretations built from sealed fact sets. Each
profile has an independent active version.

### `moonsleep.partner.workspace-state.v1`

Head key:

```text
workspace_id
+ observation_profile_id
+ canonical_partner_entity_id
```

Typed payload:

- canonical partner entity ID;
- reviewed partner categories;
- reviewed person-to-organization relationships;
- admitted contact IDs and provider connections;
- current native-conversation references;
- unresolved identity and admission counts;
- source freshness by provider;
- current open-loop IDs;
- exact source-coverage summary.

This observation does not own canonical identity. It references reviewed Nex
identity state.

### `moonsleep.partner.open-loop-state.v1`

Head key:

```text
workspace_id
+ observation_profile_id
+ canonical_partner_entity_id
+ open_loop_id
```

Typed payload:

- immutable open-loop ID;
- canonical partner entity ID;
- concise title and operational summary;
- topic labels;
- semantic lifecycle: `open`, `waiting_on_partner`,
  `waiting_on_moonsleep`, `blocked`, `resolved`, `superseded`, or
  `dismissed`;
- responsible side;
- primary evidence revision;
- all supporting evidence revisions;
- closure evidence revisions when resolved;
- related external subject references;
- explicit deadline or partner-promised date when supported;
- superseding open-loop ID when superseded;
- exact conflicting or rejected fact dispositions;
- review and promotion receipt references.

`resolved` requires exact closure evidence. `superseded` requires an existing
reviewed successor. Non-resolved states cannot carry closure evidence.

### `moonsleep.partner.source-coverage-state.v1`

Head key:

```text
workspace_id
+ observation_profile_id
+ source_logical_record_id
```

Typed payload:

- current source revision identity;
- current explicit coverage disposition;
- reviewed open-loop references;
- superseded source revision references;
- proposal conflicts;
- review receipt;
- missing or blocked reason.

When a provider message receives a new revision, the prior coverage observation
remains historical. The resolver evaluates the new revision and advances the
head only through expected-head comparison.

## Open-Loop And Workflow Boundary

The open-loop observation owns source-derived and reviewed semantic state:

- what the loop is about;
- which partner it belongs to;
- what evidence supports it;
- who appears to owe the next substantive response;
- whether it is blocked, resolved, or superseded;
- what external subjects it references.

The Partner-owned workflow store owns operator activity:

- queue assignment and internal owner;
- snooze and reminder schedule;
- internal notes;
- manual priority overrides;
- draft preparation;
- send approval;
- provider send attempts and receipts;
- collision and single-writer controls.

Workflow state never changes an observation's evidence meaning. A snooze does
not make a loop resolved. A draft does not count as outbound evidence. A sent
message can become evidence only after the provider adapter observes and
ingests the provider-confirmed result.

## Deterministic Resolvers

Partner resolvers use typed rules over sealed fact sets. They do not use
semantic-memory similarity as operational authority.

### Communication Classification Resolver

Subject: one logical source message and exact current revision.

Inputs:

- sealed set of source-bound classification facts;
- reviewed contact/entity links;
- active classification policy;
- prior classification observation head, if any.

Outputs:

- no semantic change and replay receipt;
- a candidate Partner admission or exclusion;
- a blocked result requiring identity or content review.

### Source Coverage Resolver

Subject: one logical source message.

It selects exactly one current coverage disposition. Competing proposal
batches, ambiguous revision heads, cross-thread lineage, or missing current
revision evidence fail closed into review.

### Open-Loop Association Resolver

Subject: one canonical partner workspace and bounded communication cohort.

For each signal fact it returns exactly one disposition:

- supports an existing loop;
- proposes a new loop;
- proposes a lifecycle transition;
- proposes resolution;
- informational only;
- blocked pending review.

It may use exact subject references and reviewed prior open-loop evidence.
Text similarity alone cannot merge two loops.

### Open-Loop State Resolver

Subject: one open-loop ID.

Inputs:

- sealed eligible fact set;
- current expected open-loop head;
- active observation profile and resolver policy;
- operator review receipt when required.

The resolver atomically records:

- supporting facts;
- contradicted facts;
- superseded facts;
- irrelevant facts;
- blocked facts;
- successor observation or no-change receipt;
- projection outbox event.

A stale expected head fails closed. Two canonical successor heads are never
silently created.

## Evidence Precedence

Evidence precedence is deterministic and domain-specific:

1. exact source revisions and attachment bytes outrank summaries;
2. reviewed identity bindings outrank model or similarity proposals;
3. operator-promoted explicit source claims outrank unreviewed extraction;
4. deterministic parser facts outrank model inference when both interpret the
   same exact field;
5. explicit statements outrank strongly implied or ambiguous statements;
6. a later statement supersedes an earlier statement only when both address
   the same reviewed subject and the later evidence explicitly changes it;
7. source time alone never proves supersession or closure;
8. signed or provider-authored documents may outrank chat paraphrases for the
   document's stated fields, but they remain claims until the owning domain
   promotes them;
9. Finance, Supply, Dispatch, and Control Tower observations outrank Partner
   communication claims for their owned operational state;
10. model inference never overrides reviewed evidence.

Equal-precedence conflicting evidence produces a blocked candidate and review
item. Missing evidence produces an explicit missing reason; it does not
produce zero, false, empty text, or an inferred date.

## Review, Promotion, And Correction

### Proposal

Model and deterministic extraction produce immutable facts and candidate
observations. They carry no operational authority.

Every candidate binds:

- exact sealed input set and member digest;
- source revision and fragment references;
- profile, producer, model, prompt, taxonomy, resolver, and policy versions;
- expected current observation head;
- candidate payload digest;
- exact review requirements.

### Review

An authenticated operator may:

- accept;
- reject;
- correct;
- split;
- merge proposals without merging identities;
- defer;
- mark blocked with a reason.

Review produces an immutable receipt bound to the candidate, exact evidence
set, reviewer identity, decision, corrected payload digest, and expected head.

### Promotion

Promotion atomically:

- revalidates the sealed set;
- checks the expected observation head;
- creates or reuses the successor observation;
- records evidence dispositions and links;
- records the promotion receipt;
- advances the canonical head;
- emits the projection outbox event.

An identical replay returns the existing receipt and creates nothing.

### Correction

Corrections never rewrite facts or observations. A correction creates:

- corrected facts when extraction was wrong;
- a successor observation when interpretation changes;
- contradiction, supersession, or derivation links as appropriate;
- a new review and promotion receipt;
- a projection rebuild or incremental update.

Rollback switches the active profile or head pointer to an already validated
state. It never deletes candidate or historical evidence.

## Sealed Sets And Idempotency

Partner Desk uses three sealed-set families.

### Extraction Source Set

Members are exact immutable source revisions selected for one extraction run.

Seal binds:

- provider and connection;
- logical source identities and exact revision digests;
- count and canonical sorted member digest;
- lower and upper capture bounds;
- extractor profile and producer version;
- creation and seal receipts.

### Resolver Fact Set

Members are exact fact element IDs eligible for one subject and resolver
profile.

Seal binds:

- canonical partner entity and stable subject;
- fact profile families and versions;
- count and canonical sorted member digest;
- resolver and policy versions;
- expected observation head.

### Comparison Set

Members bind old and candidate observation heads and projection artifacts for
shadow/backfill comparison.

Membership cannot change after sealing. Jobs revalidate the same seal inside
their atomic commit.

Canonical replay identities include:

- source extraction:
  source-set digest plus extractor/profile/producer versions;
- fact:
  fact profile and version, subject reference, typed payload digest, source
  revision digest, fragment digest, and producer version;
- resolver:
  resolver fact-set digest, observation profile, resolver policy, expected
  head, and review receipt when required;
- projection:
  active observation-head set digest plus projection version;
- review:
  candidate digest, sealed-set digest, expected head, reviewer identity, and
  canonical decision payload.

The same identity and same bytes return an idempotent receipt. The same
identity with different bytes fails closed.

## Jobs, Subscriptions, And Reconciliation

### Job Graph

```text
provider capture or shared ingestion
  -> record.ingested
  -> ingress identity orchestration
  -> Partner fact extraction
  -> sealed fact-set creation
  -> shadow Partner resolvers
  -> review or governed promotion
  -> projection outbox
  -> Partner read-model update
```

### Source Jobs

- Gmail remains owned by the shared Gmail substrate.
- Alibaba capture is a bounded read-only schedule, initially every 15 minutes,
  with rolling overlap and authentication-health checks.
- Future iMessage capture remains owned by its adapter.

Source capture and Partner projection are separate jobs. A disabled Partner
resolver never blocks durable source ingestion.

### Subscription Rules

Partner subscriptions match only:

- admitted provider platform;
- exact source family;
- required source-record profile;
- Partner app source-manifest identity.

They do not subscribe to every record globally. A record event launches
bounded extraction; it does not directly mutate Partner observations or
workflow.

### Single Flight And Concurrency

- Source capture is single-flight per connection.
- Extraction is single-flight per logical source revision and producer
  version.
- Resolution is single-flight per observation head key.
- Projection is single-flight per Partner workspace and projection version.
- Independent partners may process concurrently.
- A stale expected head retries from a newly sealed fact set; it never forks a
  canonical head.

### Retries And Dead Letters

Retries use exponential backoff, bounded attempt counts, and the same
idempotency identity.

A failed run:

- does not advance the source cursor;
- does not unseal or mutate its input set;
- does not partially promote observations;
- does not emit a successful projection event;
- retains exact error classification and attempt receipt.

Permanent validation, identity, source-integrity, or head conflicts enter a
dead-letter and review queue. Credential or provider-session failures enter
source health and do not trigger credential recovery or provider writes.

### Reconciliation

Periodic reconciliation compares:

- provider/source run receipt bounds and cursors;
- admitted record revision count and digest;
- extracted fact coverage;
- sealed-set count and digest;
- current observation heads;
- projection head-set digest;
- review and dead-letter counts;
- source freshness and schedule health.

Alibaba additionally runs a bounded overlap reconciliation pull. Gmail and
future iMessage use the owning adapter's reconciliation contract.

## Partner Projections

Partner projections are rebuildable read models, not canonical evidence.

### Partner Workspace

Displays:

- canonical organization and people;
- reviewed contacts and provider accounts;
- partner categories and relationships;
- source freshness by provider;
- active, waiting, blocked, and recently resolved loops;
- referenced purchase orders, invoices, payments, shipments, samples,
  products, documents, and attachments.

### Native Conversations

Provider-native Gmail, Alibaba, and iMessage conversations remain distinct.
Partner Desk may render a unified entity timeline, but it never fabricates one
cross-provider thread.

### Open-Loop Queue

Queue views include:

- waiting on MoonSleep;
- open and unassigned;
- blocked;
- waiting on partner with follow-up due;
- overdue;
- needs review;
- recently resolved.

Semantic loop state comes from the active observation head. Assignment,
snooze, internal priority, and drafting come from the Partner workflow store.

### Review Surfaces

Review surfaces include:

- unresolved or ambiguous identity;
- Partner admission;
- unclassified source revisions;
- competing coverage proposals;
- proposed open-loop creation, attachment, split, merge, transition, or
  resolution;
- stale-head conflicts;
- missing or contradictory evidence;
- shadow-profile differences.

## Display Provenance

Every displayed derived value must resolve through:

```text
projection field
  -> active observation head or workflow receipt
  -> supporting fact and disposition
  -> exact source fragment and source revision
  -> record-ingest and source-run receipts
```

The UI exposes a provenance drawer for derived values. It may show:

- source provider and native conversation;
- source time and capture time;
- exact revision digest;
- attachment reference;
- fact profile and producer version;
- resolver and observation profile versions;
- review and promotion receipt;
- superseded or contradictory evidence.

Missing values use explicit Partner missing reasons:

- `source_not_captured`
- `source_revision_ambiguous`
- `identity_unresolved`
- `partner_admission_unreviewed`
- `fact_not_extracted`
- `conflicting_evidence`
- `review_required`
- `owning_domain_unavailable`
- `not_applicable`
- `withheld_by_authority`

The UI never substitutes zero, false, empty text, or a guessed value for a
missing value.

## Historical Backfill And Evolution

### Baseline Migration

The existing Partner Desk proposal and review records predate the canonical
fact/observation substrate. Migration treats them as immutable historical
evidence:

1. select exact proposal and review record revisions;
2. seal the migration cohort;
3. create equivalent typed Partner facts;
4. create shadow workspace, coverage, and open-loop observations;
5. compare the existing deterministic projection with the candidate
   observation-driven projection;
6. classify every difference;
7. require review for identity, lifecycle, closure, and material reference
   changes;
8. promote accepted heads;
9. retain original records and migration receipts;
10. switch the active projection only after parity.

The old proposal/review record store remains readable until rollback and
retention gates pass. It is not rewritten or silently discarded.

### Alibaba Historical Backfill

The complete admitted Alibaba corpus is processed in bounded sealed cohorts.
The backfill:

- validates every source revision and attachment;
- extracts facts idempotently;
- resolves in shadow mode;
- assigns explicit source coverage;
- reconciles native conversations and logical messages;
- repeats the complete run;
- requires zero new records, facts, observations, identities, contacts,
  reviews, jobs, or queue rows on the identical second run.

### Gmail Historical Backfill

Partner Desk consumes existing Gmail records and generic classifier facts.
It selects partner-relevant records without duplicating Gmail ingestion.
Reviewed contacts associate channels to the same partner entity while native
threads remain separate.

### Profile Evolution

Adapter, source-revision, extractor, fact-profile, resolver,
observation-profile, projection, and UI versions evolve independently.

Meaningful changes run in shadow:

- old and candidate profiles coexist;
- candidate facts do not rewrite old facts;
- candidate observations do not advance active heads;
- historical comparison classifies all material differences;
- review gates promotion;
- rollback changes active profile pointers.

## Validation

### Focused Contract Tests

Tests must prove:

- profile validation rejects unknown or malformed payloads;
- exact source revision and fragment binding;
- unsafe numeric values are rejected or represented as exact strings;
- identity uses exact anchors and reviewed links only;
- no provider or operational write methods are exposed;
- one message may support several independent loops;
- one loop may span native channels for one reviewed partner;
- native provider threads remain separate;
- every current source revision receives one explicit coverage disposition;
- resolved loops require closure evidence;
- superseded loops require an existing successor;
- workflow state cannot fabricate evidence state;
- displayed values preserve complete provenance.

### Cleanroom Proof

The cleanroom uses the exact Nex core, Partner package, adapter package, source
manifests, and registered profiles intended for release.

It proves:

- clean install and replayed install;
- source adapters remain read-only;
- synthetic Gmail, Alibaba, and iMessage-shaped records ingest through public
  operations;
- exact provider revisions create expected facts;
- sealed sets reject mutation after sealing;
- shadow resolvers cover every fact;
- reviewed promotion atomically advances one head;
- projection rebuild equals incremental projection;
- restart preserves queues, heads, receipts, and source checkpoints;
- deactivation disables Partner work without deleting source evidence;
- complete uninstall leaves provider records and shared identity untouched.

### Hostile Proof

Hostile tests include:

- source payload or revision digest tamper;
- fragment outside the admitted source revision;
- cross-connection or cross-thread lineage;
- provider-native thread mapped to several entities;
- similarity-only identity merge;
- missing or malformed attachment;
- duplicate or reordered set members;
- member addition after set sealing;
- replay with changed bytes under the same identity;
- stale expected observation head;
- concurrent successor attempts;
- competing proposal batches;
- model proposal presented as reviewed truth;
- coverage and loop evidence disagreement;
- closure without exact evidence;
- supersession without a valid successor;
- source checkpoint advancement after partial failure;
- raw credential or session material in admitted payload;
- provider write authority enabled in a read-only release;
- projection field without resolvable provenance.

### Replay And Concurrency Proof

The same source cohort runs twice. The second run creates zero duplicate:

- source records or revisions;
- contacts, contact observations, entities, or merge proposals;
- facts or fact links;
- sealed sets;
- candidate or promoted observations;
- review or promotion receipts;
- projection rows;
- jobs, queue items, or dead letters.

Concurrent resolver attempts for the same head key yield one committed
successor and one stale-head result. Concurrent work for different partner
entities may succeed independently.

### Golden Journey

The initial golden journey uses a reviewed Surewal cohort containing:

1. an Alibaba inbound question about production timing;
2. a related attachment with an explicit quantity or date;
3. an Alibaba response or MoonSleep outbound follow-up;
4. a Gmail continuation from a reviewed Surewal contact;
5. a separate unrelated product or payment question in the same native thread;
6. explicit resolution evidence for one loop while the other remains open.

The proof must show:

- Surewal organization and Rebecca person/contact identity;
- distinct Alibaba and Gmail native conversations;
- one cross-channel reviewed open loop;
- one separate loop from the same Alibaba thread;
- exact facts, source fragments, sealed sets, observations, and receipts;
- correct waiting side and lifecycle;
- source-linked closure for only the resolved loop;
- complete source coverage;
- identical replay with zero duplicate durable state.

## Production Activation

### Build And Install

Immutable package and cleanroom artifacts are built outside MoonSleep's
canonical production deployment lock.

The short install transaction:

- verifies the exact core and package manifests;
- verifies registered profile digests;
- installs or upgrades Partner Desk inactive;
- creates jobs and subscriptions disabled;
- applies only Partner-owned projection storage changes;
- preserves source records, shared identity, and other domain state;
- records an install and rollback receipt;
- releases the lock after exact postflight.

Installation performs zero provider calls and grants zero provider write
authority.

### Shadow Activation

Activation proceeds in stages:

1. verify Gmail, Alibaba, and Nex source health read-only;
2. run the reviewed Surewal golden cohort;
3. run a bounded historical shadow cohort;
4. review identity, coverage, loop, and provenance output;
5. backfill the complete Alibaba corpus twice;
6. add partner-relevant Gmail shadow facts and observations;
7. compare old and candidate projections;
8. promote accepted active profiles;
9. enable bounded record-event subscriptions;
10. enable the Alibaba capture schedule only under its separate source receipt;
11. monitor sustained reconciliation, replay, and restart.

No stage enables provider send authority.

### Rollback

Rollback may:

- disable Partner subscriptions and schedules;
- restore the previous active observation and projection profile pointers;
- restore the prior Partner package release;
- rebuild the prior projection from retained observation heads.

Rollback does not:

- delete provider records;
- delete facts, observations, sealed sets, or receipts;
- undo reviewed identity merges;
- mutate Gmail, Alibaba, or iMessage;
- alter Finance, Supply, Dispatch, Control Tower, or Helpdesk state.

### Health And Audit Readback

Production health reports:

- installed core, Partner package, adapter, and source-manifest identities;
- active fact, observation, resolver, and projection profiles;
- source freshness by provider and connection;
- last successful source run and cursor/checkpoint receipt;
- source records and current revisions;
- fact extraction coverage;
- sealed-set count and digest;
- shadow, review, promotion, and stale-head counts;
- active open loops by lifecycle;
- unclassified and conflicting source revisions;
- projection head-set digest and last rebuild;
- queue and dead-letter depth;
- retry age and oldest pending work;
- provider read and write authority declarations;
- subscription and schedule enablement;
- rollback state.

Terminal activation requires:

- exact release and profile identities;
- healthy source reads;
- zero unresolved integrity errors;
- zero duplicate durable state on replay;
- one canonical head per Partner observation key;
- projection provenance for every displayed value;
- provider write authority false;
- no unrelated domain mutation;
- successful rollback rehearsal.

## Current Implementation Transition

The existing Partner Desk 0.2.x implementation already preserves several
domain invariants:

- provider-native conversations remain evidence boundaries;
- one conversation may contain several open loops;
- one message may support several loops;
- identity and workspace admission require exact anchor or operator review;
- model proposals remain outside the operational queue;
- source coverage is explicit;
- resolved loops require closure evidence;
- native threads can span one reviewed partner without being merged together;
- provider and operational write authority are absent.

Its proposal and review ledgers currently persist specialized immutable Nex
records and resolve their heads inside the app. The target implementation
migrates those semantics onto canonical Nex facts, observations, sealed sets,
expected-head comparison, and promotion receipts. That is an implementation
migration, not a conflict with the core model.

## Non-Goals

This design does not:

- replace exact provider records with summaries;
- create a Partner-specific observation database;
- force Helpdesk, Finance, Supply, Dispatch, or Control Tower into Partner
  payloads;
- make every communication a task;
- make every extracted claim canonical;
- merge identities from similarity;
- fabricate cross-provider conversations;
- treat a projection as evidence;
- activate drafting or sending;
- grant provider or operational authority through identity or evidence state.
