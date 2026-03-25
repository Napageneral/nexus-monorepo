# Frontdoor AWS Account Evidence Validation 2026-03-25

## Scope

This validation covers the AWS-side account evidence posture relevant to the
frontdoor HIPAA-oriented claim.

It validates:

- AWS Organization ownership context
- AWS Artifact accessibility from the live account
- whether accepted customer agreements are visible in Artifact

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

## Result

Blocked.

This means:

1. the frontdoor technical posture is strong, but the AWS-side agreement
   evidence is not yet closed
2. a human/operator still needs to verify and, if necessary, accept the
   required AWS legal agreement posture in Artifact before claiming final
   audit-ready HIPAA support for the frontdoor account
