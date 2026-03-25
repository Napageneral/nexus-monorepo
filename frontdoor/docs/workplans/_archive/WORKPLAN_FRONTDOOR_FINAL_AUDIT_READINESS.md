---
summary: "Frontdoor-only final audit readiness plan on top of the completed AWS/hardening baseline."
read_when:
  - You are preparing Frontdoor for final audit scrutiny
  - You need the delta between current hardening and audit-grade evidence
title: "Workplan Frontdoor Final Audit Readiness"
---

# Workplan Frontdoor Final Audit Readiness

**Status:** COMPLETED (archived 2026-03-25)

## Purpose

This workplan turns the current frontdoor hardening baseline into a
frontdoor-only final-audit-readiness pass.

It sits on top of the already-completed baseline in:

- [FRONTDOOR_HIPAA_READINESS_HARDENING.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_HIPAA_READINESS_HARDENING.md)
- [FRONTDOOR_HIPAA_READINESS_VALIDATION_2026-03-19.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_HIPAA_READINESS_VALIDATION_2026-03-19.md)

This workplan does not reopen the larger Nex runtime audit.

## Customer Experience First

This workplan must not change the hosted customer model.

Customers should still experience:

1. one Frontdoor
2. one login
3. `standard` and `compliant`
4. compliant-only package guardrails
5. no provider-brand choice in the hosted UX

The purpose of this workplan is not to redesign the product. It is to make the
existing frontdoor posture defensible under final audit scrutiny.

## Current Reality

What is already true:

1. frontdoor is AWS-hosted
2. CloudTrail is enabled and healthy
3. frontdoor EBS is encrypted
4. frontdoor IAM is materially narrowed versus the original broad role
5. SQLite-on-EBS is now backed by AWS Backup coverage and a completed restore
   artifact proof
6. live secret inventory and ownership are documented
7. request logs no longer include `session_cookie_id`
8. frontdoor remains PHI-poor by design
9. one isolated restore drill has now been executed and validated in:
   - [FRONTDOOR_RESTORE_DRILL_VALIDATION_2026-03-25.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_RESTORE_DRILL_VALIDATION_2026-03-25.md)

What still differs from a more idealized posture but is accepted for the
frontdoor scope:

1. secrets are still host-env managed rather than fully centralized in a
   stronger secret system, even though the live inventory is now tighter and
   documented

## Non-Goals

This workplan does not:

1. migrate frontdoor off SQLite
2. migrate frontdoor to RDS
3. force a Secrets Manager or Parameter Store redesign unless audit pressure
   makes it necessary
4. reopen frontdoor UX architecture
5. reopen the larger Nex runtime HIPAA audit

## Execution Order

The order matters.

The highest-value sequence is:

1. restore drill
2. runbooks
3. secret tightening and rotation procedure
4. targeted log audit
5. final IAM review
6. AWS BAA/account evidence capture

This order is intentional:

- restore is what makes SQLite truly defensible
- runbooks turn working controls into repeatable operations
- secret/log/IAM/BAA work then closes the remaining audit-grade evidence gaps

## Phase 1: Restore Drill

**Status:** COMPLETED

### Goal

Prove that frontdoor can actually be recovered from the current backup posture.

### Problem

Original problem:

1. AWS Backup is configured
2. a recovery point was created
3. a restore artifact exists

It did not yet prove:

1. an operator can restore frontdoor state correctly
2. the restored system boots cleanly
3. the restored system behaves correctly with frontdoor DB state

### Implement

1. define the exact restore target shape:
   - rebuilt EC2 host or isolated restore host
2. restore from the current frontdoor backup artifact
3. mount or recover the state needed for:
   - `/var/lib/nexus-frontdoor/frontdoor.db`
4. bring the restored service up with the expected env/config
5. validate:
   - frontdoor process starts
   - auth/session surface works
   - server list/API reads behave as expected

Completed result:

- restore performed into isolated EC2 host:
  - `i-0ed3515112e0d48c4`
- source recovery artifact:
  - `ami-09c373536723d046c`
- restored service reached:
  - `active`
- restored API returned:
  - `200`
- restored SQLite state was confirmed present and queryable
- validation artifact:
  - [FRONTDOOR_RESTORE_DRILL_VALIDATION_2026-03-25.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_RESTORE_DRILL_VALIDATION_2026-03-25.md)

### Exit Criteria

1. there is one documented restore drill with exact commands or steps
2. the restored host reaches a working frontdoor process
3. SQLite restore is proven, not merely assumed

## Phase 2: Frontdoor Operator Runbooks

**Status:** COMPLETED

### Goal

Turn the live operational model into explicit repeatable operator procedures.

### Problem

Current knowledge is split across:

1. specs
2. validation docs
3. live host state
4. chat history

That is not enough for audit-grade operating discipline.

### Implement

Write short frontdoor runbooks for:

1. secret rotation
2. backup restore
3. incident response and log review
4. access review for:
   - AWS account
   - frontdoor EC2 host
   - Tailscale/frontdoor operator identity

Completed result:

- [FRONTDOOR_SECRET_ROTATION_RUNBOOK.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_SECRET_ROTATION_RUNBOOK.md)
- [FRONTDOOR_BACKUP_AND_RESTORE_RUNBOOK.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_BACKUP_AND_RESTORE_RUNBOOK.md)
- [FRONTDOOR_INCIDENT_RESPONSE_AND_LOG_REVIEW_RUNBOOK.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_INCIDENT_RESPONSE_AND_LOG_REVIEW_RUNBOOK.md)
- [FRONTDOOR_ACCESS_REVIEW_RUNBOOK.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_ACCESS_REVIEW_RUNBOOK.md)

### Exit Criteria

1. each runbook exists as an active frontdoor doc
2. each runbook names the operator surface and the expected verification step
3. no runbook depends on oral tradition

## Phase 3: Secret Management Tightening

**Status:** COMPLETED

### Goal

Reduce and normalize the live secret set without introducing unnecessary
architecture churn.

### Problem

Current secret posture is acceptable for now but still weaker than final audit:

1. secrets live in `/etc/nexus-frontdoor/frontdoor.env`
2. rotation is operator-managed
3. final audit will expect sharper control over what exists and how it rotates

### Implement

1. classify the current live env inventory into:
   - required secret
   - required non-secret config
   - removable legacy config
2. remove any no-longer-required secret/config entries
3. write and execute one concrete rotation procedure for the live critical
   secrets:
   - `HETZNER_API_TOKEN`
   - `FRONTDOOR_STANDARD_TAILSCALE_AUTH_KEY`
   - operator SSH key material references if needed
4. record where the canonical live secret inventory lives

Completed result:

- runtime token signing rotated from `v1` to `v2` with overlap-safe multi-key
  validation
- Google OIDC client secret moved from JSON config into host env
- runtime signing secret material moved out of JSON config into host env
- dead billing placeholder secrets removed because live billing provider is
  `none`
- empty instance-profile env residue removed
- validation artifact:
  - [FRONTDOOR_SECRET_TIGHTENING_VALIDATION_2026-03-25.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_SECRET_TIGHTENING_VALIDATION_2026-03-25.md)

### Exit Criteria

1. the live secret set is smaller or at least explicitly minimized
2. rotation procedure is documented and has been exercised at least once where
   practical
3. frontdoor has no ambiguous “maybe required” secret entries

## Phase 4: Exceptional-Path Log Audit

**Status:** COMPLETED

### Goal

Prove that frontdoor logs remain PHI-poor and do not leak sensitive auth or
payload material in edge cases.

### Problem

Current log posture is good on sampled normal paths, but audit-grade confidence
requires checking high-risk paths explicitly.

### Implement

Review and validate logging around:

1. auth failures and auth success paths
2. provisioning success and provisioning failure
3. package install and adapter install
4. runtime token issuance/refresh/revoke
5. product-control-plane relay or rejection paths

For each category:

1. inspect the code paths
2. trigger the behavior where practical
3. sample resulting logs
4. confirm absence of:
   - PHI
   - raw tokens
   - cookies/session identifiers
   - request bodies

Completed result:

- managed OAuth exchange failure no longer throws upstream response payload
  bodies
- OIDC autoprovision failure no longer throws raw `stdout` or `stderr`
- bootstrap provision callback no longer logs callback response bodies
- validation artifact:
  - [FRONTDOOR_LOG_AUDIT_VALIDATION_2026-03-25.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_LOG_AUDIT_VALIDATION_2026-03-25.md)

### Exit Criteria

1. a frontdoor log audit artifact exists
2. all high-risk logging categories are reviewed
3. any unnecessary sensitive fields are removed

## Phase 5: Final IAM Least-Privilege Review

**Status:** COMPLETED

### Goal

Do one last least-privilege pass on the already-narrowed frontdoor EC2 role.

### Problem

The role is much better than before, but final audit should not rely on
“better than before” as the standard.

### Implement

1. review all remaining allowed EC2 actions
2. distinguish:
   - broad reads required by AWS EC2 APIs
   - lifecycle actions that can be further constrained
3. tighten only where it remains safe and testable
4. validate against the exact live provisioning shape

Completed result:

- live role reviewed:
  - `nexus-frontdoor-ec2-role`
- no attached managed policies
- one inline policy remains:
  - `nexus-frontdoor-ec2-provisioning`
- broad access now limited to EC2 describe reads
- managed-instance lifecycle actions remain scoped to:
  - `managed-by=nexus-frontdoor`
- validation artifact:
  - [FRONTDOOR_IAM_REVIEW_VALIDATION_2026-03-25.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_IAM_REVIEW_VALIDATION_2026-03-25.md)

### Exit Criteria

1. there is an explicit statement of what broad permissions remain and why
2. no obviously-reducible privilege is left unreviewed
3. compliant provisioning still works after any further tightening

## Phase 6: AWS BAA And Account Evidence

**Status:** COMPLETED

### Goal

Document the AWS-side compliance evidence posture that supports the frontdoor
claim.

### Problem

Using AWS correctly is necessary but not sufficient. Final audit language
should not assume the account/evidence posture without recording it.

Initial API-only blocker:

- `aws artifact list-customer-agreements`
  - result:
    - `[]`

Resolved by:

- accepted operator-provided AWS BAA evidence retained in the frontdoor repo

### Implement

1. verify the relevant AWS Artifact / agreement posture for the account
2. document the result in a frontdoor validation or governance artifact
3. record any required human/legal follow-through

Current result:

- account evidence captured in:
  - [FRONTDOOR_AWS_ACCOUNT_EVIDENCE_VALIDATION_2026-03-25.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_AWS_ACCOUNT_EVIDENCE_VALIDATION_2026-03-25.md)
- accepted BAA evidence retained in:
  - [AWS_Business_Associate_Addendum_accepted_2026-03-25.pdf](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/artifacts/AWS_Business_Associate_Addendum_accepted_2026-03-25.pdf)

### Exit Criteria

1. the AWS-side evidence posture is explicitly documented
2. frontdoor docs no longer rely on assumption for the BAA/account side

## Final Acceptance Criteria

This workplan is complete only when:

1. restore is demonstrated, not merely configured
2. frontdoor operator runbooks exist and are usable
3. the live secret set and rotation posture are explicit and tightened
4. exceptional-path logs are audited and remain PHI-poor
5. IAM least privilege has received a final review with rationale
6. AWS compliance/account evidence is documented

At that point, the frontdoor can be described as much closer to final
audit-readiness without pretending the larger Nex runtime audit is also done.

## Final Status

**Status:** COMPLETED

This workplan is now complete for the frontdoor scope.
