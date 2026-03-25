# Frontdoor Log Audit Validation 2026-03-25

## Scope

This validation covers exceptional-path log hygiene for the hosted frontdoor.

It validates:

- high-risk auth logging
- provisioning and autoprovision failure logging
- bootstrap callback logging
- live request-log shape after redeploy

It does not claim a full Nex runtime log audit.

## Customer Experience

This pass must not change the hosted customer model.

Customers should still experience:

- one Frontdoor
- Google OIDC production sign-in
- working `standard` and `compliant` provisioning flows
- no provider-brand UX change

## Reviewed High-Risk Categories

Reviewed:

1. managed OAuth exchange failure
2. OIDC autoprovision command failure
3. provision callback retry logging during bootstrap
4. normal request logging after restart

## Findings And Hard Cuts

### Managed OAuth exchange failure

Previous problem:

- the thrown error string could include upstream token-endpoint payload bodies

Current code:

- throws only:
  - `managed_oauth_exchange_failed:<http_status>`

Result:

- upstream OAuth response bodies no longer flow into logs through this path

### OIDC autoprovision command failure

Previous problem:

- failed autoprovision commands could throw raw `stderr` or `stdout`
- command output could contain sensitive payload material

Current code:

- throws only:
  - `autoprovision_command_failed:<exit or signal marker>:<stdout presence>:<stderr presence>`

Result:

- the log path preserves failure shape without dumping raw command output

### Provision callback retry logging

Previous problem:

- bootstrap retry logic wrote callback response bodies to:
  - `/tmp/callback-response.txt`
- retry logging then dumped that file to logs

Current code:

- callback retries log only the HTTP status
- callback response body is discarded with:
  - `curl -o /dev/null`

Result:

- bootstrap no longer logs arbitrary callback response bodies

## Live Validation

Built and redeployed live:

- updated `dist/` synced to:
  - `/opt/nexus/frontdoor/dist/`
- `nexus-frontdoor.service` restarted
- service result:
  - `active`

Verified live:

- `GET /api/plans?server_class=standard`
  - result:
    - `200`
- `GET /api/auth/oidc/start?provider=google&return_to=/`
  - result:
    - `302` to Google

Sampled live journald after redeploy:

- startup logs present
- normal `http_request` logs present
- sampled entries included:
  - request id
  - method
  - path
  - status
  - duration
  - client IP
- sampled entries did not include:
  - request bodies
  - raw OAuth payloads
  - cookies
  - session identifiers
  - callback response bodies

## Result

Pass.

This proves:

1. frontdoor exceptional-path log hygiene is tighter than before
2. the two remaining sensitive log paths were hard-cut
3. the hosted frontdoor remained healthy after redeploy
