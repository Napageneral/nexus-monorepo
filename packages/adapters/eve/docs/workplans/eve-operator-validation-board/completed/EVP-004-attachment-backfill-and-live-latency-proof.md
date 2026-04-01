# EVP-004 Attachment, Backfill, And Live-Latency Proof

## Goal

Prove the remote-useful parts of Eve data flow under real conditions: history,
attachments, and live latency.

## Scope

- backfill proof against the Linux cleanroom
- real attachment ingest and remote fetch proof
- live-sync latency measurement from device action to Nex visibility
- evidence capture for record and attachment surfaces

## Acceptance

- backfill lands in canonical Nex records
- at least one real attachment becomes fetchable from Nex
- live latency is measured and recorded, not guessed
- no client proof depends on a macOS local file path

## Validation

- backfill transcript and record count proof
- attachment fetch proof through Nex
- latency measurements with timestamps
- `git diff --check`

## Result

Completed on 2026-03-31.

Backfill proof:

- the paired cleanroom contained `18` canonical `platform='imessage'` records
  after pairing
- `13` of those were historical records older than the self-loop proof ids,
  which proved the cleanroom had more than the new live-only events
- earliest cleanroom iMessage timestamp:
  `1774979295286`

Attachment proof:

- routed send body:
  `EVE ATTACHMENT PROOF 2026-03-31T13:00 self-loop 1774979940`
- runtime request window:
  `started_at=1774980616447`, `completed_at=1774980616813`
- warehouse attachment row:
  `attachments.id=354715874`
- attachment message record id:
  `imessage:289B1C50-9235-42C2-89E9-993F1AC9FF88`
- artifact reference:
  `nex-artifact:7452d982-fad0-40ba-9e92-79c0f795bf9a`
- cleanroom artifact path:
  `/artifacts/fresh-nex-workspace/state/artifacts/tools/eve-edge-attachment/2026-03-31/1774980621212-7452d982-fad0-40ba-9e92-79c0f795bf9a.txt`
- artifact sha256:
  `87b0c0c092737017c24e18c51955b3996630d4ea08637bb5eda2b05e3cb8c5d5`

Observed behavior:

- under the current `applescript_send_only` executor, the text leg and the
  attachment leg materialized as separate canonical outbound records
- the attachment record carried the Nex-managed artifact reference and no macOS
  filesystem path leaked into the cleanroom canonical record

Measured timings from the routed attachment send request:

- text-leg canonical visibility:
  `2829ms` from request start
- attachment-leg canonical visibility:
  `4826ms` from request start, `4460ms` from request completion

This ticket proved the cleanroom stores real Eve attachments through Nex-owned
artifact surfaces, not through direct macOS paths.
