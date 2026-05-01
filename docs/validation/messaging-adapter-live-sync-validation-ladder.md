# Messaging Adapter Live Sync Validation Ladder

**Status:** ACTIVE
**Last Updated:** 2026-05-01

## Purpose

This ladder validates Slack and Discord adapters against the canonical messaging
adapter live-sync target.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/platform/messaging-adapter-live-sync-and-interactions.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/messaging-adapter-live-sync-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-validation-proof-ladder.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/slack/docs/validation/SLACK_ADAPTER_VALIDATION.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/discord/docs/validation/DISCORD_ADAPTER_VALIDATION.md`

## Completion Standard

A messaging adapter clears this ladder when one reviewable evidence bundle
proves:

1. package-local tests pass
2. package install and connection setup work in a fresh cleanroom
3. backfill imports the expected provider history scope
4. monitor starts from durable state and catches up after downtime
5. live create, edit, delete, reaction, file, and thread events are projected
   where the provider supports them
6. native interactions work through the production runtime seams
7. provider rate limits are handled without broad replay loops
8. hosted install, restart, and monitor continuation work
9. a worker can discover and use the adapter from the real capability surface

Cleanroom proof is primary. Live dogfood is secondary confirmation after the
cleanroom lanes pass.

## Evidence Bundle

Each proof bundle records:

- adapter repo commit
- umbrella repo commit
- package artifact name and checksum
- cleanroom id and runtime id
- connection id
- redacted credential source
- provider workspace/server/channel ids used for proof
- start and end timestamps
- command transcript or Dispatch run id
- emitted record ids for each proof event
- monitor state file before and after restart
- hosted install/restart receipt when hosted proof is in scope

Secret values, tokens, message body private content, and raw provider payloads
with personal data stay out of docs. Evidence may reference local artifact paths
that contain redacted transcripts.

## Stage 1: Package And Install

Run package-local tests first:

- Slack: `go test ./...`
- Discord: `pnpm test`

Then build the adapter package and install it into a fresh cleanroom runtime.
The proof passes when:

- `adapter.info` exposes the expected public method catalog
- setup metadata is present
- connection setup completes with real provider credentials
- health reports connected or ready

## Stage 2: Backfill

Run a scoped backfill against a proof workspace/server.

The proof passes when:

- records are emitted for normal messages
- thread replies are represented
- files or attachments are represented when present
- edited or deleted metadata is preserved when returned by history APIs
- backfill emits no duplicate record ids for the same provider message
- cursor or monitor state is written after successful processing

## Stage 3: Monitor Startup And Catch-Up

Stop the monitor after backfill, create one safe provider message while the
monitor is offline, then restart the monitor.

The proof passes when:

- monitor resumes from durable state
- the offline message is emitted without replaying old history
- state advances only after successful emission
- a second restart does not re-emit the same record

## Stage 4: Live Event Richness

With the monitor running, perform provider-native live changes.

The proof passes when:

- message create emits one canonical record
- message edit emits one revision record
- message delete emits one deletion revision record
- reaction add and remove events are emitted where supported
- file share emits attachments or file metadata
- thread reply records carry thread routing metadata

If a provider cannot recover a missed delete from history, the evidence states
that offline delete recovery is unavailable or best-effort for that provider.

## Stage 5: Native Interactions

Send a native provider control through the adapter and complete it from the
provider UI.

The proof passes when:

- buttons resolve to the registered Nex action
- menus or selects preserve selected values
- modals submit structured values
- approval prompts can be accepted and rejected
- expired or unauthorized controls fail closed
- interaction records link back to the originating message and action
- the action is handled through the same runtime path used by agents

## Stage 6: Rate Limits And Restart

Run a bounded backfill or monitor soak with enough provider calls to exercise
rate-limit handling.

The proof passes when:

- retry-after responses are honored
- bounded workers do not exceed the configured provider lane limits
- monitor polling stays incremental
- health remains ready or degraded with an explicit reason
- restart resumes from durable state

## Stage 7: Hosted And Agent-Use

Install the package into a hosted or hosted-surrogate runtime through the
supported package installation path.

The proof passes when:

- hosted package install completes
- hosted connection setup completes
- hosted restart preserves connection and monitor state
- a worker discovers the adapter capability
- the worker chooses the correct provider-native method
- the method succeeds against the hosted installed adapter

### Discord Evidence: 2026-05-01

Discord cleared the native interaction, hosted install, hosted restart, and
durable monitor-start portions of this ladder.

- Adapter commit: `8f54323`
- Umbrella/package-helper commit: `0ac7ab6c`
- Artifact:
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/discord/dist/discord-0.1.3.tar.gz`
- SHA-256:
  `fca3448fcf51c1f70fcefb26725c4783ad532b58de1186d1a1ec730ae8ad641c`
- Test: `pnpm test` passed 10 files / 45 tests.
- Extracted artifact smoke: `./discord-adapter.js adapter.info` returned
  Discord adapter version `0.1.3`, five adapter operations, and 17 methods.
- Live UI target: Brandtty `#general`, connection
  `02a725fd-910c-494d-a32f-809094b6a6aa`.
- Live UI proof stamp: `20260501T164109Z`; button, select, modal trigger, and
  modal submission records were ingested and linked to source message
  `1499812941581783232`.
- Hosted catalog latest: `discord@0.1.3`,
  `rel-discord-0.1.3`,
  `variant-discord-0.1.3-linux-arm64`.
- Hosted MoonSleep runtime install reported package health `active`,
  `healthy: true`, `active_version: "0.1.3"`.
- Hosted Frontdoor archive/restore restart completed for server
  `srv-1c4b077a-1f2`; after startup, package health again reported
  `active_version: "0.1.3"` and adapter version `0.1.3`.
- Local durable monitor proof used
  `adapters.connections.livesync.enable` for the Discord connection; after
  local runtime restart, startup logs reported 10 persisted connections
  rehydrated and three monitors restarted, including Discord.

Operational lesson:

- `adapter.monitor.start` is a low-level process start and does not persist
  restart intent. Use `adapters.connections.livesync.enable` for durable
  live-sync monitor startup.

## Slack Validation Script

Before running live Slack proof, paste the exact script into the ticket or run
packet with the run id filled in.

Use a dedicated proof channel or DM whose residue is acceptable.

1. Send: `Nex Slack live sync proof <run-id> create`
2. Edit the same message to: `Nex Slack live sync proof <run-id> edited`
3. Add reaction: `white_check_mark`
4. Remove reaction: `white_check_mark`
5. Reply in thread: `Nex Slack live sync proof <run-id> thread reply`
6. Upload or attach a small harmless text file named
   `nex-slack-proof-<run-id>.txt`
7. Delete the original message if deletion is allowed in the proof channel
8. Click the proof button or select menu sent by the adapter
9. Submit the proof modal with value: `Nex Slack modal proof <run-id>`

Expected review evidence:

- create record for the original message
- edit revision record
- delete revision record when the deletion step is allowed
- reaction add/remove records where implemented
- thread reply record
- file metadata or attachment record
- interaction record for button/select/modal submission

## Discord Validation Script

Before running live Discord proof, paste the exact script into the ticket or run
packet with the run id filled in.

Use a dedicated proof channel in a test server.

1. Send: `Nex Discord live sync proof <run-id> create`
2. Edit the same message to: `Nex Discord live sync proof <run-id> edited`
3. Add reaction: `✅`
4. Remove reaction: `✅`
5. Reply in thread: `Nex Discord live sync proof <run-id> thread reply`
6. Attach a small harmless text file named
   `nex-discord-proof-<run-id>.txt`
7. Delete the original message if deletion is allowed in the proof channel
8. Click the proof button or select control sent by the adapter
9. Submit the proof modal with value: `Nex Discord modal proof <run-id>`

Expected review evidence:

- create record for the original message
- edit revision record
- delete revision record when the deletion step is allowed
- reaction add/remove records where implemented
- thread reply record
- file metadata or attachment record
- interaction record for button/select/modal submission

## Residual Risk

Messaging providers do not all expose complete offline deletion or edit
timelines. The adapter must distinguish:

- live authoritative events observed through gateway or Events API
- offline history catch-up that can recover missed creates
- best-effort reconciliation for edits
- unavailable deletion recovery when the provider does not expose it

That distinction is part of a truthful pass.
