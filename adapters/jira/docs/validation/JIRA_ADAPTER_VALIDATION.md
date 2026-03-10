# Jira Adapter Validation Ladder

**Spec**: `docs/specs/ADAPTER_SPEC_JIRA.md`  
**Workplan**: `docs/workplans/JIRA_ADAPTER_WORKPLAN.md`  
**Archive of completed read-only work**: `docs/workplans/archive/JIRA_ADAPTER_IMPLEMENTATION_ARCHIVE_2026-03-10.md`

## Validation Status

Status: complete.

The full ladder has been exercised for the Jira adapter's current scope.

Key live evidence:

- Nex runtime `channels.send` successfully created Jira issue `VT-4864` from a Jira project channel
- Nex runtime `channels.send` successfully commented, transitioned, assigned, and labeled `VT-4864` from the Jira issue-thread target
- negative live routing checks failed cleanly before unintended writes
- bounded backfill emitted the created issue, comment `35220`, and three changelog records as canonical `record.ingest` envelopes
- bounded monitor emitted the same issue, comment, and changelog records after the watermark-to-Jira-timezone fix

## How To Use This Ladder

This ladder starts from the current Jira reality:

- read-only behavior has already been validated live
- outbound routing is the remaining architectural cutover

Do not resume live write testing until the earlier rungs in this ladder pass. The point is to prove that Jira writes now obey the canonical channel model, not merely that raw Jira API calls succeed.

## Archived Evidence

The following evidence is already complete and archived:

- local build and test validation
- live auth validation
- live project discovery
- live `adapter.health`
- live read-only backfill
- live read-only monitor

That evidence lives in:

- `docs/workplans/archive/JIRA_ADAPTER_IMPLEMENTATION_ARCHIVE_2026-03-10.md`

## Rung 0: Contract Alignment

**Goal**: confirm the active Jira docs and code all describe the same routing model.

### Automated checks

```bash
rg -n 'route from `connection_id` plus the canonical target channel' /Users/tyler/nexus/home/projects/nexus/adapters/jira/docs/specs/ADAPTER_SPEC_JIRA.md
rg -n 'derive project from `channel.container_id`' /Users/tyler/nexus/home/projects/nexus/adapters/jira/docs/specs/ADAPTER_SPEC_JIRA.md
rg -n 'derive issue key from `channel.thread_id`' /Users/tyler/nexus/home/projects/nexus/adapters/jira/docs/specs/ADAPTER_SPEC_JIRA.md
rg -n 'do not require payload field `project`' /Users/tyler/nexus/home/projects/nexus/adapters/jira/docs/specs/ADAPTER_SPEC_JIRA.md
rg -n 'do not require payload field `issue_key`' /Users/tyler/nexus/home/projects/nexus/adapters/jira/docs/specs/ADAPTER_SPEC_JIRA.md
```

### Pass criteria

- the Jira spec says project routing comes from `container_id`
- the Jira spec says issue routing comes from `thread_id`
- the active docs do not describe payload routing as target state

## Rung 1: Shared Adapter Contract Accepts Canonical Delivery Targets

**Goal**: prove the adapter-facing send contract exposes the canonical target model.

### Automated checks

```bash
rg -n "connection_id" /Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/nexus-adapter-sdk-go
rg -n "thread_id|container_id|reply_to_id" /Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/nexus-adapter-sdk-go
(cd /Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/nexus-adapter-sdk-go && go test ./...)
```

### Pass criteria

- the SDK request type exposes canonical target fields
- tests pass after the contract cutover

## Rung 2: Jira Adapter Routes Create-Issue From Project Channels

**Goal**: prove `create_issue` derives project from the target channel.

### Required tests

- unit test: project channel with `container_id = VT` and no `thread_id` succeeds
- unit test: payload omits `project` and still succeeds
- unit test: same action with a `thread_id` fails before any Jira write call

### Pass criteria

- project is derived from target channel only
- payload field `project` is not required for routing

## Rung 3: Jira Adapter Routes Issue Mutations From Issue Threads

**Goal**: prove issue mutations derive issue key from `thread_id`.

### Required tests

- unit test: `comment` succeeds with target `thread_id = VT-123`
- unit test: `transition` succeeds with target `thread_id = VT-123`
- unit test: `assign` succeeds with target `thread_id = VT-123`
- unit test: `add_label` succeeds with target `thread_id = VT-123`
- unit test: payload omits `issue_key` and still succeeds

### Pass criteria

- issue key is derived from `thread_id`
- payload field `issue_key` is not required for routing

## Rung 4: Invalid Routing Is Rejected Early

**Goal**: prove the adapter rejects invalid target/action combinations before writing to Jira.

### Required tests

- `create_issue` on issue-thread target -> reject
- `comment` on project channel -> reject
- `transition` on project channel -> reject
- `assign` on project channel -> reject
- `add_label` on project channel -> reject
- non-`jira` platform target -> reject
- missing `container_id` -> reject

### Pass criteria

- each invalid request fails with a deterministic adapter error
- no Jira API write call is attempted for invalid routing

## Rung 5: Local Regression Suite Passes

**Goal**: prove the cutover did not break the working read-only path.

### Automated checks

Run from `adapters/nexus-adapter-jira`:

```bash
go test ./...
go vet ./...
go build ./cmd/jira-adapter
```

### Pass criteria

- build passes
- tests pass
- vet passes

## Rung 6: Live Create-Issue Validation Via Project Channel

**Goal**: prove the first write operation works from the proper routing model.

### Manual test

Send a write request that targets a Jira project channel:

- `platform = jira`
- `space_id = <site>`
- `container_kind = group`
- `container_id = <project key>`
- no `thread_id`

Payload:

```json
{
  "action": "create_issue",
  "issuetype": "Task",
  "summary": "Adapter routing validation",
  "description": "Created via Jira project channel."
}
```

### Pass criteria

- Jira issue is created in the targeted project
- the adapter did not need a payload `project` field

## Rung 7: Live Issue-Thread Mutation Validation

**Goal**: prove all mutation actions work from the issue-thread target.

### Manual test sequence

Against the issue created in Rung 6:

1. `comment`
2. `transition`
3. `assign`
4. `add_label`

Each request must target:

- the same project `container_id`
- `thread_id = <created issue key>`

### Pass criteria

- every write appears correctly in the Jira UI
- none of the requests required payload `issue_key`

## Rung 8: Negative Live Routing Validation

**Goal**: prove the UI/runtime/adapter stack rejects invalid targets cleanly.

### Manual tests

- attempt `create_issue` on an issue-thread target
- attempt `comment` on a project channel
- attempt one request with a non-Jira platform target

### Pass criteria

- all three fail cleanly
- no unintended Jira writes occur

## Rung 9: UI-Level End-To-End Validation

**Goal**: prove the actual UI channel selection flow can drive Jira writes without adapter-specific routing hacks.

### Required checks

- select a Jira project channel in the UI and create an issue
- select the created Jira issue thread in the UI and post a comment
- validate the runtime resolves that public request into the adapter-facing target without custom Jira-only payload routing

### Pass criteria

- the UI can exercise the whole write path through the canonical channel model
- there is no hidden adapter-only requirement to pass `project` or `issue_key`

## Definition Of Done

The Jira adapter write path is validated only when:

- live read-only validation remains true
- all five write behaviors route from channel targets
- invalid routing combinations are rejected early
- the UI can trigger those writes through the canonical `channels.send` path

That definition is now satisfied for the Jira adapter's current scope.
