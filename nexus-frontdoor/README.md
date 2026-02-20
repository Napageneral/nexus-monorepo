# Nexus Frontdoor (Scaffold)

Frontdoor service for hosted Nexus with one runtime per tenant.

Implements:

- password login now, pluggable OIDC flow
- tenant resolution from authenticated principal
- short-lived runtime token minting (HS256 JWT)
- refresh/revoke lifecycle for runtime tokens
- reverse proxy for tenant runtime HTTP + WS + SSE under `/runtime/*`
- control UI passthrough under `/app` and WS upgrades for hosted control UI
- shared UI shell served from frontdoor (`/`)

## Quick Start

```bash
cd /Users/tyler/nexus/home/projects/nexus/nexus-frontdoor
pnpm install
pnpm dev
```

Defaults:

- frontdoor: `http://127.0.0.1:4789`
- tenant runtime in sample config: `http://127.0.0.1:18789`
- sample login: `owner / changeme`

## Config

Config file:

- `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/config/frontdoor.config.json`

Override path:

```bash
FRONTDOOR_CONFIG_PATH=/abs/path/frontdoor.config.json pnpm dev
```

Important env overrides:

- `FRONTDOOR_RUNTIME_TOKEN_SECRET`
- `FRONTDOOR_RUNTIME_TOKEN_ACTIVE_KID`
- `FRONTDOOR_RUNTIME_TOKEN_SECRETS_JSON`
- `FRONTDOOR_RUNTIME_TOKEN_ISSUER`
- `FRONTDOOR_RUNTIME_TOKEN_AUDIENCE`
- `FRONTDOOR_OIDC_ENABLED=true`

## Password Hash Utility

```bash
pnpm password:hash -- 'my-password'
```

## API Surface

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/auth/oidc/start?provider=<id>&return_to=/`
- `GET /api/auth/oidc/callback/<provider>?code=...&state=...`
- `POST /api/runtime/token`
- `POST /api/runtime/token/refresh`
- `POST /api/runtime/token/revoke`
- `ALL /runtime/*` (proxied to tenant runtime with minted bearer token)
- `ALL /app/*` (proxied to runtime control UI path)

## Runtime Compatibility

This scaffold targets Nexus runtime hosted mode with:

- `runtime.hostedMode=true`
- `runtime.tenantId=<tenant>`
- `runtime.auth.mode=trusted_token`
- matching trusted token secret/issuer/audience

## Security Notes

- Keep frontdoor and runtime on private/internal network boundaries.
- Rotate runtime signing keys with `runtimeToken.activeKid` + `runtimeToken.keys`.
- OIDC callback verifies ID token signature + claims (`iss`/`aud`/`exp`/`nonce`) against provider JWKs (`issuer` + `jwksUrl` required per provider).
