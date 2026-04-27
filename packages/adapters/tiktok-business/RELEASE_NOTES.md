# Release Notes

## 0.1.1

- Reworked live monitor polling into bounded per-family lanes.
- Added adapter-local monitor state and revision suppression so unchanged rows do not repeatedly hit runtime ingest.
- Kept exhaustive backfill behavior unchanged.

## 0.1.0

- initial `tiktok-business` package scaffold
- install manifest, Go entrypoint, release script, and package-local docs
