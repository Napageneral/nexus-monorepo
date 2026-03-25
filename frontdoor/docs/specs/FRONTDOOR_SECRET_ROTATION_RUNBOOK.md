# Frontdoor Secret Rotation Runbook

## Customer Experience

Secret rotation must not change the hosted product model.

Customers should still experience:

- one Frontdoor
- one login
- no DNS change
- no change to `standard` / `compliant` semantics

Planned rotation should happen during a controlled operator window.

## Scope

This runbook covers the live hosted frontdoor secrets/config model at:

- host env file:
  - `/etc/nexus-frontdoor/frontdoor.env`
- service:
  - `nexus-frontdoor.service`

It is frontdoor-only. It does not cover runtime tenant secrets.

## Current Live Secret Set

Required secrets:

- `HETZNER_API_TOKEN`
- `FRONTDOOR_STANDARD_TAILSCALE_AUTH_KEY`
- SSH private key referenced by:
  - `FRONTDOOR_VPS_SSH_KEY_PATH`

Required non-secret config:

- `FRONTDOOR_BASE_URL`
- `FRONTDOOR_INTERNAL_BASE_URL`
- `AWS_FRONTDOOR_REGION`
- `AWS_FRONTDOOR_SUBNET_ID`
- `AWS_FRONTDOOR_SECURITY_GROUP_IDS`
- `AWS_FRONTDOOR_AMI_ID`
- `AWS_FRONTDOOR_SSH_KEY_NAME`
- `FRONTDOOR_TAILSCALE_BASE_URL`

## Triggers

Run this when:

- a secret is suspected exposed
- a vendor token is intentionally rotated
- a Tailscale bootstrap key is rotated
- operator SSH key material changes
- periodic security rotation policy requires it

## Preconditions

1. operator access to the frontdoor host via SSH
2. replacement secret value already created and verified at the upstream system
3. current frontdoor backup posture healthy
4. current config inventory reviewed so no unrelated env changes are mixed in

## Procedure

### 1. Snapshot the current live env inventory

From an operator machine:

```bash
ssh -i ~/.ssh/nexus-operator ubuntu@frontdoor.nexushub.sh \
  'sudo cp /etc/nexus-frontdoor/frontdoor.env /etc/nexus-frontdoor/frontdoor.env.bak-$(date +%Y%m%d-%H%M%S)'
```

### 2. Edit only the target secret

SSH to the host and update only the intended secret entry in:

- `/etc/nexus-frontdoor/frontdoor.env`

Do not mix:

- unrelated config edits
- package deploys
- IAM changes
- DNS changes

### 3. Validate file ownership and permissions

Expected:

- root-owned env file
- no repo copy
- no world-readable secret material

Check:

```bash
ssh -i ~/.ssh/nexus-operator ubuntu@frontdoor.nexushub.sh \
  'sudo ls -l /etc/nexus-frontdoor/frontdoor.env'
```

### 4. Restart frontdoor

```bash
ssh -i ~/.ssh/nexus-operator ubuntu@frontdoor.nexushub.sh \
  'sudo systemctl restart nexus-frontdoor.service && sudo systemctl is-active nexus-frontdoor.service'
```

Expected:

- `active`

### 5. Validate public control-plane health

From the operator machine:

```bash
curl -fsS https://frontdoor.nexushub.sh/api/plans?server_class=standard >/dev/null
curl -fsS https://frontdoor.nexushub.sh/api/plans?server_class=compliant >/dev/null
```

### 6. Validate the rotated secret path specifically

If rotating `HETZNER_API_TOKEN`:

- run one non-destructive Hetzner-backed control-plane operation if possible
- minimum acceptable next proof:
  - create one throwaway `standard` server later in the same maintenance window

If rotating `FRONTDOOR_STANDARD_TAILSCALE_AUTH_KEY`:

- create one throwaway `standard` server
- verify it joins the tailnet as:
  - `tag:nex-standard-server`

If rotating the operator SSH key:

- verify SSH from frontdoor to one managed server still works

## Rollback

If frontdoor fails to restart or the rotated path breaks:

1. restore the most recent backup env file
2. restart `nexus-frontdoor.service`
3. verify public control-plane health again

Example:

```bash
ssh -i ~/.ssh/nexus-operator ubuntu@frontdoor.nexushub.sh \
  'sudo cp /etc/nexus-frontdoor/frontdoor.env.bak-YYYYMMDD-HHMMSS /etc/nexus-frontdoor/frontdoor.env && sudo systemctl restart nexus-frontdoor.service'
```

## Verification

Rotation is complete only when:

1. frontdoor service is `active`
2. public `/api/plans` responses still return `200`
3. the rotated integration path is explicitly re-validated
4. the old secret is revoked upstream where applicable

## Rotation Ownership

Primary operator:

- Tyler Brandt / Intent Systems

## Audit Notes

For audit evidence, record:

- what secret rotated
- when it rotated
- who rotated it
- what validation was performed
- whether the old secret/token was revoked
