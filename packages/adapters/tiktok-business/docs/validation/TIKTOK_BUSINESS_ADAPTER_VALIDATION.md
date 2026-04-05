# TikTok Business Adapter Validation

Current validation includes local package proof, provider-native hierarchy and
report reads, retained MoonSleep cleanroom validation, and a retained
multi-adapter soak cleanroom with mounted agent-use proof.

## Local Proof

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-business

go test ./...
mkdir -p ./bin
go build -o ./bin/tiktok-business-adapter ./cmd/tiktok-business-adapter
./bin/tiktok-business-adapter adapter.info
./bin/tiktok-business-adapter tiktok-business.campaigns.list --connection tiktok-business-primary --payload-json '{}'
```

## Retained Proof

- installed method catalog assertion for the first-wave hierarchy and report
  methods
- representative provider-native reads through the installed adapter/runtime
  surface
- cleanroom proof:
  `/Users/tyler/nexus/state/sandboxes/52569bc7-aa69-4fcf-bf14-4179cdef291b/artifacts/validation/tiktok-business-live/20260331T012109Z/tiktok-business-proof-summary.json`
- combined TikTok soak proof:
  `/Users/tyler/nexus/state/sandboxes/47ce00d7-c1ea-415e-bc4e-3ead0ddd386c/artifacts/validation/tiktok-soak-live/20260405T014721Z/tiktok-soak-proof-summary.json`
- combined TikTok soak observations:
  `/Users/tyler/nexus/state/sandboxes/47ce00d7-c1ea-415e-bc4e-3ead0ddd386c/artifacts/validation/tiktok-soak-live/20260405T014721Z/tiktok-soak-observations.json`
- stable provider spot-check:
  `/Users/tyler/nexus/state/artifacts/validation/tiktok-business/provider-spotcheck-stable-20260331T013349Z.json`

## Notes

- the retained backfill run completed and landed all expected record families,
  but `run.error` still includes `lease_expired:2026-03-31T01:24:13.243Z`; the
  queue bookkeeping noise did not block ingest or provider-row parity
- the combined soak proof on April 5, 2026 held `11` observations over `10`
  minutes, proved mounted agent-use for
  `tiktok-business.campaigns.list`, and finished with `797` landed records
  across `campaign_snapshot`, `adgroup_snapshot`, `ad_snapshot`,
  `campaign_daily`, `adgroup_daily`, `ad_daily`, and `advertiser_hourly`
