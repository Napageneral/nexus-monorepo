---
summary: "Gap analysis of all adapter packages against the current shared SDK, method-first outward contract, IAM, and validation model."
title: "Adapter Package SDK Gap Analysis"
---

# Adapter Package SDK Gap Analysis

## Purpose

This document answers one practical question:

- which adapter package categories remain blocked on the shared contract and SDK
  hard cut before truthful outward methods are operational end to end

## Customer Experience

The intended package-author experience is:

1. pick up one shared SDK surface
2. declare package metadata and capabilities once
3. emit canonical `record.ingest`
4. declare truthful outward methods once
5. package the adapter through the shared package kit
6. validate through one shared hosted ladder plus one package-local ladder

## Canonical Target State

Every adapter package should converge on:

- the shared SDK workspace
- package declarations plus derived runtime reflection including truthful `methods`
- canonical `record.ingest`
- canonical state root via `NEXUS_ADAPTER_STATE_DIR`
- one method-first outward declaration path

Non-goals:

- backwards compatibility with bundled outward channel-operation modeling
- preserving vendored SDK forks indefinitely
- continuing to treat legacy `delivery` models as acceptable target state

## Shared SDK Status

The shared SDK layer already has enough structure to support truthful
namespaced methods, but it still preserves old outward concepts in its
contract, docs, tests, and some implementation surfaces.

That means package migration remains blocked on shared contract and shared SDK
cutover work.

## Main Gap Types

### Gap 1. Old Go handler and outward operation names

Legacy packages and forks still center:

- `DeliverySend`
- `DeliveryDelete`
- `DeliveryReact`
- `DeliveryEdit`
- `EventBackfill`

Those are old-world outward abstractions and must be replaced by truthful
namespaced methods.

### Gap 2. Old inbound event type

Legacy packages and forks still center:

- `NexusEvent`

Canonical target remains:

- `record.ingest`
- `AdapterInboundRecord`

### Gap 3. Vendored SDK forks

Vendored SDK forks create three problems:

1. package code can stay green while drifting from the canonical shared SDK
2. bug fixes must be copied across forks
3. agents cannot rely on one shared authoring surface

### Gap 4. Outward communication and provider mutation still modeled through bundled delivery

Many packages still expose outward communication or provider mutation through
bundled delivery-style operations.

That is now off-canon.

### Gap 5. TS package code lagging behind the TS SDK

Several TS adapters still import older names and still assume the old outward
model.

## Package Waves

The package fleet now falls into three practical migration waves:

1. communication adapters:
   - Slack
   - Eve / iMessage
   - Discord
   - WhatsApp
   - Telegram
2. provider/work/content adapters:
   - Jira
   - Git
   - Qase
   - Confluence
3. duplicate or namespace cleanup adapters:
   - LinkedIn
   - Gog / Gmail
   - Twilio residue cleanup

## Recommended Migration Order

The right order is:

1. lock the shared SDK contract to the method-first outward model
2. cut shared SDK implementation
3. migrate shared-Go packages directly on the shared SDK
4. migrate vendored-fork Go packages
5. migrate TS adapters
6. run package-specific validation

The package fleet should not be migrated one-by-one against an unsettled shared
SDK contract.
