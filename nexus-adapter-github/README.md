# nexus-adapter-github

Nexus adapter for GitHub App connector setup and health validation.

## Scope

This adapter is control-plane focused:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `adapter.setup.start`
- `adapter.setup.submit`
- `adapter.setup.status`
- `adapter.setup.cancel`

It uses `custom_flow` auth and validates that a GitHub App installation token can be minted.

## Build

```bash
go build ./cmd/github-adapter
```

## Run

```bash
go run ./cmd/github-adapter adapter.info
go run ./cmd/github-adapter adapter.accounts.list
go run ./cmd/github-adapter adapter.setup.start
go run ./cmd/github-adapter adapter.setup.submit --session-id s1 --payload-json '{"app_id":"123","installation_id":"456","private_key_pem":"-----BEGIN..."}'
```
