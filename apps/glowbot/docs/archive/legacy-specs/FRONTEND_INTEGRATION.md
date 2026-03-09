# GlowBot Frontend Integration

Date: 2026-02-26
Status: active
Production cutover checklist: `specs/PRODUCTION_E2E_CUTOVER.md`

This document defines frontend integration for the canonical product flow:

- GlowBot-owned shell on the GlowBot domain (`glowbot-demo` Vercel project)
- Frontdoor as auth/workspace/runtime gateway
- Tenant GlowBot UI mounted at `/app/glowbot/` in nex runtime

See `specs/GLOWBOT_DOMAIN_E2E.md` for the full customer journey and launch rules.

---

## 1) Frontend Surfaces

## 1.1 GlowBot Domain Shell (product-owned)

- Location: GlowBot monorepo
- Responsibility:
  - Landing/offer/sign-up UX
  - Start Google OAuth via frontdoor
  - Resolve workspace state
  - Launch tenant GlowBot UI through frontdoor

## 1.2 Tenant GlowBot UI (runtime-mounted app)

- Mount: `/app/glowbot/`
- Responsibility:
  - Overview, Funnel, Modeling, Agents, Integrations
  - Adapter connection actions
  - Pipeline status/trigger and data display

---

## 2) Auth + Launch Flow

1. User opens GlowBot domain shell.
2. User clicks `Continue with Google`.
3. Shell redirects to frontdoor OIDC start.
4. Frontdoor callback resolves or auto-provisions workspace.
5. Shell loads session + workspaces.
6. Shell launches `/app/glowbot/?workspace_id=<workspace_id>`.

Launch behavior:

1. Single workspace: auto-launch.
2. Multiple workspaces: user picker then launch.
3. Provisioning in progress: poll provisioning status and launch when ready.
4. Missing `glowbot` app in runtime app catalog: show explicit configuration error.

---

## 3) Shell to Frontdoor HTTP Contracts

Shell must use same-origin API routes that proxy to frontdoor.

Required routes:

1. `GET /api/oidc-start` -> frontdoor `/api/auth/oidc/start`
2. `GET /api/session`
3. `GET /api/workspaces`
4. `POST /api/workspaces-select` (or direct `/api/workspaces/select`)
5. `GET /api/workspaces/provisioning/status`
6. `GET /runtime/api/apps?workspace_id=<id>`
7. `GET /api/frontdoor-origin` (if shell constructs launch URL)

---

## 4) Tenant GlowBot RPC/Data Contracts

RPC method names remain:

1. `glowbot.overview`
2. `glowbot.funnel`
3. `glowbot.modeling`
4. `glowbot.agents`
5. `glowbot.agents.recommendations`
6. `glowbot.integrations`
7. `glowbot.integrations.connect.oauth.start`
8. `glowbot.integrations.connect.apikey`
9. `glowbot.integrations.connect.upload`
10. `glowbot.integrations.test`
11. `glowbot.integrations.disconnect`
12. `glowbot.pipeline.status`
13. `glowbot.pipeline.trigger`

Payload contracts are defined by:

1. `src/lib/glowbot/contracts.ts`
2. `src/lib/glowbot/methods.ts`

---

## 5) Runtime App Registration Contract

GlowBot runtime app descriptor:

```json
{
  "app_id": "glowbot",
  "display_name": "GlowBot",
  "entry_path": "/app/glowbot/",
  "api_base": "/api/glowbot"
}
```

Validation requirements:

1. `/api/apps` includes `glowbot`.
2. `/app/glowbot/` is reachable via frontdoor proxy.
3. Shell launches `entry_path` exactly, with `workspace_id` query parameter.

---

## 6) Environment Contract (GlowBot Shell Deployment)

Required:

1. `GLOWBOT_FRONTDOOR_ORIGIN`
2. `GLOWBOT_APP_COOKIE_NAME`
3. `GLOWBOT_FRONTDOOR_COOKIE_NAME`
4. Frontdoor-side session cookie domain config (`FRONTDOOR_SESSION_COOKIE_DOMAIN` or `session.cookieDomain`) for cross-subdomain shell/session access.

Optional:

1. `GLOWBOT_RUNTIME_TOKEN_MINT_URL`
2. `GLOWBOT_RUNTIME_TOKEN_REFRESH_URL`
3. `GLOWBOT_FRONTDOOR_CLIENT_ID`
4. `GLOWBOT_FRONTDOOR_WORKSPACE_ID`

---

## 7) Hard Cutover Rules

1. Product signup/launch shell lives in GlowBot repo only.
2. `nexus-frontdoor-web` is generic and should not be required for GlowBot customer UX.
3. No dual-shell compatibility mode.
4. No fallback to non-GlowBot app launch path for customer flow.
