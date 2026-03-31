# TikTok Display Adapter Validation

Current validation includes the real auth/profile-health path, local video sync
coverage, and retained MoonSleep cleanroom validation.

## Local Proof

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-display

go test ./...
mkdir -p ./bin
go build -o ./bin/tiktok-display-adapter ./cmd/tiktok-display-adapter
./bin/tiktok-display-adapter adapter.info
```

## Cleanroom Proof

- cleanroom proof:
  `/Users/tyler/nexus/state/sandboxes/112b4d07-d664-4364-b586-4562e5b1f3d4/artifacts/validation/tiktok-display-row-parity-live/20260331T022745Z/tiktok-display-proof-summary.json`
- stable provider spot-check:
  `/Users/tyler/nexus/state/artifacts/validation/tiktok-display/provider-spotcheck-stable-20260331T015930Z.json`
- raw provider spot-check showing expected live drift:
  `/Users/tyler/nexus/state/artifacts/validation/tiktok-display/provider-spotcheck-20260331T015844Z.json`

The latest clean launcher rerun proves the patched stable revision-hash build on
the normal cleanroom path. It landed `41` records:

- `profile_snapshot`: `3`
- `video_snapshot`: `38`
