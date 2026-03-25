# Frontdoor Backup And Restore Runbook

## Customer Experience

Backup and restore work must preserve the hosted customer model:

- one Frontdoor
- one login
- no unexpected DNS cutover
- no silent fallback behavior

Restore validation should default to isolated drill hosts, not live cutover.

## Scope

This runbook covers the hosted frontdoor control plane only.

Live frontdoor state:

- `/var/lib/nexus-frontdoor/frontdoor.db`
- `/var/lib/nexus-frontdoor/frontdoor-sessions.db`
- `/var/lib/nexus-frontdoor/frontdoor-autoprovision.db`

Live service/config:

- `/etc/nexus-frontdoor/frontdoor.env`
- `nexus-frontdoor.service`

## Current Backup Surfaces

AWS Backup:

- vault:
  - `nexus-frontdoor-backup-vault`
- plan:
  - `nexus-frontdoor-daily`
- selection:
  - `nexus-frontdoor-host`

Reference proof:

- [FRONTDOOR_RESTORE_DRILL.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_RESTORE_DRILL.md)
- [FRONTDOOR_RESTORE_DRILL_VALIDATION_2026-03-25.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_RESTORE_DRILL_VALIDATION_2026-03-25.md)

## Backup Verification

Check AWS Backup coverage:

```bash
AWS_PROFILE=frontdoor-admin aws backup list-backup-plans --region us-east-2
AWS_PROFILE=frontdoor-admin aws backup list-backup-vaults --region us-east-2
AWS_PROFILE=frontdoor-admin aws backup list-protected-resources --region us-east-2
```

Check recent jobs:

```bash
AWS_PROFILE=frontdoor-admin aws backup list-backup-jobs --region us-east-2
```

Expected:

- frontdoor host selected into the plan
- latest backup jobs show successful completion

## Isolated Restore Drill Procedure

Use the current backup AMI and launch an isolated host.

### 1. Identify the recovery artifact

```bash
AWS_PROFILE=frontdoor-admin aws backup list-recovery-points-by-backup-vault \
  --region us-east-2 \
  --backup-vault-name nexus-frontdoor-backup-vault
```

### 2. Launch isolated restore host

Requirements:

- same subnet
- temporary restore-only security group
- operator-only ingress on `22` and `4789`
- no production DNS

Reference implementation:

- [FRONTDOOR_RESTORE_DRILL_VALIDATION_2026-03-25.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_RESTORE_DRILL_VALIDATION_2026-03-25.md)

### 3. Verify recovered host

Minimum checks:

```bash
ssh -i ~/.ssh/nexus-operator ubuntu@RESTORE_HOST \
  'systemctl is-active nexus-frontdoor.service && sudo ls -lah /var/lib/nexus-frontdoor'
```

```bash
ssh -i ~/.ssh/nexus-operator ubuntu@RESTORE_HOST \
  'curl -fsS http://127.0.0.1:4789/api/plans?server_class=standard'
```

### 4. Verify recovered SQLite state

```bash
ssh -i ~/.ssh/nexus-operator ubuntu@RESTORE_HOST "python3 - <<'PY'
import sqlite3
conn = sqlite3.connect('/var/lib/nexus-frontdoor/frontdoor.db')
cur = conn.cursor()
for q in [
    \"select count(*) from frontdoor_accounts\",
    \"select count(*) from frontdoor_servers\",
]:
    cur.execute(q)
    print(cur.fetchone()[0])
PY"
```

### 5. Tear down restore host

Terminate the temporary instance and delete the temporary restore security
group immediately after validation.

## Live Restore Guidance

If a real frontdoor recovery is required:

1. prefer restoring into an isolated host first
2. verify service, state, and API health
3. only then decide whether to:
   - replace the production instance
   - re-point DNS
   - or restore state onto a newly prepared host

Do not improvise a live DNS cutover before validating the recovered host.

## Verification

Backup/restore is healthy only when:

1. AWS Backup coverage exists
2. at least one recent successful backup job exists
3. one isolated restore drill has been completed and documented
4. a recovered host can serve frontdoor API responses from restored state

## Ownership

Primary operator:

- Tyler Brandt / Intent Systems
