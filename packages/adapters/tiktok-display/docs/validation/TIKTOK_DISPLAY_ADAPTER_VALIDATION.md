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
