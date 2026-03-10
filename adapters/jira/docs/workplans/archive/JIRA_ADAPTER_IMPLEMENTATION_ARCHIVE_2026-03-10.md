# Jira Adapter Implementation Archive

**Archived on**: 2026-03-10  
**Reason**: The original workplan assumed a greenfield Jira adapter. That work is no longer the active planning surface. The adapter now exists, read-only validation has been run against a real Jira Cloud tenant, and the remaining open work is a narrower channel-routing cutover for outbound delivery.

## What Is Complete

The following workplan items are complete and should be treated as archived execution history rather than open plan items:

### 1. Adapter scaffolding and runtime wiring

- Go module created at `adapters/nexus-adapter-jira/`
- Adapter binary responds to:
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
- Runtime context loading uses `connection_id`

### 2. Jira Cloud auth and setup flow

- Site + email + API token credential flow implemented
- `cloudId` discovery implemented via `/_edge/tenant_info`
- `GET /rest/api/3/myself` auth validation implemented
- `GET /rest/api/3/project/search` project discovery implemented
- setup session persistence added so the multi-step flow survives separate process invocations

### 3. Jira API client and read-only sync path

- Search, pagination, rate limiting, and timestamp parsing implemented
- Issue, comment, and changelog mapping implemented
- ADF to markdown conversion implemented for inbound content
- Monitor loop implemented
- Backfill implemented
- Real Jira Cloud read-only validation completed

### 4. Delivery action implementation

The adapter currently implements these write actions:

- `create_issue`
- `comment`
- `transition`
- `assign`
- `add_label`

This implementation is archived as functional code, but it is not the correct final architecture because routing is still derived from payload fields instead of the canonical channel target.

## Live Read-Only Validation Evidence

Read-only validation was run against a real Jira Cloud tenant using the adapter.

### Tenant discovery and health

- Accessible projects discovered:
  - `ROADMAP`
  - `VD`
  - `VM`
  - `VS`
  - `VT`
- `adapter.health` succeeded and returned:
  - connected: `true`
  - site: `vrtlyai.atlassian.net`
  - user: `Tyler Brandt`

### Backfill validation

Backfill was run against project `VT` with a bounded historical window.

Observed output:

- `47` issue records
- `29` comment records
- `121` changelog records
- `197` total canonical `record.ingest` envelopes

### Monitor validation

- monitor produced clean empty cycles with a recent watermark
- monitor emitted real records immediately when given an older watermark
- monitor and backfill share the same record emission path, so historical and incremental reads produce the same canonical record family

## Bugs Found And Fixed During Validation

### CLI protocol shim mismatch

The Jira adapter had a stale compatibility rewrite that converted `--connection` into `--account`.

That was incorrect for the current adapter/runtime direction and broke live health checks. The fix removed that rewrite from:

- `adapters/nexus-adapter-jira/cmd/jira-adapter/protocol.go`

### Shared Go SDK compile repair

The shared Go SDK had already been partially renamed from `account` to `connection` and was left in a broken mixed state that blocked validation. A minimal compile repair was made in:

- `adapters/nexus-adapter-sdks/nexus-adapter-sdk-go/adapter.go`

## Why This Work Is Archived Instead Of Still Active

The remaining blocker is not “finish Jira read/write support” in the broad sense.
The remaining blocker is architectural:

- outbound Jira routing still depends on payload fields like `project` and `issue_key`
- the canonical Nex model requires outbound routing to derive from the channel target
- the adapter is therefore read-ready and partially write-capable, but not yet compliant with the non-negotiable channel model

That means the active workplan should now focus only on the outbound routing cutover and the write-validation ladder that follows from it.
