# Operator Chat Surface And Agent Lanes

**Status:** CANONICAL
**Last Updated:** 2026-04-07
**Related:** [Operator Chat Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-taxonomy.md), [Operator Chat Runtime Contract](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-runtime-contract.md), [Operator Chat t3code Shell Transplant](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-t3code-shell-transplant.md), [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md), [Spec Standards](/Users/tyler/nexus/home/projects/nexus/docs/spec-standards.md)

---

## Purpose

This document defines the target-state operator chat architecture for Nexus.

The global `Chat` tab is the canonical operator surface for:

- talking directly to manager agents
- talking directly to worker agents when they are visible and chatable
- inspecting the live execution transcript of an agent session
- inspecting linked public conversation history across external channels
- continuing those linked conversations from the operator UI

Nex owns the chat truth.
The forked `t3code` application is the chat microfrontend and rendering shell.

## Customer Experience

The intended operator experience is:

1. the operator opens one global `Chat` tab in the Nex console
2. the left sidebar uses an agent-group and lane-row hierarchy derived from the
   upstream `project -> thread` shell grammar
3. manager groups can expand to reveal worker lanes underneath them
4. selecting any lane shows the direct session transcript for that lane
5. if the lane is linked to a public conversation, the operator can inspect the unified channel history that contributed to that conversation
6. the operator can continue the conversation from the same UI without leaving the chat surface
7. live run state, approvals, tool activity, and spawned worker activity appear in place without refresh

## Product Boundary

The target-state system has these ownership boundaries:

- Nex runtime owns agents, sessions, session ledger history, conversations, records, approvals, model selection, runtime policy, and delivery routing.
- Nex runtime owns the canonical chat contract consumed by the operator UI.
- Nex runtime owns the durable chat projection used for lane summaries, ordered chat events, and replay.
- The forked `t3code` web app is a microfrontend mounted inside the console `Chat` tab.
- The forked `t3code` app is not an independent server, database, orchestration authority, or source of truth.

The system does not include:

- a standalone `t3code` backend or SQLite store
- a second orchestration engine beside Nex
- project or worktree management as a primary chat concept
- terminal drawers, git header controls, diff panels, checkpoint panels, or separate runtime-mode toggles as part of the supported chat product

The supported shell intentionally preserves upstream `t3code` visual grammar.
That grammar is defined in
[Operator Chat t3code Shell Transplant](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-t3code-shell-transplant.md).

## Vocabulary

The canonical nouns for this surface are defined in
[Operator Chat Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-taxonomy.md).

This document uses those nouns without redefining them.

## Agent Lane Model

Agent lanes are the primary navigation model for the global chat tab.

The preserved sidebar shell presents those lanes inside agent groups rather
than as a flat list.

### Top-level lanes

Top-level lanes are the directly chatable agents returned by the Nex agent
directory.

Each top-level lane has:

- a stable lane id
- a target agent id
- a current active session id when one exists
- a lane title derived from agent identity
- current run state
- model and provider references resolved by Nex
- delivery state when the lane is linked to public conversation context

### Worker lanes

Worker lanes are nested under a parent manager lane when the worker is directly
chatable.

Worker visibility is derived from spawned or child session continuity rather
than from generic thread membership.

A worker lane may be backed by:

- a distinct agent identity with its own active session
- a directly addressable child session linked to a parent session

Worker lane titles are derived from the worker identity when present, otherwise
from the session task description or the spawning context.

### Agent groups

Agent groups are the preserved sidebar grouping layer for this surface.

An agent group:

- corresponds to one top-level directly chatable agent
- owns the direct lane row for that agent
- owns any worker lane rows nested beneath it
- preserves the upstream project-header visual role without making projects a
  product noun

### Lane continuity

An agent-backed lane remains stable across active-session rollover.
The lane is the persistent navigation object; the active session is the current
execution target for that lane.

A session-backed worker lane remains stable for the lifetime of that worker
session and remains addressable after completion for transcript inspection.

### Conversation binding

A lane may have no linked public conversation context, one linked conversation,
or one unified conversation scope composed from multiple linked conversations.

Conversation binding does not change the primary transcript source.
It adds public channel history and delivery routing to the lane.

## Conversation Scope

The operator chat surface supports unified public conversation history across
multiple channels.

The target-state conversation model is:

- a lane may reference a conversation scope id
- a conversation scope may include one or more Nex conversation ids
- the scope is built from canonical identity resolution plus channel-specific
  conversation membership
- the scope exposes the ordered public record history that contributed to the
  conversation
- the scope exposes one selected delivery target plus the available delivery
  targets for continuation

`conversation_scope_id` belongs to the chat projection and read model.
Underlying raw records remain linked to canonical conversation ids.

This allows one chat lane to show:

- the direct agent session transcript
- the linked iMessage, Discord, email, or other public record history
- the active outbound delivery target when the operator continues the
  conversation from the UI

## Runtime Contract Boundary

The canonical runtime contract for this surface is defined in
[Operator Chat Runtime Contract](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-runtime-contract.md).

This surface depends on that contract for:

- authoritative snapshots
- ordered chat events
- replay recovery
- chat commands
- model and provider metadata
- lane actions

## Primitive Reuse

The chat surface is built from existing Nex primitives wherever those primitives
already define the canonical truth.

### Lane directory

The lane directory is derived from:

- `agents.list`
- agent identity and workspace bindings
- session ownership and continuity in `agents.db`
- child-session relationships such as `parent_session_id`
- spawned worker relationships where tool activity links one session to another

### Session transcript

The session transcript is derived from:

- `agents.sessions.history`
- direct session-ledger reads from `agents.db`
- turn rows
- message rows
- tool-call rows
- session-history markers

The chat product does not use `agents.conversations.history` as the primary
transcript because that surface returns public records rather than the execution
history of the agent session.

For transcript entries that correspond to durable human-visible utterances, the
session transcript preserves durable linkage to the canonical records used by
memory and other record-oriented systems.

### Conversation context

Conversation context is derived from:

- `agents.conversations.list`
- `agents.conversations.get`
- `agents.conversations.history`
- `records.db`
- canonical entity resolution from identity storage

The chat product uses these surfaces to enrich the lane with public channel
history and delivery routing.

### Live updates

Live chat projection updates are derived from:

- `agent` websocket events
- `agent.run` websocket events
- `acl.approval.requested`
- `acl.approval.resolved`
- session and conversation lifecycle changes

The chat runtime normalizes those sources into the canonical ordered chat event
stream.

### Message dispatch and approval resolution

Chat commands reuse existing runtime paths:

- `chat.send` persists durable human-visible operator input into canonical
  records and then continues the resolved lane and session explicitly
- `chat.abort` uses the canonical session abort path
- `chat.approvals.respond` resolves through the canonical ACL approval paths
- `chat.delivery.select` updates canonical lane routing state used by future
  sends

Final human-visible assistant output is also projected into canonical records.
Streaming execution state remains a chat-event concern rather than a records
concern.

## Chat Projection Ownership

Nex owns a durable chat projection above the underlying ledgers and runtime
events.

That projection owns:

- the ordered chat event log
- the lane summary read model
- the conversation-scope read model
- the mapping from low-level runtime events into chat-domain events

This projection is not a second source of truth.
Its job is to provide a stable chat read model and replayable event stream above
the canonical ledgers that already own agent, session, conversation, record,
approval, and model truth.

## Model And Provider Contract

The chat UI keeps a provider-runtime-style event and activity vocabulary because
that is the right rendering abstraction for a coding-oriented chat transcript.

The source of provider and model truth is still Nex.

The target-state rules are:

- model catalogs come from Nex, not from upstream `t3code` enums
- provider identifiers come from Nex, not from upstream `t3code` provider names
- runtime settings shown in the UI are the current Nex runtime settings for the
  lane
- timeline items may represent tool calls, spawned workers, file changes, web
  activity, approvals, warnings, and agent output
- git-worktree-specific and checkpoint-specific concepts do not define the chat
  contract

## Shell Contract

The canonical shell contract for this surface is defined in
[Operator Chat t3code Shell Transplant](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-t3code-shell-transplant.md).

That shell contract defines:

- how the preserved upstream `t3code` visual grammar maps onto agent groups and
  lane rows
- which upstream shell surfaces survive
- how lane actions replace project-script semantics
- which upstream git, terminal, diff, and worktree surfaces are deleted

## Microfrontend Boundary

The global `Chat` tab mounts the forked `t3code` web app as a microfrontend
inside the operator console.

The host console owns:

- the outer console navigation
- auth and runtime connection bootstrap
- route mounting for the `Chat` tab
- microfrontend container sizing and lifecycle

The chat microfrontend owns:

- sidebar interaction
- transcript rendering
- composer behavior
- lane-local query and cache state
- chat-specific keyboard navigation

The microfrontend must scope its own styling and runtime assumptions to its root
container.
It must not rely on the Nex console host to provide `t3code` server behavior,
project state, thread state, or git/worktree runtime state.

## Supported Fork Surface

The supported upstream `t3code` surface in the Nex fork is:

- the sidebar layout and navigation interaction model
- the chat transcript and composer experience
- the provider-runtime-style timeline rendering model
- the React microfrontend shell and local state architecture where it remains
  useful

The supported Nex fork does not include:

- project lists as the primary sidebar model
- generic thread lists as the primary sidebar model
- the upstream orchestration server contract
- the upstream project and worktree contract
- terminal drawers
- git branch and worktree header controls
- diff panels
- checkpoint panels
- standalone proposed-plan product surfaces
- the upstream full-access versus supervised runtime-mode toggle

The Nex fork presents agent lanes and worker lanes as the primary objects of the
chat product.
