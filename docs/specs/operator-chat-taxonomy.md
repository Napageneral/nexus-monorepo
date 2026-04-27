# Operator Chat Taxonomy

**Status:** CANONICAL
**Last Updated:** 2026-04-07
**Related:** [Operator Chat Surface And Agent Lanes](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-surface-and-agent-lanes.md), [Operator Chat Runtime Contract](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-runtime-contract.md), [Operator Chat t3code Shell Transplant](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-t3code-shell-transplant.md), [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)

---

## Purpose

This document defines the canonical nouns for the Nexus operator chat domain.

It exists to keep runtime, UI, storage, and validation work aligned under one
vocabulary before implementation expands.

## Core Objects

### Chat Surface

The chat surface is the operator-facing product mounted as the global `Chat`
tab in the Nex console.

It is the canonical UI for direct agent chat, worker chat, session transcript
inspection, public conversation inspection, and conversation continuation.

### Agent Group

An agent group is the operator-facing sidebar grouping object that preserves
the upstream project visual role inside the forked `t3code` shell.

An agent group represents one directly chatable top-level agent and owns the
lane rows shown beneath it.

### Agent Lane

An agent lane is the operator-facing navigation object shown in the chat
sidebar.

An agent lane is the stable thing the operator clicks.
It is not a generic project or thread.

Each lane resolves to one current execution target and one current read model.

### Top-Level Lane

A top-level lane is an agent lane representing a directly chatable agent.

Examples:

- the default manager agent
- another directly chatable agent that is not the default manager

### Worker Lane

A worker lane is an agent lane nested under a parent lane.

A worker lane represents a directly inspectable or directly chatable worker
execution target derived from child-session continuity or worker identity.

### Lane Hierarchy

Lane hierarchy is the parent-child relationship between top-level lanes and
worker lanes.

Lane hierarchy is derived from session continuity and worker ownership, not from
generic thread nesting.

### Active Session

The active session is the current execution backing object for a lane.

A lane may persist across multiple sessions over time, but it has at most one
active session at a time.

### Session Transcript

The session transcript is the primary execution history shown for a lane.

It is built from the `agents.db` session ledger and includes:

- user messages
- assistant messages
- system messages
- tool-linked execution history
- session-history markers
- worker-spawn continuity

For transcript entries that correspond to durable human-visible utterances, the
session transcript preserves durable linkage to the canonical record for that
utterance.

### Timeline Activity

Timeline activity is non-message execution history associated with a lane.

Examples:

- run lifecycle changes
- tool activity
- file changes
- approval requests and resolutions
- worker spawn events
- runtime warnings

Timeline activity is rendered alongside the session transcript but is a separate
object class from transcript messages.

### Conversation Context

Conversation context is the linked public communication history associated with
a lane.

It is built from Nex conversations and records and may include multiple
external channels contributing to one operator-facing conversation scope.

### Conversation Scope

A conversation scope is the operator-facing grouping of one or more Nex
conversation ids that together represent the public communication context for a
lane.

A conversation scope does not replace the session transcript.
It enriches the lane with public-channel history and continuation routes.

Conversation scope is a chat projection concept.
Raw records remain linked to canonical conversation ids rather than to
conversation-scope ids.

### Delivery Target

A delivery target is one available outbound route for continuing a linked public
conversation from the operator chat surface.

Examples:

- an iMessage destination
- a Discord thread
- an email destination

The selected delivery target is the route used when the operator continues the
conversation from the lane.

### Lane Action

A lane action is a reusable operator-visible action attached to an agent group
and surfaced inside the selected lane workspace.

Lane actions are Nex-native task and prompt-launch objects.
They are not shell commands, worktree scripts, or git actions.

### Canonical Record

A canonical record is the durable human-visible utterance stored in the Nex
records substrate.

Canonical records are the memory-facing and public-history-facing material for:

- operator-visible user messages
- final human-visible assistant replies
- public inbound channel messages
- public outbound channel messages

Canonical records do not represent:

- partial token streaming
- tool progress ticks
- lifecycle churn
- other non-durable execution noise

### Chat Projection

The chat projection is the Nex-owned read model above the canonical ledgers and
runtime events that powers the operator chat surface.

The chat projection owns:

- lane summaries
- lane hierarchy
- conversation-scope links
- delivery-target selection
- the durable ordered chat event log

The chat projection is not a second source of truth for sessions,
conversations, approvals, or records.

### Chat Sequence

The chat sequence is the monotonic ordering value for the durable chat event
log.

The chat sequence is global to the chat surface.
It allows clients to apply updates deterministically and detect missed events.

## Recovery Vocabulary

### Authoritative Read Snapshot

An authoritative read snapshot is one internally consistent description of the
operator-visible chat state at a specific chat sequence.

If a client receives the snapshot, it can rebuild the visible chat surface from
that payload alone.

### Ordered Chat Event Stream

The ordered chat event stream is the replayable sequence of chat-domain events
emitted by Nex for the operator chat surface.

The order is defined by the chat sequence rather than by client receipt time.

### Replay Recovery

Replay recovery is the client recovery path used after reconnect or after a
detected sequence gap.

The client asks Nex for all chat events after its last applied chat sequence.
If Nex cannot provide a contiguous replay, the client discards local chat state
and bootstraps from a fresh authoritative read snapshot.

## Contract Vocabulary

### Chat Snapshot

The chat snapshot is the runtime response that returns the authoritative read
snapshot for the operator chat surface.

### Chat Event

A chat event is one entry in the ordered chat event stream.

Chat events describe lane-level changes, transcript changes, activity changes,
approval changes, conversation-context changes, and delivery-target changes.

### Chat Command

A chat command is one operator action executed through the chat runtime
contract.

Examples:

- send message
- abort active run
- approve request
- deny request
- select delivery target

## Modeling Rules

The operator chat domain follows these rules:

- the lane is the primary navigation object
- the session is the primary execution backing object
- the session transcript is the primary execution history
- canonical records are the durable human-visible utterance layer
- conversation context is linked context, not the primary execution history
- chat events are the streaming and live-update layer
- the chat projection owns replayable chat ordering
- Nex canonical schemas do not use a `kind` field for this domain
- UI-only discriminants may exist inside the forked `t3code` client view model
  without becoming Nex canonical schema fields
