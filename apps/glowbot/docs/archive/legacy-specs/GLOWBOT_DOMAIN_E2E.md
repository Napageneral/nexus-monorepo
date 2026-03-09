# GlowBot Domain E2E Experience (Canonical)

Date: 2026-02-26
Status: canonical target state
Production execution/cutover checklist: `specs/PRODUCTION_E2E_CUTOVER.md`

## 1) Customer Experience (North Star)

1. User lands on the GlowBot domain shell hosted on the `glowbot-demo` Vercel project.
2. User clicks `Continue with Google`.
3. Frontdoor handles OIDC, resolves existing user/workspace or auto-provisions a new GlowBot workspace.
4. User is routed back to GlowBot shell and then launched directly into tenant GlowBot UI through Frontdoor at `/app/glowbot/`.
5. Inside tenant GlowBot UI, user connects adapters and starts using Overview/Funnel/Modeling/Agents/Integrations.

Hard rule: onboarding/shell ownership is in the GlowBot monorepo. `nexus-frontdoor-web` remains generic infrastructure tooling.

---

## 2) System Boundaries

## 2.1 GlowBot Domain Shell (product-owned)

- Repo: `home/projects/glowbot`
- Host: `glowbot-demo` Vercel project
- Responsibility:
  - Marketing/offer + signup UX
  - OIDC start into Frontdoor
  - Session/workspace resolution UX
  - Direct launch to tenant GlowBot app via Frontdoor

## 2.2 Frontdoor (platform-owned)

- Repo: `home/projects/nexus/nexus-frontdoor`
- Responsibility:
  - OIDC callback/session management
  - Workspace membership + selection
  - Auto-provision orchestration
  - Runtime token issuance
  - `/app/*`, `/runtime/*`, `/auth/*` proxy into tenant runtime

## 2.3 Tenant Runtime + GlowBot App (tenant-owned execution)

- Runtime: nex tenant instance
- App mount: `/app/glowbot/`
- Responsibility:
  - GlowBot dashboard UI
  - Adapter connection operations
  - Data ingestion + pipeline compute

---

## 3) End-to-End Flows

## 3.1 First-Time Signup (no existing workspace)

1. Shell starts OIDC:
   - `GET /api/auth/oidc/start?provider=google&return_to=<shell-return-path>`
2. Frontdoor callback resolves principal and triggers auto-provision.
3. Shell checks:
   - `GET /api/session`
   - `GET /api/workspaces`
   - `GET /api/workspaces/provisioning/status` (poll while provisioning)
4. When workspace appears, shell sets active workspace:
   - `POST /api/workspaces/select` (frontdoor server route)
5. Shell launches:
   - `/app/glowbot/?workspace_id=<workspace_id>`

## 3.2 Returning User (existing workspace)

1. OIDC roundtrip completes.
2. Shell loads workspace list.
3. If one workspace, auto-launch `/app/glowbot/?workspace_id=...`.
4. If many workspaces, show picker and launch selected workspace.

## 3.3 Multi-Workspace User

1. Shell lists all workspace memberships.
2. Shell defaults to:
   - `active_workspace_id` from session if present, else default membership, else first workspace.
3. Launch button always routes to `/app/glowbot/?workspace_id=<selected>`.

---

## 4) Launch Resolution Rules (must implement exactly)

1. No auth session:
   - Show marketing/signup state and Google CTA.
2. Auth session + zero workspaces + provisioning in progress:
   - Show provisioning progress state (poll status endpoint).
3. Auth session + zero workspaces + provisioning disabled/failed:
   - Show actionable error with support path.
4. Auth session + one workspace:
   - Auto-select workspace and launch GlowBot app.
5. Auth session + multiple workspaces:
   - Show workspace selector, then launch.
6. Selected workspace without `glowbot` in `/runtime/api/apps`:
   - Show workspace-level configuration error (`glowbot_app_not_registered`), do not launch fallback app.

---

## 5) Technical Contracts Used by Shell

All calls are same-origin shell API routes that proxy to Frontdoor.

Required endpoints:

1. `GET /api/oidc-start` (shell helper to frontdoor `/api/auth/oidc/start`)
2. `GET /api/session`
3. `GET /api/workspaces`
4. `POST /api/workspaces-select` (or direct frontdoor `/api/workspaces/select`)
5. `GET /api/workspaces/provisioning/status`
6. `GET /runtime/api/apps?workspace_id=...`
7. `GET /api/frontdoor-origin` (or fixed env origin) for launch URL construction

Required environment variables in GlowBot shell deployment:

1. `GLOWBOT_FRONTDOOR_ORIGIN`
2. `GLOWBOT_APP_COOKIE_NAME`
3. `GLOWBOT_FRONTDOOR_COOKIE_NAME`
4. Frontdoor deployment must set `FRONTDOOR_SESSION_COOKIE_DOMAIN` (or `session.cookieDomain`) so OIDC session cookies are valid on both frontdoor and GlowBot shell subdomains.

---

## 6) Current Gap List vs Target

1. Shell currently lives in `nexus-frontdoor-web` instead of GlowBot repo.
2. Current shell relies on manual app picker flow, not direct GlowBot-first launch flow.
3. Provisioning status polling UX is not implemented in GlowBot repo.
4. Post-OAuth return path behavior is not yet standardized to GlowBot shell callback route.
5. E2E signup-to-tenant-GlowBot tests are not yet codified in GlowBot repo.
6. Live adapter backfill/continuous ingest is not complete; connect success does not imply data landed.

---

## 7) Acceptance Criteria for Cutover

1. Visiting GlowBot domain provides complete signup/login shell with Google OAuth.
2. First-time user gets a workspace provisioned and is launched into `/app/glowbot/` without operator tooling screens.
3. Returning user lands in existing workspace GlowBot UI.
4. Multi-workspace user can select workspace and launch GlowBot app.
5. `nexus-frontdoor-web` can remain generic and contain no GlowBot-specific product UX dependencies.
6. Full E2E test exists: `signup -> provision/resolve -> launch -> integrations visible`.

---

## 8) Non-Goals

1. Replacing Frontdoor auth/proxy responsibilities.
2. Building onboarding in `nexus-frontdoor-web` as product UX.
3. Supporting backward-compat hybrid shell behavior long-term.
