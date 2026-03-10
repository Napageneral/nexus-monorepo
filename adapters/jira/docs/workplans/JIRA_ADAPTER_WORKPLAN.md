# Jira Adapter Workplan

**Spec**: `docs/specs/ADAPTER_SPEC_JIRA.md`  
**Archive of completed work**: `docs/workplans/archive/JIRA_ADAPTER_IMPLEMENTATION_ARCHIVE_2026-03-10.md`

## Customer Goal

Status: complete.

The remaining Jira work is not to “build a Jira adapter from scratch.”

The remaining goal is narrower and stricter:

- keep the inbound/read-only implementation that already works
- cut outbound Jira delivery over to the canonical channel model
- validate that the UI can trigger every Jira write behavior by channel target rather than by payload-embedded routing

If that cutover is not done, the adapter is not done.

## Archived Completed Work

These items are complete and removed from the active work surface:

- scaffolding and module setup
- auth and setup flow
- project discovery
- health checks
- Jira Cloud API client
- ADF to markdown conversion for inbound data
- monitor
- backfill
- issue/comment/changelog record emission
- real Jira Cloud read-only validation

Those execution details are preserved in:

- `docs/workplans/archive/JIRA_ADAPTER_IMPLEMENTATION_ARCHIVE_2026-03-10.md`

## Gap Analysis

### What already matches the target state

- inbound records use the correct Jira routing shape:
  - project as `container_id`
  - issue as `thread_id`
- `connection_id` is already used in the adapter’s canonical inbound envelopes
- setup, health, backfill, and monitor work against a real Jira Cloud tenant
- the adapter can already perform the intended Jira write actions at the HTTP level

### What does not match the target state

The outbound routing model is wrong today.

Current behavior:

- `delivery.send` parses action JSON from `text`
- `create_issue` routes from payload field `project`
- `comment`, `transition`, `assign`, and `add_label` route from payload field `issue_key`

Required behavior:

- route from `connection_id` + canonical target channel
- derive project from `channel.container_id`
- derive issue from `channel.thread_id`
- treat payload as action content only

### Why this matters

Without this cutover:

- the UI cannot rely on the channel model as the single routing authority
- Jira write behavior is inconsistent with Jira inbound records
- other adapters cannot share a uniform channel-first delivery story

## Completion Summary

The remaining routing cutover is implemented and validated.

Completed outcomes:

- Nex runtime now passes canonical delivery targets into the adapter boundary
- the shared Go adapter SDK accepts `channels.send --connection --target-json --text`
- Jira `create_issue` routes from project channels
- Jira `comment`, `transition`, `assign`, and `add_label` route from issue-thread targets
- payload routing fields `project` and `issue_key` are rejected
- live write validation passed against a real Jira Cloud tenant
- backfill and monitor both emitted the created issue, comment, and changelog mutations as canonical `record.ingest` envelopes
- monitor watermark formatting was fixed to use Jira's timezone semantics for JQL time comparisons

## Remaining Work Phases

## Phase 1: Freeze The Canonical Outbound Contract

**Goal**: remove ambiguity about the adapter-facing Jira write contract.

### Required outputs

- Jira spec updated to define project-channel and issue-thread routing
- active workplan rewritten around the cutover only
- validation ladder rewritten around post-cutover write validation

### Exit criteria

- no active Jira planning doc still describes payload-owned routing as valid target state

## Phase 2: Align The Adapter-Facing Send Contract

**Goal**: make the Jira adapter receive the canonical outbound target model rather than relying on legacy `to` / `text` assumptions.

### Research and implementation scope

Inspect and update the concrete adapter-facing request type in the shared Go SDK and any local protocol shims so the Jira adapter receives:

- `connection_id`
- `channel.platform`
- `channel.space_id`
- `channel.container_kind`
- `channel.container_id`
- optional `channel.thread_id`
- optional `reply_to_id`
- outbound text / payload content

### Files likely involved

- `adapters/nexus-adapter-sdks/nexus-adapter-sdk-go/types.go`
- `adapters/nexus-adapter-sdks/nexus-adapter-sdk-go/adapter.go`
- `adapters/nexus-adapter-jira/cmd/jira-adapter/protocol.go`

### Exit criteria

- Jira adapter code can read a canonical delivery target directly
- no Jira delivery path requires `project` or `issue_key` to decide destination

## Phase 3: Cut Jira Delivery Over To Channel Routing

**Goal**: make outbound Jira writes derive destination solely from the canonical target.

### Implementation requirements

- `create_issue`
  - derive project from `target.channel.container_id`
  - reject if `thread_id` is present
- `comment`
  - derive issue from `target.channel.thread_id`
  - reject if `thread_id` is absent
- `transition`
  - derive issue from `target.channel.thread_id`
- `assign`
  - derive issue from `target.channel.thread_id`
- `add_label`
  - derive issue from `target.channel.thread_id`

### Payload cutover

Remove routing authority from the action payload:

- delete required payload field `project`
- delete required payload field `issue_key`

Preserve only action content fields:

- `issuetype`
- `summary`
- `description`
- `assignee_account_id`
- `labels`
- `body`
- `target_status`
- `comment`

### Files likely involved

- `adapters/nexus-adapter-jira/cmd/jira-adapter/delivery.go`
- `adapters/nexus-adapter-jira/cmd/jira-adapter/main_test.go`

### Exit criteria

- all five Jira write actions route from the target channel
- unit tests prove payload routing fields are no longer required

## Phase 4: Add Strict Routing Validation

**Goal**: reject invalid action-target combinations deterministically.

### Required validation rules

- reject `create_issue` on issue-thread targets
- reject issue mutation actions on project-only targets
- reject non-`jira` platform targets
- reject missing `container_id`
- reject malformed Jira issue keys where the adapter expects an issue thread

### Exit criteria

- invalid routing fails before any Jira write call is attempted
- error messages are explicit enough for UI and operator debugging

## Phase 5: Align UI And Runtime Expectations

**Goal**: ensure the Jira adapter can actually be exercised from the Nex UI through the intended public flow.

### Required surface review

- public `channels.send` request shape
- runtime target resolution into adapter-facing `DeliveryTarget`
- adapter subprocess invocation for Jira

### Required outcome

There must be an end-to-end, documented route from:

- UI-selected Jira project channel -> `create_issue`
- UI-selected Jira issue thread -> `comment`, `transition`, `assign`, `add_label`

### Exit criteria

- there is no undocumented adapter-only routing assumption that the UI cannot produce

## Phase 6: Post-Cutover Live Write Validation

**Goal**: validate the real Jira write path only after the routing cutover is complete.

### Live write sequence

1. create one throwaway Jira issue from a project channel
2. add one markdown comment from the created issue thread
3. transition that same issue to one valid next status
4. assign that same issue to the intended Jira user
5. add one or two labels to that same issue
6. run negative tests for invalid routing and malformed action payloads

### Exit criteria

- every successful write is visible in Jira UI
- every invalid routing combination fails cleanly
- no write action depends on payload-owned `project` or `issue_key`

## File-Level Change Inventory

### Jira adapter docs

- `adapters/jira/docs/specs/ADAPTER_SPEC_JIRA.md`
- `adapters/jira/docs/workplans/JIRA_ADAPTER_WORKPLAN.md`
- `adapters/jira/docs/validation/JIRA_ADAPTER_VALIDATION.md`

### Jira adapter code

- `adapters/nexus-adapter-jira/cmd/jira-adapter/delivery.go`
- `adapters/nexus-adapter-jira/cmd/jira-adapter/protocol.go`
- `adapters/nexus-adapter-jira/cmd/jira-adapter/main_test.go`

### Shared adapter SDK / runtime boundary

- `adapters/nexus-adapter-sdks/nexus-adapter-sdk-go/types.go`
- `adapters/nexus-adapter-sdks/nexus-adapter-sdk-go/adapter.go`

Additional runtime files may need to move if the current `channels.send` to adapter invocation path still serializes legacy `--to` / `--text` only. That is an explicit research checkpoint, not a place to improvise.

## Definition Of Done

The Jira adapter is done only when all of the following are true:

- inbound/read-only behavior still passes
- outbound routing uses `connection_id` + canonical channel target
- project creation happens on project channels
- issue mutations happen on issue-thread targets
- payload fields no longer own routing
- UI-triggered `channels.send` can exercise all five Jira write actions through the canonical channel model

That definition is now satisfied for the Jira adapter's current scope.
