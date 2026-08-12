---
title: Alibaba Identity Directory v1
summary: Versioned read-only contract for Alibaba people, organizations, conversations, participation, and reviewed membership proposals.
---

# Alibaba Identity Directory v1

Contract id: `alibaba.identity-directory.v1`. Snapshot receipt version: `2`.

This contract is evidence projection only. It cannot send Alibaba messages, change orders or payments, route inventory, mutate supplier/customer state, apply entity merges, approve memberships, or activate a public surface.

## Concepts and identifiers

| Concept | `identity_type` | Stable provider identity | Promotion rule |
| --- | --- | --- | --- |
| Person/contact | `person` | `alibaba:person:ali:<ali_id>`; account-only fallback is review-required | Stable Ali ID may seed one platform contact. Equal names or employers never merge people. |
| Organization | `organization` | provider organization id when present; otherwise a normalized-name evidence id | Name-only rows remain `name_only_review_required`, `merge_eligible: false`. |
| Conversation/channel | `conversation` | `alibaba:conversation:<cid>` | Always remains a channel identity; never becomes a person. |
| Participation | `participation` | SHA-256 of person identity plus conversation identity | Observed channel membership only. |
| Employment/membership | `membership` | SHA-256 of person identity plus organization identity | Always `review_state: proposed` and `automatic_promotion_allowed: false`. |

Every row has `schema_version: 1`, `provider: alibaba`, a stable `provider_identity_id`, and exact `source_provenance` entries with source snapshot, source row identity, capture timestamp, and SHA-256 of the sanitized source fields used. Arrays are unique and deterministically sorted. Replaying identical sealed evidence produces byte-identical JSONL.

## Messages

The sanitized message projection retains `senderAliId`, `receiverAliId`, `senderName`, and `receiverName`. The adapter emits:

- `routing.sender_id`: the author;
- `payload.recipients`: the addressed participant for a direct message, or the conversation audience when a group recipient is not person-specific;
- `routing.connection_id`: the local Nex observation lane;
- `routing.container_id`: Alibaba `cid`;
- `routing.container_kind`: `direct` or `group` from the sealed directory;
- `payload.metadata.adapter_contacts`: provider-stable people observed in that conversation, with aliases;
- immutable message identity based on provider message id; revisions remain hash-bound to sanitized provider evidence.

The local connection never substitutes for an outbound supplier recipient. A direct v2 message with no stable author/recipient resolution fails closed. A group conversation may truthfully use its channel audience rather than invent a person receiver.

Older outbound rows may omit `receiverAliId`. For a direct conversation only, the adapter uses the conversation contact's stable Ali ID as the authoritative counterparty. It does not count every observed participant because the sealed directory also legitimately contains MoonSleep's own provider person identity. If the direct conversation contact is absent or ambiguous, ingestion fails closed.

## Name history and organizations

All names observed for one stable Ali ID are retained in `name_history`; the current display name and aliases are projections of that history. A shared company name may propose two memberships to one organization but can never merge the two people. Company-name equality alone never creates or applies an entity merge.

## Fixtures and acceptance cases

The executable fixture in `scripts/alibaba/automation/identity-directory.test.mjs` and adapter fixture in `src/adapter.test.ts` cover:

1. direct Janet Liu conversation;
2. Janet Liu and Aim Feng as distinct contacts at Yangzhou Dulala Crafts Ltd.;
3. Janet Liu to Janet Chen name history;
4. a Surewal group conversation distinct from Rebecca Liu;
5. inbound and outbound participant routing;
6. missing/ambiguous company identity failing closed to no organization or a review-only name row;
7. deterministic replay, zero automatic merges, and review-only memberships.

## Historical stages

1. `SOURCE READY`: committed capture, adapter, and runtime sources plus focused cleanroom proof.
2. `HISTORICAL PREVIEW`: bounded sealed-capture report; no Nex write.
3. `REVIEWED PROMOTION`: separate resumable manifest applying reviewed contacts, organizations, membership assertions, and message revisions.
4. `PRODUCTION DEPLOYED`: only after exact contacts/entities/channels/message joins are read back from production.

Promotion depends on the separately reviewed Nex organization-membership contract. Source readiness does not imply schema enablement, backfill, promotion, public activation, or deployment.
