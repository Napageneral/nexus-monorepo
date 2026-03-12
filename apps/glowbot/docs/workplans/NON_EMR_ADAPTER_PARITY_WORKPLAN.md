# GlowBot Non-EMR Adapter Parity Workplan

**Status:** IMPLEMENTATION COMPLETE, LIVE VALIDATION ACTIVE
**Last Updated:** 2026-03-11
**Scope:** `google`, `meta-ads`, `callrail`, `twilio`, `apple-maps`
**Approach:** hard cutover, no backwards compatibility

## Customer Outcome

The immediate customer goal is not "old GlowBot adapters compile."

The goal is:

1. a real clinic can connect non-EMR providers through canonical Nex
   connection flows
2. each adapter emits canonical inbound provider records with stable
   `connection_id`
3. GlowBot ingests those records into `metric` elements without adapter-local
   identity hacks
4. the clinic can trust the resulting dashboards and benchmark snapshots on
   first live data

This workplan now exists to drive first-clinic live validation against the
completed non-EMR adapter cutover. The contract and package lifecycle parity
work that originally motivated it is complete and archived at the adapter
package level.

## Locked Decisions

| Decision | Resolution |
|---|---|
| Canonical governance | Adapter docs follow the active workflow in `/docs/governance/spec-driven-development-workflow.md`. |
| Canonical adapter contract | Target-state adapter behavior follows `nex/docs/specs/adapters/adapter-protocol.md` and `adapter-connections.md`. |
| Inbound data model | The target-state inbound contract is `record.ingest`, not legacy flat `NexusEvent`. |
| Connection identity | `connection_id` is the canonical adapter/runtime identity, not provider email, account id, or `"default"`. |
| Managed profile routing | Shared adapters do not hardcode product URLs. Managed profile routing goes through the frontdoor-managed connection gateway. |
| First live-clinic scope | Non-EMR only. Zenoti and other EMR flows are out of scope for this parity pass. |
| Validation philosophy | Each adapter gets package-local spec, workplan, and validation docs before code changes. |

## Current State Summary

The target adapters all need the same structural cutover:

- they still emit legacy flat adapter events or otherwise preserve the old
  `account_id` shape
- they still expose provider identity or `"default"` as their operational
  account surface instead of stable runtime `connection_id`
- Google and Meta Ads are still product-coupled to a GlowBot-specific managed
  credential URL
- package-local documentation either does not exist or still teaches the
  pre-cutover command surface

The newer adapters already show the correct direction:

- `nexus-adapter-jira`
- `nexus-adapter-qase`
- `nexus-adapter-confluence`
- `slack`

Those packages are reference implementations for canonical record emission,
connection-aware routing, and package-local spec/workplan/validation structure.

## Current Snapshot

| Adapter | Current State | Highest-Risk Gap |
|---|---|---|
| `google` | Local contract cutover landed: canonical `record.ingest`, runtime `connection_id`, runtime-token bridge into `gog`, no GlowBot-specific managed URL. | Real Google Ads and GBP validation with clinic credentials. |
| `meta-ads` | Local contract cutover landed: canonical `record.ingest`, runtime `connection_id`, no GlowBot-specific managed URL. | Real Meta credential validation and monitor proof. |
| `callrail` | Local contract cutover landed: canonical `record.ingest`, no fallback identity synthesis. | Real CallRail credential validation and multi-company proof. |
| `twilio` | Local contract cutover landed: canonical `record.ingest`, runtime `connection_id`, no `"default"` identity semantics. | Real Twilio credential validation and monitor proof. |
| `apple-maps` | Local contract cutover landed: canonical `record.ingest`, manual-first connection-aware provenance. | Fixture/manual first-clinic proof through GlowBot. |

## Workstreams

### A1. Package-Local Documentation Baseline

Status: complete and archived at the package level

For each target adapter:

- add `docs/specs/`
- add `docs/workplans/`
- add `docs/validation/`
- add `docs/README.md`
- treat the new package-local spec as the active target-state truth for that
  adapter

Exit criteria:

- every target adapter has a package-local active docs tree
- no adapter depends on a GlowBot-only document as its only canonical spec

### A2. Shared Contract Parity

Status: complete and archived at the package level

Align all five adapters to the active shared adapter contract:

- canonical `record.ingest` output
- canonical `connection_id`
- correct `adapter.info` operations
- correct `adapter.accounts.list` semantics
- no fallback `"default"` connection synthesis

Exit criteria:

- every adapter emits canonical inbound records
- every adapter treats `connection_id` as the runtime identity surface

### A3. Managed Connection Gateway Parity

Status: complete and archived at the package level

For adapters that participate in managed-profile routing:

- remove product-coupled managed credential URLs
- resolve managed profile behavior through the frontdoor-managed connection
  gateway contract

Applies directly to:

- `google`
- `meta-ads`

Exit criteria:

- shared adapters are product-agnostic
- managed profile behavior routes through the canonical platform gateway

### A4. Adapter-Specific Cutovers

Status: complete and archived at the package level

Execute the package-local workplans in this order:

1. `google`
2. `meta-ads`
3. `callrail`
4. `twilio`
5. `apple-maps`

Reasoning:

- Google and Meta are the most likely first-clinic integrations
- CallRail and Twilio are next for call-tracking proof
- Apple Maps is manual and lower risk once the shared connection/record shape
  is fixed elsewhere

### A4.5 Package Lifecycle Parity

Status: complete and archived at the package level

The five target adapters now also match the Confluence/Jira shared package
lifecycle pattern:

- `adapter.nexus.json`
- release tarball under `dist/`
- operator install through `/api/operator/packages/install`
- package health through runtime operator endpoints
- restart rehydration from durable `runtime_packages` state

Observed result:

- all five packages installed successfully in the isolated runtime
- all five reported `healthy = true`
- all five rehydrated successfully after restart

### A5. Cross-Adapter GlowBot Readiness

Status: pending real credentials / first clinic

After the adapter-local cutovers:

- verify real non-EMR clinic flows in GlowBot
- validate raw record arrival
- validate `metric` element creation
- validate on-demand dashboard outputs
- validate benchmark snapshot publication/query

Exit criteria:

- GlowBot is ready for first live non-EMR clinic data

## Deliverables

This workplan is supported by package-local docs in:

- `adapters/nexus-adapter-google/docs/`
- `adapters/nexus-adapter-meta-ads/docs/`
- `adapters/nexus-adapter-callrail/docs/`
- `adapters/nexus-adapter-twilio/docs/`
- `adapters/nexus-adapter-apple-maps/docs/`

Each package now owns:

- one active target-state adapter spec
- archived local workplans/validation docs for the completed package/install
  cutover
- live validation handoff into this GlowBot-level workplan and the active
  GlowBot validation/runbook set

## Remaining Exit Criteria

Implementation parity is complete. This program is fully complete only when all
of the following are true:

1. real Google credentials validate connection, health, backfill/monitor, and
   record arrival
2. real Meta Ads credentials validate connection, health, backfill/monitor, and
   record arrival
3. real CallRail credentials validate connection, health, backfill/monitor, and
   multi-company proof
4. real Twilio credentials validate connection, health, backfill/monitor, and
   record arrival
5. Apple Maps fixture/manual flow is exercised through the same GlowBot ingest
   and read path
6. GlowBot validates first-clinic non-EMR integrations against the canonical
   Nex adapter model
