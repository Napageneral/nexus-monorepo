# Frontdoor AWS Operator Access Baseline

**Status:** VALIDATION
**Last Updated:** 2026-03-17
**Related:** `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_AWS_HOSTING_AND_SERVER_CLASS_MODEL.md`, `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_AWS_STANDARD_AND_COMPLIANT_LIVE_PROOF_2026-03-17.md`

---

## Purpose

This document records the active AWS workforce-access and local CLI baseline for
frontdoor AWS hosting work.

This is an operator validation note, not target-state product canon.

---

## Established Baseline

### AWS account

- account name: `nexus`
- account id: `953113807086`

### IAM Identity Center

- home region: `us-east-2`
- start URL: `https://d-9a6756dfa4.awsapps.com/start`
- issuer URL:
  `https://identitycenter.amazonaws.com/ssoins-6684514e6c73dda9`

### Identity Center user access

- user: `brandtty`
- access pattern: group-based assignment
- granted role / permission set: `AdministratorAccess`

### Local AWS CLI profile

Configured local profile:

```ini
[profile frontdoor-admin]
sso_session = frontdoor
sso_account_id = 953113807086
sso_role_name = AdministratorAccess
region = us-east-2
output = json

[sso-session frontdoor]
sso_start_url = https://d-9a6756dfa4.awsapps.com/start
sso_region = us-east-2
sso_registration_scopes = sso:account:access
```

---

## Validation Performed

### CLI profile creation

The local machine successfully completed:

```bash
aws configure sso --profile frontdoor-admin
```

### Identity verification

The configured profile successfully completed:

```bash
aws sts get-caller-identity --profile frontdoor-admin
```

Observed result:

```json
{
  "UserId": "AROA532QCRDXDM6SFPSSA:brandtty",
  "Account": "953113807086",
  "Arn": "arn:aws:sts::953113807086:assumed-role/AWSReservedSSO_AdministratorAccess_d1aa0170b3d0f774/brandtty"
}
```

---

## Operational Notes

1. The CLI profile is durable; it does not need to be recreated after each use.
2. The SSO login token and short-lived AWS role credentials still expire.
3. When the session expires, operators should refresh it with:

```bash
aws sso login --profile frontdoor-admin
```

4. This validation note should be updated if:
   - the Identity Center home region changes
   - the access portal URL changes
   - the operator profile name changes
   - the assigned role / permission set changes
