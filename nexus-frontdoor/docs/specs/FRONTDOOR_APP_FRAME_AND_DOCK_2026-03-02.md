# Frontdoor App Frame & Dock

Date: 2026-03-02
Status: confirmed
Owners: Nexus Platform

---

## 1) Overview

The app frame is a persistent, thin UI element that frontdoor injects into every app's HTML document response. When a user is inside any app (GlowBot, Spike, Control, future apps), the app frame provides platform-level navigation without requiring the user to leave the app or know the dashboard URL.

The app frame solves a fundamental UX gap: today, when a user launches an app from the frontdoor dashboard, they navigate away entirely and have no way to get back, switch apps, switch servers, or access account functions.

### Design Principles

1. **Always present** — Every app HTML document response gets the frame injected. No exceptions.
2. **Minimal footprint** — A single top bar, 44px tall. The app owns the rest of the viewport.
3. **Product-branded** — The bar displays the active app's name and accent color from the product registry.
4. **Server-aware** — Shows which server the user is on. Supports switching servers without returning to dashboard.
5. **App switching** — Quick access to all installed apps on the current server.
6. **Injection-based** — Frontdoor injects the frame HTML/CSS/JS into the proxied HTML response. No iframe wrapper.

---

## 2) Implementation: HTML Injection (Option A — Locked In)

Frontdoor intercepts HTML document responses for all `/app/<app-id>/*` routes. Before returning the response to the browser, frontdoor:

1. Injects a `<style>` block before `</head>` containing the frame CSS.
2. Injects a `<div id="nexus-app-frame">` + `<script>` before `</body>` containing the frame markup and behavior.
3. Adds `padding-top: 44px` to the document body via the injected CSS, pushing app content below the frame.

This replaces the current `injectControlUiBootstrap()` function which only handles the control UI. The new injection applies to **all** apps.

### Why not iframe wrapper

- Apps connect to nex runtime via WebSocket RPC — no same-origin issues
- Static SPAs don't need iframe isolation
- Injection is simpler, faster, and more transparent to the app
- No postMessage complexity or URL synchronization
- The control UI bootstrap injection already proves this pattern works

---

## 3) App Frame Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  ◆ Nexus  │  ● GlowBot  │  ▾ Amber Beacon  │  ⊞ Apps  │  ● ty  ← │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                         App content fills                            │
│                         remaining viewport                           │
│                         (full width, full height minus 44px)         │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

The frame is a single horizontal bar, fixed to the top of the viewport, 44px tall, dark background (`#0c0e14`), with the following elements left to right:

### 3.1 Nexus Logo (left anchor)

- Small Nexus icon (20×20px)
- Clicking the logo navigates to the frontdoor dashboard (`/`)
- Always visible, no dropdown

### 3.2 Active App Badge

- Accent-colored dot (from `frontdoor_products.accent_color`) + app display name
- Non-interactive — just shows what app the user is currently in
- Example: `● GlowBot` with gold dot, `● Spike` with green dot

### 3.3 Server Selector

- Dropdown showing the current server's display name (e.g., "Amber Beacon")
- Click to expand a list of all servers the user has access to
- Selecting a different server:
  1. Calls `POST /api/servers/select` to set active server
  2. Checks if the current app is installed on the target server
  3. If installed: navigates to `/app/<app-id>/?server_id=<new-server-id>`
  4. If not installed: navigates to dashboard with server selected
- Shows server status indicator (green dot = healthy, amber = degraded, red = down)

### 3.4 App Switcher

- Grid/dropdown icon that expands to show all installed apps on the current server
- Each app shows: accent dot + display name + status
- Clicking an app navigates to its entry path on the current server
- Apps that are `installing` or `failed` are shown but disabled with status text
- The currently active app is highlighted

### 3.5 Account Menu (right side)

- User avatar or initial + truncated email/name
- Click expands dropdown with:
  - Account name
  - "Billing & Plans" → navigates to dashboard billing section
  - "Team & Access" → navigates to dashboard members section
  - "Account Settings" → navigates to dashboard settings
  - Divider
  - "Sign Out" → calls logout API, redirects to auth gate

### 3.6 Dashboard Link (right anchor)

- "← Dashboard" or back arrow icon
- Navigates to the frontdoor dashboard (`/`)
- Always visible as the rightmost element

---

## 4) Injection Function

The injection replaces the current `injectControlUiBootstrap()` with a generalized `injectAppFrame()`:

```typescript
function injectAppFrame(html: string, params: {
  // Active app context
  appId: string;
  appDisplayName: string;
  appAccentColor: string;

  // Active server context
  serverId: string;
  serverDisplayName: string;
  serverStatus: string;

  // All servers for server switcher
  servers: Array<{
    serverId: string;
    displayName: string;
    status: string;
  }>;

  // Installed apps on current server for app switcher
  installedApps: Array<{
    appId: string;
    displayName: string;
    accentColor: string;
    entryPath: string;
    status: string; // 'installed' | 'installing' | 'failed'
  }>;

  // User context
  userDisplayName: string;
  userEmail: string;
  accountName: string;

  // Navigation
  dashboardUrl: string;
  logoutUrl: string;
}): string
```

### Injection points

1. **CSS injection** — Insert before `</head>`:
   - Fixed positioning for the frame bar
   - `body { padding-top: 44px !important; }` to push app content down
   - Dropdown menus, transitions, dark theme tokens
   - Scoped under `#nexus-app-frame` to avoid style collisions with app CSS

2. **HTML + JS injection** — Insert before `</body>`:
   - Frame bar markup with all elements
   - Dropdown open/close behavior (vanilla JS, no framework dependency)
   - Server switch handler (fetch + navigate)
   - App switch handler (navigate)
   - Logout handler (fetch + redirect)

### CSS isolation

All frame styles are scoped under `#nexus-app-frame` and use specific class prefixes (`nxf-*`) to prevent collisions with app stylesheets. The frame uses `position: fixed; top: 0; left: 0; right: 0; z-index: 999999` to ensure it sits above all app content.

---

## 5) Proxy Path Integration

### 5.1 Current proxy flow (what changes)

Current flow for `/app/<app-id>/*`:
1. Validate session
2. Resolve workspace context
3. If control UI document path → inject control bootstrap
4. Otherwise → proxy to runtime as-is

New flow:
1. Validate session
2. Resolve server context (renamed from workspace)
3. If HTML document request (`Accept: text/html`, no file extension, GET method):
   a. Proxy to runtime and buffer the response
   b. Look up active app metadata from product registry
   c. Look up installed apps on current server
   d. Look up user's server list
   e. Call `injectAppFrame()` on the response HTML
   f. Return modified HTML to browser
4. If non-document request (JS, CSS, images, API calls) → proxy to runtime as-is (no injection)

### 5.2 Document detection

A request is an app document request when ALL of:
- Method is `GET`
- Path starts with `/app/<app-id>/`
- `Accept` header includes `text/html`
- Path has no file extension (`.js`, `.css`, `.png`, etc.)
- OR path is exactly `/app/<app-id>` or `/app/<app-id>/`

This replaces `isLikelyControlUiDocumentPath()` with a general `isAppDocumentRequest()`.

### 5.3 Response buffering

For document requests, the proxy must buffer the full response from the runtime before sending it to the browser. This is necessary because:
- We need to inject content at specific positions (`</head>`, `</body>`)
- We need to update `Content-Length` header after injection
- We need to handle cases where the runtime returns non-HTML (redirect, error)

If the runtime response is not HTML (non-200, non-text/html content-type), pass through without injection.

---

## 6) Data Requirements

The frame needs data that must be available at proxy time. This data comes from the frontdoor database (not from the runtime):

| Data | Source | Cache strategy |
|------|--------|----------------|
| App display name, accent color | `frontdoor_products` | Cache per app_id, refresh on app registry update |
| Server display name, status | `frontdoor_servers` | Cache per server_id, refresh on server status change |
| User's server list | `frontdoor_account_memberships` + `frontdoor_servers` | Cache per session, refresh on membership change |
| Installed apps on server | `frontdoor_server_app_installs` + `frontdoor_products` | Cache per server_id, refresh on app install/uninstall |
| User display name, email | Session record | Already in session |
| Account name | `frontdoor_accounts` | Cache per account_id |

To avoid adding latency to every proxied HTML request, these lookups should be cached in memory with short TTLs (30-60 seconds) and invalidated on relevant mutations.

---

## 7) URL Contract

### 7.1 App entry URLs

All app URLs follow the pattern:
```
/app/<app-id>/[path]?server_id=<server-id>
```

The `server_id` query parameter tells frontdoor which server context to use. If omitted, the user's active server from the session is used.

### 7.2 Server switching within app frame

When a user switches servers via the frame dropdown:
1. Frame JS calls `POST /api/servers/select` with `{ server_id: "<new>" }`
2. On success, navigates to `/app/<current-app-id>/?server_id=<new-server-id>`
3. Frontdoor resolves the new server context and proxies to the correct runtime

### 7.3 App switching within app frame

When a user switches apps via the frame dropdown:
1. Frame JS navigates to the target app's `entry_path` with `?server_id=<current-server-id>`
2. This is a full page navigation (apps are independent SPAs)

### 7.4 Dashboard navigation

- Logo click or "← Dashboard" link navigates to `/`
- This loads the frontdoor dashboard UI

---

## 8) Edge Cases

### 8.1 App returns non-HTML

If the runtime returns a non-HTML response for a document request (e.g., 302 redirect, 404, 500), pass through without frame injection. The frame only wraps successful HTML responses.

### 8.2 App has no accent color

Default to the Nexus brand color (`#6366f1` indigo) if the product registry has no `accent_color` for the app.

### 8.3 Server is unreachable

If the runtime is down, frontdoor should show a full-page error with the frame still visible at the top. The user can use the frame to switch to a different server or return to the dashboard.

### 8.4 App not installed on server

If the user navigates to `/app/glowbot/?server_id=X` but GlowBot is not installed on server X:
1. Frontdoor returns a branded error page (with frame) explaining the app isn't installed
2. The error page offers: "Install GlowBot on this server" button + "Switch to a server with GlowBot" dropdown

### 8.5 WebSocket connections

WebSocket upgrade requests (`/app/*` with `Connection: Upgrade`) are NOT document requests and receive no frame injection. They proxy through to the runtime as-is.

### 8.6 SPA client-side routing

SPAs use client-side routing (History API). The frame is injected on the initial HTML document load. Subsequent client-side navigations don't trigger new HTML requests, so the frame persists naturally. This is the correct behavior — the frame only needs to be injected once per page load.

---

## 9) Superseded Behavior

This spec supersedes:
1. `injectControlUiBootstrap()` — Replaced by `injectAppFrame()` which handles all apps
2. `isLikelyControlUiDocumentPath()` — Replaced by general `isAppDocumentRequest()`
3. The control UI's localStorage-based runtime config injection — The app frame provides platform context; apps get runtime connection details through the nex SDK, not localStorage hacks

---

## 10) Future Considerations

1. **Notification badges** — The frame could show notification counts per app (e.g., "3 new alerts in GlowBot")
2. **Quick actions** — Power user keyboard shortcuts for switching apps/servers
3. **Breadcrumbs** — If apps expose route metadata, the frame could show breadcrumb context
4. **Theme sync** — If apps support light/dark mode, the frame could respect the app's theme choice
5. **Collapse mode** — On mobile or small screens, the frame could collapse to a hamburger menu
