# Messaging Adapter Live Sync And Interactions

**Status:** CANONICAL
**Last Updated:** 2026-04-30

## Purpose

Messaging adapters provide durable workspace memory and native collaboration
surfaces for chat providers such as Slack and Discord.

The adapter target state combines two requirements:

- provider history is imported and caught up through durable cursors
- provider live events drive low-latency updates and native interactions

Live events are the fast path. Durable polling, history reads, and restart
catch-up are the repair path.

## Provider Surface

Each provider-backed messaging adapter exposes the provider-native method
surface that is useful to Nex agents and operators. Provider method names remain
truthful to the upstream API, with stable Nex projections for common operations
such as send, reply, react, edit, delete, backfill, monitor, and health.

The adapter does not hide provider-native capabilities behind a narrow chat-only
API. It adds Nex record, contact, thread, file, interaction, and validation
semantics on top of the provider surface.

## Durable Sync Spine

Every messaging adapter maintains adapter-owned durable state for each connected
account or workspace.

The durable sync state records:

- the connection identifier
- per-conversation cursors or watermarks
- the latest successfully processed provider event boundary
- bounded catch-up metadata
- monitor health and last-success timestamps

Backfill establishes the first trustworthy cursor set. Monitor startup resumes
from that state. A monitor restart never depends on process memory to avoid
duplicate replay or missed messages.

The monitor advances a cursor only after all records for that provider page or
event batch have been emitted successfully.

## Live Event Semantics

Messaging adapters emit Nex records for provider events that cannot be reliably
reconstructed from history alone.

The canonical live event set is:

- message created
- message edited
- message deleted
- reaction added
- reaction removed
- file shared
- thread reply created
- app mention or direct prompt
- interaction submitted

Message edits and deletes are represented as explicit revision records. A
revision record references the original provider message identity, carries the
provider event timestamp when available, and includes enough metadata to explain
whether the record is an edit, deletion, or other state change.

Provider history APIs remain useful for missed creates and best-effort changed
content. They are not assumed to provide a complete deletion or edit timeline
unless the provider explicitly exposes that timeline.

## Offline Catch-Up

When an adapter has been offline, startup catch-up reads provider history from
the last durable cursor.

Catch-up behavior is bounded and deterministic:

- it uses provider-native cursors, timestamps, or message identifiers
- it emits records in stable chronological order where the provider allows it
- it suppresses duplicate records before emission
- it persists progress after successful batches
- it reports skipped conversations and permission failures as degraded health,
  not silent success

Missed deletion recovery is provider-specific. If a provider does not expose
deleted messages in history, the adapter records live delete events and
truthfully reports offline delete recovery as unavailable or best-effort.

## Interaction Runtime

Messaging adapters support native provider controls where the provider exposes
them.

The canonical interaction surface includes:

- buttons
- menus and selects
- modals
- approval prompts
- ephemeral responses
- message updates after interaction completion
- authorization checks
- time-to-live for reusable controls

Interactions are registered through adapter-owned state that can be validated
without relying on process memory. Submitted interactions resolve back to the
Nex command, agent action, job, or approval they were created for.

## Transport Health

Monitor health distinguishes transport state from record processing state.

Adapters report:

- starting
- ready
- reconnecting
- degraded
- stopped
- fatal

Transport reconnects do not imply record loss when durable cursors and catch-up
remain healthy. Fatal authentication or permission failures surface as operator
action items.

## Rate Limits

Messaging adapters use provider-aware request scheduling.

The scheduler honors:

- provider retry-after headers
- method-specific limits
- bounded worker pools
- backoff with jitter for transient transport failures
- explicit catch-up limits for startup and live repair

Backfill can be correctness-first and slow when explicitly requested. Monitor
polling is incremental, cheap, and bounded.

## Validation Contract

Each messaging adapter proves these lanes:

- install and connection setup
- full or scoped backfill
- monitor startup from durable state
- offline catch-up after downtime
- live create, edit, delete, and reaction events where supported
- native interactions where supported
- rate-limit and retry behavior
- hosted install, restart, and monitor continuation
- agent-use proof through the same runtime seams used in production

Cleanroom validation is the default. Live dogfood is secondary confirmation
after the cleanroom proof passes.
