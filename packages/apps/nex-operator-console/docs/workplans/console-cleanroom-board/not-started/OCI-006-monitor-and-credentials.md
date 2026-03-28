# OCI-006 Monitor and Credentials Domain Tests

## Goal

Prove that the operation monitoring and ingress credential (API key) management
paths work against a real runtime.

## Scope

Tests for:

**Monitor:**
- `monitor.operations.list` — returns operation history (should include our own
  test calls from previous domains)
- `monitor.operations.stats` — returns aggregated stats
- Validate that operations from earlier test domains appear in the history
- Validate stats show non-zero totals matching our test call count

**Ingress Credentials:**
- `auth.tokens.list` — returns tokens array
- `auth.tokens.create` — creates a new ingress credential
- `auth.tokens.list` (post-create) — includes the new token
- `auth.tokens.rotate` — rotates the token
- `auth.tokens.revoke` — revokes the token
- `auth.tokens.list` (post-revoke) — excludes the revoked token

**ACL:**
- `acl.requests.list` — returns pending requests (may be empty)

## Dependencies

- OCI-001 (harness and boot)
- OCI-002 through OCI-005 should run first so monitor history has data

## Acceptance

1. Monitor operations list returns entries from earlier test domains
2. Monitor stats show non-zero operation counts
3. Credential CRUD lifecycle completes without errors
4. ACL endpoint returns valid shape

## Validation

- Monitor history contains at least some of our own RPC calls
- Stats totalOperations > 0
- Credential create returns a token value
- Credential list after revoke excludes the revoked token
