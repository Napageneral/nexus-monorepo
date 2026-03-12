# GlowBot Synthetic Deployed Rehearsal

> Target-state spec for proving GlowBot behavior on the real hosted package
> topology before live clinic credentials arrive.
>
> **Status:** ACTIVE
> **Last Updated:** 2026-03-12

## Customer Outcome

Before a real clinic connects Google, Meta Ads, CallRail, or Twilio, GlowBot
must already prove the deployed product shape works.

The rehearsal must prove this operator and clinic story:

1. `glowbot-admin` and `glowbot-hub` run on a dedicated control-plane server.
2. `glowbot` runs on a separate clinic server.
3. synthetic canonical records enter the clinic runtime through `record.ingest`
4. the real downstream pipeline writes canonical `metric` elements
5. deployed clinic methods return coherent overview, funnel, modeling, and
   recommendation outputs
6. benchmark snapshots publish and query through the deployed control-plane path
7. a control-plane product flag update becomes visible in the clinic app

This is the final non-credential rehearsal before live clinic onboarding.

## Scope

### In Scope

- real package artifacts
- real frontdoor publish/install flow
- separate clinic and control-plane servers
- deployed `productControlPlane.call`
- synthetic canonical `record.ingest`
- downstream `record.ingested` wake-up
- real `metric_extract`
- real clinic read methods
- benchmark publication/query
- product flag round-trip

### Out Of Scope

- live provider credentials
- managed profile live-provider exchange
- persisted derived-output materialization
- HIPAA / EMR validation

## Topology

### Control-Plane Server

- `glowbot-admin`
- `glowbot-hub`

### Clinic Server

- `glowbot`

The rehearsal must use the canonical dependency-driven install shape:

- install `glowbot-admin`
- dependency planning installs `glowbot-hub`
- install `glowbot` separately on the clinic server

## Synthetic Inputs

The rehearsal uses canonical `record.ingest` payloads only.

Minimum metric metadata per record:

- `connection_id`
- `adapter_id`
- `metric_name`
- `metric_value`
- `date`

Recommended first dataset:

- demand metrics:
  - `ad_spend`
  - `ad_impressions`
  - `ad_clicks`
- local presence metrics:
  - `listing_views_search`
  - `listing_views_maps`
  - `listing_clicks_website`
  - `listing_clicks_directions`
  - `listing_clicks_phone`
  - `reviews_new`
  - `reviews_rating_avg`

The clinic app must also persist a canonical clinic profile before benchmark
publication is expected to succeed:

- `specialty` required
- `monthlyAdSpendBand`, `patientVolumeBand`, and `locationCountBand` may be
  `"unknown"`

## Rehearsal Flow

1. publish real GlowBot package artifacts
2. create/select dedicated control-plane and clinic servers
3. install `glowbot-admin` and confirm `glowbot-hub`
4. install `glowbot`
5. update a product flag through the deployed admin path
6. update the clinic profile on the clinic server
7. inject synthetic canonical `record.ingest` payloads into the clinic runtime
8. wait for durable downstream processing to produce `metric` elements
9. validate clinic-facing method outputs
10. validate benchmark snapshot publish/query
11. validate product flag readback from the clinic app

## Required Evidence

- package install status on both servers
- dependency-driven `glowbot-admin -> glowbot-hub` install
- real `metric` element creation after synthetic ingest
- real `glowbot.overview` response
- real `glowbot.funnel` response
- real `glowbot.modeling` response
- real `glowbot.agents.recommendations` response
- benchmark snapshot publish and benchmark query success
- product flag update on the control-plane side and readback on the clinic side

## Pass Criteria

The rehearsal passes only if:

- it uses the real hosted deployment topology
- it uses real package artifacts
- it uses canonical `record.ingest`
- it proves end-to-end GlowBot behavior without direct database seeding
- it produces coherent clinic-facing outputs from deployed code
