---
summary: "Execution board for making published adapter setup metadata flow from adapter source through Frontdoor, local runtime catalog, and Operator Console setup."
title: "Adapter Catalog Setup Metadata Board"
---

# Adapter Catalog Setup Metadata Board

## Purpose

This board turns the adapter catalog setup metadata spec into executable work.

The goal is a fully catalog-backed Add App flow:

- adapter authors declare setup methods once
- package publishing extracts setup metadata from the adapter declaration
- Frontdoor serves the published adapter catalog with setup metadata
- the local runtime merges published, installed, workspace, and live adapter
  data without losing setup metadata
- the Operator Console renders setup inside the modal
- durable connection rows appear only after successful setup
- every supported adapter is published with correct setup metadata

## Canonical Inputs

- [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
- [Adapter Catalog Setup Metadata](/Users/tyler/nexus/home/projects/nexus/docs/specs/platform/adapter-catalog-setup-metadata.md)
- [Unified Adapter SDK API](/Users/tyler/nexus/home/projects/nexus/packages/adapters/nexus-adapter-sdks/docs/specs/UNIFIED_ADAPTER_SDK_API.md)
- [Package Author Experience](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-author-experience.md)

## Gap Analysis

Current reality:

- adapter source declarations already contain setup/auth metadata for nearly
  every active adapter
- package releases currently publish only `adapter.nexus.json` install metadata
- Frontdoor stores package release manifest JSON but no setup descriptor
- `/api/adapters/catalog` returns adapter id, display name, description,
  version, and release id only
- the local runtime can use live `adapter.info` setup metadata for registered
  adapters, but published-only catalog entries do not carry setup metadata
- the Console Add App modal can render setup inside the modal for locally
  described methods, but the catalog source is still incomplete
- existing durable connection rows are no longer the right source for
  available adapters

Required target:

- published Frontdoor catalog entries include sanitized setup descriptors
- uninstalled but published adapters still show setup options in the local
  Console
- all currently supported adapters are published with setup metadata
- local runtime registered info overrides published metadata for live adapter
  operation, with drift diagnostics
- Console allows another setup attempt for an adapter even when existing
  connections already exist

## Adapter Matrix

This matrix is from the local package tree and deployed Frontdoor package
registry on 2026-04-27 after the publication pass.

| Adapter | Local package | Frontdoor registry status | Source setup declaration | Current catalog setup metadata |
| --- | --- | --- | --- | --- |
| apple-maps | apple-maps 0.1.0 | published current | validated | deployed setup descriptor |
| bitbucket | bitbucket 1.0.12 | published current | validated | deployed setup descriptor |
| callrail | callrail 0.1.0 | published current | validated | deployed setup descriptor |
| confluence | confluence 0.1.1 | published current | validated | deployed setup descriptor |
| device-headless | device-headless 0.1.0 | published current | validated | deployed setup descriptor |
| discord | discord 0.1.0 | published current | validated | deployed setup descriptor |
| eve | eve 0.1.0 | published current | validated | deployed setup descriptor |
| git | git 1.0.11 | retired local tombstone only | holdback | not active in Frontdoor catalog |
| github | github 1.0.11 | published current | validated | deployed setup descriptor |
| gitlab | gitlab 1.0.11 | published current | validated | deployed setup descriptor |
| gog | gog 0.1.0 | published current | validated | deployed setup descriptor |
| google | google 0.1.0 | published current | validated | deployed setup descriptor |
| google-ads | google-ads 0.1.1 | published current | validated | deployed setup descriptor |
| google-business-profile | google-business-profile 0.1.0 | published current | validated | deployed setup descriptor |
| jira | jira 1.0.0 | published current | validated | deployed setup descriptor |
| linkedin | linkedin 0.1.0 | published current | validated | deployed setup descriptor |
| meta-ads | meta-ads 0.1.2 | published current | validated | deployed setup descriptor |
| patient-now-emr | patient-now-emr 0.1.0 | published current | validated | deployed setup descriptor |
| qase | qase 0.1.0 | published current | validated | deployed setup descriptor |
| shopify | shopify 0.1.2 | published current | validated | deployed setup descriptor |
| slack | slack 0.1.0 | published current | validated | deployed setup descriptor |
| telegram | telegram 0.1.0 | published current | validated | deployed setup descriptor |
| tiktok-business | tiktok-business 0.1.2 | published current | validated | deployed setup descriptor |
| tiktok-display | tiktok-display 0.1.2 | published current | validated | deployed setup descriptor |
| twilio | twilio 0.1.0 | published current | validated | deployed setup descriptor |
| web-journey | web-journey 0.1.0 | published current | validated | deployed setup descriptor |
| web-rum | web-rum 0.1.0 | published current | validated | deployed setup descriptor |
| whatsapp | whatsapp 0.1.0 | published current | validated | deployed setup descriptor |
| zenoti-emr | zenoti-emr 0.1.3 | published current | validated | deployed setup descriptor |

## Ticket Lifecycle

Tickets live in exactly one folder:

1. `not-started/`
2. `in-progress/`
3. `completed/`
4. `blocked/`

## Ticket Order

1. [ACSM-001](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-catalog-setup-metadata-board/completed/ACSM-001-shared-setup-descriptor-contract.md)
2. [ACSM-002](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-catalog-setup-metadata-board/completed/ACSM-002-package-release-generates-setup-descriptor.md)
3. [ACSM-003](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-catalog-setup-metadata-board/completed/ACSM-003-frontdoor-catalog-serves-setup-metadata.md)
4. [ACSM-004](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-catalog-setup-metadata-board/completed/ACSM-004-runtime-catalog-merges-published-setup-metadata.md)
5. [ACSM-005](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-catalog-setup-metadata-board/completed/ACSM-005-console-modal-setup-flow-completion-semantics.md)
6. [ACSM-006](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-catalog-setup-metadata-board/completed/ACSM-006-adapter-source-gap-closure.md)
7. [ACSM-007](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-catalog-setup-metadata-board/completed/ACSM-007-frontdoor-publish-all-adapters.md)
8. [ACSM-008](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-catalog-setup-metadata-board/completed/ACSM-008-frontdoor-deploy-and-local-dogfood-proof.md)
9. [ACSM-009](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-catalog-setup-metadata-board/completed/ACSM-009-stale-catalog-entry-cleanup.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-catalog-setup-metadata-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-catalog-setup-metadata-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-catalog-setup-metadata-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-catalog-setup-metadata-board/blocked/README.md)

## Live Snapshot

Final truth after the 2026-04-27 publication and live dogfood pass:

- local package tree has 29 adapter manifests
- `nexus package validate` passes for 28 adapter packages
- retired `git` is the only local package validation holdback and is not
  active in the deployed Frontdoor catalog
- package release now generates setup descriptors from `adapter.info`
- Frontdoor code can store and serve setup descriptor metadata
- runtime catalog code can merge published setup metadata and report drift
- Console method-selection behavior is implemented and tested
- deployed Frontdoor serves 28 published adapters with zero missing setup
  descriptors
- local runtime sees 29 catalog entries: 28 published plus the retired local
  `git` tombstone as unpublished inventory
- live Operator Console proof shows Published catalog count 28, Slack
  multi-method setup inside the modal, Telegram single-method setup inside the
  modal, WhatsApp file-upload setup inside the modal, and no durable row
  created before setup completion
