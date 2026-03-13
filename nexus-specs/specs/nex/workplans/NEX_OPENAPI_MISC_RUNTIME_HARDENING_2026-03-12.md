# Nex OpenAPI Misc Runtime Hardening

## Customer Experience

The published Nex contract should cover the small but important runtime/operator methods
without generic request or payload schemas where live behavior is already stable.

This pass targets:
- `runtime.health`
- `auth.login`
- `records.*`
- `events.publish`
- `events.unsubscribe`
- `skills.*`
- `models.get`
- `talk.mode`
- `wizard.cancel`
- `productControlPlane.call`

## Hard-Cut Rule

Local OpenAPI schemas are acceptable when protocol exports do not exist, but they must
match live handler outputs or the real alias route behavior.
