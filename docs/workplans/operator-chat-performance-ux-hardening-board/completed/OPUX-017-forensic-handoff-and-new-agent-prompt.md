---
summary: "Handoff context for the Nex operator chat t3code fork, current forensic findings, and a prompt for the next agent."
title: "OPUX-017 - Forensic Handoff And New Agent Prompt"
---

# OPUX-017 - Forensic Handoff And New Agent Prompt

## Purpose

This document preserves the current operator chat context so a new agent can
continue without relying on prior chat memory.

The work is not a custom chat redesign. The long-term goal is to run a true
t3code fork as the Nex Console Chat tab, preserve upstream t3code visual and
interaction behavior wherever possible, and connect that shell directly to the
Nex runtime, agent/session ledger, records ledger, approvals, actions, and
delivery context.

## Canonical Docs

Start with these documents:

- `/Users/tyler/nexus/AGENTS.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-taxonomy.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-surface-and-agent-lanes.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-runtime-contract.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-t3code-shell-transplant.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-performance-and-ux-hardening.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/validation/operator-chat-performance-ux-validation-ladder.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/README.md`

Important local repos:

- Umbrella repo: `/Users/tyler/nexus/home/projects/nexus`
- Core runtime repo: `/Users/tyler/nexus/home/projects/nexus/nex`
- Operator chat fork: `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app`
- Operator console host: `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app`
- Upstream t3code reference checkout: `/Users/tyler/nexus/home/projects/t3code`

## High-Level Product Goal

The Console Chat tab should be a global agent chat workspace:

- The left rail shows manager/agent lanes first.
- Worker/subagent lanes are hidden behind explicit agent expansion.
- A manager lane can be selected directly.
- A worker lane can be selected when the operator intentionally expands or
  deep-links into it.
- Nex remains the source of truth for sessions, messages, records, approvals,
  actions, runtime state, replay, and linked public conversation context.
- The t3code fork should keep upstream layout, scroll behavior, composer
  behavior, action bar behavior, and visual polish unless a Nex product seam
  requires a targeted adaptation.

Removed or disabled surfaces remain out of scope for Nex Chat:

- terminal drawer
- git/worktree controls
- checkpoint and diff panels
- IDE open controls
- commit, push, and pull-request controls

Useful upstream surfaces that should survive:

- sidebar visual language
- chat transcript and composer
- model/runtime picker shape, mapped to Nex-supported models
- action creation/invocation bar, mapped to Nex lane actions
- auxiliary context sheet for Nex-only linked context

## Data Ownership Goals

The architecture should keep these responsibilities separate:

- `agents.db` session ledger: operator-facing execution transcript and session
  continuity.
- `records.db`: durable human-visible utterance substrate for memory/public
  records.
- chat projection: UI read model that combines lanes, selected transcript
  window, runtime state, approvals, actions, and linked context.
- chat events: live streaming and replay surface for UI state changes.

Human-visible operator input should be records-first, then explicit lane/session
continuation. Final assistant output should also project into records. Partial
tokens, lifecycle churn, and tool progress should be chat events, not canonical
records.

For human-visible session messages, message metadata should keep stable links to
projected records so UI transcript and memory/public substrate do not drift.

## Current Forensic Findings

### 1. Selected-Lane History Is Session-Scoped

Current behavior:

- Echo root lane is `lane:agent:entity-assistant`.
- Echo points at `session:operator-chat:entity-assistant`.
- That active operator-chat session has 23 ledger messages and 19 renderable
  messages.
- The selected-lane snapshot reads only that active session ancestry.
- Older Echo history exists across older sessions and chat events, but is not
  rendered as a lane-global timeline.

Relevant code:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/chat-projection.ts`
  reads selected lane messages through `readMessages(...)`.
- `readMessages(...)` resolves the lane session to a thread and reads messages
  only from that thread ancestry.

Current vs ideal:

- Current: selected Echo shows the active operator-chat session window.
- Ideal: selecting Echo should show a lane-global, paged history surface while
  still using the active session as the send/continuation target.

Recommended direction:

- Add an explicit lane timeline/read side rather than overloading the active
  session transcript.
- Page older history by session/message cursor.
- Preserve active session continuity for sends.

### 2. Sends Persist, But Replay Recovery Is Too Strict

Current behavior:

- `chat.send` resolves the lane/session.
- It projects the human-visible user message into records.
- It appends the user message into the agent session ledger.
- It inserts a chat `message.appended` event with a stable
  `client_message_id`.
- It continues execution through the resolved session.
- Final assistant output is projected into records and emitted as a chat event.

Relevant code:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/server-methods/chat.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/runtime/runtime.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/nex/chat-adapter.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/store.ts`

Live evidence:

- Recent Echo test messages have matching user input records and assistant
  output records.
- New user messages include `client_message_id`; the UI maps that to the
  optimistic message id for dedupe.
- Older test rows without `client_message_id` can look duplicate-like because
  they predate the current dedupe path.

The important bug:

- `chat_events.sequence` is monotonic but not gapless.
- SQLite `AUTOINCREMENT` plus ignored duplicate projections creates skipped
  sequence slots.
- `chat.replay` currently treats a sequence jump as a reset condition.
- The UI recovery path also treats sequence jumps as missing event gaps.
- The live DB had multiple sequence gaps, including a 37-slot gap between
  `6855` and `6893`.

Current vs ideal:

- Current: legitimate sparse sequence jumps can force slow snapshot recovery,
  causing replies to appear late or only after reload.
- Ideal: replay should use monotonic ordering and `after_sequence` paging, not
  require gapless sequences.

Recommended direction:

- Fix replay/reset semantics to tolerate sparse monotonic sequences.
- Keep reset only for actual retention/window loss, not skipped row ids.
- Validate one controlled Echo send/reply after replay recovery is fixed.

### 3. Scroll Code Is Mostly Upstream t3code

Current behavior:

- The forked `MessagesTimeline.tsx` matches upstream t3code.
- The transcript container still uses upstream scroll ownership:
  `min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain`.
- Programmatic browser probing confirmed the selected transcript can scroll.

Relevant code:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/components/chat/MessagesTimeline.tsx`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/components/ChatView.tsx`

Current vs ideal:

- Current: scroll often feels broken because selected lane hydration is slow
  and the page can sit in a nearly empty or stale state.
- Ideal: transcript is immediately responsive after lane selection, with
  selected transcript detail loaded cheaply and older history paged.

Recommended direction:

- Do not rewrite t3code scroll unless a focused probe proves a scroll bug.
- First reduce selected snapshot payload and recovery churn.
- Then run OPUX-015 large-transcript scroll proof.

### 4. Runtime Bootstrap Is Not The Main Slow Path

Current behavior:

- Runtime is reachable at `ws://127.0.0.1:18789`.
- Default no-lane `/chat` boot is usually fast.
- No-lane `chat.snapshot` returns only root agent lanes and is about `0.12s`
  from the CLI in the current live workspace.
- Selecting Echo is slow because selected `chat.snapshot` still performs too
  much work.

Measured current behavior:

- No-lane snapshot returned 3 root agent lanes.
- Selected Echo snapshot returned about `162 KB`, 134 lanes, 131 worker lanes,
  and 19 selected messages.
- Browser click-to-selected-transcript probe took about `1.8s`.
- The selected snapshot included 112 direct Echo worker children.

Relevant code:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/chat-projection.ts`
  calls `synchronizeChatProjection(...)` on selected-lane reads.
- `selectSnapshotLaneRows(...)` recursively includes all descendants when the
  selected lane is a root agent lane.

Current vs ideal:

- Current: selecting a manager lane pulls all worker descendants and may run
  full projection sync.
- Ideal: selecting a manager lane loads manager transcript/state only; worker
  lanes load only on explicit expansion, search, or deep link.

Recommended direction:

- Split cheap snapshot read from projection synchronization.
- Do not recursively include all children for selected root lanes.
- Add targeted child-lane loading for explicit expansion.

### 5. URL Selection Source Exists But Runtime-Served Bundle Is Stale

Current behavior:

- Source has support for reading `?lane=...` and passing `initialLaneId` into
  the chat microfrontend.
- Source has support for writing lane selection back to the URL.
- The runtime-served console bundle did not include the lane selection callback
  when last inspected.

Relevant source:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app/src/console/pages/chat.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app/src/console/components/chat-microfrontend-host.ts`

Current vs ideal:

- Current: deep link selection and URL writeback can fail if the console bundle
  served by runtime is stale.
- Ideal: Chat tab without a lane shows neutral picker; selecting a lane writes
  the lane parameter; valid lane deep links select; invalid lane links clear.

Recommended direction:

- Complete OPUX-014 by rebuilding/syncing the console bundle and proving served
  assets contain the source behavior.

## Current Board State

Primary active board:

- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/README.md`

Completed:

- OPUX-001 through OPUX-012, except OPUX-006 remains open for upstream parity.

Remaining next-pass tickets:

- OPUX-006 upstream visual parity review.
- OPUX-013 manager-first sidebar parity pass.
- OPUX-014 chat URL selection state.
- OPUX-015 transcript virtualization and scroll robustness.
- OPUX-016 cleanroom performance regression proof.

Recommended additional tickets to create before implementation continues:

- Replay semantics for sparse monotonic chat event sequences.
- Selected snapshot payload reduction and projection-sync separation.
- Lane-global history/timeline read model.

## New Agent Prompt

Use this prompt in the next chat:

```text
You are continuing Nex operator Chat work in /Users/tyler/nexus.

First run:

nexus status

Then read:

- /Users/tyler/nexus/AGENTS.md
- /Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md
- /Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-taxonomy.md
- /Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-surface-and-agent-lanes.md
- /Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-runtime-contract.md
- /Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-t3code-shell-transplant.md
- /Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-performance-and-ux-hardening.md
- /Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/README.md
- /Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-performance-ux-hardening-board/completed/OPUX-017-forensic-handoff-and-new-agent-prompt.md

Important repos:

- Core runtime: /Users/tyler/nexus/home/projects/nexus/nex
- Operator chat fork: /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app
- Console host: /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app
- Upstream t3code reference: /Users/tyler/nexus/home/projects/t3code

Project goal:

Make the Nex Console Chat tab a true t3code-fork microfrontend that preserves upstream t3code UI/behavior wherever possible while using Nex as the source of truth for agent lanes, sessions, messages, records, replay, approvals, actions, model settings, and linked public context.

Do not pursue temporary bridges or compatibility shims. This is a hard-cutover architecture.

Do not add any new data schema field named `kind`. Respect /Users/tyler/nexus/AGENTS.md.

Current forensic conclusions:

1. Echo selected-lane history is currently active-session scoped, not lane-global. The active Echo operator session has 23 ledger rows and 19 renderable messages. The ideal is a lane-global paged timeline while preserving the active session as the send target.
2. `chat.send` is mostly correct: records-first input, ledger append, chat event, explicit session continuation, final assistant output projection. The bigger bug is replay: `chat_events.sequence` is monotonic but sparse, while replay/UI recovery treat sequence jumps as loss.
3. Scroll is mostly upstream t3code and programmatically works. The bad UX comes from slow selected-lane hydration and oversized selected snapshots, not from a proven t3code scroll rewrite bug.
4. Runtime bootstrap is usually fast. No-lane `chat.snapshot` is small and quick. Selecting Echo is slow because selected snapshots still run too much projection work and include all recursive worker descendants.
5. URL lane selection source exists, but the runtime-served console bundle was stale when last inspected. OPUX-014 needs build/sync/proof.

Recommended next step:

Before writing code, tighten the active board with tickets for:

- sparse monotonic chat replay semantics
- selected snapshot payload reduction and projection-sync separation
- lane-global history/timeline read model

Then implement in this order:

1. Finish OPUX-014 so URL selection/deep links work in the served console bundle.
2. Fix replay semantics so sparse monotonic sequences do not force reset/snapshot recovery.
3. Reduce selected manager snapshot payload and stop recursive worker inclusion on normal manager selection.
4. Define and implement lane-global history separately from active-session send continuity.
5. Run OPUX-015 large-transcript scroll proof.
6. Close with OPUX-016 cleanroom performance regression proof and update the validation ladder.

Use cleanroom validation as the default proof posture. Use live dogfood only for forensics or final operator confirmation.
```

## Immediate Cautions

- Do not mistake umbrella repo state, core runtime state, and package app state
  for one repo.
- Do not assume the served console bundle matches source; inspect built assets
  or rebuild and restart before trusting browser behavior.
- Do not test send/reply repeatedly against live Echo until replay and hydration
  are understood, or the transcript will accumulate confusing probe messages.
- Do not rewrite t3code UI components unless upstream comparison and browser
  probes prove that the forked component itself is the problem.

## Closeout

This handoff produced the active follow-up tickets and is now historical
context. OPUX-014, OPUX-018, OPUX-019, and OPUX-020 closed the implementation
findings captured here. OPUX-015 and OPUX-016 closed after the 2026-04-29
Docker cleanroom proof at
`/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260429T174053Z`.
