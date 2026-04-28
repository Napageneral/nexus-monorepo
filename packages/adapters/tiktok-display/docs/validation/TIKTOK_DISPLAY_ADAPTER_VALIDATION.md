# TikTok Display Adapter Validation

Current validation includes the real auth/profile-health path, provider-native
profile and video reads, local video sync coverage, retained MoonSleep
cleanroom validation, and a retained multi-adapter soak cleanroom with mounted
agent-use proof.

## Local Proof

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-display

go test ./...
mkdir -p ./bin
go build -o ./bin/tiktok-display-adapter ./cmd/tiktok-display-adapter
./bin/tiktok-display-adapter adapter.info
./bin/tiktok-display-adapter tiktok-display.user.info.get --connection tiktok-display-primary
```

## Cleanroom Proof

- installed method catalog assertion for `tiktok-display.user.info.get` and `tiktok-display.video.list`
- direct provider-native reads through the installed adapter/runtime surface
- cleanroom proof:
  `/Users/tyler/nexus/state/sandboxes/112b4d07-d664-4364-b586-4562e5b1f3d4/artifacts/validation/tiktok-display-row-parity-live/20260331T022745Z/tiktok-display-proof-summary.json`
- refreshed canonical-source cleanroom proof:
  `/Users/tyler/nexus/state/sandboxes/1257db25-d46b-474f-8716-f11c6a44da25/artifacts/validation/tiktok-display-row-parity-live/20260405T005116Z/tiktok-display-proof-summary.json`
- combined TikTok soak proof:
  `/Users/tyler/nexus/state/sandboxes/47ce00d7-c1ea-415e-bc4e-3ead0ddd386c/artifacts/validation/tiktok-soak-live/20260405T014721Z/tiktok-soak-proof-summary.json`
- combined TikTok soak observations:
  `/Users/tyler/nexus/state/sandboxes/47ce00d7-c1ea-415e-bc4e-3ead0ddd386c/artifacts/validation/tiktok-soak-live/20260405T014721Z/tiktok-soak-observations.json`
- stable provider spot-check:
  `/Users/tyler/nexus/state/artifacts/validation/tiktok-display/provider-spotcheck-stable-20260331T015930Z.json`
- raw provider spot-check showing expected live drift:
  `/Users/tyler/nexus/state/artifacts/validation/tiktok-display/provider-spotcheck-20260331T015844Z.json`

The latest combined soak proof on April 5, 2026 held `11` observations over
`10` minutes, proved mounted agent-use for
`tiktok-display.user.info.get`, and finished with `44` landed records:

- `profile_snapshot`: `5`
- `video_snapshot`: `39`

## April 27, 2026 Monitor Sanity Fix

The package-local monitor now uses the Go adapter SDK poll loop instead of
returning after a single bounded replay. It runs an immediate bounded seven-day
poll, then continues hourly until runtime cancellation.

Local proof:

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-display
go test ./...
```

Result:

- `ok github.com/nexus-project/adapter-tiktok-display/cmd/tiktok-display-adapter 0.187s`

## April 27, 2026 Smart Polling Local Cleanroom Proof

The package-local monitor has been upgraded from fixed-window replay polling to
durable per-connection smart polling:

- profile, discovery, active refresh, and slow reconcile lanes are separate
- monitor state is persisted under `$NEXUS_ADAPTER_STATE_DIR`
- unchanged profile and video revisions are suppressed before emit
- backfill updates monitor state when a state directory is available
- quiet monitor cycles no longer replay a broad recent window into runtime

Repo-local proof:

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-display
go test ./...
go test ./cmd/tiktok-display-adapter -run '^$' -bench 'BenchmarkTikTokDisplayQuietMonitorCycle' -benchmem
```

Repo-local result:

- `ok github.com/nexus-project/adapter-tiktok-display/cmd/tiktok-display-adapter 0.192s`
- `BenchmarkTikTokDisplayQuietMonitorCycle-12 111228 10800 ns/op 12593 B/op 161 allocs/op`

Copied-package cleanroom proof:

```bash
cleanroom=$(mktemp -d /tmp/tiktok-display-cleanroom.XXXXXX)
mkdir -p "$cleanroom/nexus-adapter-sdks"
rsync -a --delete --exclude .git /Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-display/ "$cleanroom/tiktok-display/"
rsync -a --delete --exclude .git /Users/tyler/nexus/home/projects/nexus/packages/adapters/nexus-adapter-sdks/nexus-adapter-sdk-go/ "$cleanroom/nexus-adapter-sdks/nexus-adapter-sdk-go/"
cd "$cleanroom/tiktok-display"
GOCACHE="$cleanroom/gocache" GOMODCACHE="$cleanroom/gomodcache" go test ./...
GOCACHE="$cleanroom/gocache" GOMODCACHE="$cleanroom/gomodcache" go test ./cmd/tiktok-display-adapter -run '^$' -bench 'BenchmarkTikTokDisplayQuietMonitorCycle' -benchmem -count=1
```

Copied-package cleanroom result from `/tmp/tiktok-display-cleanroom.P25QNj`:

- `ok github.com/nexus-project/adapter-tiktok-display/cmd/tiktok-display-adapter 0.195s`
- `BenchmarkTikTokDisplayQuietMonitorCycle-12 111435 10366 ns/op 12593 B/op 161 allocs/op`

## April 27, 2026 Hosted MoonSleep Proof

Published and installed package `tiktok-display@0.1.2` on the hosted MoonSleep
Nex runtime through Frontdoor.

Proof artifact:

- `/Users/tyler/nexus/home/projects/nexus/artifacts/package-smoke/moonsleep-tiktok-display-0.1.2-hosted-proof.json`

Validation result:

- Frontdoor install status: `installed`
- active version: `0.1.2`
- runtime `adapter.info` version: `0.1.2`
- connection id: `d3f7dfd2-ef3c-4844-be4d-e0dca82e2093`
- connection status: `connected`
- adapter health: connected for MoonSleep
- `tiktok-display.user.info.get`: returned MoonSleep profile
- `tiktok-display.video.list`: first page returned `10` videos with `has_more`
- backfill run `jobrun_d1c969da-f234-4288-ae90-2200443fcfa7`: `completed`
- records before proof checkpoint: `85`
- records after backfill: `90`
- records after one live-monitor window: `90`
- live sync after monitor window: `enabled`
- hosted runtime health after proof: `healthy`, `5` adapters running, `0`
  errored

This validates the hosted install, provider reads, backfill path, and live
monitor enablement. Per-lane request and suppression counters are still a useful
observability follow-up, but the hosted proof already shows no additional
unchanged durable records emitted during the quiet monitor window.

## April 27/28, 2026 Hosted OAuth Renewal Upgrade Proof

Published and installed package `tiktok-display@0.1.3` on the hosted MoonSleep
Nex runtime through Frontdoor.

Proof artifact:

- `/Users/tyler/nexus/home/projects/nexus/artifacts/package-smoke/moonsleep-tiktok-display-0.1.3-hosted-proof.json`

Validation result:

- Frontdoor install status: `installed`
- active version: `0.1.3`
- runtime `adapter.info` version: `0.1.3`
- connection id: `d3f7dfd2-ef3c-4844-be4d-e0dca82e2093`
- connection status: `connected`
- connection credential fields now include access token, refresh token, token
  expiries, OAuth client key, and OAuth client secret
- adapter health: connected for MoonSleep with `oauth_refresh_configured: true`
- `tiktok-display.user.info.get`: returned MoonSleep profile
- `tiktok-display.video.list`: first page returned `5` videos with `has_more`
- backfill run `jobrun_70cc276d-8c91-4967-a868-a5c02715e0c9`: `completed`
- live sync after upgrade: `enabled`
- hosted runtime health after proof: `healthy`, `5` adapters running, `0`
  errored, `tiktok-display` healthy

The previous manual-rotation caveat is closed for this adapter. The adapter now
renews TikTok Display access tokens directly via TikTok OAuth when the current
access token is missing, expired, or inside the configured refresh buffer. The
renewed token bundle is persisted in adapter state under
`NEXUS_ADAPTER_STATE_DIR` and reloaded on adapter restart.
