# Adapter Connection Service

**Status:** IN PROGRESS (decision-locked)
**Last Updated:** 2026-02-26
**Depends On:** `CREDENTIAL_SYSTEM.md`, `ADAPTER_CREDENTIALS.md`, `ADAPTER_INTERFACE_UNIFICATION.md`

---

## Overview

The Adapter Connection Service defines the runtime-side credential orchestration layer for adapter onboarding. It enables control panel and external frontends to manage adapter credentials without using the CLI.

This pass is a **hard cutover** to the richer runtime credential model and auth-manifest-driven setup.

**This spec adds:**
1. **Adapter manifest format** — Adapters declare auth requirements declaratively
2. **Control plane methods** — Server methods for connection orchestration via WebSocket
3. **OAuth callback submodule** — HTTP ingress handler for OAuth redirect flows
4. **Connection status tracking** — Unified view of all adapter connection states
5. **Richer runtime credential handling** — Runtime adopts the account/credentials[] model from `CREDENTIAL_SYSTEM.md`
6. **Durable OAuth flow state** — Pending OAuth flows are persisted with TTL and mirrored in memory
7. **Custom adapter setup flow** — Adapters expose runtime-driven onboarding via `adapter.setup.*`

**This spec intentionally changes current runtime behavior:**
- Removes the legacy simplified runtime credential resolver shape (no compatibility shim)
- Requires adapter `auth` manifest support across runtime + SDK + adapters
- Requires frontdoor-authenticated identity for hosted platform credential exchange paths

---

## 0. Decision Lock (2026-02-26)

These decisions are locked for implementation:

1. **Hard cutover only.** No backwards compatibility layer for legacy credential runtime behavior.
2. **Richer credential model in runtime.** Runtime credential loading must align to the canonical service/account/credentials[] model, not a runtime-specific reduced model.
3. **State model is both persisted and in-memory.** Durable store is canonical; in-memory cache is an optimization layer only.
4. **Secret-by-default for adapter auth fields.** Values provided through adapter auth flows are stored as secrets by default, even if UI field type is text/select.
5. **Multi-field credentials are first-class.** A single auth method may capture and store multiple fields as one structured credential payload.
6. **Best long-term OAuth flow durability.** Pending OAuth state must survive process restarts with TTL cleanup.
7. **Hosted auth path is frontdoor-first.** Caller identity is established at frontdoor; admin/hub endpoints enforce token exchange/authorization.
8. **Best-effort auth manifests for in-repo adapters.** Discord, Telegram, WhatsApp, and Gog must get the strongest practical auth manifest + implementation in this cutover.
9. **Naming freeze.** Existing operation and field names in this spec remain unchanged.
10. **Custom setup is first-class.** `custom_flow` is canonical and uses persisted runtime session state (no legacy fallback shape).

---

## 1. Adapter Manifest

Every adapter that requires credentials declares an **auth manifest** describing what it needs and how to acquire it.

### Location

The manifest lives in the adapter's metadata, returned by the existing `adapter.info` operation with an additional `auth` field.

### Schema

```typescript
type AdapterAuthManifest = {
  /** Methods available for connecting this adapter */
  methods: AdapterAuthMethod[];

  /** Human-readable setup instructions (optional) */
  setupGuide?: string;
};

type AdapterAuthMethod =
  | AdapterAuthMethodOAuth
  | AdapterAuthMethodApiKey
  | AdapterAuthMethodFileUpload
  | AdapterAuthMethodCustomFlow;

type AdapterAuthMethodOAuth = {
  type: "oauth2";

  /** Display label for the connect button */
  label: string;        // "Connect with Google"

  /** Icon hint for UI rendering */
  icon: string;         // "google" | "meta" | "oauth"

  /** Credential service name (matches credential store service) */
  service: string;      // "google"

  /** OAuth scopes required for this adapter */
  scopes: string[];     // ["https://www.googleapis.com/auth/adwords.readonly"]

  /**
   * If true, OAuth client credentials (client_id, client_secret) are fetched
   * from a platform credential provider (e.g., central GlowBot hub) rather
   * than from the local `{service}/_client.json`.
   *
   * This supports SaaS deployments where the platform operator owns the
   * OAuth app registrations.
   */
  platformCredentials?: boolean;

  /** Platform credential provider URL (required if platformCredentials: true) */
  platformCredentialUrl?: string;
};

type AdapterAuthMethodApiKey = {
  type: "api_key";

  /** Display label */
  label: string;        // "Enter API Key"

  /** Icon hint */
  icon: string;         // "key"

  /** Credential service name */
  service: string;      // "patient-now"

  /** Fields the user must provide */
  fields: AdapterAuthField[];
};

type AdapterAuthField = {
  name: string;         // "api_key"
  label: string;        // "API Key"
  type: "secret" | "text" | "select";  // UI widget type
  required: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;  // For select type
};

type AdapterAuthMethodFileUpload = {
  type: "file_upload";

  /** Display label */
  label: string;        // "Upload CSV Export"

  /** Icon hint */
  icon: string;         // "upload"

  /** Accepted file types */
  accept: string[];     // [".csv", ".xlsx"]

  /** URL to download a template file (optional) */
  templateUrl?: string;

  /** Maximum file size in bytes */
  maxSize?: number;
};

type AdapterAuthMethodCustomFlow = {
  type: "custom_flow";

  /** Display label */
  label: string;        // "Set Up Eve Access"

  /** Icon hint */
  icon: string;         // "settings"

  /** Credential/config service name this flow resolves */
  service: string;      // "eve" | "google" | "gog"

  /**
   * Optional starter fields shown before first `adapter.setup.start`.
   * UI hint only; stored values are still secret-by-default in runtime persistence.
   */
  fields?: AdapterAuthField[];
};
```

### Storage Policy For Auth Fields

`AdapterAuthField.type` controls UI rendering, not storage classification.

For this cutover:

1. Values captured by `oauth2` and `api_key` flows are treated as secret material by default.
2. Multi-field auth inputs are stored together as one credential payload for that auth method.
3. `custom_flow` submit payload values are secret-by-default when persisted as credentials.
4. If a field is truly non-secret runtime config, it should be moved to adapter account config instead of auth input.

### Extended AdapterInfo

The existing `AdapterInfoSchema` gains an optional `auth` field:

```typescript
// Extends existing AdapterInfoSchema
AdapterInfoSchema = z.object({
  platform: z.string(),
  name: z.string(),
  version: z.string(),
  operations: z.array(AdapterOperationSchema),
  credential_service: z.string().optional(),
  multi_account: z.boolean(),
  platform_capabilities: ChannelCapabilitiesSchema,

  // NEW: Auth manifest
  auth: AdapterAuthManifestSchema.optional(),
});
```

### Example: Google Ads Adapter Info

```json
{
  "platform": "google-ads",
  "name": "Google Ads",
  "version": "1.0.0",
  "operations": ["adapter.info", "adapter.health", "event.backfill", "adapter.monitor.start"],
  "credential_service": "google",
  "multi_account": false,
  "platform_capabilities": { "direction": "inbound" },
  "auth": {
    "methods": [
      {
        "type": "oauth2",
        "label": "Connect with Google",
        "icon": "google",
        "service": "google",
        "scopes": ["https://www.googleapis.com/auth/adwords.readonly"],
        "platformCredentials": true,
        "platformCredentialUrl": "https://hub.glowbot.com/api/platform-credentials"
      },
      {
        "type": "file_upload",
        "label": "Upload CSV Export",
        "icon": "upload",
        "accept": [".csv"],
        "templateUrl": "/templates/google-ads-export.csv"
      }
    ]
  }
}
```

### Example: Patient Now EMR Adapter Info

```json
{
  "platform": "patient-now-emr",
  "name": "Patient Now",
  "version": "1.0.0",
  "operations": ["adapter.info", "adapter.health", "event.backfill", "adapter.monitor.start"],
  "credential_service": "patient-now",
  "multi_account": false,
  "platform_capabilities": { "direction": "inbound" },
  "auth": {
    "methods": [
      {
        "type": "api_key",
        "label": "Enter API Key",
        "icon": "key",
        "service": "patient-now",
        "fields": [
          { "name": "api_key", "label": "API Key", "type": "secret", "required": true },
          { "name": "practice_id", "label": "Practice ID", "type": "text", "required": true }
        ]
      },
      {
        "type": "file_upload",
        "label": "Upload CSV Export",
        "icon": "upload",
        "accept": [".csv"],
        "templateUrl": "/templates/emr-export.csv"
      }
    ]
  }
}
```

---

### 1.1 Custom Setup Operation Contract (`adapter.setup.*`)

Adapters that declare `auth.methods[].type = "custom_flow"` can implement adapter-defined setup logic using these operations:

1. `adapter.setup.start`
2. `adapter.setup.submit`
3. `adapter.setup.status`
4. `adapter.setup.cancel`

Runtime invocation contract:

```typescript
type AdapterSetupInvokePayload = {
  account?: string;
  session_id?: string;
  payload?: Record<string, unknown>;
};

type AdapterSetupStatus =
  | "pending"
  | "requires_input"
  | "completed"
  | "failed"
  | "cancelled";

type AdapterSetupResult = {
  status: AdapterSetupStatus;
  session_id?: string;
  account?: string;
  service?: string;
  message?: string;
  instructions?: string;
  fields?: AdapterAuthField[];
  /**
   * Secret-by-default credential payload when completion should create/update
   * runtime credential records.
   */
  secret_fields?: Record<string, string>;
  metadata?: Record<string, unknown>;
};
```

Rules:

1. Runtime persists session state keyed by `session_id` (or runtime-generated ID if absent).
2. Completion with `secret_fields` persists credential payload + links account.
3. Completion without `secret_fields` still links/configures account when flow represents non-secret setup prerequisites (e.g., local permissions).
4. Runtime is authoritative for persistence/lifecycle; adapter code is authoritative for setup UX logic.

---

## 2. Control Plane Methods

New server methods for credential orchestration. These follow the existing `RuntimeRequestHandlers` pattern in `src/nex/control-plane/server-methods/`.

### File: `src/nex/control-plane/server-methods/adapter-connections.ts`

```typescript
const adapterConnectionHandlers: RuntimeRequestHandlers = {
  /**
   * List all registered adapters with their connection status.
   * Merges adapter.info with credential store state.
   */
  "adapter.connections.list": async ({ respond, context }) => {
    // 1. List all registered adapters from adapterManager
    // 2. For each adapter, query adapter.info to get auth manifest
    // 3. For each adapter, check credential store for matching service
    // 4. Return merged list with connection status

    // Response:
    respond(true, {
      adapters: [
        {
          adapter: "google-ads",
          name: "Google Ads",
          status: "connected",       // "connected" | "disconnected" | "error" | "expired"
          authMethod: "oauth2",      // Which method was used to connect
          auth: { /* manifest */ },  // Full auth manifest
          account: "tyler@clinic.com",
          lastSync: 1740000000000,
          error: null,
          metadata: { email: "tyler@clinic.com" },
        },
        // ...
      ]
    });
  },

  /**
   * Get detailed connection status for a single adapter.
   */
  "adapter.connections.status": async ({ params, respond, context }) => {
    // params: { adapter: string }
    // Returns full status including credential details, sync state, health
  },

  /**
   * Start an OAuth connection flow.
   * Returns a redirect URL for the user's browser.
   */
  "adapter.connections.oauth.start": async ({ params, respond, context }) => {
    // params: { adapter: string, methodIndex?: number }
    //
    // 1. Get adapter info → auth manifest → find oauth method
    // 2. Resolve OAuth client credentials:
    //    - If platformCredentials: true → fetch from platformCredentialUrl
    //    - Else → read from local {service}/_client.json
    // 3. Generate state token (random, stored for verification)
    // 4. Build authorization URL:
    //    - client_id from resolved client creds
    //    - redirect_uri = https://{host}/auth/{service}/callback
    //    - scope = method.scopes.join(" ")
    //    - state = generated state token
    // 5. Store pending flow: { state, adapter, service, scopes, createdAt }
    //
    // Response:
    respond(true, {
      redirectUrl: "https://accounts.google.com/o/oauth2/auth?...",
      state: "abc123",
    });
  },

  /**
   * Complete an OAuth flow after callback.
   * Called by the HTTP ingress OAuth callback handler.
   * (Not typically called directly by UI — the callback handler calls this internally.)
   */
  "adapter.connections.oauth.complete": async ({ params, respond, context }) => {
    // params: { adapter: string, code: string, state: string }
    //
    // 1. Verify state token matches pending flow
    // 2. Resolve OAuth client credentials (same as start)
    // 3. Exchange code for tokens:
    //    - If platformCredentials → POST to central hub for exchange
    //    - Else → POST directly to tokenEndpoint
    // 4. Discover account identity (e.g., call Google userinfo API)
    // 5. Store credentials in credential store:
    //    - Create {service}/{account}.json with oauth credential
    //    - Store access token + refresh token via storage pointer
    // 6. Link adapter account: configureAccount(adapter, accountId, { credential_ref })
    // 7. Clean up pending flow state
    //
    // Response:
    respond(true, {
      status: "connected",
      account: "tyler@clinic.com",
      service: "google",
    });
  },

  /**
   * Save API key credentials for an adapter.
   */
  "adapter.connections.apikey.save": async ({ params, respond, context }) => {
    // params: { adapter: string, fields: Record<string, string> }
    //
    // 1. Get adapter info → auth manifest → find api_key method
    // 2. Validate all required fields are present
    // 3. Store each secret field in credential store:
    //    - Use default storage provider (keychain on macOS, encrypted file on Linux)
    //    - Create {service}/{account}.json pointer file
    // 4. Test connection: run adapter health check
    // 5. If health check passes → link adapter account
    // 6. If health check fails → remove stored credentials, return error
    //
    // Response:
    respond(true, {
      status: "connected",
      account: "practice-12345",
      service: "patient-now",
    });
  },

  /**
   * Handle file upload for an adapter.
   * The file content is passed as base64 or the file is already written
   * to a temp path by the HTTP ingress handler.
   */
  "adapter.connections.upload": async ({ params, respond, context }) => {
    // params: { adapter: string, fileName: string, filePath: string }
    //
    // 1. Validate file type against adapter manifest accept list
    // 2. Pass file to adapter's import handler
    // 3. Return preview of imported data (row count, columns, date range)
    //
    // Response:
    respond(true, {
      status: "imported",
      preview: {
        rows: 1247,
        columns: ["date", "spend", "impressions", "clicks"],
        dateRange: { from: "2025-01-01", to: "2026-02-25" },
      },
    });
  },

  /**
   * Start a custom adapter-defined setup flow.
   */
  "adapter.connections.custom.start": async ({ params, respond, context }) => {
    // params: { adapter: string, methodIndex?: number, account?: string, payload?: object }
    //
    // 1. Resolve adapter info/auth manifest and select `custom_flow` method
    // 2. Invoke adapter `adapter.setup.start` with optional account/payload
    // 3. Persist runtime setup session (durable + in-memory mirror)
    // 4. If result is completed and includes credentials, persist + link account
    //
    // Response:
    respond(true, {
      sessionId: "setup-session-abc",
      status: "requires_input",
      account: "default",
      service: "eve",
      message: "Grant Full Disk Access and click Continue",
      fields: [
        { name: "confirm", label: "I enabled Full Disk Access", type: "select", required: true },
      ],
    });
  },

  /**
   * Submit data for an in-progress custom setup session.
   */
  "adapter.connections.custom.submit": async ({ params, respond, context }) => {
    // params: { adapter: string, sessionId: string, account?: string, payload?: object }
    //
    // 1. Load persisted setup session
    // 2. Invoke adapter `adapter.setup.submit`
    // 3. Persist updated session state
    // 4. On completion, store credentials/link account and mark connected
    //
    // Response:
    respond(true, {
      sessionId: "setup-session-abc",
      status: "completed",
      account: "default",
      service: "eve",
      message: "Setup complete",
    });
  },

  /**
   * Retrieve current status for a custom setup session.
   */
  "adapter.connections.custom.status": async ({ params, respond, context }) => {
    // params: { adapter: string, sessionId: string, account?: string }
    //
    // 1. Read persisted session
    // 2. Optionally refresh via `adapter.setup.status`
    // 3. Return normalized latest status
  },

  /**
   * Cancel a custom setup session.
   */
  "adapter.connections.custom.cancel": async ({ params, respond, context }) => {
    // params: { adapter: string, sessionId: string, account?: string }
    //
    // 1. Best-effort invoke `adapter.setup.cancel`
    // 2. Remove persisted session
    // 3. Return cancelled status
  },

  /**
   * Test an existing adapter connection.
   */
  "adapter.connections.test": async ({ params, respond, context }) => {
    // params: { adapter: string }
    //
    // 1. Resolve credential for adapter
    // 2. Run adapter health check (adapter.health operation)
    // 3. Return result
    //
    // Response:
    respond(true, {
      ok: true,
      latency: 234,
    });
    // Or on failure:
    respond(true, {
      ok: false,
      error: "Invalid API key",
    });
  },

  /**
   * Disconnect an adapter (remove credentials and unlink).
   */
  "adapter.connections.disconnect": async ({ params, respond, context }) => {
    // params: { adapter: string }
    //
    // 1. Stop any running monitors for this adapter
    // 2. Remove adapter account configuration
    // 3. Optionally revoke OAuth tokens (if supported by service)
    // 4. Remove credentials from credential store
    //
    // Response:
    respond(true, { disconnected: true });
  },
};
```

### Protocol Schemas

File: `src/nex/control-plane/protocol/schema/adapter-connections.ts`

```typescript
import { Type } from "@sinclair/typebox";

// --- List ---
export const AdapterConnectionsListResultSchema = Type.Object({
  adapters: Type.Array(Type.Object({
    adapter: Type.String(),
    name: Type.String(),
    status: Type.Union([
      Type.Literal("connected"),
      Type.Literal("disconnected"),
      Type.Literal("error"),
      Type.Literal("expired"),
    ]),
    authMethod: Type.Union([
      Type.Literal("oauth2"),
      Type.Literal("api_key"),
      Type.Literal("file_upload"),
      Type.Literal("custom_flow"),
      Type.Null(),
    ]),
    auth: Type.Optional(Type.Unknown()),  // AdapterAuthManifest
    account: Type.Union([Type.String(), Type.Null()]),
    lastSync: Type.Union([Type.Integer(), Type.Null()]),
    error: Type.Union([Type.String(), Type.Null()]),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  })),
});

// --- OAuth Start ---
export const AdapterConnectionsOAuthStartParamsSchema = Type.Object({
  adapter: Type.String(),
  methodIndex: Type.Optional(Type.Integer({ minimum: 0 })),
});

export const AdapterConnectionsOAuthStartResultSchema = Type.Object({
  redirectUrl: Type.String(),
  state: Type.String(),
});

// --- OAuth Complete ---
export const AdapterConnectionsOAuthCompleteParamsSchema = Type.Object({
  adapter: Type.String(),
  code: Type.String(),
  state: Type.String(),
});

// --- API Key Save ---
export const AdapterConnectionsApiKeySaveParamsSchema = Type.Object({
  adapter: Type.String(),
  fields: Type.Record(Type.String(), Type.String()),
});

// --- Upload ---
export const AdapterConnectionsUploadParamsSchema = Type.Object({
  adapter: Type.String(),
  fileName: Type.String(),
  filePath: Type.String(),
});

// --- Custom Setup Flow ---
export const AdapterConnectionsCustomStartParamsSchema = Type.Object({
  adapter: Type.String(),
  methodIndex: Type.Optional(Type.Integer({ minimum: 0 })),
  account: Type.Optional(Type.String()),
  payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export const AdapterConnectionsCustomSubmitParamsSchema = Type.Object({
  adapter: Type.String(),
  sessionId: Type.String(),
  account: Type.Optional(Type.String()),
  payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export const AdapterConnectionsCustomStatusParamsSchema = Type.Object({
  adapter: Type.String(),
  sessionId: Type.String(),
  account: Type.Optional(Type.String()),
});

export const AdapterConnectionsCustomCancelParamsSchema = Type.Object({
  adapter: Type.String(),
  sessionId: Type.String(),
  account: Type.Optional(Type.String()),
});

// --- Test ---
export const AdapterConnectionsTestParamsSchema = Type.Object({
  adapter: Type.String(),
});

// --- Disconnect ---
export const AdapterConnectionsDisconnectParamsSchema = Type.Object({
  adapter: Type.String(),
});

// --- Common Result ---
export const AdapterConnectionResultSchema = Type.Object({
  status: Type.String(),
  account: Type.Optional(Type.String()),
  service: Type.Optional(Type.String()),
  error: Type.Optional(Type.String()),
});
```

---

## 3. OAuth Callback HTTP Submodule

A new HTTP ingress submodule that handles OAuth redirect callbacks.

### Registration

In `createHttpIngressAdapter()`:

```typescript
// Always registered (handles /auth/*/callback routes)
submodules.push({
  id: "oauth-callback",
  handle: async ({ req, res }) =>
    handleOAuthCallbackRequest(req, res, {
      getNexRuntime: options.getNexRuntime,
    }),
});
```

### Implementation

File: `src/nex/control-plane/http-oauth-callback.ts`

```typescript
import { IncomingMessage, ServerResponse } from "node:http";

/**
 * Handles OAuth callback requests at:
 *   /auth/{service}/callback?code=xxx&state=yyy
 *
 * Flow:
 * 1. Parse URL to extract service name, code, and state
 * 2. Look up pending OAuth flow by state token
 * 3. Call adapter.connections.oauth.complete internally
 * 4. Redirect browser to success/error page in the control UI
 */
export async function handleOAuthCallbackRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: {
    getNexRuntime?: () => NexRuntimeHandle | null;
  }
): Promise<boolean> {
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);

  // Only handle /auth/*/callback paths
  const match = url.pathname.match(/^\/auth\/([^/]+)\/callback$/);
  if (!match) return false;

  const service = match[1];
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    // OAuth provider returned an error (user denied, etc.)
    res.writeHead(302, {
      Location: `/integrations?error=${encodeURIComponent(error)}`,
    });
    res.end();
    return true;
  }

  if (!code || !state) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Missing code or state parameter");
    return true;
  }

  const runtime = options.getNexRuntime?.();
  if (!runtime) {
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("Runtime not available");
    return true;
  }

  try {
    // Look up pending flow to find adapter name
    const pendingFlow = await runtime.oauthFlowStore.get(state);
    if (!pendingFlow) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Invalid or expired state token");
      return true;
    }

    // Complete the OAuth flow (exchanges code, stores credentials)
    await runtime.adapterConnectionService.completeOAuth({
      adapter: pendingFlow.adapter,
      code,
      state,
    });

    // Redirect to success page
    res.writeHead(302, {
      Location: `/integrations?connected=${encodeURIComponent(pendingFlow.adapter)}`,
    });
    res.end();
  } catch (err) {
    res.writeHead(302, {
      Location: `/integrations?error=${encodeURIComponent(String(err))}`,
    });
    res.end();
  }

  return true;
}
```

### OAuth Flow State Store

Pending OAuth flows need temporary storage (survives across the redirect round-trip):

```typescript
type PendingOAuthFlow = {
  state: string;           // Random state token
  adapter: string;         // "google-ads"
  service: string;         // "google" (credential service name)
  scopes: string[];        // Requested scopes
  redirectUri: string;     // The callback URL used
  initiatedBy: {
    userId: string;
    tenantId?: string;
    via: "frontdoor" | "local-admin";
  };
  createdAt: number;       // Epoch ms
  expiresAt: number;       // Epoch ms
};

type PendingCustomSetupFlow = {
  sessionId: string;
  adapter: string;
  service: string;
  methodIndex: number;
  account?: string;
  initiatedBy: {
    userId: string;
    tenantId?: string;
    via: "frontdoor" | "local-admin";
  };
  createdAt: number;       // Epoch ms
  updatedAt: number;       // Epoch ms
  expiresAt: number;       // Epoch ms
  lastResult?: Record<string, unknown>;
};
```

Storage policy for this cutover:

1. **Persisted canonical store** in runtime state (with TTL sweep and startup rehydration).
2. **In-memory mirror** for fast lookups during callback handling.
3. On restart, flows not expired remain valid.
4. Expired entries are rejected and cleaned up.
5. Same persisted+mirror policy applies to custom setup sessions (`PendingCustomSetupFlow`).

---

## 4. Platform Credential Provider

For SaaS deployments (like GlowBot), OAuth client credentials are managed centrally rather than locally.

### Flow

When an adapter's auth method has `platformCredentials: true`:

```
Clinic Instance                          Central Hub
      │                                       │
      │  GET /api/platform-credentials        │
      │  ?service=google                      │
      │  Authorization: Bearer {clinicToken}  │
      │──────────────────────────────────────>│
      │                                       │
      │  { clientId, authUri, tokenUri,       │
      │    scopes, redirectUriPattern }       │
      │<──────────────────────────────────────│
      │                                       │
      │  (clinic builds auth URL with         │
      │   its own redirect_uri)               │
      │                                       │
      │  --- user completes OAuth ---         │
      │                                       │
      │  POST /api/platform-credentials/      │
      │       exchange                        │
      │  { service, code, redirectUri }       │
      │──────────────────────────────────────>│
      │                                       │
      │  (hub exchanges code using its        │
      │   client_secret)                      │
      │                                       │
      │  { accessToken, refreshToken,         │
      │    expiresAt, email }                 │
      │<──────────────────────────────────────│
      │                                       │
      │  (clinic stores tokens locally)       │
```

### Central Hub API

```
GET  /api/platform-credentials?service={service}
POST /api/platform-credentials/exchange
POST /api/platform-credentials/refresh
```

The clinic instance never sees the `client_secret`. Token exchange and refresh always go through central.

### Hosted Authentication Path (Locked)

For hosted deployments:

1. Frontdoor establishes caller identity and issues/verifies user session/token.
2. Runtime/admin endpoint accepts only frontdoor-authenticated requests for connection operations.
3. Runtime exchanges/forwards platform credential requests to hub/admin APIs using trusted service credentials.
4. Hub/admin enforces tenant and service authorization before returning OAuth client metadata or token exchange results.

### Local Fallback

When `platformCredentials` is false or not set, the standard local flow is used:
- Read `{service}/_client.json` for client credentials
- Exchange code directly with the OAuth provider

This allows the same adapter code to work in both SaaS (GlowBot) and self-hosted (personal nex) deployments.

---

## 5. Credential Storage on Hosted VPS

On a managed Linux VPS (like GlowBot clinic instances), the credential store adapts:

### Storage Provider: Encrypted File

Since there's no macOS Keychain on Linux, the default storage provider becomes encrypted files:

```typescript
type StoragePointer =
  | { provider: "keychain"; ... }       // macOS only
  | { provider: "encrypted_file"; ... } // Linux VPS
  | { provider: "env"; ... }
  | { provider: "external"; ... }
  // ...

// Encrypted file storage
{
  provider: "encrypted_file",
  path: "~/nexus/state/secrets/{service}/{account}.enc",
  encryption: "aes-256-gcm"
}
```

The encryption key is derived from:
- A machine-specific key (from `/etc/machine-id` or generated on first boot)
- A per-instance salt (generated during provisioning)

This provides at-rest encryption without requiring external services.

### Credential Lifecycle on VPS

| Event | Action |
|-------|--------|
| Provisioning | Generate encryption salt, store in `/etc/nexus/instance.key` |
| OAuth complete | Store tokens as encrypted files |
| Token refresh | Decrypt refresh token, get new access token, re-encrypt |
| Instance teardown | Securely wipe `~/nexus/state/secrets/` |

---

## 6. Implementation TODO List (Hard Cutover)

Use this as the execution checklist for implementation.

### Phase A - Contract + Schema Alignment

- [x] Add `auth` manifest support to runtime adapter protocol schema in `nex/src/nex/adapters/protocol.ts`.
- [x] Add `auth` manifest support to TypeScript SDK protocol types in `nexus-adapter-sdks/nexus-adapter-sdk-ts/src/protocol.ts`.
- [x] Add `auth` manifest support to Go SDK types in `nexus-adapter-sdks/nexus-adapter-sdk-go/types.go`.
- [x] Add `custom_flow` auth method contract across runtime + SDK protocol schemas.
- [x] Add `adapter.setup.start|submit|status|cancel` to canonical adapter operation ID enums.
- [x] Update canonical delivery contract in `nexus-specs/specs/delivery/contract/adapter-protocol.schema.json`.
- [x] Update delivery contract fixtures under `nexus-specs/specs/delivery/contract/fixtures/`.

### Phase B - Runtime Credential Model Cutover

- [x] Replace simplified runtime credential resolution in `nex/src/nex/adapters/runtime-context.ts` with richer `service/account/credentials[]` handling.
- [x] Support multi-field credential payload injection for `api_key` methods.
- [x] Enforce secret-by-default storage policy for adapter auth inputs.
- [x] Keep account linking via `credential_service` + `credential_ref` as canonical linkage.

### Phase C - Adapter Connection Control Plane

- [x] Implement `adapter.connections.*` handlers in `nex/src/nex/control-plane/server-methods/adapter-connections.ts`.
- [x] Implement `adapter.connections.custom.start|submit|status|cancel` handlers.
- [x] Register handlers in `nex/src/nex/control-plane/server-methods.ts`.
- [x] Add protocol schemas in `nex/src/nex/control-plane/protocol/schema/adapter-connections.ts`.
- [x] Wire schemas through `nex/src/nex/control-plane/protocol/schema/protocol-schemas.ts` and `nex/src/nex/control-plane/protocol/schema.ts`.
- [x] Register operation definitions in `nex/src/nex/control-plane/runtime-operations.ts`.
- [x] Add OAuth callback module `nex/src/nex/control-plane/http-oauth-callback.ts` and register in `nex/src/nex/control-plane/http-ingress-adapter.ts`.

### Phase D - OAuth Flow Durability + Hosted Auth

- [x] Implement persisted pending-flow store (TTL + restart recovery) and in-memory mirror.
- [x] Implement persisted custom setup session store (TTL + restart recovery) and in-memory mirror.
- [x] Bind pending flows to frontdoor-authenticated identity context.
- [x] Enforce hosted exchange path: frontdoor identity -> runtime/admin -> hub platform-credential APIs.
- [x] Keep local `_client.json` fallback for self-hosted mode.

### Phase E - SDK Runtime Helpers

- [x] Update TS SDK runtime context loader in `nexus-adapter-sdks/nexus-adapter-sdk-ts/src/runtime-context.ts` for richer credential payloads.
- [x] Update TS SDK runner for `adapter.setup.*` command routing + `--payload-json`.
- [x] Update Go SDK adapter bridge for `adapter.setup.*` command routing + `--payload-json`.
- [x] Add adapter manager generic invoke support for arbitrary adapter operations + JSON payload.

### Phase F - Adapter Best-Effort Auth Implementations

- [x] `nexus-adapter-discord`: add highest-quality auth manifest + runtime credential handling.
- [x] `nexus-adapter-telegram`: add highest-quality auth manifest + runtime credential handling.
- [x] `nexus-adapter-whatsapp`: add highest-quality auth manifest + runtime credential handling.
- [x] `nexus-adapter-gog`: add highest-quality auth manifest + runtime credential handling.
- [x] `eve-adapter`: add `custom_flow` manifest + setup operation handlers for local prerequisite checks.
- [x] Ensure `adapter.info` for each adapter exposes manifest that matches real implementation behavior.

### Phase G - Validation / Verification

- [x] Runtime tests in `nex/src/nex/adapters/*.test.ts` updated and passing.
- [x] Control-plane protocol + handler tests for `adapter.connections.*` added and passing.
- [x] OAuth callback and pending-flow durability tests added and passing.
- [x] Custom-flow session persistence + completion/cancel tests added and passing.
- [x] TS SDK tests passing.
- [x] Go SDK tests passing.
- [x] Adapter package tests/builds passing for discord, telegram, whatsapp, and gog.
- [x] Eve adapter tests/build passing for custom setup handlers.

---

## 7. UI Integration Points

The control panel UI (Lit for nex, Next.js for GlowBot) renders adapter connection cards by:

1. Calling `adapter.connections.list` to get all adapters + status
2. Rendering each adapter as a card with:
   - Name, icon, status badge
   - Available auth methods as clickable icons derived from `auth.methods`:
     - `oauth2` → OAuth icon (redirect flow)
     - `api_key` → Key icon (opens input form with `fields` from manifest)
     - `file_upload` → Upload icon (opens file picker with `accept` filter)
     - `custom_flow` → Setup icon (adapter-driven guided flow)
3. When a method is clicked:
   - **OAuth**: Call `adapter.connections.oauth.start` → redirect user to returned URL
   - **API Key**: Show form with fields from manifest → call `adapter.connections.apikey.save`
   - **File Upload**: Show dropzone → upload file → call `adapter.connections.upload`
   - **Custom Flow**: call `adapter.connections.custom.start` and continue via `.custom.submit/.custom.status/.custom.cancel`
4. After connection: card updates to show status, last sync, coverage

### Icon Mapping

| Auth Type | Icon | Label Pattern |
|-----------|------|---------------|
| `oauth2` | Circle-O or service logo | "Connect with {Service}" |
| `api_key` | Key | "Enter API Key" |
| `file_upload` | Folder/Upload | "Upload {File Type}" |
| `custom_flow` | Settings/Magic Wand | "Set Up {Adapter}" |

---

## 8. Relationship to Existing Systems

```
┌──────────────────────────────────────────────────────────────┐
│                    Control Panel UI                            │
│  (adapter.connections.list, .oauth.start, .apikey.save, .custom.*) │
└──────────────┬───────────────────────────────────────────────┘
               │ WebSocket
               ▼
┌──────────────────────────────────────────────────────────────┐
│              Adapter Connection Service (NEW)                  │
│  - Reads adapter manifests (from adapter.info)                │
│  - Orchestrates OAuth flows                                   │
│  - Orchestrates custom setup sessions                         │
│  - Validates API keys via health checks                       │
│  - Manages file uploads                                       │
└──────┬────────────────────────┬──────────────────────────────┘
       │                        │
       ▼                        ▼
┌──────────────┐     ┌──────────────────────────────────────┐
│ Credential   │     │ Adapter Manager (EXISTING)            │
│ Store        │     │ - configureAccount(credential_ref)    │
│ (EXISTING)   │     │ - queryInfo() → includes auth manifest│
│              │     │ - health() → connection test           │
│ Pointer-based│     │ - startMonitor(), runBackfill()       │
│ service/acct │     └──────────────────────────────────────┘
│ hierarchy    │
└──────────────┘
```

The Adapter Connection Service is a **coordination layer** between the UI, credential store, and adapter manager. It does not replace any existing system.
