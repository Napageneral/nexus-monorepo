# Alibaba Messenger Evidence Adapter

**Status:** CANONICAL
**Last Updated:** 2026-07-22
**Related:** [Nex Adapter Protocol](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/adapter-protocol.md), [Jobs, Schedules, and DAGs](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/work/jobs-schedules-and-dags.md)

---

## Purpose

The Alibaba Messenger adapter provides a read-only, restart-safe evidence boundary between an authenticated Alibaba buyer account and Nex.

MoonSleep owns browser authentication, capture, supplier relationships, purchase orders, shipments, payments, inventory, and every operational mutation. Nex owns normalized records, durable deduplication, search, events, and work orchestration.

## Source model

The adapter consumes the sanitized projection of completed authenticated browser snapshots. A completed snapshot contains:

- a capture summary
- normalized supplier conversations
- normalized messages
- downloaded attachment evidence
- extracted searchable attachment text where available

Matching root and adapter completion receipts bind projection digests, counts, capture time, and read-only authority. Raw browser exports are immutable evidence but are not valid adapter input. They can contain signed URLs, encrypted provider identifiers, and session material.

## Record model

One Alibaba Messenger message maps to one canonical Nex record.

- platform: `alibaba`
- external record id: connection, message identity, and exact revision hash
- space: the authenticated MoonSleep Alibaba buyer account
- container and thread: the supplier conversation id
- sender and receiver: derived from message direction and sanitized conversation identity
- content: message body plus bounded extracted attachment text
- opaque payload: exact sanitized provider JSON line, its SHA-256, and exact snapshot/projection receipt references
- attachments: bounded local evidence path, MIME type, size, and verified SHA-256 when available

The normalized record must not contain raw capture objects, chat tokens, signed attachment URLs, cookies, or encrypted session identifiers. The sanitized provider JSON line is authoritative source evidence and is not merged into Nex metadata.

If the provider attachment index references a message absent from the normalized message export, the adapter emits a separate `orphan_attachment` evidence record in the same native conversation. It preserves the exact sanitized attachment row, digest, bytes, extracted text, unresolved attribution, and an explicit `orphan_attachment_evidence` coverage disposition. It must never silently drop the row or guess its sender.

## Delivery and deduplication

Historical capture uses exact lower and optional upper time bounds. Ongoing monitoring replays a rolling time overlap from the latest completed snapshot. Nex deduplicates by platform and external record id.

The overlap is intentional. It gives the adapter at-least-once restart behavior without advancing an adapter-local cursor before Nex durably accepts a record.

## Authority boundary

The adapter exposes no remote mutation methods. It cannot:

- send supplier messages
- place or change orders
- initiate or reconcile payments
- alter shipping, routing, inventory, or customer promises
- promote model interpretations into canonical MoonSleep business truth

Downstream Partner Desk projection may propose independent open loops with explicit source coverage. Model output cannot create, resolve, merge, supersede, dismiss, or mutate a canonical loop without the reviewed operation contract.
