# Frontdoor HIPAA Readiness Hardening

## Customer Experience

This pass must not change the hosted product model.

Customers should still experience:

- one Frontdoor
- one login
- `standard` and `compliant` server classes
- no provider-brand choice in the UX

This is a frontdoor-only hardening pass. It exists to close the remaining
control gaps around the hosted control plane, not to change the product
surface.

## Scope

This spec covers the live hosted frontdoor at:

- `https://frontdoor.nexushub.sh`

It does not reopen the larger Nex runtime HIPAA audit. The goal here is
frontdoor-only readiness:

- credible AWS audit trail
- credible encrypted persistence posture
- credible restore posture for SQLite
- credible secret inventory and rotation story
- credible log hygiene for a PHI-poor control plane

## Current Live Posture

As of `2026-03-19`, the live frontdoor has these relevant properties:

- AWS-hosted EC2 frontdoor instance
- encrypted EBS root volume
- CloudTrail enabled and actively delivering logs
- `compliant` server class provisioned on AWS
- `standard` server class provisioned on Hetzner via Tailscale private transport
- hosted production auth is OIDC-first
- frontdoor persistence is SQLite at:
  - `/var/lib/nexus-frontdoor/frontdoor.db`
- service config and secrets are loaded from:
  - `/etc/nexus-frontdoor/frontdoor.env`

## Verified Live Findings

### CloudTrail

Verified live:

- trail name: `nexus-frontdoor-cloudtrail`
- region: `us-east-2`
- multi-region: `true`
- global service events: `true`
- log file validation: `true`
- logging status: `true`
- trail bucket:
  - `nexus-frontdoor-cloudtrail-953113807086-use2`
- S3 bucket encryption enabled
- S3 public access block enabled

Decision:

- CloudTrail is not a current blocker.

### Persistence

Verified live:

- frontdoor state file:
  - `/var/lib/nexus-frontdoor/frontdoor.db`
- root volume is encrypted EBS

Decision:

- SQLite remains acceptable for frontdoor for now.
- SQLite is only acceptable if backup and restore are real and verified.

### IAM

Verified live:

- frontdoor EC2 role:
  - `nexus-frontdoor-ec2-role`
- instance profile:
  - `nexus-frontdoor-ec2-profile`
- current inline policy:
  - `nexus-frontdoor-ec2-provisioning`

Current weakness:

- the frontdoor role allows the needed EC2 actions on `Resource: "*"`

Decision:

- this must be narrowed to the actual frontdoor provisioning scope.

### Secrets

Verified live:

- frontdoor service reads:
  - `/etc/nexus-frontdoor/frontdoor.env`
- host-managed operational secrets currently include:
  - `HETZNER_API_TOKEN`
  - `FRONTDOOR_STANDARD_TAILSCALE_AUTH_KEY`
- host-managed operational config currently includes:
  - `AWS_FRONTDOOR_REGION`
  - `AWS_FRONTDOOR_SUBNET_ID`
  - `AWS_FRONTDOOR_SECURITY_GROUP_IDS`
  - `AWS_FRONTDOOR_AMI_ID`
  - `AWS_FRONTDOOR_SSH_KEY_NAME`
  - `FRONTDOOR_BASE_URL`
  - `FRONTDOOR_INTERNAL_BASE_URL`
  - `FRONTDOOR_VPS_SSH_KEY_PATH`

Decision:

- host-env managed secrets are acceptable for frontdoor for now
- they are not acceptable as undocumented operational folklore
- frontdoor must have an explicit live secret inventory and rotation ownership

### Logging

Verified live:

- sampled request logs appear PHI-poor
- sampled request logs did not show patient data, request bodies, prompts, or raw tokens

Current weakness:

- request logs still include `session_cookie_id`

Decision:

- frontdoor should stop logging `session_cookie_id`
- log hygiene should keep:
  - request path
  - method
  - status
  - duration
  - client IP
- log hygiene should not keep:
  - session cookie identifiers
  - request bodies
  - raw auth tokens
  - PHI-bearing payloads

## Hard Cut Decisions

### 1. SQLite stays

Frontdoor does not need an RDS migration in this pass.

The hard requirement is:

- encrypted EBS
- verified backup coverage
- verified restore procedure

### 2. Host-env secrets stay for now

Frontdoor does not need a Secrets Manager migration in this pass.

The hard requirement is:

- explicit inventory
- explicit owner
- explicit rotation responsibility
- root-only host access
- no secrets in repo

### 3. IAM must narrow now

Unlike SQLite and host-env secrets, the EC2 role breadth is a real control gap
that should be tightened immediately.

The role must narrow to the concrete provisioning scope frontdoor actually uses:

- region:
  - `us-east-2`
- subnet:
  - `subnet-0d204df9a705d6f9e`
- security group:
  - `sg-05c4ab1bc82da8c1c`
- AMI:
  - `ami-0c4ecec436fe2c2f4`
- SSH key:
  - `nexus-operator`

### 4. Backup must be real now

There is currently no AWS Backup plan covering the live frontdoor state.

That is not acceptable if SQLite is the persistence model.

This pass must create:

- AWS Backup coverage for the live frontdoor instance/root volume
- a documented restore path for `frontdoor.db`

## Required Changes

### IAM policy hardening

The frontdoor EC2 role must retain the minimum EC2 capabilities required for:

- create compliant runtime EC2 instances
- tag them
- stop/start/archive/restore them
- set EC2 protection flags
- create AMI recovery points
- describe the provisioning surface

The role should remain broad only where AWS requires read scope for EC2
describe operations.

The role should narrow mutating operations to the actual resources and
conditions frontdoor uses.

### Backup coverage

This pass must add AWS Backup coverage for the live frontdoor state.

The minimum acceptable outcome is:

- one backup plan exists
- the live frontdoor instance or root volume is selected into it
- restore can be demonstrated concretely enough that SQLite-on-EBS remains
  credible

### Secret inventory

This pass must produce a frontdoor-owned live secret inventory that states:

- key name
- whether it is secret or non-secret config
- where it lives
- whether it is required
- who rotates it

### Log hygiene

This pass must remove `session_cookie_id` from request logs and re-check the
live logs for PHI-poor behavior.

## Validation Requirements

This spec is only complete when all of the following are true:

1. CloudTrail remains enabled and healthy after the pass.
2. The frontdoor EC2 role no longer uses mutating EC2 permissions on `*`
   without constraint beyond what AWS requires.
3. AWS Backup coverage exists for the live frontdoor state.
4. Restore posture is documented concretely enough that SQLite remains
   defensible.
5. Live secret inventory exists in frontdoor docs.
6. Sampled frontdoor logs no longer include `session_cookie_id`.
7. No customer-facing UX regression is introduced.

## Non-Goals

This pass does not:

- migrate frontdoor off SQLite
- migrate frontdoor secrets into Secrets Manager
- reopen the bigger Nex runtime HIPAA audit
- add backwards compatibility paths
