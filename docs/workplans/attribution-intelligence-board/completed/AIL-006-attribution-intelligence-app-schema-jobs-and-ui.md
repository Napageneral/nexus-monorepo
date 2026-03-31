# AIL-006 Attribution Intelligence App Schema Jobs And UI

Status: completed on 2026-03-31.

Validation evidence:

- focused processor proof:
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/attribution-intelligence/app/pipeline/processor.test.ts`
- package validation:
  `nexus package validate /Users/tyler/nexus/home/projects/nexus/packages/apps/attribution-intelligence/app`
- cleanroom proof bundle:
  `/Users/tyler/nexus/state/sandboxes/a78393c6-1074-4098-8802-f007b4c19d15/artifacts/validation/attribution-app-install-live/20260331T173351Z/attribution-app-proof-summary.json`

## Goal

Build the attribution intelligence app package with its own database, jobs,
reconciliation state, aggregate marts, and operator UI.

Primary execution board:

- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-intelligence-app-board/README.md`

## Scope

- input bindings
- canonical facts
- aggregate marts
- reconciliation jobs
- freshness and gap detection
- operator-facing UI for paid performance, source mix, funnel, and attributed
  outcomes

## Current Gap

- Nexus does not yet have the generic attribution intelligence app layer above
  shared acquisition, website, and backend inputs
- the app-owned persistence boundary is not yet implemented

## Resolution

- a dedicated `attribution-intelligence` app package now exists under
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/attribution-intelligence/app`
- the app owns a dedicated SQLite database for bindings, facts, reconciliation
  state, and marts
- runtime work subscribes shared acquisition, website, and backend records into
  app-owned materialization jobs
- the app now exposes operator reads for summary, paid fact rows, funnel,
  outcomes, pipeline status, and row inspection through a live operator UI

## Dependency Lock

`AIL-006` should now assume the website input contract defined in:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-website-input-package-and-install-contract.md`

That means the first app slice should treat these as fixed upstream shared
inputs:

- acquisition adapter row families from Meta Ads, Google Ads, TikTok Business,
  and later additional paid adapters
- backend outcome row families from Shopify and later EMR or CRM adapters
- canonical website input rows stamped with `website_installation_id`,
  `session_id`, `browser_id`, canonical `event_name`, attribution evidence
  fields, and explicit bridge fields

## First Implementation Slice

The first useful app slice should be intentionally narrow:

1. bind one business scope to one or more acquisition inputs, one website
   installation, and one backend outcome input
2. materialize canonical app-owned facts from those shared records
3. expose one operator UI for connected inputs, freshness, paid performance,
   website funnel, backend outcomes, and row-level inspection
4. defer advanced attribution heuristics until the canonical facts and read
   models are trustworthy

## App-Owned Core Tables

The first schema pass should center on:

- `input_bindings`
- `ad_performance_facts`
- `web_events`
- `session_source_facts`
- `conversion_bridges`
- `business_outcomes`
- `outcome_attributions`
- aggregate marts for paid performance, source mix, and funnel progression

## Required Jobs

The first job family should center on:

- input freshness and replay detection
- acquisition fact materialization from adapter records
- website event materialization from collector records
- bridge extraction from website and backend rows
- backend outcome materialization
- reconciliation into outcome attribution
- aggregate mart refresh for operator reads

## UI Starting Surface

The first UI surface should answer:

1. what inputs are connected and current
2. what paid performance exists by provider and campaign hierarchy
3. what website funnel events and handoff rows exist by installation scope
4. what backend outcomes have arrived
5. which outcomes are reconciled versus unreconciled
6. what evidence exists on one inspectable row

## Recommended Decomposition

Before full implementation, split `AIL-006` into atomic follow-on tickets for:

1. app package boundary and manifest
2. app database schema and migrations
3. input-binding model and operator setup
4. acquisition fact materialization
5. website input materialization
6. backend outcome materialization
7. reconciliation and outcome attribution jobs
8. operator UI and read models

## Acceptance

1. the app owns a dedicated database rather than relying on memory-first
   persistence
2. app jobs materialize canonical facts and aggregate marts from ingested
   records
3. the app UI reads app-owned marts instead of individual adapter payloads
4. the app can work with different backend outcome providers through the same
   generic model
