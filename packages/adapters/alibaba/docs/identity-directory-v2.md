---
title: Alibaba Identity Directory v2
summary: Class-scoped Alibaba people and conversation identities with append-only sender and receiver repair.
---

# Alibaba Identity Directory v2

Adapter contract id: `alibaba.identity-directory.v2`.
Historical Nex receipt contract id: `moonsleep_alibaba_message_identity_v2`.
Snapshot receipt version: `2`.

This is a read-only evidence contract. It grants no Alibaba provider calls or writes, message sends, order/payment changes, supplier/customer changes, record re-ingestion, model calls, entity merges, membership approval, or public activation.

## Identity boundaries

The contract uses separate contact spaces so an identical provider token cannot collapse unlike concepts:

| Concept | Contact space | Stable contact token |
| --- | --- | --- |
| MoonSleep provider account | `moonsleep-alibaba` | configured account id |
| Provider person | `moonsleep-alibaba:person` | stable Alibaba Ali ID |
| Conversation audience | `moonsleep-alibaba:conversation` | `conversation:<cid>` |
| Organization | `moonsleep-alibaba:organization` | provider organization identity or reviewed name-scoped evidence identity |

People with the same organization remain separate. A direct or group conversation never becomes a person. Organizations are promoted separately from people. Employment or membership remains an explicitly reviewed relationship and is never inferred into an entity merge.

## Live message contract

The adapter keeps the existing immutable record id, source revision, routing space, connection, Alibaba conversation id, and channel key. It adds explicit class-scoped identity metadata:

- `sender_contact_space_id` identifies the author contact space without changing the routing/channel space;
- `message_receiver_id` identifies the actual addressed participant or group audience;
- `message_receiver_contact_space_id` identifies that receiver's contact space;
- `adapter_contacts` seeds provider-stable people in `moonsleep-alibaba:person` with observed names and aliases.

Inbound messages resolve the author in the person space and the receiver as the MoonSleep provider account. Outbound direct messages resolve the sender as the MoonSleep provider account and the receiver in the person space. Outbound group messages resolve the addressed audience in the conversation space. Missing or ambiguous direct participant identity fails closed.

Nex uses the explicit sender space for principal and channel-participant joins while preserving the original channel routing space. The explicit receiver space is used for direct-message recipient resolution. This prevents a legacy organization contact from being relabeled as a person.

## Historical repair and continuity

Historical repair appends a v2 identity receipt for the existing source revision. It does not ingest a new record, create a new revision, alter message content, delete or rewrite v1 receipts, or rerun semantic processing. Current identity readback selects the later v2 receipt while all v1 receipts remain durable history.

The v5 sealed manifest records exact lineage from the reviewed v4 manifest, proves unchanged source projection, directory, and message anchors, and permits only deterministic person/conversation contact-space rewrites plus their derived request hashes. Batches are bounded to 1,000 writes, resumable, idempotent, and independently promoted.

## Acceptance fixtures

The capture/operator and adapter suites cover:

1. one direct supplier conversation;
2. Janet Liu and Aim Feng as distinct people at one organization;
3. Janet Liu to Janet Chen name history;
4. one group conversation distinct from Rebecca Liu;
5. inbound and outbound author/receiver resolution;
6. missing or ambiguous company identity failing closed;
7. a legacy organization contact with Rebecca's Ali ID remaining unchanged while a new person-space contact resolves to Rebecca;
8. deterministic v1 and v2 receipt identities with append-only supersession.
