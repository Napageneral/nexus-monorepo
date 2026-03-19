# Frontdoor HIPAA Readiness Validation 2026-03-19

## Scope

This validation covers the live hosted frontdoor only.

It does not claim full Nex runtime HIPAA signoff.

Target:

- `https://frontdoor.nexushub.sh`

## Customer Experience

This pass should not change the product surface.

Customers should still see:

- one Frontdoor
- one login
- `standard` and `compliant`
- no provider-brand choice

## Live Baseline

Verified live:

- frontdoor EC2 instance:
  - `i-09e80f7b7da307e7c`
- public IP:
  - `18.118.236.10`
- private IP:
  - `172.31.15.170`
- root volume:
  - `vol-0380b520ec27c4ca6`
- frontdoor state file:
  - `/var/lib/nexus-frontdoor/frontdoor.db`
- service env file:
  - `/etc/nexus-frontdoor/frontdoor.env`

## CloudTrail

Verified live:

- trail:
  - `nexus-frontdoor-cloudtrail`
- region:
  - `us-east-2`
- multi-region:
  - `true`
- global service events:
  - `true`
- log file validation:
  - `true`
- logging:
  - `true`
- bucket:
  - `nexus-frontdoor-cloudtrail-953113807086-use2`
- bucket encryption:
  - enabled
- public access block:
  - enabled

Result:

- pass

## EBS Encryption

Verified live:

- volume:
  - `vol-0380b520ec27c4ca6`
- encrypted:
  - `true`
- type:
  - `gp3`
- size:
  - `40 GB`

Result:

- pass

## EC2 Role Hardening

Verified live:

- role:
  - `nexus-frontdoor-ec2-role`
- instance profile:
  - `nexus-frontdoor-ec2-profile`
- inline policy:
  - `nexus-frontdoor-ec2-provisioning`

Current narrowed scope:

- subnet:
  - `subnet-0d204df9a705d6f9e`
- security group:
  - `sg-05c4ab1bc82da8c1c`
- AMI:
  - `ami-0c4ecec436fe2c2f4`
- SSH key:
  - `nexus-operator`
- instance types:
  - `t4g.medium`
  - `t4g.large`
  - `t4g.xlarge`
- lifecycle and recovery actions require:
  - `ec2:ResourceTag/managed-by = nexus-frontdoor`

Validated:

- `Describe*` actions remain available
- simulated `RunInstances` for the exact frontdoor provisioning shape is allowed
- simulated `StopInstances`, `CreateImage`, and `ModifyInstanceAttribute` on a managed instance are allowed

Result:

- pass

## Backup Coverage

Verified live:

- backup vault:
  - `nexus-frontdoor-backup-vault`
- backup plan:
  - `nexus-frontdoor-daily`
- backup plan id:
  - `a6bfbf51-65ee-45be-b04a-43156280c35a`
- backup selection:
  - `nexus-frontdoor-host`
- backup selection id:
  - `c5aacea0-bc3c-4609-be26-3ec6b434c790`
- backup role:
  - `AWSBackupDefaultServiceRole`
- selected resource:
  - `arn:aws:ec2:us-east-2:953113807086:instance/i-09e80f7b7da307e7c`
- on-demand backup job:
  - `305670a4-6b02-46db-a748-db6cfe9a92df`
- current restore artifact:
  - `ami-09c373536723d046c`
- restore artifact state:
  - `available`

Restore target for current proof:

- recovery point ARN will resolve under:
  - `nexus-frontdoor-backup-vault`
- persisted SQLite state remains:
  - `/var/lib/nexus-frontdoor/frontdoor.db`

Result:

- plan and selection created
- on-demand backup job started
- restore artifact is already materialized as an available private AMI
- AWS Backup job reached `COMPLETED`
- restore path is now concretely evidenced by:
  - backup job `305670a4-6b02-46db-a748-db6cfe9a92df`
  - recovery point `arn:aws:ec2:us-east-2::image/ami-09c373536723d046c`
  - private restore AMI `ami-09c373536723d046c`

## Live Secret Inventory

### Secrets

`HETZNER_API_TOKEN`

- secret: yes
- required: yes, while `standard` provisioning remains on Hetzner
- live location:
  - `/etc/nexus-frontdoor/frontdoor.env`
- rotation owner:
  - Tyler Brandt / Intent Systems operator

`FRONTDOOR_STANDARD_TAILSCALE_AUTH_KEY`

- secret: yes
- required: yes, while `standard` server bootstrap uses Tailscale
- live location:
  - `/etc/nexus-frontdoor/frontdoor.env`
- rotation owner:
  - Tyler Brandt / Intent Systems operator

`FRONTDOOR_VPS_SSH_KEY_PATH`

- secret: indirect reference to a private key file
- required: yes, while frontdoor performs SSH/operator work
- live location:
  - `/etc/nexus-frontdoor/frontdoor.env`
- referenced file:
  - `/home/ubuntu/.ssh/nexus-operator`
- rotation owner:
  - Tyler Brandt / Intent Systems operator

### Non-secret Infra Config

`AWS_FRONTDOOR_REGION`

- secret: no
- required: yes
- live location:
  - `/etc/nexus-frontdoor/frontdoor.env`

`AWS_FRONTDOOR_SUBNET_ID`

- secret: no
- required: yes
- live location:
  - `/etc/nexus-frontdoor/frontdoor.env`

`AWS_FRONTDOOR_SECURITY_GROUP_IDS`

- secret: no
- required: yes
- live location:
  - `/etc/nexus-frontdoor/frontdoor.env`

`AWS_FRONTDOOR_AMI_ID`

- secret: no
- required: yes
- live location:
  - `/etc/nexus-frontdoor/frontdoor.env`

`AWS_FRONTDOOR_SSH_KEY_NAME`

- secret: no
- required: yes
- live location:
  - `/etc/nexus-frontdoor/frontdoor.env`

`FRONTDOOR_BASE_URL`

- secret: no
- required: yes
- live location:
  - `/etc/nexus-frontdoor/frontdoor.env`

`FRONTDOOR_INTERNAL_BASE_URL`

- secret: no
- required: yes
- live location:
  - `/etc/nexus-frontdoor/frontdoor.env`

Result:

- pass for inventory existence
- future improvement still possible if frontdoor eventually centralizes secret storage

## Log Hygiene

Sampled live logs showed:

- request path
- method
- status
- duration
- client IP

Sampled live logs did not show:

- patient data
- request bodies
- prompts
- raw tokens

Hardening change in this pass:

- request logging removes `session_cookie_id`

Result:

- code change applied
- live redeploy completed
- post-restart sampled request logs no longer include `session_cookie_id`

## Open Follow-Through

Remaining before this validation is fully closed:

1. none for the frontdoor-only hardening scope
