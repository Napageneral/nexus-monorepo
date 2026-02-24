# Frontdoor Multi-UI Launch (Phase 2)

**Status:** PLAN LOCKED  
**Owner:** Frontdoor + Hosted Shell  
**Last Updated:** 2026-02-24

---

## 1. Objective

Implement workspace + app launch flow in frontdoor so users choose a workspace and then an app, with app availability driven by tenant runtime catalog (`GET /api/apps`).

Hard cutover: remove implicit Control-only launch (`/app/chat`) from shell behavior.

---

## 2. Customer Experience First

Desired UX:

1. User signs in once.
2. User selects workspace.
3. User sees available apps for that workspace.
4. User selects app.
5. User launches directly into that app on their tenant runtime.

No debug token controls in customer shell.

---

## 3. Scope

This phase covers:

1. shell UI app picker
2. app catalog fetch per active workspace
3. app-aware launch path
4. workspace/app authorization at launch boundary

This phase does not cover Oracle API/webhook internals.

---

## 4. Decisions (Locked)

1. **Runtime is source of truth for app list**
   - Frontdoor must not hardcode allowed apps.
2. **App catalog fetch uses selected workspace context**
   - frontdoor session + selected workspace -> runtime token -> `/api/apps`.
3. **Launch always uses runtime-provided `entry_path`**
   - shell does not synthesize app URL by convention.
4. **Workspace selection remains explicit**
   - app list/launch is blocked until active workspace is set.

---

## 5. Frontdoor Contract

### 5.1 App catalog fetch

Frontdoor shell fetches app catalog through frontdoor runtime route, scoped by workspace:

- `GET /runtime/api/apps?workspace_id=<workspace_id>`

Frontdoor proxy injects runtime token and tenant headers exactly as existing runtime proxy flow.

### 5.2 Launch behavior

Given selected `workspace_id` and selected app descriptor:

1. set active workspace (`/api/workspaces-select`)
2. navigate to `${frontdoorOrigin}${entry_path}?workspace_id=<workspace_id>`

Example:

- `entry_path=/app/control/chat`
- final launch: `/app/control/chat?workspace_id=tenant-dev`

### 5.3 App descriptor shape used by shell

```json
{
  "app_id": "control",
  "display_name": "Control",
  "entry_path": "/app/control/chat",
  "api_base": "/api/control",
  "icon": "control-panel",
  "order": 10
}
```

---

## 6. Security + IAM Behavior

1. Workspace membership checks remain in frontdoor session/workspace resolver.
2. App catalog endpoint (`/runtime/api/apps`) is authorized by runtime IAM.
3. Runtime remains final authority:
   - app listed != app action allowed
   - runtime still enforces IAM on app APIs and WS methods.

---

## 7. Implementation Plan

1. Add app picker UI state in `nexus-frontdoor-web`.
2. On workspace selection, fetch app catalog from `/runtime/api/apps?workspace_id=...`.
3. Replace hardcoded launch target (`/app/chat`) with selected app `entry_path`.
4. Keep workspace selection API call before launch.
5. Update browser/e2e tests for workspace + app flow.

---

## 8. Validation Matrix

Must pass:

1. unauthenticated shell cannot load workspace/app controls.
2. authenticated user with workspace membership can load app catalog.
3. shell defaults to first app when workspace has app list.
4. launch navigates to selected app entry path (not hardcoded `/app/chat`).
5. workspace switch reloads app catalog for new workspace.
6. app launch includes `workspace_id` query parameter.
7. runtime denies launch/API when workspace token mismatch occurs.

