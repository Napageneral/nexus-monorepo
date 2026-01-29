# Credential Broker - Seed Notes

This seed note tracks how we want to expose credentials to the gateway without
storing secrets in config.

## Key Points
- Config stays behavioral; secrets live in credentials.
- Gateway should access only approved secrets.
- Non-interactive access via Keychain ACL or 1Password service accounts.
- Broker injects secrets and restarts providers as needed.

## Spec
- See `docs/CREDENTIAL_BROKER_SPEC.md`.

