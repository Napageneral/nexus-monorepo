# Release Notes

## 0.1.3

- add adapter-side TikTok Display OAuth access-token renewal
- persist refreshed token bundles in adapter state for restart-safe live sync
- expose refresh-token, token-expiry, and OAuth-client fields in setup metadata

## 0.1.2

- align adapter runtime version with the hosted package release
- include API descriptors and skill metadata in the shared package artifact

## 0.1.1

- add durable per-connection smart polling state
- split monitor into profile, discovery, active refresh, and slow reconcile lanes
- suppress unchanged profile and video revisions before emit
- add quiet-cycle monitor tests and benchmark validation

## 0.1.0

- initial `tiktok-display` package scaffold
- install manifest, Go entrypoint, release script, and package-local docs
