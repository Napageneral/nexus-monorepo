---
name: eve
description: Use the Eve adapter for local macOS iMessage setup, health, backfill, monitor, staged backfill, and outbound send through Nex-managed connections.
---

# Nexus Eve Adapter

Use the shared Eve adapter when Nex should own local macOS iMessage access
through a paired Eve edge.

Canonical package-method truth lives in `adapter.nexus.json` `methodCatalog`
and `api/openapi.yaml`. `adapter.info` is a runtime smoke test and discovery
helper only.

## What This Package Is

`eve` is the shared Nex adapter for local macOS iMessage access via Eve's
warehouse and AppleScript lane.

Use it when Nex should:

- own one or more local iMessage connections on macOS
- guide setup for Full Disk Access and warehouse readiness
- backfill and monitor messages, reactions, membership events, and message
  updates
- send outbound iMessages through the local Messages app

This package is the canonical packaged Eve surface. It replaces older direct
binary-path assumptions and hides `chat.db` timing quirks from downstream apps.

## When To Use It

Use `eve` when you need:

- local iMessage data in Nex as canonical `record.ingest`
- a guided setup flow for macOS permissions
- continuous sync through Eve warehouse plus best-effort `chat.db` ETL
- outbound local iMessage send through the adapter surface
- cleanroom verification of the exposed method catalog before operator rollout
- automatic iMessage contact/entity materialization on first successful
  activation

## Main Operations

- `adapter.info`
- `adapters.connections.list`
- `adapter.setup.start`
- `adapter.setup.submit`
- `adapter.setup.status`
- `adapter.setup.cancel`
- `adapter.health`
- `records.backfill`
- `adapter.monitor.start`
- `imessage.send`
- `imessage.reply`
- `imessage.reaction.add`
- `imessage.reaction.remove`
- `imessage.message.edit`
- `imessage.message.unsend`
- `imessage.thread.create`
- `imessage.thread.rename`
- `imessage.thread.participants.add`
- `imessage.thread.participants.remove`
- `records.backfill.stage`

## Runtime Discovery

Use the runtime surfaces, not guesses, to discover what is actually exposed:

```bash
nexus runtime call adapters.methods --json --params '{"id":"eve"}'
nexus runtime call adapters.connections.list --json
nexus orientation taxonomy --json
```

Use `adapters.methods` as the canonical method list available to agents and
workers after the package is installed. Use `adapters.connections.list` as the
runtime-owned source of truth for durable Eve `connection_id` values.

On first successful Eve activation, Nex should also:

- enqueue `records.backfill`
- start `adapter.monitor.start`
- run Eve contact preload so observed iMessage handles materialize into
  canonical `entities` and `contacts`

## CLI Examples

Build and inspect the package-local binary:

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/eve
go test ./...
go build -o ./bin/eve-adapter ./cmd/eve-adapter
./bin/eve-adapter adapter.info
```

Run the guided setup flow:

```bash
./bin/eve-adapter adapter.setup.start
./bin/eve-adapter adapter.setup.submit \
  --session-id <session-id> \
  --payload-json '{"confirm_full_disk_access":"yes"}'
```

Check local readiness:

```bash
./bin/eve-adapter adapter.connections.list
./bin/eve-adapter adapter.health --connection default
```

Backfill or monitor local iMessage data:

```bash
./bin/eve-adapter records.backfill --connection default --since 2026-01-01T00:00:00Z
./bin/eve-adapter adapter.monitor.start --connection default
```

Stage a bulk backfill into JSONL chunks:

```bash
./bin/eve-adapter records.backfill.stage \
  --connection default \
  --payload-json '{"since":"2026-01-01T00:00:00Z","stage_dir":"/tmp/eve-stage"}'
```

Send an iMessage:

```bash
./bin/eve-adapter imessage.send \
  --connection default \
  --payload-json '{"target":{"channel":{"platform":"imessage","container_id":"+14155551234"}},"text":"Hello from Nex"}'
```

Send inline media on the current AppleScript lane:

```bash
./bin/eve-adapter imessage.send \
  --connection default \
  --payload-json '{"target":{"channel":{"platform":"imessage","container_id":"+14155551234"}},"caption":"Photo from Nex","media":"/tmp/photo.jpg"}'
```

Call the installed package through Nex instead of the local binary:

```bash
nexus runtime call imessage.send --json --params '{
  "connection_id": "<runtime-eve-connection-id>",
  "caption": "Inline image proof",
  "media": "/tmp/photo.jpg",
  "target": {
    "connection_id": "<runtime-eve-connection-id>",
    "channel": {
      "platform": "imessage",
      "container_id": "+17072876731"
    }
  }
}'
```

## Cleanroom Discovery

Use a cleanroom to discover the live method surface after the package is
installed or projected into the runtime.

1. inspect `adapter.info` for package identity and method-catalog metadata
2. confirm `imessage.send` appears in the runtime method surface
3. confirm the action taxonomy matches the packaged OpenAPI contract
4. use the cleanroom proof bundle instead of inferring support from this doc

The validation path for that discovery is recorded in
[EVE_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/validation/EVE_ADAPTER_VALIDATION.md)
and the action boundary is defined in
[EVE_ACTION_EXECUTION_BOUNDARIES.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/specs/EVE_ACTION_EXECUTION_BOUNDARIES.md).

## Manager And Worker Usage

Manager sessions should use Eve like any other truthful adapter-backed channel:

- discover `imessage.send` from `adapters.methods`
- discover the durable Eve `connection_id` from `adapters.connections.list`
- reply through the same conversation using the current `connection_id`
- use `caption` plus `media` for inline image or video sends
- treat `MEDIA:<path-or-url>` replies as same-conversation delivery work, not
  dispatch work

Worker sessions can use the same exposed method surface once
`package_method_names` includes `imessage.send`.

The worker-visible capability tree should also project this package skill under
the Eve/iMessage capability surface, so workers can discover the exact nested
`target.channel.container_id` / `thread_id` shape instead of guessing.

Identity lookup should stay canonical:

- use `entities.search` with `name` to find a named person such as Casey or Tyler
- then use `contacts.list` with `entity_id` to fetch their phone/email/iMessage
  handles
- do not use `contacts.search` as the primary way to find a person by human
  name
- treat `contacts` as the handle layer and `entities` as the named-person
  layer

Example:

```bash
nexus entities search --params '{
  "name": "Casey Adams",
  "limit": 5
}' --json
```

```bash
nexus contacts list --params '{
  "entity_id": "01KKQWTAM6K64DNCJH36KTT5WJ",
  "platform": "imessage"
}' --json
```

Code-mode example:

```ts
const delivered = await imessage.send({
  target: {
    connection_id: "<runtime-eve-connection-id>",
    channel: {
      platform: "imessage",
      container_id: "+17072876731",
    },
  },
  caption: "Here is the chart.",
  media: "/tmp/chart.png",
});

return { delivered };
```

Read the returned delivery observation before assuming the send really landed:

- `status`
  - `confirmed` means Eve observed a Messages-side row state that is no longer
    just dispatch-only
- `delivery.stage`
  - `dispatched`: AppleScript returned but no local Messages row has been
    observed yet
  - `local_row_seen`: Messages created a local row, but no stronger
    `is_sent`/`is_delivered` proof exists yet
  - `messages_sent`: Messages marked the decisive row as sent
  - `messages_delivered`: Messages marked the decisive row as delivered
  - `messages_failed`: Messages marked the decisive row as failed
- `delivery.media_row_seen`
  - for media sends, prefer this over a text-only observation
- `delivery.messages_error_code`
  - non-zero means Messages itself marked the send failed
- `delivery.attachment_transfer_state`
  - inspect this alongside `messages_error_code` for attachment debugging

If a media send returns `messages_failed`, the worker should not pretend the
attachment landed. It can retry with another media file or send a text-only
fallback.

## Event-Driven Manager Proof

For a real Nex job and event-subscription proof, use the Eve job script at:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/app/jobs/imessage-manager-dispatch.ts`

What it does:

- matches canonical `record.ingested` events for iMessage
- relies on canonical entity/contact ids plus optional sender filtering instead
  of `metadata.is_from_me`
- creates or reuses a public manager session for `entity-assistant`
- sends the inbound iMessage into that manager session with the real iMessage
  delivery context preserved
- instructs the manager to dispatch exactly one worker using an explicit child
  capability fence
- constrains the child to `packageMethodNames: ["imessage.send"]` while
  denying `local.exec`, PTY tools, and `browser`
- instructs that worker to use `imessage.send` with the configured image path

Create the job:

```bash
nexus runtime call jobs.create --json --params '{
  "name": "eve.imessage.manager.dispatch",
  "script_path": "/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/app/jobs/imessage-manager-dispatch.ts",
  "config_json": "{\"assistant_entity_id\":\"entity-assistant\",\"assistant_workspace_id\":\"entity-assistant\",\"manager_session_id\":\"session:eve-imessage-public-manager-proof\",\"reply_image_path\":\"/Users/tyler/nexus-echo/intent-layer-frame3-map-appears.png\",\"reply_caption\":\"Eve manager-worker proof image\",\"require_platform\":\"imessage\",\"require_sender_contact_id\":\"+17072876731\",\"require_receiver_entity_id\":\"entity-owner\",\"require_container_id\":\"+17072876731\"}"
}'
```

Create the subscription:

```bash
nexus runtime call events.subscriptions.create --json --params '{
  "job_definition_id": "<job-definition-id>",
  "event_type": "record.ingested",
  "match": {
    "platform": "imessage",
    "receiver_entity_id": "entity-owner",
    "sender_contact_id": "+17072876731",
    "container_id": "+17072876731"
  }
}'
```

That subscription is keyed on your self-thread. The job config should also set
`require_sender_contact_id` to the expected inbound sender and
`require_receiver_entity_id` to the local owner entity so the automation fires
only on the intended inbound side of the conversation.

If you want a broader worker proof, configure the job with
`target_contact_name`. That changes the manager instructions so the worker must:

1. use `entities.search` to find the person by name
2. use `contacts.list` with the returned `entity_id` to fetch a phone/email/iMessage handle
3. use the chosen `contact_id` as `target.channel.container_id`
4. send the configured image through `imessage.send`

That is the clean way to prove canonical entity lookup plus adapter-backed
outbound delivery without relying on `metadata.is_from_me`.

## Key Data Models

- package identity vs platform identity
  - package id is `eve`
  - runtime platform is `imessage`
- current connection model
  - runtime `connection_id` is the durable Nex identity surface
  - paired-edge routing supports multiple Eve connections
  - second-real-identity operator proof is still pending
- local readiness state
  - `chat.db` readability
  - Eve warehouse readability
  - Full Disk Access confirmation
- canonical inbound record types
  - messages
  - reactions
  - membership events
- staged backfill manifest
  - chunked canonical JSONL files
  - manifest with paths, record counts, and timestamp bounds

## AppleScript Lane

The active AppleScript lane covers:

- text send
- staged inline image and video send
- generic file attachment send when the media path is not on the staged inline
  path

Current truth:

- inline media send is supported on the AppleScript lane only because the
  staged-media path has been proven live
- do not collapse inline media into generic file-attachment support
- if that proof regresses, capability truth must be lowered immediately

## Unsupported Today

These actions still require a private-API lane and are not truthfully supported
by the current packaged AppleScript executor:

- reply threading
- reaction add and remove
- edit
- unsend
- thread create
- thread rename
- participant add and remove
- leave thread
- typing indicator mutation
- read or unread mutation

## End-To-End Example

1. Install the packaged `eve` adapter on the macOS host.
2. Create the Eve connection in Nex.
3. Complete setup by granting Full Disk Access and confirming warehouse readiness.
4. Run `adapter.health` to verify `chat.db` and warehouse access.
5. Run `records.backfill` to import historical iMessage messages, reactions, and membership events.
6. Start `adapter.monitor.start` so new local iMessage activity continuously lands in Nex.
7. Use `imessage.send` to send an outbound iMessage through the local Messages app.

That is the customer experience defined in [ADAPTER_SPEC_EVE.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/specs/ADAPTER_SPEC_EVE.md) and validated in [EVE_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/validation/EVE_ADAPTER_VALIDATION.md).

## Constraints And Failure Modes

- Full Disk Access is a real hard dependency for `chat.db` access.
- The adapter can continue warehouse-only in some degraded cases, but local readiness should report that clearly.
- Rich reply, reaction, edit, unsend, and thread-mutation actions remain
  private-API work, not AppleScript truth.
- Full multi-connection operator proof still needs a second real iMessage
  identity even though the routing surface already supports multiple
  `connection_id` values.

## Related Docs

- [README.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/README.md)
- [ADAPTER_SPEC_EVE.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/specs/ADAPTER_SPEC_EVE.md)
- [EVE_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/validation/EVE_ADAPTER_VALIDATION.md)
- [cmd/eve-adapter/main.go](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/cmd/eve-adapter/main.go)
