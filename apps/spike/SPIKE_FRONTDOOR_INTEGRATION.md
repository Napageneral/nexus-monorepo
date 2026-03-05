# Spike Frontdoor Integration Spec

> How platform credentials reach the spike engine, how GitHub OAuth callbacks route
> through the frontdoor to the correct tenant, and what configuration is required.
>
> Written 2026-03-04. Companion to SPIKE_ROADMAP.md and SPIKE_NEX_APP_SPEC.md.

---

## 1. Architecture Overview

In production, Spike runs as a **nex app** behind the nexus **frontdoor** reverse proxy.
The process hierarchy is:

```
frontdoor (Node.js, port 4789)
  └── provision-tenant-local.mjs  (spawned on first login)
        └── nexus runtime run     (per-tenant, unique port)
              └── spike-engine serve --nex --port {{port}}
```

Each layer inherits the parent's environment via `...process.env` (Node.js spread)
or standard process inheritance (Go binary). This means **any env var set on the
frontdoor process is automatically available to the spike engine** without any
additional plumbing.

### Caddy Reverse Proxy (oracle-1 reference deployment)

```
spike.fyi          → frontdoor.nexushub.sh (CNAME)
api.spike.fyi      → 127.0.0.1:7422  (legacy standalone engine, NOT nex-routed)
frontdoor.nexushub.sh → 127.0.0.1:4789  (frontdoor)
```

In the target architecture, `api.spike.fyi` is removed. All traffic flows through
the frontdoor at `frontdoor.nexushub.sh` (or a spike-specific domain like
`app.spike.fyi`).

---

## 2. Platform Credential Injection

### The Chain

```
frontdoor.env
  SPIKE_GITHUB_APP_SLUG=ask-spike
  SPIKE_GITHUB_APP_ID=2957819
  SPIKE_GITHUB_APP_PRIVATE_KEY='-----BEGIN RSA...'
  SPIKE_GITHUB_WEBHOOK_SECRET=spike-webhook-...
      │
      │  ...process.env (provision-tenant-local.mjs line ~350)
      ▼
nexus runtime process env
      │
      │  inherited by child process spawn (nex runtime → service binary)
      ▼
spike-engine process env
      │
      │  os.Getenv("SPIKE_GITHUB_APP_SLUG") etc. (main.go cmdServe)
      ▼
oracleServer fields: githubAppSlug, githubAppID, githubAppPrivateKey
```

### What This Means for Agents Working on Spike

- **Never hardcode credentials** in Go source, YAML configs, or manifests.
- **Never pass credentials via CLI flags** in the manifest's service args.
- The engine reads credentials from its own `os.Getenv()` calls at startup.
- Credentials are set ONCE in the frontdoor's environment and cascade automatically.
- The `cmdServe` function in `main.go` already reads all GitHub App env vars:
  - `SPIKE_GITHUB_APP_SLUG`
  - `SPIKE_GITHUB_APP_ID`
  - `SPIKE_GITHUB_APP_PRIVATE_KEY`
  - `SPIKE_GITHUB_WEBHOOK_SECRET`
  - `SPIKE_GITHUB_API_BASE_URL` (optional, defaults to `https://api.github.com`)
- Other credentials follow the same pattern:
  - `SPIKE_AUTH_TOKEN` — bearer token for API auth
  - `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` — LLM provider keys
  - `NEXUS_STATE_DIR` — set by provisioner, gives engine its state directory

### Adding New Credentials (Future: Jira, Bitbucket)

When adding Atlassian integration, follow the same pattern:
1. Add env var reads to `cmdServe` (e.g., `SPIKE_JIRA_CLIENT_ID`, `SPIKE_JIRA_CLIENT_SECRET`)
2. Store in `oracleServer` struct fields
3. Set in frontdoor env — they'll cascade automatically
4. No changes needed to provisioner, runtime, or manifest

---

## 3. GitHub App Callback Routing

### The Problem

When a user installs the GitHub App:
1. User clicks "Connect GitHub" in the Spike UI
2. Browser redirects to `github.com/apps/ask-spike/installations/new`
3. User authorizes the app on GitHub
4. GitHub redirects browser to the **Setup URL** configured on the GitHub App
5. This callback must reach the correct user's spike engine

### The Solution: Frontdoor Session-Based Proxy Routing

The user's browser already has a frontdoor session cookie (`nexus_fd_session`)
from their initial login. The callback URL is set to route through the frontdoor:

```
GitHub App Settings:
  Setup URL:   https://frontdoor.nexushub.sh/app/spike/connectors/github/install/callback
  Webhook URL: https://frontdoor.nexushub.sh/app/spike/github/webhook
```

**Callback flow:**

```
GitHub redirects browser to:
  https://frontdoor.nexushub.sh/app/spike/connectors/github/install/callback
    ?installation_id=12345&setup_action=install
      │
      │  Browser sends nexus_fd_session cookie
      ▼
Frontdoor looks up session → finds tenant_id
      │
      │  Proxies request to tenant's runtime
      ▼
Nex Runtime at 127.0.0.1:{tenant_port}
      │
      │  Strips /app/spike prefix, forwards to engine
      ▼
Spike Engine receives:
  GET /connectors/github/install/callback?installation_id=12345&setup_action=install
      │
      │  Stores installation_id, redirects to /
      ▼
Browser redirects to / (engine root → serves dashboard UI)
```

**Why this works:**
- The user's browser has the session cookie from their frontdoor login
- Frontdoor uses this to identify which tenant the request belongs to
- Standard frontdoor app proxy routing handles the path stripping
- No special callback handler or serverless function needed
- No direct connection between GitHub and the engine required

### Webhook Routing

GitHub webhooks (push events, installation events) also route through the frontdoor:

```
Webhook URL: https://frontdoor.nexushub.sh/app/spike/github/webhook
```

However, webhooks are server-to-server (no browser cookie). Two options:

**Option A: Shared engine (current oracle-1 setup)**
All tenants share one spike engine. Webhook URL points directly to the engine.
The engine resolves the target tree via the `installation_id` in the webhook payload,
looking up the `github_connector_bindings` table.

**Option B: Per-tenant routing (future multi-tenant)**
Webhook URL includes a tenant identifier (e.g., query param or path segment).
The frontdoor or a webhook dispatcher routes to the correct tenant's engine.
This requires either:
- A webhook dispatcher service that maps installation_id → tenant_id
- Or encoding tenant_id in the webhook URL registered with GitHub

For the current single-tenant deployment, Option A is sufficient. Multi-tenant
webhook routing is deferred until the multi-tenant architecture is built.

### Engine Redirect After Callback

The engine's GitHub callback handler (`github_connector.go`) redirects to `/`
after processing (NOT `/app/spike`, which would cause an isNexMode false positive
in standalone mode). The nex runtime's proxy transparently serves the dashboard
at `/app/spike/` for the user.

---

## 4. GitHub App Configuration

### Current GitHub App Settings (as of 2026-03-04)

| Setting | Value |
|---|---|
| App Name | Ask-Spike |
| App ID | 2957819 |
| Client ID | Iv23lixOiXQmoU3BabcO |
| Homepage URL | https://spike.fyi |
| Setup URL | https://frontdoor.nexushub.sh/app/spike/connectors/github/install/callback |
| Webhook URL | https://frontdoor.nexushub.sh/app/spike/github/webhook |
| Webhook Active | Yes |

### Required Permissions (GitHub App)

- **Repository contents**: Read (for cloning and reading code)
- **Metadata**: Read (for listing repos)

### Required Events (Webhooks)

- `push` — triggers tree staleness detection on new commits
- `installation` — tracks app install/uninstall

---

## 5. Frontdoor Environment Variables

### Required for Spike GitHub Integration

These must be set in the frontdoor's environment (e.g., `frontdoor.env` on oracle-1):

```bash
# GitHub App credentials (cascade to spike engine via env inheritance)
SPIKE_GITHUB_APP_SLUG=ask-spike
SPIKE_GITHUB_APP_ID=2957819
SPIKE_GITHUB_APP_PRIVATE_KEY='-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n'
SPIKE_GITHUB_WEBHOOK_SECRET=spike-webhook-...

# LLM provider keys (cascade to spike engine for hydrate/ask operations)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AI...
```

### Already Set (frontdoor operational config)

```bash
# Frontdoor core config
FRONTDOOR_CONFIG_PATH=/etc/spike-frontdoor/frontdoor.config.json

# Spike app proxy routing
FRONTDOOR_TENANT_SPIKE_PROXY_BASE_URL=http://127.0.0.1:7422
FRONTDOOR_SPIKE_RUNTIME_AUTH_TOKEN=spike-auth-...

# Provisioner
FRONTDOOR_AUTOPROVISION_COMMAND=node /opt/spike/frontdoor/scripts/provision-tenant-local.mjs
```

---

## 6. Spike App Proxy vs Service Mode

### Current State (oracle-1): Proxy Mode

The frontdoor proxies `/app/spike/*` requests directly to the standalone spike
engine at `http://127.0.0.1:7422`. This is configured via:

```bash
FRONTDOOR_TENANT_SPIKE_APP_KIND=proxy
FRONTDOOR_TENANT_SPIKE_PROXY_BASE_URL=http://127.0.0.1:7422
```

The provisioner creates an app config entry:
```json
{
  "spike": {
    "enabled": true,
    "displayName": "Spike",
    "entryPath": "/app/spike",
    "apiBase": "/api/spike",
    "kind": "proxy",
    "proxy": {
      "baseUrl": "http://127.0.0.1:7422"
    }
  }
}
```

### Target State: Nex Service Mode

The spike engine runs as a nex service-routed app. The runtime spawns the engine
binary, assigns it a port, and routes requests to it. No proxy configuration
needed — the runtime handles everything based on the app manifest.

The transition:
1. Remove `FRONTDOOR_TENANT_SPIKE_PROXY_BASE_URL` and related proxy env vars
2. Ensure the spike nex app package is installed (manifest at `apps/spike/app/app.nexus.json`)
3. Runtime reads manifest, spawns `bin/spike-engine serve --nex --port {{port}}`
4. Routing happens automatically via nex runtime app routing

---

## 7. Verification Checklist

To verify the full credential + callback flow works:

1. [ ] Frontdoor env has all `SPIKE_GITHUB_APP_*` vars
2. [ ] Frontdoor restarts and picks up new env vars
3. [ ] Provisioner spawns runtime with inherited env
4. [ ] Runtime spawns spike-engine, engine logs show GitHub App configured
5. [ ] User visits `https://frontdoor.nexushub.sh/app/spike/`
6. [ ] User clicks "Connect GitHub" → redirected to GitHub App install page
7. [ ] User authorizes → GitHub redirects to frontdoor callback URL
8. [ ] Frontdoor routes callback to user's engine via session cookie
9. [ ] Engine processes callback, stores installation_id
10. [ ] Engine redirects to `/` → UI shows "GitHub Connected"
11. [ ] User can browse repos via the connected GitHub installation
