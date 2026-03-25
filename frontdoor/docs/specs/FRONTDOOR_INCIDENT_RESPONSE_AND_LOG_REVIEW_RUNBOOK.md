# Frontdoor Incident Response And Log Review Runbook

## Customer Experience

Incident handling should preserve the public product contract as much as
possible:

- one Frontdoor
- one login
- no silent fallback paths
- fail loudly and clearly when a control-plane incident exists

## Scope

This runbook covers:

- hosted frontdoor service incidents
- auth incidents
- provisioning incidents
- suspicious control-plane behavior
- frontdoor log review

It does not cover patient-runtime or tenant-runtime forensics beyond the
frontdoor surface.

## Primary Log Surfaces

Frontdoor service logs:

```bash
ssh -i ~/.ssh/nexus-operator ubuntu@frontdoor.nexushub.sh \
  'sudo journalctl -u nexus-frontdoor.service --since \"2 hours ago\" --no-pager'
```

Live service state:

```bash
ssh -i ~/.ssh/nexus-operator ubuntu@frontdoor.nexushub.sh \
  'sudo systemctl status nexus-frontdoor.service --no-pager'
```

CloudTrail:

```bash
AWS_PROFILE=frontdoor-admin aws cloudtrail lookup-events \
  --region us-east-2 \
  --max-results 50
```

## Immediate Incident Flow

### 1. Classify the incident

Use one of:

- frontdoor unavailable
- auth failure
- provisioning failure
- suspicious access or mutation
- logging hygiene concern

### 2. Check live health first

```bash
curl -I https://frontdoor.nexushub.sh/
curl -fsS https://frontdoor.nexushub.sh/api/plans?server_class=standard >/dev/null
```

### 3. Check service state

```bash
ssh -i ~/.ssh/nexus-operator ubuntu@frontdoor.nexushub.sh \
  'sudo systemctl is-active nexus-frontdoor.service'
```

### 4. Pull the relevant journal window

```bash
ssh -i ~/.ssh/nexus-operator ubuntu@frontdoor.nexushub.sh \
  'sudo journalctl -u nexus-frontdoor.service --since \"30 minutes ago\" --no-pager'
```

### 5. Decide containment

Containment may mean:

- stop making config changes
- stop provisioning new servers
- rotate a secret
- investigate AWS API activity in CloudTrail

Do not invent a second frontdoor or fallback path.

## Log Review Rules

When reviewing frontdoor logs, explicitly confirm logs do not contain:

- PHI
- request bodies
- raw auth tokens
- cookies or session identifiers
- raw Tailscale auth keys
- raw Hetzner API tokens

Acceptable log content:

- request path
- method
- status
- duration
- service-level errors
- non-sensitive AWS/Hetzner/Tailscale state transitions

## High-Risk Review Categories

Always review logs around:

1. OIDC login success/failure
2. provisioning success/failure
3. `standard` server bootstrap
4. `compliant` server bootstrap
5. app install / adapter install failure
6. runtime token issuance / refresh / revoke

## Escalation

Escalate immediately if logs show:

- PHI-bearing payloads
- raw secret material
- suspicious AWS mutation not attributable to frontdoor
- unexpected operator account activity

At that point:

1. preserve the relevant log window
2. capture CloudTrail events
3. rotate the affected secret if applicable
4. open a frontdoor validation artifact or incident note

## Verification

Incident handling is complete only when:

1. the root cause is identified or bounded
2. service health is restored or intentionally held offline
3. any leaked credential is rotated
4. a minimal audit trail of the event and response exists

## Ownership

Primary operator:

- Tyler Brandt / Intent Systems
