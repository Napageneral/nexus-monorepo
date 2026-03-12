# GlowBot Synthetic Deployed Rehearsal Validation

> Validation ladder for proving the deployed GlowBot topology behaves correctly
> with synthetic canonical records.
>
> **Status:** ACTIVE
> **Last Updated:** 2026-03-12

## Validation Sequence

1. publish real package artifacts
2. create/select control-plane and clinic servers
3. install `glowbot-admin` and confirm `glowbot-hub`
4. install `glowbot`
5. drive synthetic rehearsal actions
6. capture evidence

## Checks

| # | Checkpoint | Pass Criteria |
|---|---|---|
| SR1 | Control-plane server exists | `glowbot-admin` and `glowbot-hub` install on a dedicated server |
| SR2 | Clinic server exists | `glowbot` installs on a separate clinic server |
| SR3 | Product flag update works | admin updates a flag through the deployed control-plane path |
| SR4 | Clinic profile update works | clinic app persists canonical `ClinicProfile` truth |
| SR5 | Synthetic `record.ingest` succeeds | runtime accepts canonical record ingress |
| SR6 | Durable downstream processing runs | synthetic records produce real `metric` elements |
| SR7 | Metric provenance is correct | `metric` elements carry `connection_id`, `adapter_id`, `metric_name`, `metric_value`, and `date` |
| SR8 | Overview output is sane | `glowbot.overview` returns a coherent response |
| SR9 | Funnel output is sane | `glowbot.funnel` returns a coherent response |
| SR10 | Modeling output is sane | `glowbot.modeling` returns a coherent response |
| SR11 | Recommendations output is sane | `glowbot.agents.recommendations` returns a valid response |
| SR12 | Benchmark snapshot publish works | clinic app publishes benchmark-safe summary through deployed control-plane path |
| SR13 | Benchmark query works | clinic app receives benchmark response from the deployed control-plane path |
| SR14 | Product flag readback works | clinic app reads the flag through deployed `productControlPlane.call` |

## Evidence To Capture

- package install responses
- metric element list result
- clinic method responses
- benchmark publish/query responses
- product flag update and clinic-side readback

## Failure Conditions

The rehearsal fails if any of the following occur:

- direct DB seeding is required to make the app appear healthy
- product-control-plane calls work only from local helper code and not from the
  deployed clinic app
- synthetic records do not become `metric` elements
- clinic methods return malformed or incoherent responses
- benchmark publication/query cannot run on the deployed shape
