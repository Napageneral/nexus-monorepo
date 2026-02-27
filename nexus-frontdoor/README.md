# Nexus Frontdoor (Scaffold)

Frontdoor service for hosted Nexus with one runtime per tenant.

Implements:

- password login now, pluggable OIDC flow
- tenant resolution from authenticated principal
- short-lived runtime token minting (HS256 JWT)
- refresh/revoke lifecycle for runtime tokens
- runtime endpoint descriptor bootstrap in token responses for direct browser -> runtime
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

## Local Hosted Demo Stack (tmux)

Runs a full local stack for today’s hosted flow:

- isolated hosted-mode Nexus runtime (trusted-token auth)
- frontdoor service
- Cloudflare quick tunnel for runtime
- Cloudflare quick tunnel for frontdoor

Start:

```bash
cd /Users/tyler/nexus/home/projects/nexus/nexus-frontdoor
pnpm demo-stack:start
```

Status:

```bash
pnpm demo-stack:status
```

Stop:

```bash
pnpm demo-stack:stop
```

The stack writes URLs to:

- `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/.demo-stack/stack.env`

Default frontdoor login for demo stack:

- `owner / changeme`

### Real Customer Flow Mode (Google OAuth + Auto-Provision)

The stack can run in customer mode where first Google login creates a tenant
and seeds that tenant's identity ledger (`entities`, `contacts`, `entity_tags`).

Required env before `pnpm demo-stack:start`:

- `FRONTDOOR_PUBLIC_ORIGIN` (stable HTTPS origin for the frontdoor, must match Google OAuth redirect settings)
- `FRONTDOOR_GOOGLE_CLIENT_ID`
- `FRONTDOOR_GOOGLE_CLIENT_SECRET` (optional for PKCE-only clients, recommended for web clients)

Optional:

- `FRONTDOOR_AUTOPROVISION_ENABLED=true` (defaults to true when `FRONTDOOR_PUBLIC_ORIGIN` + client id are set)

Notes:

- Google OAuth does not support random redirect origins for production flows. Quick tunnel URLs rotate, so use a stable public origin for reliable login/signup.
- Tenant runtimes are provisioned with hosted trusted-token auth and control UI assets. The provisioning script will build control UI assets if missing.

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
- `FRONTDOOR_AUTOPROVISION_ENABLED=true`
- `FRONTDOOR_TENANT_CONTROL_UI_ROOT=/abs/path/to/nex/dist/control-ui`
- `FRONTDOOR_TENANT_BUILD_UI_IF_MISSING=1`

## Provisioner Smoke Check

Validate the configured auto-provision command output schema before deploy:

```bash
cd /Users/tyler/nexus/home/projects/nexus/nexus-frontdoor
pnpm smoke:provisioner
```

Notes:

- The smoke runner executes `autoProvision.command` (or `FRONTDOOR_AUTOPROVISION_COMMAND` override).
- It sets `FRONTDOOR_PROVISIONER_DRY_RUN=1` so provisioners can validate payload/output without creating real runtimes.
- Required output fields are validated strictly: `tenant_id`, `runtime_url`, and `runtime_public_base_url` (+ optional ws/sse URL validation).

Validate launch contract for a running frontdoor instance:

```bash
cd /Users/tyler/nexus/home/projects/nexus/nexus-frontdoor
pnpm smoke:launch
```

Optional envs for launch smoke:

- `FRONTDOOR_SMOKE_ORIGIN` (default `http://127.0.0.1:4789`)
- `FRONTDOOR_SMOKE_USERNAME` / `FRONTDOOR_SMOKE_PASSWORD` (default `owner/changeme`)
- `FRONTDOOR_SMOKE_WORKSPACE_ID` (default `tenant-dev`)
- `FRONTDOOR_SMOKE_SESSION_ID` or `FRONTDOOR_SMOKE_SESSION_COOKIE` (skip password login and use an existing frontdoor session)

Combined deploy smoke:

```bash
pnpm smoke:deploy
```

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
- `POST /api/runtime/token` (returns access/refresh + runtime descriptor)
- `POST /api/runtime/token/refresh` (same response schema with rotated refresh token)
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
- Run frontdoor behind TLS termination in production (`https` externally, internal hop as needed). This is required for secure session cookies and HSTS behavior.
- Session cookie hardening is configurable via `security.sessionCookieSecure` or `FRONTDOOR_SESSION_COOKIE_SECURE`.
- Session cookie domain for cross-subdomain shells is configurable via `session.cookieDomain` or `FRONTDOOR_SESSION_COOKIE_DOMAIN`.
- HSTS is configurable via `security.hsts.*` or:
  - `FRONTDOOR_SECURITY_HSTS_ENABLED`
  - `FRONTDOOR_SECURITY_HSTS_MAX_AGE_SECONDS`
  - `FRONTDOOR_SECURITY_HSTS_INCLUDE_SUBDOMAINS`
  - `FRONTDOOR_SECURITY_HSTS_PRELOAD`
