# Eve Adapter Workplan

Archived on 2026-03-31 after the active Eve execution posture moved to the
ticketized
[Eve Edge Architecture Board](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/README.md).

## Goal

Move Eve from the packaged local-only adapter cut to the canonical edge
architecture defined in
[EVE_TAXONOMY.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/specs/EVE_TAXONOMY.md)
and
[ADAPTER_SPEC_EVE.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/specs/ADAPTER_SPEC_EVE.md).

## Current Gap Summary

The main gaps between current code and canon are:

- the hot monitor loop still behaves like a broad local sync cycle rather than
  a fast watcher-backed delta pipeline
- Eve still assumes local runtime execution instead of a macOS edge paired to a
  separate Nex core
- rich actions are narrow and not capability-driven
- attachment delivery remains local-path-centric
- the connection model still reflects one default local slot instead of one
  connection per macOS user session identity surface
- the active validation corpus still centers the packaged adapter cutover, not
  the edge architecture

## Phase 1: Replace The Hot Loop With A Fast Watcher

Port the proven fast watcher posture into Eve's hot path.

Required outcomes:

- WAL and SHM-driven change detection with low-latency debounce
- persistent local `chat.db` read handle
- per-domain ROWID or equivalent delta watermarks
- replay-safe delta ETLs for messages, reactions, membership events,
  attachments, and message updates
- bounded reconciliation windows for late join and attachment linkage races
- removal of broad `FullSync` behavior from the hot monitor loop

Primary code areas:

- `packages/adapters/eve/cmd/eve-adapter/main.go`
- `packages/adapters/eve/internal/etl/*`
- new watcher and state packages under `packages/adapters/eve/internal/`

Exit criteria:

- monitor no longer reruns broad full sync work on every tick
- live sync latency and CPU behavior are bounded and measurable
- backfill and live sync still emit the same canonical record model

## Phase 2: Split Fast Delta Ingest From Slow Maintenance

Move all heavyweight repair and enrichment tasks out of the hot watcher.

Required outcomes:

- slow AddressBook hydration loop
- slow contact merge and participant repair loop
- slow chat and conversation repair loop
- explicit warehouse repair entrypoints
- restart-safe watermark and repair bookkeeping

Exit criteria:

- hot path is limited to delta acquisition and canonical emit
- slow maintenance can lag temporarily without breaking live sync truth

## Phase 3: Introduce The Eve Edge To Nex Core Transport

Teach Eve to behave like a macOS edge instead of a purely local adapter
process.

Required outcomes:

- authenticated edge registration
- edge-initiated long-lived transport from macOS to Nex core
- heartbeats, lag reporting, and capability advertisement
- canonical record stream from edge to core
- attachment upload or durable attachment object reference flow
- routed command channel from core to edge with command receipts

Primary code areas:

- `packages/adapters/eve/*`
- `nex/src/runtime/domains/adapters/*`
- `nex/src/api/server-methods/adapter-connections.ts`
- `nex/src/capabilities/events/*`
- relevant storage ledgers for edge session and capability state

Exit criteria:

- a Linux-hosted Nex core can manage a paired macOS Eve edge
- the macOS host does not require a public inbound listener for Nex to use it

## Phase 4: Expand Core Routing And Client-Visible Eve State

Teach Nex core to expose Eve correctly to apps and remote clients.

Required outcomes:

- client-visible thread, attachment, health, and capability truth comes from
  Nex core
- Eve live state events fan out through canonical Nex event surfaces
- command routing selects the correct Eve connection
- remote clients never depend on direct reachability to the Mac

Primary code areas:

- `nex/src/api/server-methods/*`
- `nex/src/runtime/*`
- app-facing client surfaces that present Eve threads and actions

Exit criteria:

- Android, Linux, and web clients can use Eve through Nex alone
- edge availability and capability changes are visible without bespoke side
  channels

## Phase 5: Expand The Action Layer

Broaden Eve from basic local send into a richer capability-driven iMessage
action surface.

Required outcomes:

- reply
- add and remove reaction
- edit and unsend
- thread creation and rename
- participant add and remove
- durable watcher confirmation for locally executed actions
- truthful fallback when a capability is unavailable

Primary code areas:

- `packages/adapters/eve/cmd/eve-adapter/main.go`
- new edge-side action packages
- `nex-core` command routing and client capability exposure

Exit criteria:

- richer actions are routed end to end through Nex and the correct edge
- unsupported actions fail clearly instead of pretending parity

## Phase 6: Multi-User And Multi-Host

Replace the single default-slot mental model with the canonical connection
model.

Required outcomes:

- one Eve connection per macOS user session identity surface
- multiple Eve connections under one Nex core
- per-connection self identity and capability truth
- operator UX for distinguishing hosts and user sessions

Primary code areas:

- Eve setup and health surfaces
- Nex adapter connection storage and operator surfaces

Exit criteria:

- one physical Mac can support multiple Eve connections when user sessions are
  distinct
- Nex routing remains explicit and deterministic across hosts and user sessions

## Phase 7: Validation And Cutover

Replace the packaging-era proof posture with an edge-architecture validation
ladder.

Required outcomes:

- fixture-backed watcher proofs
- Linux cleanroom proofs for Nex core and transport
- paired macOS edge proofs for real iMessage acquisition and actions
- golden-journey proof for remote clients acting through Nex

Exit criteria:

- active validation proves the edge architecture rather than the packaged local
  cut
