# Frontdoor AWS Account Evidence Validation 2026-03-25

**Status:** ACTIVE VALIDATION

## Scope

This validation covers the AWS-side account evidence posture relevant to the
frontdoor HIPAA-oriented claim.

It validates:

- AWS Organization ownership context
- AWS Artifact accessibility from the live account
- whether accepted customer agreements are visible in Artifact
- whether accepted BAA evidence is retained in the frontdoor validation corpus

It does not itself create or accept any legal agreement.

## Customer Experience

This pass does not change the hosted customer model.

Its purpose is evidence and signoff, not product behavior.

## Live Account Context

Verified live:

- AWS account:
  - `953113807086`
- Organization:
  - `o-8ldr3tlhmt`
- management account email:
  - `tyler@intent-systems.com`
- Organizations feature set:
  - `ALL`

## Artifact Evidence

Verified live:

- AWS Artifact API is reachable from the current account
- Artifact report catalog is visible
- healthcare-related reports are available

Verified live with:

- `aws artifact list-customer-agreements`

Result:

- `customerAgreements: []`

Interpretation:

- no accepted customer agreements are currently visible through the Artifact
  API for this account context

## Accepted Agreement Evidence

Operator-provided evidence captured in the frontdoor repo:

- [AWS_Business_Associate_Addendum_accepted_2026-03-25.pdf](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/artifacts/AWS_Business_Associate_Addendum_accepted_2026-03-25.pdf)

Document metadata verified locally:

- title:
  - `Microsoft Word - FORM AWS Business Associate Addendum v3 (Online) (last updated 2023-01-20)`
- pages:
  - `4`

Interpretation:

- the Artifact API result alone was insufficient to prove agreement state
- operator-supplied accepted-agreement evidence is now retained alongside the
  frontdoor validation set
- the frontdoor canon now has explicit documentary support for the AWS-side BAA
  posture

## Result

Pass.

This means:

1. the frontdoor technical posture is now paired with retained AWS-side BAA
   evidence
2. the AWS account-evidence leg is closed for the frontdoor canon
