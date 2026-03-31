# TAP-003 Shared TikTok Cleanroom And Credential Path

## Goal

Create one cleanroom validation path that can exercise both TikTok adapter
surfaces through Nex without leaking secrets.

## Acceptance

1. the cleanroom harness can install and connect `tiktok-business`
2. the cleanroom harness can install and connect `tiktok-display`
3. credential references stay inside Nex-managed storage or local encrypted sources
4. the harness can run backfill and monitor proofs for both surfaces
