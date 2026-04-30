# GOG Gmail Richness Handoff

Date: 2026-04-30

## Larger Goal

The broader project is to make Nex a production-quality attribution and
operator runtime for MoonSleep and future clients such as Devenir. The current
line of work came from a performance and correctness concern: hosted MoonSleep
Nex had become CPU/disk heavy because several adapters were doing too much
repeated work during backfill/live monitoring. The target pattern is:

- backfill is exhaustive and correctness-first
- live monitor is incremental, cursor-based, and fast
- every adapter preserves source richness without doing broad repeated scans
- app-level products, such as Attribution, consume rich records from dedicated
  adapters rather than embedding ingestion logic inside the app

For Gmail/Google Workspace, the `gog` adapter should be a rich first-class
Gmail adapter built on a pinned upstream `gogcli` runtime, not a thin wrapper
around whatever host binary happens to be on PATH.

## Project Context

Important paths:

- Umbrella repo: `/Users/tyler/nexus/home/projects/nexus`
- GOG adapter repo: `/Users/tyler/nexus/home/projects/nexus/packages/adapters/gog`
- Workboard: `/Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board`
- Adapter spec: `/Users/tyler/nexus/home/projects/nexus/packages/adapters/gog/docs/specs/ADAPTER_SPEC_GOG.md`
- Validation doc: `/Users/tyler/nexus/home/projects/nexus/packages/adapters/gog/docs/validation/GOG_ADAPTER_VALIDATION.md`
- Workflow rules: `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`

Important local upstream assets:

- Upstream checkout: `/tmp/nexus-gogcli-v014`
- Upstream binary used for live dry-runs: `/tmp/nexus-gog-v014`
- Current package cleanroom proof:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-package-cleanroom/20260430T212001Z`
- Current live Gmail cleanroom proof:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-gmail-live/20260430T152911Z`
- Latest live monitor self-send proof:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-gmail-live/20260429T201934Z`
- Current hosted MoonSleep install/restart proof:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-hosted-moonsleep-install-restart/20260429T202232Z`

Important operator constraints:

- Do not leak OAuth tokens, message bodies, attachment contents, or raw private
  customer data into docs or chat.
- Do not touch unrelated dirty files in the umbrella repo.
- Do not perform hosted install/restart/deploy actions without explicit
  operator approval.
- Do not add a `kind` field to any data schema.

## What Was Done

The GOG board now has `GGR-001` through `GGR-011` completed. `GGR-009` has
green package cleanroom, live Gmail cleanroom, and hosted MoonSleep
install/restart proofs. `GGR-010` adds the adapter-side Pub/Sub/history
live-sync seam. `GGR-011` makes the near-term path polling-first by deriving
the durable Gmail history cursor from backfill, so Pub/Sub setup is optional
rather than required.

Completed work:

- `GGR-001`: adapter release script now builds and bundles pinned upstream
  `gogcli v0.14.0` as `bin/gog`; runtime resolution prefers
  `NEXUS_GOG_COMMAND`, then bundled `bin/gog`, then host PATH.
- `GGR-002`: message ingest uses `gog gmail get --format full` and preserves
  rich plain text, HTML, normalized headers, RFC threading headers, history id,
  internal date, size estimate, labels, and snippet metadata.
- `GGR-003`: thread and attachment metadata are preserved; `gmail.thread.get`
  and `gmail.thread.attachments` were added.
- `GGR-004`: `gmail.attachment.download` downloads attachments into
  adapter-owned state with safe path handling and cache hits on repeated reads.
- `GGR-005`: rich `gmail.send`, `gmail.forward`, and Gmail draft methods were
  added with dry-run/no-input support and mutation metadata.
- `GGR-006`: Gmail history parsing now supports richer event families when
  present, emits state-change records for delete/label changes, keeps full
  message fetches for message-added/changed events, and advances cursors only
  after successful event processing.
- `GGR-007`: fallback polling is no longer fixed to one top window. It pages
  until stable, exhausted, or capped; persists metrics/watermarks; and exposes
  degraded polling status via health details.
- `GGR-008`: guarded `gmail.native.read` and `gmail.native.write` wrappers
  expose an allowlisted broader Gmail command surface without arbitrary args.
  Native writes require dry-run or explicit mutation confirmation; destructive
  live writes require force.
- `GGR-009`: validation signoff now includes cleanroom package proof, live
  Gmail backfill/monitor/agent-use proof, and hosted MoonSleep install/restart
  proof through Frontdoor archive/restore.
- `GGR-010`: Pub/Sub live sync now has a spec, watch start/renew support,
  backfill watch priming, richer monitor state, and `gmail.pubsub.sync` for
  hosted webhook workers to process Gmail notifications through history.
- `GGR-011`: backfill now stores a Gmail `history_id` cursor without Pub/Sub,
  monitor startup uses persisted history cursors without touching watch APIs,
  and package cleanroom proves polling-only cursor persistence.

## Validation Status

Passing local validation:

- `go test ./...`
- `go build -o ./bin/gog-adapter ./cmd/gog-adapter`
- `GOGCLI_SOURCE_DIR=/tmp/nexus-gogcli-v014 ./scripts/package-release.sh`
- Package validate and release passed via `nexus package validate` and
  `nexus package release`.
- Release archive:
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/gog/dist/gog-0.1.0.tar.gz`
- Earlier live-richness release SHA:
  `5e43593faf01eeee5cf121f7a7c44adb1e645cbda76e9f6b45bd339c2466e4c3`
- Hosted Linux arm64 archive SHA:
  `4b3d99bd01e0daedc80783b40e0d86f56771d4a7675030129e720d9850c0c68e`
- Latest package archive SHA:
  `f0a2dc0d6d3173c84ff263f3b64666533082dd1e1e561c460ded4e6e1bc4454b`
- Archive includes both `bin/gog` and `bin/gog-adapter`.
- Extracted package cleanroom verifies bundled `bin/gog` reports
  `v0.14.0 (469f4b4 2026-04-29T17:45:00Z)`.
- Host-native package cleanroom smoke passed:
  `./scripts/package-cleanroom-smoke.sh dist/gog-0.1.0.tar.gz`
- Package cleanroom proof artifacts:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-package-cleanroom/20260430T212001Z`
- The cleanroom proof validates the source package with clean `HOME`, extracts
  the release archive into fresh state, runs the bundled `bin/gog` and
  `bin/gog-adapter` with Homebrew `gog` excluded from adapter execution `PATH`,
  verifies 14 Gmail methods including `gmail.pubsub.sync`, verifies structured
  disconnected health, verifies guarded no-send `gmail.native.write` behavior,
  verifies Pub/Sub notification fast-forward behavior, and verifies
  polling-only `records.backfill` stores a Gmail history cursor without a
  `gmail watch` call.
- Live Gmail cleanroom proof passed:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-gmail-live/20260430T152911Z`
- Live proof covered clean setup, health, full `tnapathy@gmail.com` backfill
  across `in:anywhere after:1970/01/01`, `gmail.native.read`, guarded
  `gmail.native.write`, and
  `gmail.send` dry-run/no-send behavior.
- Full backfill emitted `98,268` unique Gmail records, including text body,
  HTML body, normalized headers, RFC Message-ID header, thread ids for every
  record, `8,630` attachment metadata entries, and zero parse errors.
- Performance proof used `search_max=500`, `workers=16`, and
  fail-on-message-error; it took `78m49s`, emitted at `20.78` records/sec,
  recovered `268` rate-limit retries, and had zero skipped message fetches.
- The latest forced self-send monitor proof remains:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-gmail-live/20260429T201934Z`
- Additional live dogfood proof sent from `casey@moonsleep.co` to
  `tnapathy@gmail.com` and was ingested by the running local Nex Gmail monitor:
  `/Users/tyler/nexus/state/artifacts/validation/live/gog-gmail-other-account-runtime/20260430T143930Z`
- Hosted MoonSleep install/restart proof passed:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-hosted-moonsleep-install-restart/20260429T202232Z`
- Hosted proof published the corrected `gog@0.1.0` Linux arm64 release to
  Frontdoor, verified install at active version `0.1.0`, archived/restored the
  MoonSleep server, and verified runtime health plus the 13 Gmail methods and
  required adapter operations after restore.

Live read/dry-run proofs already performed:

- One-message full-body projection proof emitted body/header richness without
  printing private message contents.
- Attachment metadata proof emitted canonical attachment metadata.
- Attachment download proof fetched `590500` bytes and then returned a cache
  hit with the same byte count.
- Rich send/forward/draft proofs used upstream dry-run JSON and did not send or
  save mail.
- Fake-CLI tests prove history mode does not do broad Gmail search when history
  is healthy.
- Fallback polling tests prove multi-page missed-burst safety and bounded
  no-change polling.
- GGR-010 adds the durable live-sync seam: `records.backfill` can prime Gmail
  watch/history state when a Pub/Sub topic is configured, `adapter.monitor.start`
  can start/renew watch state, and `gmail.pubsub.sync` can process Pub/Sub
  notifications through Gmail history without advancing the cursor before
  complete processing.
- GGR-011 adds the polling-first live-sync path: `records.backfill` stores the
  highest fetched Gmail `history_id`, `adapter.monitor.start` uses a persisted
  cursor without calling watch APIs, and package cleanroom proves the path with
  a fake Gmail CLI.

## Known Limitations

- `gogcli v0.14.0` `gmail history --json` still exposes only flattened
  message-added ids. The adapter is ready for richer label/delete history JSON,
  but live label/delete event richness needs either upstream output expansion or
  a lower-level Gmail history API path.
- Local packaged `bin/gog` can hit macOS Keychain ACL prompts/timeouts when
  trying to reuse host-stored OAuth credentials. This is local operator state,
  not a package contract failure. Hosted installs should prefer credentials
  created under the packaged runtime path or a non-Keychain credential backend.
- The hosted public runtime inventory currently exposes the legacy Gmail-root
  connection count but not a stable public connection id for that row, so
  hosted restart proof records count preservation rather than id hash
  preservation.
- The latest live monitor proof predates GGR-011 and used degraded search
  polling because no Gmail watch/history cursor was present in the cleanroom.
  New backfills now create the history cursor needed for tight history polling.
  The latest performance run did not force another live self-send; the
  2026-04-29 cleanroom proof still emitted the forced self-send as a rich
  `record.ingest` event with body and headers.
- The adapter side of Pub/Sub live sync is implemented and package-tested. The
  remaining runtime piece is a public hosted webhook route that verifies Google
  delivery, maps the Gmail email address to the connection, calls
  `gmail.pubsub.sync`, and persists returned records through canonical record
  ingest.
- The subprocess-per-message backfill path is correctness-safe but not
  sub-10-minute capable for a ~98k mailbox. Raising `search_max` to `500`
  reduced list pages to `197`, but stable throughput remained about
  `20.78` records/sec because Gmail search/list and per-message fetch wall time
  dominate. `workers=20` and `workers=24` caused Gmail `messages.get`
  rate-limit bursts; `workers=16` is the current stable ceiling.
- The umbrella repo is dirty with unrelated operator-chat and other changes.
  The GOG adapter repo dirty state is expected from this work.

## Next Recommended Steps

1. Expose a stable public connection id for the legacy Gmail-root row if future
   hosted restart proofs need id hash preservation instead of count
   preservation.
2. Add the hosted Pub/Sub webhook route that calls `gmail.pubsub.sync` and
   ingests returned records.
3. Decide whether to extend upstream `gogcli gmail history --json` to expose
   full Gmail history event families, or implement a lower-level adapter path
   for Gmail history events.
4. Return to the broader adapter fleet audit now that GOG signoff is complete.

## New Agent Prompt

Paste this into a new chat:

```text
You are working in /Users/tyler/nexus. Follow /Users/tyler/nexus/AGENTS.md first, including running `nexus status` as your first action. Do not add a `kind` field to any data schema. Do not leak secrets, OAuth tokens, private Gmail message bodies, or attachment contents. Do not touch unrelated dirty worktree changes.

We are continuing the Nex/MoonSleep adapter efficiency and richness project. The larger goal is to make Nex reliable for MoonSleep attribution and operator workflows by ensuring adapters preserve source richness while using efficient backfill/live-monitor patterns. Backfill should be exhaustive and correctness-first. Live monitor should be incremental, cursor-based, and fast. Apps like Attribution should consume rich adapter records rather than embedding ingestion.

Current focus: the GOG Gmail adapter at /Users/tyler/nexus/home/projects/nexus/packages/adapters/gog.

Start by reading:
- /Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/HANDOFF.md
- /Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/README.md
- /Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/completed/GGR-009-cleanroom-and-hosted-validation-signoff.md
- /Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/completed/GGR-010-gmail-pubsub-history-live-sync.md
- /Users/tyler/nexus/home/projects/nexus/docs/workplans/gogcli-gmail-richness-board/completed/GGR-011-gmail-polling-first-history-live-sync.md
- /Users/tyler/nexus/home/projects/nexus/packages/adapters/gog/docs/specs/ADAPTER_SPEC_GOG.md
- /Users/tyler/nexus/home/projects/nexus/packages/adapters/gog/docs/validation/GOG_ADAPTER_VALIDATION.md
- /Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md

State to inherit:
- GGR-001 through GGR-011 are implemented and validated.
- Release archive is /Users/tyler/nexus/home/projects/nexus/packages/adapters/gog/dist/gog-0.1.0.tar.gz.
- Release SHA is f0a2dc0d6d3173c84ff263f3b64666533082dd1e1e561c460ded4e6e1bc4454b.
- Hosted Linux arm64 SHA is 4b3d99bd01e0daedc80783b40e0d86f56771d4a7675030129e720d9850c0c68e.
- The package bundles upstream gogcli v0.14.0 as bin/gog.
- Local validation passed: `go test ./...`, `go build -o ./bin/gog-adapter ./cmd/gog-adapter`, and `GOGCLI_SOURCE_DIR=/tmp/nexus-gogcli-v014 ./scripts/package-release.sh`.
- Package cleanroom smoke passed: `./scripts/package-cleanroom-smoke.sh dist/gog-0.1.0.tar.gz`.
- Package cleanroom proof artifacts are in /Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-package-cleanroom/20260430T212001Z.
- GGR-011 package cleanroom proof verifies `records.backfill` stores a Gmail history cursor without a configured Pub/Sub topic or `gmail watch` call.
- Live Gmail cleanroom proof artifacts are in /Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-gmail-live/20260430T152911Z.
- Live Gmail cleanroom backfilled 98,268 unique `tnapathy@gmail.com` records in 78m49s with zero skipped message fetches.
- Forced self-send monitor proof artifacts are in /Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-gmail-live/20260429T201934Z.
- Local live dogfood cross-account proof artifacts are in /Users/tyler/nexus/state/artifacts/validation/live/gog-gmail-other-account-runtime/20260430T143930Z.
- Hosted MoonSleep install/restart proof artifacts are in /Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-hosted-moonsleep-install-restart/20260429T202232Z.

Your first useful task is to reorient, verify current git status, summarize what is ready, and prepare a clean commit plan. Do not print private Gmail contents or credentials.
```
