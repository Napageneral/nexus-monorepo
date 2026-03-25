# Frontdoor AWS Compliant Live Proof 2026-03-17

**Status:** ACTIVE VALIDATION
**Last Updated:** 2026-03-17
**Related:** `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_AWS_HOSTING_AND_SERVER_CLASS_MODEL.md`, `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_HOSTED_PACKAGE_INSTALL_POLICY_AND_DEPLOYMENT_CLASSES.md`

## Purpose

This validation note records the first live AWS compliant-hosting proof for the
AWS frontdoor / `compliant` server-class cutover.

It captures what is already proven, what failed in live execution, and what the
next hard-cut fix must be.

## Customer Experience Baseline

The customer-facing target remains:

1. one frontdoor
2. one login
3. one server list
4. `standard` vs `compliant`
5. no cloud-vendor UX

This proof only tests whether the compliant AWS provider path can satisfy that
experience.

## AWS Resources Created

### Frontdoor host

- instance id: `i-09e80f7b7da307e7c`
- public IP: `16.59.59.213`
- private IP: `172.31.15.170`

### Current compliant runtime images observed in live proof

- stale AMI: `ami-00cf0b4a4a826980a`
- fresh AMI from current Nex runtime tree: `ami-0579126a217876d83`

### Network / access

- subnet id: `subnet-0d204df9a705d6f9e`
- frontdoor host security group: `sg-0f51e4bd4fed68750`
- compliant runtime security group: `sg-05c4ab1bc82da8c1c`
- EC2 key pair: `nexus-operator`

### AWS operator access

- account id: `953113807086`
- region: `us-east-2`
- local CLI profile: `frontdoor-admin`

## Frontdoor Host Baseline Proven

The AWS frontdoor host is up and serving the current hosted bootstrap path.

Observed host config:

1. `baseUrl = http://16.59.59.213:4789`
2. `internalBaseUrl = http://172.31.15.170:4789`
3. runtime trusted-token signer is configured on the host
4. `nexus-frontdoor.service` is active

Observed deployed bootstrap contract:

1. trusted-token `aud = nexus-runtime`
2. trusted-token includes `tenant_id`
3. trusted-token includes `jti`
4. bootstrap retries `nexus init`
5. bootstrap currently fails hard on health timeout instead of reporting false
   `running`

This means the first live AWS proof is no longer blocked by the frontdoor host
deployment itself.

## Live Compliant Create Proof

Frontdoor successfully created a real `compliant` server record and launched a
real AWS EC2 tenant instance.

Observed hosted records:

- stale-image proof:
  - server id: `srv-b3484a7e-97f`
  - tenant id: `t-fd8780b4-3a7`
- fresh-image proof:
  - server id: `srv-93887647-ece`
  - tenant id: `t-8a40eadc-95b`
- server class: `compliant`
- deployment class: `customer_server`
- current fresh-proof status: `failed`

Observed provider instances:

- stale-image proof instance: `i-08ebb722d3772f4dd`
- fresh-image proof instance: `i-086114ae30c143a94`
- fresh-image proof private IP while alive: `172.31.14.15`
- no public IP on compliant instances

Important result:

1. frontdoor no longer incorrectly flips the server to `running`
2. the live record correctly remains `provisioning` when callback does not
   happen

That closes the earlier false-positive bootstrap bug.

## Live Failure Narrowed

The stale-image failure is closed.

The fresh compliant instance from `ami-0579126a217876d83` proved:

1. cloud-init ran
2. `/opt/nex/state/config.json` was created and patched
3. `runtime.hostedMode = true`
4. runtime auth mode is `trusted_token`
5. `tenantId` is patched correctly
6. `nex-runtime.service` eventually starts the current runtime tree
7. the runtime eventually listens on `0.0.0.0:18789`

But the fresh proof still failed because cloud-init hit a bootstrap-ordering
race and then died on the fatal health gate.

Observed console evidence from the fresh instance:

1. `nex-runtime.service` auto-started before cloud-init final stage
2. cloud-init then attempted `nexus init`
3. `nexus init` hit `database is locked`
4. bootstrap later started the runtime again after patching config
5. the runtime was listening by `20:46:40Z`
6. cloud-init still died at `20:47:38Z` with
   `FATAL: Runtime health check timed out after 60s`

This means the remaining blocker is not stale runtime-token shape or stale
runtime artifacts.

The remaining blocker is:

1. the baked compliant image leaves `nex-runtime.service` enabled on first boot
2. first-boot cloud-init does not yet neutralize that pre-start before
   `nexus init`
3. the fatal health gate turns that race into a failed provision instead of a
   recoverable bootstrap sequence

## Stale AMI Drift Finding Closed

The fresh compliant AMI now proves the current Nex runtime tree can be baked
into AWS successfully.

Observed fresh-image facts:

1. AMI id: `ami-0579126a217876d83`
2. AMI name: `nex-compliant-runtime-20260317b`
3. runtime tree on the instance is current, not the stale `2026.2.6-3` build

Canonical interpretation:

1. stale AMI drift is no longer the primary blocker
2. the next hard-cut fix is service-ordering, not token-contract rollback
3. the compliant AMI contract must now require `nex-runtime.service` to ship
   installed but disabled before first boot

## AWS Destroy Gap Closed

The earlier AWS destroy bug was real and is now closed in the live path.

What was previously proven:

1. compliant instances are launched with termination protection enabled
2. direct terminate failed with `OperationNotPermitted`

What is now proven:

1. the frontdoor host is running the updated destroy path that clears
   protection before terminate
2. the failed fresh-proof instance `i-086114ae30c143a94` was actually cleaned
   up instead of lingering

Canonical rule remains:

1. AWS destroy and timeout-cleanup paths must clear delete/rebuild protection
   before terminate

## Decision

The next hard-cut execution steps are:

1. change the compliant image contract so `nex-runtime.service` ships disabled
2. make cloud-init stop/disable any pre-started runtime before `nexus init`
3. rebake a fresh ARM64 compliant runtime AMI from that corrected image
   contract
4. repoint `AWS_FRONTDOOR_AMI_ID`
5. rerun fresh compliant create proof
6. only after that, proceed to compliant package-install proof and Tailscale
   `standard` overlay work

## Current Validation State

### Proven

1. AWS frontdoor host deployment works
2. AWS operator CLI access works
3. compliant create dispatch works live
4. private compliant runtime instance launch works live
5. current bootstrap path no longer false-reports `running`
6. stale AMI drift is closed
7. AWS timeout cleanup can now actually terminate failed compliant instances

### Not Yet Proven

1. the corrected image contract can complete hosted trusted-token bootstrap
2. compliant runtime can phone home to `running`
3. compliant-only package install can complete on AWS
4. Tailscale-backed standard-server management from AWS frontdoor works live
