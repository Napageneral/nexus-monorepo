# MAP-004 MoonSleep Credential Validation

## Goal

Validate the Meta row-parity package against real MoonSleep Meta credentials
and sampled upstream provider data.

## Proof Posture

Primary proof should run in cleanroom first with injected local credentials or
runtime-managed credential binding.

Live local confirmation can follow after the cleanroom path passes.

## Current Gap

- none on the validation lane itself
- remaining package-doc and signoff work moves to `MAP-005`

## Current Findings

Latest cleanroom bundle:

- `/Users/tyler/nexus/state/sandboxes/bc46bd8e-be88-4507-b631-0a428460027a/artifacts/validation/meta-ads-row-parity-live/20260330T193828Z`
- `/Users/tyler/nexus/state/sandboxes/2f4d64db-e438-44dc-bab6-a96597cbc92f/artifacts/validation/meta-ads-row-parity-live/20260330T210130Z`
- `/Users/tyler/nexus/state/sandboxes/2e0598da-6ee7-4031-a6f0-849c273b9b93/artifacts/validation/meta-ads-row-parity-live/20260330T225303Z`

Validated against restored MoonSleep local credentials mounted from the local
encrypted volume path described in workspace instructions.

Initial failures and isolation:

- the fresh runtime originally died during backfill after the first
  `record.ingested` -> `internal.search-projector.execute` cycle
- standalone package execution in the same cleanroom succeeded, which narrowed
  the fault to the Nex runtime path rather than the packaged Meta adapter
- a search-disabled cleanroom run also completed successfully, which confirmed
  the adapter package and repaired backfill host were good

Local runtime fixes that cleared the crash:

- `work.db` initialization was tightened so repeated opens no longer rewrite
  canonical role-config and memory-job rows in steady state
- adapter backfill now waits for child `close`, not `exit`, before finalizing
  stdout handling
- adapter backfill now awaits durable ingest instead of fire-and-forget
  `processEvent()` calls
- the search projector was changed to open only the ledgers it actually needs,
  instead of initializing unrelated ledgers during `record.ingested` fanout

What now passes on the default runtime path:

- credentialed package install and package health succeed in a fresh runtime
- connection create/update succeeds once a local receiver-grounding contact is
  seeded for the fresh runtime
- real MoonSleep Meta backfill completes successfully with normal
  `record.ingested` search projection enabled
- the retained cleanroom proof summary at
  `/Users/tyler/nexus/state/sandboxes/2e0598da-6ee7-4031-a6f0-849c273b9b93/artifacts/validation/meta-ads-row-parity-live/20260330T225303Z/meta-ads-proof-summary.json`
  shows:
  - `campaign_snapshot`: 13
  - `campaign_daily`: 29
  - `adset_daily`: 42
  - `ad_daily`: 72
  - `account_hourly`: 42
  - total Meta records after the cleanroom backfill pass: 198
- the cleanroom runtime log at
  `/Users/tyler/nexus/state/sandboxes/2e0598da-6ee7-4031-a6f0-849c273b9b93/artifacts/validation/meta-ads-row-parity-live/20260330T225303Z/runtime.log`
  shows multiple `internal.search-projector.execute` jobs running during active
  Meta backfill without crashing the runtime

Live-sync findings:

- resuming the retained cleanroom restarted the persisted Meta monitor and
  logged:
  - `rehydrated active adapter "meta-ads" from durable package state`
  - `rehydrated 1 persisted adapter connection and restarted 1 monitor`
- those lines are recorded in
  `/Users/tyler/nexus/state/sandboxes/2e0598da-6ee7-4031-a6f0-849c273b9b93/artifacts/server-under-test-runtime.log`
- a manual monitor stop/start in that retained cleanroom produced a stronger
  live-sync proof:
  - stop response:
    `/Users/tyler/nexus/state/sandboxes/2e0598da-6ee7-4031-a6f0-849c273b9b93/artifacts/execs/bf7ea066-e57a-45fb-b60c-fbdfa2a67e11/stdout.txt`
  - start response:
    `/Users/tyler/nexus/state/sandboxes/2e0598da-6ee7-4031-a6f0-849c273b9b93/artifacts/execs/6a8b4e46-fbf1-4310-81c7-0f5cccaaab13/stdout.txt`
  - runtime adapter-state before restart:
    `/Users/tyler/nexus/state/sandboxes/2e0598da-6ee7-4031-a6f0-849c273b9b93/artifacts/execs/a7776879-cc0a-4f5c-ab4f-7ca66efc7f9f/stdout.txt`
    with `events_received = 412`
  - runtime adapter-state after restart:
    `/Users/tyler/nexus/state/sandboxes/2e0598da-6ee7-4031-a6f0-849c273b9b93/artifacts/execs/d5393f37-ddea-4b0a-afed-301433adc708/stdout.txt`
    with `events_received = 618`
  - the resumed runtime log then shows fresh `internal.search-projector.execute`
    jobs at `2026-03-30T23:00:57Z`, `2026-03-30T23:00:58Z`, and
    `2026-03-30T23:01:00Z`
- querying the retained cleanroom records ledger after that manual restart
  shows 269 total Meta records across:
  - `campaign_snapshot`: 13
  - `campaign_daily`: 31
  - `adset_daily`: 45
  - `ad_daily`: 136
  - `account_hourly`: 44
- records received after the manual monitor restart show new immutable arrivals:
  - `campaign_daily`: 1
  - `adset_daily`: 2
  - `ad_daily`: 14
  - `account_hourly`: 1

Provider-row spot-check findings:

- host-side parity artifact:
  `/Users/tyler/nexus/state/artifacts/validation/meta-ads/provider-spotcheck-20260330T1826CDT.json`
- sampled rows checked directly against the Meta Graph API:
  - `campaign_snapshot` for campaign `120242571460180078`
  - `campaign_daily` for campaign `120242062365030078` on `2026-03-29`
  - `adset_daily` for ad set `120242378748940078` on `2026-03-29`
  - `ad_daily` for ad `120242680235760078` on `2026-03-29`
  - `account_hourly` for `2026-03-29 22:00:00 - 22:59:59`
- all sampled rows matched semantically after normalization:
  - `row_equal = true` for all five sampled families
  - `derived_equal = true` for all five sampled families
  - `derived_mismatches = 0` for all five sampled families
- the parity artifact also preserves the exact replayed Graph request shape,
  with access tokens redacted
- the initial false negatives in the scratch artifact were caused by object key
  insertion order during naive JSON string comparison; the final artifact uses
  structural equality instead

Additional isolation proof retained for reference:

- running the packaged adapter directly inside the same retained sandbox,
  outside the Nex runtime, also completed successfully against the same
  MoonSleep credentials
- standalone adapter result: 106 emitted `record.ingest` envelopes
- standalone family totals:
  - `campaign_snapshot`: 13
  - `campaign_daily`: 6
  - `adset_daily`: 8
  - `ad_daily`: 40
  - `account_hourly`: 39

Current conclusion:

- the MoonSleep Meta credentials and adapter package are good enough to fetch
  and emit the required provider truth
- the original runtime blocker was in the Nex runtime path, not the Meta
  adapter package itself, and that blocker is now fixed locally
- default-path cleanroom backfill with normal search projection now completes
  successfully against real MoonSleep data
- resumed monitor rehydration works, and a manual monitor restart proves the
  live polling path emits additional Meta arrivals through the runtime-managed
  ingestion path
- sampled provider rows now match emitted Nex rows and derived helper measures
  directly against Meta upstream responses
- unchanged `campaign_snapshot` rows remained at `13` through replay while
  changed daily/hourly families appended new immutable arrivals, which is the
  replay-safe behavior this lane needed to prove
- this ticket is complete; remaining signoff/doc sync work belongs to
  `MAP-005`

## Acceptance

1. credentialed health succeeds against the MoonSleep Meta account
2. backfill emits all required row families against real provider data
3. sampled emitted rows match upstream ids, dates, spend, clicks, actions, and
   action-values payloads
4. replay of recent windows shows correct dedupe for unchanged rows and new
   arrivals for changed rows
5. no secrets are written into active docs or committed artifacts

## Status

Acceptance item `1` is satisfied.

Acceptance item `2` is satisfied.

Acceptance item `3` is satisfied.

Acceptance item `4` is satisfied.

Acceptance item `5` is satisfied; no raw secrets were written into docs, and
captured artifacts remain operator-only validation material.
