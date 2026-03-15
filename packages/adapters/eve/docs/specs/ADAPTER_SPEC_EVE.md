# Adapter Spec: Eve

## Customer Experience

The Eve adapter gives Nex a first-class local iMessage connection on macOS by
using Eve's warehouse as the provider integration layer.

For Tyler, the experience should be:

1. install the shared `eve` adapter package into Nex
2. create one Eve connection in Nex for the local macOS host
3. complete a guided custom setup flow that confirms Full Disk Access and Eve
   warehouse readiness
4. run historical backfill from Eve's normalized warehouse into canonical Nex
   records
5. start monitor so Nex continuously syncs new iMessage data through Eve and
   emits new canonical records
6. let Nex read and send iMessages as a real coworker surface without
   requiring direct `chat.db` hacks in every downstream feature

The customer should not need to know:

- the old direct `eve-adapter` binary path in `home/projects/eve`
- the old low-level `AdapterOperations` authoring model
- `chat.db` join timing edge cases or Eve watermark details
- whether a message came from `chat.db` directly or from Eve's warehouse sync

## Adapter Identity

| Field | Value |
|---|---|
| Package ID | `eve` |
| Display Name | `Eve` |
| Platform | `imessage` |
| Package Root | `packages/adapters/eve/` |
| Binary | `cmd/eve-adapter` |
| Provider Scope | Local macOS iMessage access via Eve warehouse |

## Source Of Truth

The source-of-truth behavioral baseline is the latest chronological Eve adapter
implementation in the separate Eve repo:

- repo: `home/projects/eve`
- file: `cmd/eve-adapter/main.go`
- latest adapter commit: `0f874b6f4856db8a4ff8b5be9544e98094c1d4a0`
- commit date: `2026-02-26`
- commit summary: `feat(eve-adapter): adopt v2 operations and setup flow`

The new packaged adapter must preserve the real customer-facing behavior of that
version while cutting over to the current packaged Nex adapter contract.

## Hard-Cutover Rules

1. `packages/adapters/eve` becomes the canonical Eve adapter surface.
2. The package uses the current shared Go SDK `DefineAdapter(...)` model.
3. The package does not depend on Nex invoking `home/projects/eve/bin/eve-adapter`
   or `home/projects/eve/eve-adapter` directly.
4. Platform identity remains `imessage` because downstream Nex routing, memory,
   IAM, and UI already rely on that value.
5. The package preserves the adapter name `eve` because that is the established
   operator-facing adapter identity.
6. Inbound data is emitted as canonical `record.ingest`.
7. Runtime `connection_id` is the durable Nex identity surface.
8. Provider-specific local paths, row ids, GUIDs, and chat identifiers remain
   metadata, not canonical Nex connection identity.

## Scope

The Eve adapter package must cover:

- local custom setup for Eve/iMessage access
- connection health
- account listing
- historical backfill from Eve warehouse
- continuous monitor with best-effort warehouse sync before emit
- `channels.send` text and attachment delivery through Messages/AppleScript

The initial packaged cut does not expand scope into separate Eve analytics,
embeddings, or context-engine product methods. The first goal is a reliable
shared messaging adapter for Nex.

## Connection Model

One Nex Eve connection represents one local macOS iMessage identity surface
served by the current machine.

The canonical Nex identity is the runtime-owned `connection_id`.

The adapter remains single-account in this cut:

- one connection
- one default local account projection
- one local Eve warehouse

Provider-side identifiers such as:

- phone number
- email
- `chat.db` row ids
- Eve warehouse message ids
- iMessage GUIDs
- chat identifiers

must remain metadata on records and health details, not replace the Nex
connection identity.

## Setup Experience

The adapter uses a `custom_flow` auth/setup method because this is not an OAuth
provider integration.

The setup flow must guide the operator through:

1. granting Full Disk Access to Eve
2. granting Full Disk Access to the runtime shell or process that needs to read
   `chat.db`
3. verifying that `chat.db` is readable
4. verifying that Eve's warehouse exists and is readable

The setup flow must return:

- `requires_input` when permissions are missing or unconfirmed
- `completed` only when health proves the local environment is ready
- useful health metadata when setup is blocked

## Monitor Behavior

Monitor must preserve the proven Eve behavior:

1. open Eve warehouse
2. best-effort open `chat.db`
3. establish message, reaction, and membership cursors from the warehouse
4. on each poll, run incremental ETL sync from `chat.db` into `eve.db` when
   possible
5. use the lookback row-id window so `chat.db` join timing races do not
   permanently skip messages
6. query the warehouse for new messages, reactions, and membership events
7. emit canonical records to Nex

If `chat.db` is unavailable but the warehouse is readable, monitor may continue
from warehouse-only state rather than fail closed.

## Backfill Behavior

Backfill must preserve the proven Eve behavior:

1. open Eve warehouse
2. best-effort open `chat.db`
3. best-effort sync `chat.db` into the warehouse before backfill
4. backfill messages, reactions, and membership events from the warehouse
5. paginate so memory stays bounded
6. emit the same canonical record model as monitor

Backfill and monitor are not allowed to diverge on record shape.

## Delivery Behavior

`channels.send` must preserve the proven Eve behavior:

- resolve recipient from target or thread identity
- reject unsupported reply threading behavior
- chunk text to the iMessage-safe text limit
- support optional attachment send
- send through AppleScript / Messages.app on the local macOS host

The package does not need edit/delete/react outbound parity in the first cut.

## Health Behavior

Health must report whether the adapter can actually function on this machine.

At minimum, health must verify:

- `chat.db` path discovery
- `chat.db` readability
- Eve warehouse readability
- latest known event timestamp
- warehouse message count

Health metadata should include path and warehouse facts that help explain setup
or runtime failure without exposing unnecessary secrets.

## Record Model

The adapter emits canonical inbound records for:

- iMessage messages
- iMessage reactions
- iMessage membership events

Each record must preserve:

- `connection_id`
- `platform = "imessage"`
- stable provider-native identifiers in metadata
- sender/contact/chat metadata needed by downstream Nex memory and routing

The packaged adapter must not reintroduce legacy flat event shapes as canonical
output.

## Package Shape

The package should include:

- `adapter.nexus.json`
- `README.md`
- `go.mod`
- `cmd/eve-adapter/main.go`
- package-local helpers/tests as needed
- `docs/specs/ADAPTER_SPEC_EVE.md`
- `docs/workplans/EVE_ADAPTER_WORKPLAN.md`
- `docs/validation/EVE_ADAPTER_VALIDATION.md`
- `scripts/package-release.sh`

## Done Definition

The Eve adapter package is done only when:

1. `packages/adapters/eve` is the canonical shared adapter package
2. it preserves the latest proven Eve adapter customer behavior
3. it uses the current Go `DefineAdapter(...)` contract
4. it emits canonical inbound records for messages, reactions, and membership
5. it supports setup, health, accounts, backfill, monitor, and send
6. it is buildable, testable, package-valid, and releasable from the package
   root
7. Nex can install and run it without depending on the old direct external
   binary path
