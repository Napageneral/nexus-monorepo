# Frontdoor Secret Tightening Validation 2026-03-25

## Scope

This validation covers the hosted frontdoor secret/config posture only.

It validates:

- live secret placement tightening
- one real runtime token rotation exercise
- removal of dead config residue

It does not claim final frontdoor secret-management perfection.

## Customer Experience

This pass must not change the hosted product surface.

Customers should still experience:

- one Frontdoor
- Google OIDC production login
- working `standard` and `compliant` APIs
- no DNS change

## Live Changes Applied

### Runtime token signing

Changed live:

- active kid:
  - from `v1`
  - to `v2`

Current live env now carries:

- `FRONTDOOR_RUNTIME_TOKEN_ACTIVE_KID=v2`
- `FRONTDOOR_RUNTIME_TOKEN_SECRETS_JSON`

Current live overlap model:

- old key retained under `v1`
- new key active under `v2`

Result:

- real secret rotation exercised without breaking service continuity

### OIDC secret placement

Changed live:

- Google OIDC client secret moved out of:
  - `/etc/nexus-frontdoor/frontdoor.config.json`
- Google OIDC client secret now lives in:
  - `/etc/nexus-frontdoor/frontdoor.env`
  - `FRONTDOOR_OIDC_GOOGLE_CLIENT_SECRET`

Result:

- OIDC client secret no longer lives in the JSON config file

### Runtime secret placement

Changed live:

- runtime token `secret` removed from:
  - `/etc/nexus-frontdoor/frontdoor.config.json`
- runtime token `keys` removed from:
  - `/etc/nexus-frontdoor/frontdoor.config.json`

Result:

- runtime signing material no longer lives in the JSON config file

### Dead billing residue

Because live billing provider is:

- `none`

Removed from JSON config:

- `billing.webhookSecret`
- `billing.stripeSecretKey`

Result:

- no fake billing secret placeholders remain in the live config file

### Empty env residue

Removed from live env file:

- `AWS_FRONTDOOR_INSTANCE_PROFILE_ARN`
- `AWS_FRONTDOOR_INSTANCE_PROFILE_NAME`

Result:

- live env no longer carries empty instance-profile placeholders

## Backups Created Before Mutation

Created live:

- env backup:
  - `/etc/nexus-frontdoor/frontdoor.env.bak-20260325-214559`
- config backup:
  - `/etc/nexus-frontdoor/frontdoor.config.json.bak-20260325-214559`

## Validation

Verified live:

- public API:
  - `GET /api/plans?server_class=compliant`
  - result:
    - `200`
- OIDC start:
  - `GET /api/auth/oidc/start?provider=google&return_to=/`
  - result:
    - `302` to Google
- service:
  - `nexus-frontdoor.service`
  - result:
    - `active`

Verified live config posture:

- env has runtime keys JSON:
  - `true`
- env active kid:
  - `v2`
- env has Google OIDC client secret:
  - `true`
- env still has empty instance profile fields:
  - `false`
- config still has runtime token secret:
  - `false`
- config still has runtime token keys:
  - `0`
- config still has Google client secret:
  - `false`
- config still has billing webhook secret:
  - `false`
- config still has billing stripe secret:
  - `false`

## Result

Pass.

This proves:

1. frontdoor secrets/config are tighter than before
2. one real rotation exercise has been performed
3. the hosted service remained healthy after the tightening pass
