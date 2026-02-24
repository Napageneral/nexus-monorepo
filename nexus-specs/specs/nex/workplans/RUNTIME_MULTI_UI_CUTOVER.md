# Runtime Multi-UI Cutover (Phase 1)

**Status:** PLAN LOCKED  
**Owner:** NEX Runtime  
**Last Updated:** 2026-02-24

---

## 1. Objective

Implement runtime-side multi-app foundations so one tenant runtime can host multiple first-class apps (starting with Control), with explicit app mounts and an authenticated app catalog endpoint.

This is a hard cutover. No compatibility fallback for legacy bare `/app/*` routing.

---

## 2. Customer Experience First

From a user perspective, this phase enables:

1. "Open workspace" no longer means one implicit UI.
2. Workspace runtime exposes an explicit app list.
3. App URLs are explicit and stable (`/app/<app_id>/...`).
4. The same runtime can host Control now and Oracle/future apps later without changing frontdoor architecture.

---

## 3. Current-State Research (Code Truth)

As of current `nex` branch:

1. runtime has two **surface roles**:
   - control-plane surface (protocol/control operations + selected event methods)
   - ingress surface (adapter-owned event ingress)
2. ingress bridge ownership is separated from control-plane route ownership.
3. agent-triggering flows dispatch via:
   - `dispatchNexusEvent(...) -> nex.processEvent(...)`

Implication:

- ingress unification to `NexusEvent` is the canonical behavior for agent-triggering work.
- listener/port topology is implementation detail; surface semantics are the contract.

This phase focuses on app-model primitives and does not require a specific listener count.

---

## 4. Decisions (Locked)

1. **Canonical app mount namespace**
   - `/app/control/*`
   - `/app/<future-app>/*`
2. **No implicit app root**
   - `/app`
   - `/app/`
   - `/app/chat`
   are not valid app entry points after cutover.
3. **Runtime app catalog endpoint**
   - `GET /api/apps`
4. **Catalog is authenticated + IAM-authorized**
   - endpoint requires control-plane auth and IAM permission.
5. **Control UI served only via Control app mount**
   - control UI HTTP base path is fixed to `/app/control`.

---

## 5. Runtime Contract

### 5.1 Config (canonical shape)

`runtime.apps` is the runtime app registry config.

```yaml
runtime:
  apps:
    control:
      enabled: true
      displayName: Control
      apiBase: /api/control
      entryPath: /app/control/chat
      icon: control-panel
      order: 10
    oracle:
      enabled: false
      displayName: Oracle
      apiBase: /api/oracle
      entryPath: /app/oracle/
      icon: tree
      order: 20
```

### 5.2 Endpoint

`GET /api/apps`

Response:

```json
{
  "ok": true,
  "items": [
    {
      "app_id": "control",
      "display_name": "Control",
      "entry_path": "/app/control/chat",
      "api_base": "/api/control",
      "icon": "control-panel",
      "order": 10
    }
  ]
}
```

Rules:

1. sorted by `order`, then `app_id`.
2. only enabled apps are listed.
3. endpoint is IAM-authorized as control-plane operation.

### 5.3 Routing behavior

1. control UI assets are served only for `/app/control/*`.
2. unknown app ids under `/app/<id>/...` return `404`.
3. bare `/app` and `/app/*` non-namespaced legacy routes return `404`.

---

## 6. Implementation Plan

1. Add runtime app config types and schema support.
2. Add runtime app registry resolver in control-plane layer.
3. Add `GET /api/apps` control-plane HTTP endpoint with IAM authorization.
4. Cut over control UI serving path to `/app/control/*` only.
5. Remove legacy bare app fallback behavior.
6. Add/adjust tests for app catalog and routing contract.

---

## 7. Validation Matrix

Must pass:

1. `GET /api/apps` unauthorized without auth token in hosted mode.
2. `GET /api/apps` returns Control app when enabled.
3. `GET /api/apps` omits disabled apps.
4. `GET /app/control/chat` serves Control UI.
5. `GET /app/chat` returns `404`.
6. `GET /app` returns `404`.
7. non-control app mount without installed app returns `404`.
