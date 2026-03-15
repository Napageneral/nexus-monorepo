# `nex-sdk-go`

Generated Go SDK for the canonical Nex runtime API.

Source OpenAPI:

- `api/nex/openapi.yaml`

Generate and validate it from the owning Nex repo:

```bash
pnpm sdk:build:nex:go
```

Example:

```go
client := nexsdk.NewClient(
  "http://127.0.0.1:18789",
  nexsdk.WithRuntimeServiceToken(os.Getenv("NEX_RUNTIME_SERVICE_TOKEN")),
)
```
