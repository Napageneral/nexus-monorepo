# MoonSleep Partner Communications

**Status:** CANONICAL
**Last Updated:** 2026-07-21

---

## Operator experience

MoonSleep operators have one place to see conversations with factories,
fulfillment nodes, packaging suppliers, carriers, marketplace partners,
professional services, and creator partners.

The left queue shows conversations awaiting MoonSleep first, ordered by the
oldest unanswered partner message. The center shows the provider-native thread.
The right context panel shows the reviewed partner entity and links to relevant
operational read models such as products, purchase orders, production batches,
shipments, invoices, and attachments.

Gmail and Alibaba conversations with the same reviewed partner appear on one
entity timeline, but they are never rewritten into a fictional cross-provider
thread. Every message keeps its immutable source record and revision digest.

## Inputs

The projection consumes public Nex contracts only:

- immutable communication records and their exact source revision digest;
- provider, connection, native thread, native message, timestamp, direction,
  bounded summary, and attachment count;
- canonical entity/contact resolution produced by an exact provider anchor or
  explicit operator review;
- a confirmed workspace classification assertion.

Names, email addresses, phone numbers, message similarity, and model output are
evidence. They do not establish canonical identity.

## Projection

The projection produces:

- one chronological timeline per canonical partner entity;
- one thread per provider, connection, and provider-native thread identifier;
- deterministic `awaiting_moonsleep` or `awaiting_partner` state;
- oldest-unanswered-first queue order;
- an explicit review queue for unresolved, ambiguous, model-only, or
  unconfirmed classifications.

Model output may propose classifications, relationship links, purchase-order
references, shipment references, dates, quantities, and other facts. A model
proposal never enters canonical identity or operational truth without the
owning domain's acceptance operation.

## Authority boundaries

This projection cannot:

- send or modify Gmail or Alibaba messages;
- create, merge, split, or supersede canonical identities;
- create or mutate purchase orders, production batches, shipments, routing,
  inventory, payments, invoices, or customer promises;
- convert extracted claims into Supply or Finance truth;
- hide an in-scope source record without an explicit disposition.

The shared communications plane owns immutable messages, native threads,
classifications, and coverage. Nex identity owns canonical entity/contact
resolution. Supply and Finance own their operational records. The partner
workspace is a read projection plus review surface across those boundaries.
