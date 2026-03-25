# Frontdoor Restore Drill

## Customer Experience

This drill must not affect the live hosted frontdoor at:

- `https://frontdoor.nexushub.sh`

Customers should experience:

- no DNS cutover
- no auth disruption
- no runtime routing change
- no change to `standard` / `compliant` behavior

This is an isolated operator drill only.

## Purpose

Prove that the current frontdoor backup posture can restore a working hosted
control plane without touching the live public deployment.

This drill is the practical proof that makes SQLite-on-EBS defensible for the
frontdoor scope.

## Current Restore Artifact

Current verified recovery point:

- backup vault:
  - `nexus-frontdoor-backup-vault`
- backup job:
  - `305670a4-6b02-46db-a748-db6cfe9a92df`
- recovery point:
  - `arn:aws:ec2:us-east-2::image/ami-09c373536723d046c`
- private restore AMI:
  - `ami-09c373536723d046c`
- root snapshot:
  - `snap-08a9df793e08eae4a`

## Chosen Drill Shape

Use the private AMI restore path first.

Do not start with a SQLite-file-only exercise.

Reason:

1. the AMI already captures the real host shape
2. the frontdoor service, env file, deployed bundle, and state are all on the
   restored host image
3. this is the lowest-risk proof of practical recovery
4. it avoids inventing an untested rebuild flow before proving the existing
   recovery artifact works

## Drill Topology

Launch one temporary restore instance in AWS with:

- the backup AMI
- a temporary restore-only security group
- the same subnet
- the same SSH key
- a public IP for operator verification

Do not:

- attach production DNS
- reuse the production frontdoor instance id
- route customer traffic to the restore host

## Verification Target

The drill must prove:

1. the restored host boots
2. `nexus-frontdoor.service` starts
3. the restored host still has the expected state files:
   - `/var/lib/nexus-frontdoor/frontdoor.db`
   - `/var/lib/nexus-frontdoor/frontdoor-sessions.db`
   - `/var/lib/nexus-frontdoor/frontdoor-autoprovision.db`
4. the frontdoor process serves locally
5. the restored frontdoor still has recognizable control-plane state

This drill does not need to prove:

1. Google OIDC login over the production domain
2. customer traffic cutover
3. production DNS failover

## Restore Host Policy

The restore host should be:

- clearly tagged as restore-only
- isolated from production traffic
- temporary

Recommended tags:

- `Name = nexus-frontdoor-restore-drill`
- `managed-by = nexus-frontdoor`
- `service = frontdoor`
- `scope = restore-drill`

## Execution Steps

### Phase 1: Prepare restore host

1. create a temporary restore security group
2. allow:
   - `22` from the operator IP only
   - `4789` from the operator IP only if needed
3. launch one instance from `ami-09c373536723d046c`
4. use:
   - subnet `subnet-0d204df9a705d6f9e`
   - key pair `nexus-operator`
   - instance type `t4g.medium`

### Phase 2: Verify restored host state

1. SSH to the restore host
2. confirm:
   - `/etc/nexus-frontdoor/frontdoor.env`
   - `/var/lib/nexus-frontdoor/*`
   - `/opt/nexus/frontdoor`
3. confirm `nexus-frontdoor.service` is active

### Phase 3: Verify restored frontdoor behavior

1. curl the local service on the restore host
2. confirm the frontdoor serves a response
3. inspect the SQLite DBs enough to prove recognizable state exists
4. verify the host is not accidentally serving public production traffic

### Phase 4: Teardown

1. terminate the restore instance
2. delete the temporary restore security group
3. record findings in validation

## Acceptance Criteria

The drill is successful only when:

1. a temporary restore host is launched from the AWS Backup AMI
2. the restored frontdoor service starts successfully
3. restored state files are present
4. the restored host serves local frontdoor responses
5. the drill is documented in a frontdoor validation artifact
6. the restore infrastructure is torn down afterward

## Non-Goals

This drill does not:

1. replace the production frontdoor
2. create a permanent standby host
3. change DNS
4. introduce backwards compatibility or fallback behavior
