# GlowBot Live Credential Cutover Runbook

**Status:** ACTIVE
**Last Updated:** 2026-03-06

This runbook is for the first real clinic onboarding window. It assumes the
canonical package model, connection-profile model, and nex-backed pipeline
cutover are already in place.

---

## Preconditions

1. A clinic server exists and the GlowBot app is reachable through frontdoor.
2. The relevant shared adapter package is installed and visible to GlowBot.
3. The runtime adapter SDK surface needed for the chosen connection profile is
   available.
4. For EMR adapters, required compliance preconditions are complete before live
   credentials are used.

---

## Live Cutover Sequence

1. Select the intended connection profile in the Integrations UI.
2. Complete the runtime-owned connection flow for that profile.
3. Run the runtime-backed connection test.
4. If runtime-backed backfill is available for that adapter, run it. Otherwise
   start/verify monitoring and confirm first live events arrive through the
   normal ingestion path.
5. Confirm a fresh GlowBot pipeline run executes on live data.
6. Verify clinic-facing method payloads reflect live data.
7. Disconnect and reconnect once to validate repeatability and connection-state
   cleanup.

---

## What To Verify Per Adapter

| Adapter | Live path | Must verify |
|---|---|---|
| Google | managed OAuth and/or approved quick-connect profile | ad, local, and review metric elements map correctly |
| Meta Ads | supported connection profile | campaign metric elements and stable connection health |
| PatientNow EMR | supported API-key/custom profile | aggregate-only appointment/patient/revenue elements |
| Zenoti EMR | supported API-key/custom profile | aggregate-only elements with `clinic_id` per discovered center |
| CallRail | supported token profile | call metric elements with `clinic_id` per company |
| Twilio | supported credential profile | call metric elements with expected inbound/outbound/duration fields |
| Apple Maps | CSV/manual profile | normalized import and downstream recompute behavior |

---

## Evidence Capture

Capture all of the following:

1. connection/profile used
2. connection/test result
3. whether backfill or monitor-first ingestion was used
4. pipeline run ID and status transition timestamps
5. one sample metric element with expected metadata
6. one sample computed output showing downstream pipeline success
7. any provider-specific warning or mapping issue

---

## Rollback Rule

Immediately stop and disconnect the adapter if:

- the mapping is malformed
- PHI minimization expectations are violated
- health/test behavior is unstable
- the downstream pipeline produces obviously invalid output

Do not preserve a broken connection just to keep momentum.
