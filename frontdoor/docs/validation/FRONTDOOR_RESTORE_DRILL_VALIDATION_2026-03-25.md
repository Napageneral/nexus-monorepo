# Frontdoor Restore Drill Validation 2026-03-25

**Status:** ACTIVE VALIDATION

## Scope

This validation proves that the live hosted frontdoor can be restored into an
isolated AWS EC2 host from the current AWS Backup recovery artifact.

This is a frontdoor-only restore drill.

It does not claim full Nex runtime disaster recovery signoff.

## Customer Experience

This drill must not affect the live customer surface.

The restore target is isolated and must not:

- receive production DNS
- receive production traffic
- mutate the live frontdoor state

## Source Baseline

Live frontdoor host:

- instance:
  - `i-09e80f7b7da307e7c`
- public URL:
  - `https://frontdoor.nexushub.sh`
- state path:
  - `/var/lib/nexus-frontdoor`

Restore artifact used:

- backup job:
  - `305670a4-6b02-46db-a748-db6cfe9a92df`
- recovery point / private AMI:
  - `ami-09c373536723d046c`

## Restore Target

Temporary restore host:

- instance:
  - `i-0ed3515112e0d48c4`
- name:
  - `nexus-frontdoor-restore-drill-20260325`
- public IP:
  - `3.135.210.246`
- private IP:
  - `172.31.12.114`
- subnet:
  - `subnet-0d204df9a705d6f9e`
- security group:
  - `sg-01b4dda8696d9aa7b`

Temporary restore security group ingress:

- `22/tcp` from operator IP `136.49.99.9/32`
- `4789/tcp` from operator IP `136.49.99.9/32`

## Host Recovery Validation

Verified on the restored host via SSH:

- hostname:
  - `ip-172-31-12-114`
- service:
  - `nexus-frontdoor.service`
- service state:
  - `active`
- app root present:
  - `/opt/nexus/frontdoor`
- env file present:
  - `/etc/nexus-frontdoor/frontdoor.env`
- state directory present:
  - `/var/lib/nexus-frontdoor`

State directory contents recovered:

- `frontdoor.db`
- `frontdoor-sessions.db`
- `frontdoor-autoprovision.db`

Observed state directory size:

- `736K`

## Restored API Validation

Verified on the restored host:

- `GET http://127.0.0.1:4789/api/plans?server_class=standard`
- response:
  - `200`

Verified from the operator side over the isolated restore host public IP:

- `GET http://3.135.210.246:4789/api/plans?server_class=compliant`
- response:
  - `200`

Observed restored API payloads included the expected current pricing and class
model:

- `standard`
  - `Small`
  - `Medium`
  - `Large`
- `compliant`
  - `Small`
  - `Medium`
  - `Large`

## SQLite Recovery Validation

Verified from the restored `frontdoor.db`:

- table count:
  - `28`
- account count:
  - `8`
- server count:
  - `17`

This proves the restored host did not merely boot from an image with binaries.
It recovered working frontdoor state.

## Config Recovery Validation

Verified the restored host still carries the expected live config model in:

- `/etc/nexus-frontdoor/frontdoor.env`

Validated presence of the expected config/secret categories without disclosing
raw values:

- `FRONTDOOR_BASE_URL`
- `FRONTDOOR_INTERNAL_BASE_URL`
- `AWS_FRONTDOOR_REGION`
- `AWS_FRONTDOOR_AMI_ID`
- `FRONTDOOR_STANDARD_TAILSCALE_AUTH_KEY`
- `HETZNER_API_TOKEN`

## Result

Pass.

This drill proves:

1. AWS Backup recovery for frontdoor is real, not theoretical
2. the recovered host boots with the expected service/config/state layout
3. the restored frontdoor answers API traffic correctly in isolation
4. SQLite-on-EBS is defensible for frontdoor because restore has now been
   exercised, not merely assumed

## Teardown

Verified after validation:

- terminated:
  - `i-0ed3515112e0d48c4`
- deleted:
  - `sg-01b4dda8696d9aa7b`

Result:

- pass
