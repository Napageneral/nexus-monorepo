# Operator Chat Runtime Contract

**Status:** CANONICAL
**Last Updated:** 2026-04-07
**Related:** [Operator Chat Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-taxonomy.md), [Operator Chat Surface And Agent Lanes](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-surface-and-agent-lanes.md), [Operator Chat t3code Shell Transplant](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-t3code-shell-transplant.md), [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)

---

## Purpose

This document defines the canonical Nex runtime contract for the operator chat
surface.

This is the contract consumed by the forked `t3code` microfrontend and any
other Nex-native operator chat client.

## Contract Principles

The operator chat runtime contract follows these rules:

- Nex is the source of truth for agents, sessions, conversations, approvals,
  delivery routing, model catalogs, and provider catalogs.
- The chat runtime exposes one Nex-owned chat-domain read model and event log
  above the canonical ledgers and runtime events.
- The lane is the primary navigation object in the contract.
- The session is the current execution backing object in the contract.
- The session transcript is the primary execution history in the contract.
- Canonical records are the durable human-visible utterance layer in the
  contract.
- Conversation context is linked public-channel history in the contract.
- Lane actions are reusable Nex-native task-launch objects attached to agent
  groups and resolved for the selected lane.
- Streaming state is emitted through chat events rather than through record
  mutation.
- Nex canonical schemas in this contract do not use a `kind` field.

## Transport Model

The operator transport exposes:

- request methods for snapshot, replay, and chat commands
- one live broadcast event named `chat`

The live event stream reuses the existing Nex websocket event transport rather
than defining a second streaming RPC protocol.

## Shared Object Model

### Chat Lane Summary

Each lane summary includes:

- `lane_id`
- `lane_mode`
- `agent_id`
- `session_id`
- `parent_lane_id`
- `conversation_scope_id`
- `title`
- `subtitle`
- `preview_text`
- `run_state`
- `updated_at`
- `unread_count`
- `can_send`
- `can_abort`

`lane_mode` values:

- `agent`
- `worker_session`

`run_state` values:

- `idle`
- `queued`
- `running`
- `waiting_approval`
- `error`

### Chat Message

Each transcript message includes:

- `id`
- `lane_id`
- `session_id`
- `turn_id`
- `record_id`
- `role`
- `text`
- `created_at`

`role` values:

- `user`
- `assistant`
- `system`
- `tool`

### Chat Activity

Each activity item includes:

- `id`
- `lane_id`
- `session_id`
- `activity_type`
- `status`
- `title`
- `detail`
- `created_at`

`activity_type` values:

- `run_lifecycle`
- `tool_call`
- `file_change`
- `web_activity`
- `approval_request`
- `approval_resolution`
- `worker_spawn`
- `warning`

### Chat Approval

Each approval item includes:

- `id`
- `lane_id`
- `request_type`
- `status`
- `summary`
- `created_at`
- `expires_at`
- `resolved_at`

`status` values:

- `pending`
- `approved`
- `denied`
- `expired`

### Chat Delivery Target

Each delivery target includes:

- `target_id`
- `channel`
- `label`
- `selected`

### Chat Conversation Context

Each conversation context includes:

- `conversation_scope_id`
- `conversation_ids`
- ordered `records`
- available `delivery_targets`

`conversation_scope_id` is a chat projection identifier.
The underlying public records remain linked to canonical conversation ids.

Each public record entry includes:

- `id`
- `channel`
- `sender_entity_id`
- `receiver_entity_id`
- `text`
- `timestamp`

### Chat Lane Action

Each lane action includes:

- `action_id`
- `agent_id`
- `label`
- `description`
- `icon`
- `shortcut`
- `invocation_mode`
- `requires_input`
- `default_prompt`

`invocation_mode` values:

- `prefill`
- `invoke`

### Chat Lane Detail

Each lane detail includes:

- `lane`
- ordered `messages`
- ordered `activities`
- ordered `approvals`
- ordered `actions`
- optional `conversation_context`
- `model_id`
- `provider_id`

### Chat Snapshot Result

Each snapshot result includes:

- `sequence`
- `default_lane_id`
- `lanes`
- optional `expanded_lane`

### Chat Replay Result

Each replay result includes:

- `events`
- `latest_sequence`
- `reset_required`

### Chat Event

The live and replay event object includes:

- `sequence`
- `event_name`
- `lane_id`
- `occurred_at`
- `data`

`event_name` values:

- `lane.upserted`
- `lane.removed`
- `lane.state-changed`
- `message.appended`
- `message.updated`
- `activity.appended`
- `activity.updated`
- `approval.upserted`
- `approval.resolved`
- `conversation.updated`
- `delivery.updated`

## Runtime Methods

### `chat.snapshot`

Returns the authoritative read snapshot for the operator chat surface.

Request fields:

- optional `lane_id`
- optional `message_limit`
- optional `activity_limit`
- optional `approval_limit`
- optional `record_limit`
- optional `include_conversation_context`

Response fields:

- `sequence`
- `default_lane_id`
- `lanes`
- optional `expanded_lane`

Normative behavior:

- If `lane_id` is omitted, Nex expands the default lane when one exists.
- `lanes` always contains the currently visible lane directory for the operator.
- `expanded_lane` always reflects one internally consistent lane state at the
  same `sequence` returned by the snapshot.
- The session transcript in `expanded_lane.messages` is derived from the
  session ledger, not from public conversation records.
- Transcript messages representing durable human-visible utterances include
  their linked canonical `record_id` when one exists.
- If conversation context is requested, `expanded_lane.conversation_context`
  contains the linked public communication history and delivery targets for the
  lane.

### `chat.replay`

Returns ordered chat events after a supplied sequence.

Request fields:

- `after_sequence`

Response fields:

- `events`
- `latest_sequence`
- `reset_required`

Normative behavior:

- `events` is strictly ordered by ascending `sequence`.
- All returned events have `sequence > after_sequence`.
- If Nex can no longer provide a contiguous replay after `after_sequence`, it
  returns `reset_required = true`.
- When `reset_required = true`, the client must discard local chat state and
  call `chat.snapshot`.

### `chat.send`

Queues a user message into a lane.

Request fields:

- `lane_id`
- `message`
- optional `thinking`
- optional `attachments`
- optional `idempotency_key`

Response fields:

- `status`
- `lane_id`
- `session_id`
- `request_id`

Normative behavior:

- Nex resolves the active session for the supplied lane.
- If the lane has no active session, Nex creates or resolves the correct
  session before dispatch.
- Nex persists the human-visible operator message as a canonical record before
  execution continues on the resolved lane and session.
- Nex preserves durable linkage between the resulting session transcript message
  and the canonical record for that utterance.
- If the lane has a selected delivery target, Nex uses that routing state for
  continuation.
- After canonical record persistence, Nex explicitly continues execution on the
  resolved lane and session.
- `status` is `queued` on success.

### `chat.abort`

Aborts the active run for a lane.

Request fields:

- `lane_id`

Response fields:

- `ok`
- `lane_id`
- `session_id`
- `aborted`

Normative behavior:

- Nex resolves the active session for the lane.
- Nex aborts the active run for that session through the canonical abort path.
- Nex emits the resulting lane and run-state changes into the chat event log.

### `chat.approvals.respond`

Resolves a pending approval for a lane.

Request fields:

- `lane_id`
- `approval_id`
- `decision`

`decision` values:

- `approve`
- `deny`

Response fields:

- `ok`
- `lane_id`
- `approval_id`
- `status`

Normative behavior:

- `approve` maps to the canonical approval-allow path.
- `deny` maps to the canonical approval-deny path.
- The resulting approval state is emitted into the chat event log.

### `chat.delivery.select`

Selects the active delivery target for a lane with linked conversation context.

Request fields:

- `lane_id`
- `target_id`

Response fields:

- `ok`
- `lane_id`
- `target_id`

Normative behavior:

- Nex updates the lane routing state used for future sends.
- The resulting selection is emitted into the chat event log.

### `chat.actions.create`

Creates a lane action for one agent group.

Request fields:

- `agent_id`
- `label`
- `description`
- `icon`
- `shortcut`
- `invocation_mode`
- `requires_input`
- `default_prompt`

### `chat.actions.update`

Updates one lane action for one agent group.

Request fields:

- `agent_id`
- `action_id`
- optional `label`
- optional `description`
- optional `icon`
- optional `shortcut`
- optional `invocation_mode`
- optional `requires_input`
- optional `default_prompt`

### `chat.actions.delete`

Deletes one lane action for one agent group.

Request fields:

- `agent_id`
- `action_id`

### `chat.actions.invoke`

Invokes one lane action against the selected lane.

Request fields:

- `lane_id`
- `action_id`
- optional `input_text`

## Live Event Contract

The websocket broadcast event name is `chat`.

The `chat` event payload is one `ChatEvent`.

Normative behavior:

- The client applies `chat` events strictly by ascending `sequence`.
- If the client observes a sequence gap, it must stop incremental application
  and call `chat.replay`.
- If replay cannot recover the gap, the client must call `chat.snapshot`.

## Primitive Reuse

The operator chat runtime is built from existing Nex primitives wherever those
primitives already define the canonical truth.

### Lane Directory Inputs

Lane summaries and lane hierarchy are derived from:

- `agents.list`
- agent identity metadata
- active session ownership in `agents.db`
- session continuity such as `parent_session_id`
- worker spawn continuity where tool or runtime state links one session to
  another

### Session Transcript Inputs

Session transcript reads are derived from:

- `agents.sessions.history`
- direct session-ledger reads from `agents.db`
- turn rows
- message rows
- tool-call rows
- session-history markers

### Conversation Context Inputs

Conversation context reads are derived from:

- `agents.conversations.list`
- `agents.conversations.get`
- `agents.conversations.history`
- `records.db`
- canonical entity resolution

### Command Execution Inputs

Command execution reuses:

- canonical record persistence plus explicit lane/session continuation for
  `chat.send`
- the canonical session abort path for `chat.abort`
- the canonical approval resolution paths for `chat.approvals.respond`
- the agent-group lane-action catalog for `chat.actions.*`

## Durability And Streaming Split

The operator chat runtime separates durable human-visible material from live
streaming execution state.

Normative rules:

- human-visible operator input is persisted as a canonical record
- final human-visible assistant output is persisted as a canonical record
- session transcript entries for those utterances preserve durable record
  linkage
- streaming deltas, tool progress, and lifecycle churn are emitted through chat
  events rather than through canonical records
- memory and other record-oriented systems read durable human-visible material
  from canonical records rather than from the session ledger

## Projection And Replay Requirements

Nex owns a durable chat projection and durable chat event log for this
contract.

The chat projection persists:

- lane summaries
- lane hierarchy
- conversation-scope correlation
- selected delivery target
- durable ordered chat events

The chat projection does not replace the canonical ledgers for:

- transcript messages
- public records
- approval truth
- model truth
- provider truth

Detailed lane payloads are assembled from canonical ledgers on read.
Replay and ordering are served from the durable chat event log.
