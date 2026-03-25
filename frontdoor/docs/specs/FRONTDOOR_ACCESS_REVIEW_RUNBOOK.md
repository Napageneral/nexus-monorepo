# Frontdoor Access Review Runbook

## Customer Experience

Access review should not change the public hosted experience unless an access
issue requires immediate containment.

## Scope

This runbook covers frontdoor operator access only:

- AWS account access for frontdoor infrastructure
- frontdoor EC2 host access
- Tailscale service-device posture
- operator SSH access

It does not cover tenant-runtime end-user access reviews.

## Primary Access Surfaces

AWS operator profile:

- CLI profile:
  - `frontdoor-admin`
- account:
  - `953113807086`

Frontdoor host:

- public URL:
  - `https://frontdoor.nexushub.sh`
- EC2 instance:
  - `i-09e80f7b7da307e7c`
- IAM role:
  - `nexus-frontdoor-ec2-role`
- instance profile:
  - `nexus-frontdoor-ec2-profile`

Tailscale:

- service tags:
  - `tag:frontdoor`
  - `tag:nex-standard-server`

SSH:

- operator key:
  - `~/.ssh/nexus-operator`

## Review Cadence

Run access review:

- before any formal audit checkpoint
- after any staffing or operator change
- after any suspected credential exposure
- periodically during normal operations

## AWS Review Procedure

### 1. Verify active operator identity

```bash
AWS_PROFILE=frontdoor-admin aws sts get-caller-identity
```

### 2. Verify frontdoor host identity

```bash
AWS_PROFILE=frontdoor-admin aws ec2 describe-instances \
  --region us-east-2 \
  --instance-ids i-09e80f7b7da307e7c
```

Confirm:

- expected instance profile
- expected security group
- expected subnet

### 3. Verify frontdoor role policy

```bash
AWS_PROFILE=frontdoor-admin aws iam get-role --role-name nexus-frontdoor-ec2-role
AWS_PROFILE=frontdoor-admin aws iam list-role-policies --role-name nexus-frontdoor-ec2-role
```

Confirm:

- no unexpected managed policies
- only expected inline provisioning policy

## Host Access Review Procedure

### 1. Verify SSH still requires the operator key

```bash
ssh -i ~/.ssh/nexus-operator ubuntu@frontdoor.nexushub.sh 'hostname'
```

### 2. Verify frontdoor service ownership surfaces

```bash
ssh -i ~/.ssh/nexus-operator ubuntu@frontdoor.nexushub.sh \
  'sudo ls -l /etc/nexus-frontdoor/frontdoor.env /var/lib/nexus-frontdoor /etc/systemd/system/nexus-frontdoor.service'
```

Confirm:

- root-owned config/state surfaces
- no unexpected writable access for non-root users

## Tailscale Review Procedure

Confirm the frontdoor service device remains a tagged machine:

- `tag:frontdoor`

Confirm standard bootstrap devices use:

- `tag:nex-standard-server`

Confirm operator laptops remain user devices, not tagged service machines.

Review:

- machine inventory
- active tags
- auth key inventory

Revoke:

- stale user-scoped bootstrap keys
- unused tagged keys

## SSH Key Review Procedure

Confirm:

- `~/.ssh/nexus-operator` exists only on authorized operator machines
- the public key remains the expected key pair in AWS
- no unexpected alternate operator key path is configured in:
  - `/etc/nexus-frontdoor/frontdoor.env`

## Verification

Access review is complete only when:

1. AWS operator identity is confirmed
2. frontdoor host identity and role are confirmed
3. Tailscale service tags are correct
4. SSH operator access path is correct
5. stale credentials, keys, or access paths are revoked where applicable

## Ownership

Primary operator:

- Tyler Brandt / Intent Systems
