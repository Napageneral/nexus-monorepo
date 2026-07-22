# MoonSleep Partner Desk projection

**Status:** CANONICAL
**Last updated:** 2026-07-22

## Product decision

Partner Desk tracks independent supplier and partner open loops. Provider-native
threads are evidence containers, not task containers. Categories and labels are
descriptive facets, not lifecycle state.

The design is grounded in MoonSleep's Alibaba corpus: 55 conversations, 7,707
messages, 1,148 attachment hints, and one Surewal conversation with more than
6,000 messages. The Surewal thread simultaneously contains questions about
product materials, pricing, purchase-order changes, production batches,
shipment schedules, samples, payment follow-up, quality tests, and future
factory capacity. A conversation-level awaiting-response flag cannot represent
that work truthfully.

## Source and identity boundaries

The projection consumes immutable communication records and exact revision
digests from Nex. Every record retains its provider, connection, native thread,
native message, timestamp, direction, bounded summary, and attachment count.

Canonical identity must come from an exact provider anchor or operator review.
Names, addresses, message similarity, and model output are evidence only. A
provider-native thread cannot silently resolve to several canonical entities.

## Partner open loops

A reviewed open loop contains:

- a stable open-loop identifier and canonical partner entity;
- a primary source record and one or more evidence source records;
- a concise title and operational summary;
- optional labels, owner, and follow-up time;
- lifecycle state: open, waiting on MoonSleep, waiting on partner, blocked,
  resolved, superseded, or dismissed;
- exact closure evidence when resolved;
- an explicit successor when superseded;
- review state and assertion origin.

An open loop may use evidence from Alibaba and Gmail when every record resolves
to the same canonical partner. The provider-native threads remain separate.

Model output may propose new loops, labels, splits, merges, lifecycle changes,
or closure. A proposal never enters the operational queue until reviewed.

## Coverage

Every in-scope source record receives one explicit disposition:

- evidence for one or more open loops;
- informational;
- provider system event;
- attachment-only evidence; or
- needs review.

A source record may support several loops. Unclassified records remain visible
in review; they are never silently dropped.

## Operational projection

The projection produces:

- chronological entity timelines;
- provider-native threads with linked open-loop identifiers;
- all non-terminal open loops;
- an attention queue for open, blocked, or waiting-on-MoonSleep loops;
- a separate waiting-on-partner follow-up queue;
- review items for identity, partner classification, source coverage, and loop
  proposals.

## Authority boundaries

The projection cannot:

- send or modify Gmail or Alibaba messages;
- create, merge, split, or supersede canonical Nex identities;
- create or mutate purchase orders, production batches, shipments, routing,
  inventory, payments, invoices, or customer promises;
- promote extracted claims into Supply or Finance truth;
- close a loop without source-linked evidence;
- hide an in-scope source record without an explicit disposition.

Reply drafting and sending are a later, separately authorized phase. Drafts
must remain source-linked, operator-approved, provider-scoped, and auditable.
