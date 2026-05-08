# Adapter Spec: Eve

## Customer Experience

Eve gives Nex a first-class iMessage surface whose durable truth lives in Nex
even when the actual iMessage access lives on macOS.

The operator experience should be:

1. pair one or more macOS Eve edges with Nex
2. complete guided setup that proves Full Disk Access, local warehouse
   readiness, self-identity discovery, and action capability discovery
3. run historical backfill into canonical Nex records
4. keep low-latency live sync running from the macOS edge into Nex
5. let Nex apps and remote clients on Android, Linux, and web read and act on
   iMessage through Nex without direct Mac access

The client experience should be:

1. browse, search, and reply to iMessage threads through Nex
2. see attachment previews and fetch attachment content from Nex
3. receive live updates when new iMessages arrive or connection health changes
4. send native inline photos and videos through Nex when the paired Eve edge
   advertises provider-native media support
5. add reactions, send replies, edit messages, unsend messages, and mutate
   threads when the paired Eve edge advertises support for them

The operator and client should not need to know:

- where `chat.db` lives on disk
- whether an event first came from WAL-driven sync or warehouse reconciliation
- whether a rich action used Messages automation or a deeper local companion
- whether Nex core is running on macOS or Linux

## Adapter Identity

| Field | Value |
|---|---|
| Package ID | `eve` |
| Display Name | `Eve` |
| Platform | `imessage` |
| Package Root | `packages/adapters/eve/` |
| Binary | `cmd/eve-adapter` |
| Provider Scope | macOS iMessage edge for Nex |

## Taxonomy

See [EVE_TAXONOMY.md](./EVE_TAXONOMY.md) for the canonical nouns used below.

See [EVE_ACTION_EXECUTION_BOUNDARIES.md](./EVE_ACTION_EXECUTION_BOUNDARIES.md)
for the canonical action-class boundary between AppleScript-reachable behavior
and private-API-required behavior.

## Target-State Rules

1. Eve is a host-bound edge adapter for iMessage, so iMessage acquisition and
   local action execution live on macOS.
2. `nex-core` is the canonical system of record for Eve records, remote client
   APIs, search, memory, and app integrations.
3. `eve-edge` owns local acquisition, warehouse maintenance, attachment
   discovery, self-identity resolution, and local action execution.
4. Clients never talk directly to a macOS Eve edge.
5. Durable history enters Nex only through canonical Eve record ingest.
6. Command receipts never replace watcher-confirmed durable history.
7. Fast delta watching is the default ingest posture.
8. Rich actions are capability-gated and may vary by edge.
9. One Eve connection maps to one macOS user session identity surface.
10. Multiple Eve connections may coexist across hosts and user sessions without
    collapsing into one shared local slot.

## Deployment Model

Eve is deployed as a macOS edge that pairs with a Nex core runtime.

The deployment boundary is:

- `eve-edge`
  - runs on macOS
  - can read `chat.db`, WAL, SHM, AddressBook, and local attachment paths
  - can drive Messages automation and richer local iMessage integrations when
    available
  - opens an authenticated outbound runtime session to `nex-core`
- `nex-core`
  - may run on Linux or any other Nex-supported runtime substrate
  - stores canonical records and live edge state
  - routes commands to the correct edge
  - serves clients and Nex apps

No public listener on the macOS host is required for the target architecture.

## Connection Model

One Eve connection represents one logged-in macOS user session with Messages
access and one discoverable local self identity surface.

The durable Nex identity is the runtime-owned `connection_id`.

Every connection must expose:

- `connection_id`
- self `account`
- self `account contact`
- capability advertisement
- edge health and lag metadata

Multiple Eve connections may exist:

- on different Macs
- on the same physical Mac under different logged-in user sessions
- under one Nex core runtime

Provider-side identifiers such as phone numbers, emails, `chat.db` row ids,
iMessage GUIDs, and chat identifiers remain metadata and lookup keys. They do
not replace the Nex `connection_id`.

Message records must preserve the source `chat.db` GUID as
`metadata.message_guid` so Nex review surfaces can open the exact native
message in macOS Messages when the runtime host supports it.

## Ingest Model

Eve's ingest path is warehouse-first but watcher-driven.

The hot path must:

1. watch `chat.db`, WAL, and SHM for local changes with low latency
2. keep a persistent local read handle to `chat.db`
3. track per-domain watermarks for messages, reactions, membership events,
   attachments, and message updates
4. run small replay-safe delta ETLs instead of broad full sync passes
5. apply bounded reconciliation windows so late join rows and attachment links
   are not permanently skipped
6. emit canonical records from the normalized warehouse into Nex

The slow path must run separately from the hot loop for:

- handle and contact refresh
- AddressBook name hydration and contact reconciliation
- chat and participant repair
- warehouse cleanup and repair
- conversation repair

Backfill and live sync must use the same canonical transform pipeline.

## Warehouse Model

The warehouse is Eve's normalized local truth for iMessage ingestion.

It must:

- preserve replay-safe provider metadata
- support low-latency delta ingest
- survive edge restarts without full reimport
- keep attachment linkage and contact linkage stable
- provide a single canonical read surface for backfill and monitor

Warehouse maintenance may rebuild or repair derived tables, but canonical Nex
records must not depend on clients reading warehouse internals directly.

## Record Model

Eve emits canonical inbound records for:

- messages
- reactions
- membership events
- message updates such as edits and unsends when the provider can observe them

Each record must preserve:

- `connection_id`
- `platform = "imessage"`
- stable provider-native identifiers in metadata
- sender and participant identity facts needed by Nex routing and memory
- thread and container metadata needed for conversation continuity
- attachment references when attachments are present

Backfill and live sync are not allowed to diverge on record shape.

## Live State Model

Eve also emits live state events through Nex for:

- typing and other composition state
- delivery and read observations
- edge presence and health transitions
- command progress
- capability changes

Live state events are not a substitute for durable canonical records.

## Attachment Model

Attachments are discovered locally by `eve-edge` and become remotely usable
through Nex.

The target behavior is:

1. the edge resolves local attachment metadata and bytes
2. Nex stores durable attachment objects or durable object references
3. clients fetch attachments from Nex, not from the macOS filesystem
4. outbound image and video sends render with provider-native inline media
   semantics when the edge advertises inline media support, instead of falling
   back to generic file-tile behavior

Local absolute paths may exist as edge-only metadata, but they are not part of
the remote client contract.

Inbound iMessage attachments feed the canonical
[Attachment Interpretation Pipeline](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/memory/attachment-interpretation-pipeline.md)
after they have been represented as canonical record attachments. The edge
preserves attachment access and provenance; memory retain consumes derived
interpretations, not direct Mac filesystem paths.

## Action Execution Boundary

Eve recognizes only two action-execution classes:

1. AppleScript-reachable
2. private-API-required

UI automation is intentionally out of scope for the canonical Eve plan.

The AppleScript-reachable class currently covers:

- text send
- generic file attachment send
- inline photo or video parity only if that behavior is proven live and remains
  stable enough to advertise truthfully

The private-API-required class currently covers:

- reply threading
- reaction add and remove
- edit
- unsend
- thread create
- thread rename
- participant add and remove
- other provider-native state mutations such as typing or read state when the
  provider allows them

If an AppleScript executor cannot prove native inline media send, it must keep
inline media support disabled and advertise only generic file-attachment
support.

## Outbound Action Model

Eve supports a baseline local action surface plus richer capability-gated
actions.

The baseline action surface includes:

- send text
- send generic file attachments when the provider path requires file semantics
- send native inline photos and videos only when the paired edge has proved
  that capability and advertises it truthfully

The richer action surface includes:

- reply
- add reaction
- remove reaction
- edit
- unsend
- create thread
- rename thread
- add participants
- remove participants
- mark read or otherwise reconcile message state when the provider allows it

All remote actions flow:

1. client to `nex-core`
2. `nex-core` to the correct `eve-edge`
3. local execution on macOS
4. durable confirmation through the ingest path

If an action is unsupported on a given edge, Eve must fail clearly and expose
that capability truthfully through health and info surfaces.

Capability truth must be specific enough that Nex and remote clients can
distinguish:

- native inline media send support
- generic file-send support
- reply support
- reaction support
- edit support
- unsend support
- thread mutation support

## Setup Experience

Eve uses a custom setup flow because iMessage access is a local macOS provider
integration, not OAuth.

The setup flow must guide the operator through:

1. granting Full Disk Access for Eve's local edge process
2. verifying that `chat.db`, WAL, and SHM are readable
3. verifying that the warehouse is readable and writable
4. discovering the local self identity
5. discovering the currently available action capabilities
6. pairing the edge with `nex-core`

The setup flow must return:

- `requires_input` when permissions or pairing requirements are missing
- `completed` only when the local edge is genuinely ready
- explicit account-contact linkage when self identity is known
- capability truth when rich actions are unavailable

## Health Behavior

Health must report whether the edge can actually function and whether Nex can
route work through it.

At minimum, health must verify:

- `chat.db` path discovery
- `chat.db`, WAL, and SHM readability
- warehouse readability and writeability
- watcher readiness and lag
- current capability set
- self account projection
- edge pairing status with Nex core
- latest known event timestamp
- attachment transfer readiness

Health metadata should include path and warehouse facts that help explain setup
or runtime failure without exposing unnecessary secrets.

Health and connection metadata should also expose the local session surface
needed for operator disambiguation, including:

- host identity
- macOS user identity
- self account projection
- stable per-session connection display truth

## Security And Transport

The edge-to-core transport must be edge-initiated, authenticated, encrypted,
and restart-safe.

The target posture is:

- `eve-edge` opens the connection to `nex-core`
- `nex-core` never requires a public inbound listener on the Mac
- edge credentials are scoped to edge registration and command routing
- attachment transfer uses durable Nex-managed storage or durable object
  references
- secrets remain in runtime-managed storage, not docs

## Failure And Recovery

Eve must remain truthful and restart-safe under:

- edge restarts
- temporary loss of `chat.db` access
- temporary loss of pairing with Nex core
- command retries
- late attachment linkage
- late join and membership linkage races

If the macOS edge is offline, Nex clients may still read stored history, but
live state and remote actions for that connection degrade truthfully.

## Done Definition

Eve is at parity with this spec only when:

1. a macOS edge can pair with Nex and keep a low-latency live sync running
2. backfill and live sync emit the same canonical record model
3. Nex clients on Android, Linux, and web can read and act on Eve threads only
   through Nex
4. rich actions are capability-gated and routed through the correct edge
5. one Nex core can manage multiple Eve connections across hosts and user
   sessions
6. attachment access works remotely through Nex without direct Mac paths
7. recovery from restart or temporary edge loss is replay-safe and truthful
