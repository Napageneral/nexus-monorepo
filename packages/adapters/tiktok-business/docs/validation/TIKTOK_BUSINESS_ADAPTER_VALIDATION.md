# TikTok Business Adapter Validation

Current validation includes local package proof plus retained MoonSleep
cleanroom validation.

## Local Proof

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-business

go test ./...
mkdir -p ./bin
go build -o ./bin/tiktok-business-adapter ./cmd/tiktok-business-adapter
./bin/tiktok-business-adapter adapter.info
```

## Retained Proof

- cleanroom proof:
  `/Users/tyler/nexus/state/sandboxes/52569bc7-aa69-4fcf-bf14-4179cdef291b/artifacts/validation/tiktok-business-live/20260331T012109Z/tiktok-business-proof-summary.json`
- stable provider spot-check:
  `/Users/tyler/nexus/state/artifacts/validation/tiktok-business/provider-spotcheck-stable-20260331T013349Z.json`

## Notes

- the retained backfill run completed and landed all expected record families,
  but `run.error` still includes `lease_expired:2026-03-31T01:24:13.243Z`; the
  queue bookkeeping noise did not block ingest or provider-row parity
