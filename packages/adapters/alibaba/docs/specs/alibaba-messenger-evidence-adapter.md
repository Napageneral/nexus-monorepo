# Alibaba Messenger Evidence Adapter

**Status:** CANONICAL
**Last Updated:** 2026-07-17
**Related:** [Nex Adapter Protocol](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/adapter-protocol.md), [Jobs, Schedules, and DAGs](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/work/jobs-schedules-and-dags.md)

---

## Purpose

The Alibaba Messenger adapter provides a read-only, restart-safe evidence boundary between an authenticated Alibaba buyer account and Nex.

MoonSleep owns browser authentication, capture, supplier relationships, purchase orders, shipments, payments, inventory, and every operational mutation. Nex owns normalized records, durable deduplication, search, events, and work orchestration.

## Source model

The adapter consumes completed authenticated export snapshots. A completed snapshot contains:

- a capture summary
- normalized supplier conversations
- normalized messages
- downloaded attachment evidence
- extracted searchable attachment text where available

Raw browser exports are immutable evidence but are not valid adapter input. They can contain signed URLs, encrypted provider identifiers, and session material.

## Record model

One Alibaba Messenger message maps to one canonical Nex record.

- platform: `alibaba`
- external record id: `message:<Alibaba message id>`
- space: the authenticated MoonSleep Alibaba buyer account
- container and thread: the supplier conversation id
- sender and receiver: derived from message direction and sanitized conversation identity
- content: message body plus bounded extracted attachment text
- attachments: local evidence path, MIME type, size, and SHA-256 when available

The normalized record must not contain raw provider objects, chat tokens, signed attachment URLs, or encrypted session identifiers.

## Delivery and deduplication

Historical capture uses a bounded backfill. Ongoing monitoring replays a rolling time overlap from the latest completed snapshot. Nex deduplicates by platform and external record id.

The overlap is intentional. It gives the adapter at-least-once restart behavior without advancing an adapter-local cursor before Nex durably accepts a record.

## Authority boundary

The adapter exposes no remote mutation methods. It cannot:

- send supplier messages
- place or change orders
- initiate or reconcile payments
- alter shipping, routing, inventory, or customer promises
- promote model interpretations into canonical MoonSleep business truth

Downstream interpretation produces proposed or quarantined claims. MoonSleep validation and approval gates own promotion.
