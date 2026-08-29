# Borden FedEx External Capture Adapter Validation

**Last Updated:** 2026-08-15

## Required proof

- package unit tests, type checking, and build pass;
- a fresh Docker cleanroom repeats the tests and prints `adapter.info`;
- setup rejects credentials, unknown fields, invalid custody references, and missing read-only confirmation;
- health reports every provider, registration, Dispatch, Finance, and Claims mutation authority as false;
- `adapter.info` omits `adapter.monitor.start` and `records.backfill`;
- production install readback identifies the exact committed release;
- the created connection reads back as adapter `borden-fedex`, service `fedex-billing-online`, account `borden-production`;
- invoice registration and identical replay remain separate production activities;
- no timer or projection is enabled before review.
