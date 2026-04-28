# ACSM-008 Frontdoor Deploy And Local Dogfood Proof

## Goal

Deploy the Frontdoor catalog changes and prove the local runtime plus Operator
Console consume the deployed published catalog correctly.

## Why

The user's local Console should use the deployed Frontdoor version as the
catalog authority, not a second local-only Frontdoor variant.

## Scope

- deploy Frontdoor after catalog metadata changes pass tests
- point local runtime catalog loading at the deployed Frontdoor catalog
- verify `adapters.catalog.list` includes published setup metadata
- verify Console Add App modal shows the full published catalog
- run a live local browser proof for at least one existing-connection adapter
  and one not-installed adapter

## Acceptance

- deployed Frontdoor `/api/adapters/catalog` serves setup metadata
- local runtime pulls setup metadata from deployed Frontdoor
- Console modal renders setup options from the deployed catalog
- adding another connection does not get blocked by existing durable rows
- live proof screenshots and command outputs are linked back into this board

## Completion Notes

- Operator approval was granted on 2026-04-27.
- Frontdoor was deployed and `nexus-frontdoor.service` was active on
  `frontdoor.nexushub.sh`.
- The local runtime consumed the deployed catalog and reported 28 published
  adapters plus the retired local `git` tombstone as unpublished inventory.
- Live Operator Console proof showed the Add App modal using the deployed
  Published catalog section with 28 published adapters.
- Slack, Telegram, and WhatsApp setup flows stayed inside the modal and did not
  create durable rows before setup completion.
