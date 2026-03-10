# Adapter Spec: Jira

## Customer Experience

The Jira adapter should make Jira feel native inside Nex.

For read behavior, an operator connects a Jira Cloud site once, selects the projects that matter, and Nex continuously ingests issues, comments, and changelog history as canonical records. A Jira issue should appear in Nex as a stable issue thread with the full surrounding context needed for agents and apps to reason over work.

For write behavior, Jira routing must be channel-first. Creating a Jira issue should happen by sending to a Jira project channel. Mutating an existing Jira issue should happen by sending to that Jira issue thread. The caller should not have to smuggle routing back into the action payload with fields like `project` or `issue_key` when the destination is already present in the canonical channel target.

That is the target customer experience:

- inbound and outbound use the same routing model
- project is the root channel container
- issue is thread metadata inside that project container
- payloads describe the action content, not the destination

## Status Snapshot

Implemented and already validated live:

- Jira Cloud auth
- setup flow with project discovery
- health checks
- monitor
- backfill
- issue/comment/changelog record emission
- ADF to markdown conversion for inbound content
- read-only validation against a real Jira Cloud tenant

Implemented and validated live:

- outbound Jira delivery routes from `connection_id` plus the canonical channel target
- `channels.send` from the Nex runtime can drive all five Jira write actions through the canonical target shape
- invalid routing combinations are rejected before any Jira write call is attempted

## Adapter Identity

- **Adapter ID**: `jira`
- **Platform**: `jira`
- **Language**: Go (`nexus-adapter-sdk-go`)
- **Runtime package**: `adapters/nexus-adapter-jira/`

## Contract Authority

The Jira adapter is anchored to the current Nex adapter specs under:

- `nex/docs/specs/adapters/channels-and-adapters.md`
- `nex/docs/specs/adapters/adapter-connections.md`
- `nex/docs/specs/adapters/contract/ADAPTER_PROTOCOL_SCHEMA.md`

Important interpretation rule:

- the schema and connection docs are authoritative that adapter-facing contracts use `connection_id`
- the channel model is authoritative that outbound routing is channel-first
- older prose residue using `account` / `account_id` in `adapter-protocol.md` is upstream spec debt and is not Jira target-state authority

## Normative Routing Rule

The non-negotiable Jira outbound routing rule is:

- route from `connection_id` plus the canonical target channel
- do not route from Jira-specific payload fields when the destination is already expressed by the target channel

This supersedes any earlier Jira doc or code path that treated payload fields like `project` or `issue_key` as the routing authority.

## Auth

**Method**: Atlassian API token via Basic auth

### Required fields

| Name | Type | Required | Description |
|---|---|---|---|
| `site` | `text` | yes | Atlassian Cloud site slug, for example `vrtlyai` from `vrtlyai.atlassian.net` |
| `email` | `text` | yes | Atlassian account email |
| `api_token` | `secret` | yes | Atlassian API token |

### Auth flow

1. Discover `cloudId` from `https://{site}.atlassian.net/_edge/tenant_info`
2. Use `https://api.atlassian.com/ex/jira/{cloudId}` as the Jira API base
3. Authenticate with `Authorization: Basic base64({email}:{api_token})`

### Primary endpoints

| Purpose | Method | Endpoint |
|---|---|---|
| Validate credentials | GET | `/rest/api/3/myself` |
| List projects | GET | `/rest/api/3/project/search` |
| Search issues | GET | `/rest/api/3/search/jql` |
| Fetch issue with changelog | GET | `/rest/api/3/issue/{issueIdOrKey}?expand=changelog,names` |
| Fetch comments | GET | `/rest/api/3/issue/{issueIdOrKey}/comment` |
| Create issue | POST | `/rest/api/3/issue` |
| Add comment | POST | `/rest/api/3/issue/{issueIdOrKey}/comment` |
| Get transitions | GET | `/rest/api/3/issue/{issueIdOrKey}/transitions` |
| Execute transition | POST | `/rest/api/3/issue/{issueIdOrKey}/transitions` |
| Update issue fields | PUT | `/rest/api/3/issue/{issueIdOrKey}` |

## Adapter Info

The adapter advertises:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `adapter.setup.start`
- `adapter.setup.submit`
- `adapter.setup.status`
- `adapter.setup.cancel`
- `adapter.monitor.start`
- `records.backfill`
- `delivery.send`

### Capabilities

| Capability | Value | Meaning |
|---|---|---|
| `text_limit` | `32768` | practical text ceiling for Jira comment/description payloads |
| `supports_markdown` | `true` | markdown is accepted at the Nex surface and converted to ADF |
| `markdown_flavor` | `standard` | Nex-facing formatting |
| `supports_threads` | `false` | Jira has no nested reply threads |
| `supports_reactions` | `false` | no reaction surface |
| `supports_streaming_edit` | `false` | no streaming comment-edit delivery mode |

The important nuance is:

- Jira issue threads exist in the canonical channel model through `thread_id`
- that does not mean Jira supports nested threaded replies

## Setup Flow

Setup is a standard start / submit / status / cancel flow.

### `adapter.setup.start`

Input:

```json
{
  "connection_id": "vrtly-jira",
  "payload": {
    "site": "vrtlyai",
    "email": "tyler@example.com",
    "api_token": "ATATT3x..."
  }
}
```

Behavior:

- validate credentials with `GET /rest/api/3/myself`
- discover accessible projects with `GET /rest/api/3/project/search`
- return `requires_input` with project-selection options

### `adapter.setup.submit`

Input:

```json
{
  "connection_id": "vrtly-jira",
  "session_id": "setup-abc123",
  "payload": {
    "projects": ["VT", "VM"]
  }
}
```

Behavior:

- persist selected projects for the connection
- return `completed` with site, selected projects, and authenticated user metadata

## Health

`adapter.health` validates stored credentials with `GET /rest/api/3/myself`.

Healthy response shape:

```json
{
  "connected": true,
  "connection_id": "vrtly-jira",
  "details": {
    "site": "vrtlyai.atlassian.net",
    "user": "Tyler Brandt",
    "user_id": "712020:...",
    "projects": ["VT", "VM"]
  }
}
```

## Canonical Jira Channel Model

Inbound and outbound Jira routing must use the same channel model.

### Project channel

The Jira root channel is the Jira project.

```json
{
  "platform": "jira",
  "space_id": "vrtlyai",
  "container_kind": "group",
  "container_id": "VT"
}
```

Meaning:

- `space_id` identifies the Jira site
- `container_id` is the Jira project key
- this is the canonical target for creating a new Jira issue

### Issue thread target

A Jira issue is thread metadata inside the project container.

```json
{
  "platform": "jira",
  "space_id": "vrtlyai",
  "container_kind": "group",
  "container_id": "VT",
  "thread_id": "VT-4805"
}
```

Meaning:

- the root channel boundary is still the Jira project
- `thread_id` selects a specific Jira issue inside that project
- this is the canonical target for issue mutations

## Inbound Record Mapping

The adapter emits canonical `record.ingest` envelopes for three Jira record families:

- issue
- comment
- changelog entry

### Shared routing shape

All three record families use:

- `platform = "jira"`
- `connection_id = <connection_id>`
- `space_id = <site slug>`
- `container_kind = "group"`
- `container_id = <project key>`
- `thread_id = <issue key>`

This is the critical symmetry point for outbound routing.

### Issue records

Issue records represent the Jira issue itself.

- `external_record_id = jira:{space_id}:{issue_key}`
- content = summary plus description markdown
- metadata includes issue status, type, priority, labels, assignee, resolution, and other issue facts

### Comment records

Comment records represent flat Jira comments under the issue.

- `external_record_id = jira:{space_id}:{issue_key}:comment:{comment_id}`
- `reply_to_id` points at the parent issue record
- content is comment markdown converted from ADF

### Changelog records

Changelog records represent individual field changes on the issue.

- `external_record_id = jira:{space_id}:{issue_key}:changelog:{history_id}:{field}`
- `reply_to_id` points at the parent issue record
- content is a compact human-readable diff summary
- metadata preserves structured `field`, `from`, and `to`

## Backfill And Live Monitoring

Backfill and live monitoring must share the same issue-family emission path.

### Backfill

- one-shot execution
- explicit lower bound from `--since`
- fetch issues by project and updated timestamp
- emit issue, comment, and changelog records
- exit when complete

### Live monitor

- long-running polling loop
- per-project watermark
- same record-emission path as backfill
- watermark advances only after the full issue family succeeds
- Jira JQL watermark formatting must be converted into the authenticated Jira user's timezone before building `updated >= ...` search clauses

Target-state rule:

- backfill and monitor differ by lifecycle and cursor source, not by record mapping

### Watermark expectation

Watermarks are per project.

The target-state operator experience is:

- each configured project has an independent lower-bound watermark
- operators can reason about freshness per project
- monitor restarts do not silently lose incremental position

Current implementation note:

- in-memory project watermarks exist today
- durable cross-restart watermark persistence is still an open integration concern

## Outbound Delivery Target

The adapter-facing outbound target is the canonical `DeliveryTarget`.

```json
{
  "connection_id": "vrtly-jira",
  "channel": {
    "platform": "jira",
    "space_id": "vrtlyai",
    "container_kind": "group",
    "container_id": "VT",
    "thread_id": "VT-4805"
  },
  "reply_to_id": "jira:vrtlyai:VT-4805"
}
```

Routing authority:

- `connection_id` selects the concrete Jira connection
- `channel.container_id` selects the Jira project
- `channel.thread_id` selects the Jira issue when present
- `reply_to_id` is metadata only; it does not create nested Jira threading

## Outbound Actions

The adapter supports five outbound Jira actions.

### `create_issue`

Target requirements:

- target must be a Jira project channel
- `thread_id` must be absent

Payload:

```json
{
  "action": "create_issue",
  "issuetype": "Task",
  "summary": "Codex validation issue",
  "description": "Markdown body",
  "assignee_account_id": "712020:...",
  "labels": ["validation-test", "codex"]
}
```

Routing rule:

- derive project from `channel.container_id`
- do not require payload field `project`

### `comment`

Target requirements:

- target must be a Jira issue thread
- `thread_id` is required

Payload:

```json
{
  "action": "comment",
  "body": "Validation comment with **bold** and `code`."
}
```

Routing rule:

- derive issue key from `channel.thread_id`
- do not require payload field `issue_key`

### `transition`

Target requirements:

- target must be a Jira issue thread

Payload:

```json
{
  "action": "transition",
  "target_status": "In Progress",
  "comment": "Starting work via adapter validation."
}
```

Routing rule:

- derive issue key from `channel.thread_id`
- resolve transition by current Jira transition options

### `assign`

Target requirements:

- target must be a Jira issue thread

Payload:

```json
{
  "action": "assign",
  "assignee_account_id": "712020:27dfa9e2-a654-4813-b956-91f6f8b3c01d"
}
```

Routing rule:

- derive issue key from `channel.thread_id`

### `add_label`

Target requirements:

- target must be a Jira issue thread

Payload:

```json
{
  "action": "add_label",
  "labels": ["adapter-test", "ui-write"]
}
```

Routing rule:

- derive issue key from `channel.thread_id`
- append labels rather than replace the full label set

## Invalid Routing Matrix

The adapter must reject these combinations before attempting any Jira write:

- `create_issue` with a target that includes `thread_id`
- `comment` with no `thread_id`
- `transition` with no `thread_id`
- `assign` with no `thread_id`
- `add_label` with no `thread_id`
- any target whose `channel.platform` is not `jira`
- any request whose `connection_id` does not identify a Jira connection
- any request missing `container_id`

## Read-Only Validation Status

Completed live validation:

- successful auth and project discovery against a live Jira Cloud site
- successful `adapter.health`
- successful bounded backfill for project `VT`
- successful monitor execution with both empty and emitting cycles

Evidence is archived in:

- `docs/workplans/archive/JIRA_ADAPTER_IMPLEMENTATION_ARCHIVE_2026-03-10.md`

## Definition Of Done

The Jira adapter is done only when all of the following are true:

- inbound/read-only behavior remains validated
- outbound routing derives solely from `connection_id` plus channel target
- `create_issue` works from project channels
- `comment`, `transition`, `assign`, and `add_label` work from issue-thread targets
- payloads no longer own routing
- the Nex UI and runtime can exercise these writes through the canonical `channels.send` flow
