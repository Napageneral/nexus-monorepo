# Phase 5: API Tokens

**Status:** NOT STARTED
**Last Updated:** 2026-03-04
**Depends On:** Phase 1 (token table + store methods), Phase 4 (two-tier auth uses tokens)
**Enables:** Programmatic/MCP access to tenant VPSes
**Specs:** [TENANT_NETWORKING_AND_ROUTING §7](../specs/TENANT_NETWORKING_AND_ROUTING_2026-03-04.md)

---

## Goal

Implement platform-level API tokens that allow programmatic access to frontdoor APIs and tenant VPSes. These are Tier 1 credentials — frontdoor validates them and adds identity headers.

Separate from VPS-issued tokens (Tier 2) which are managed by apps on the VPS and passed through by frontdoor.

---

## Current State

- No API token infrastructure exists
- All auth is session-cookie based (browser only)
- No way for local dev tools (MCP clients, CLI tools) to authenticate

---

## Tasks

### 5.1 — Token generation utilities

**File:** `src/api-tokens.ts` (new)

```typescript
import crypto from "node:crypto";

// Token format: nex_t_<base64url-encoded-32-bytes>
// Prefix makes tokens scannable by secret detection tools
export function generateApiToken(): string {
  const bytes = crypto.randomBytes(32);
  return `nex_t_${bytes.toString("base64url")}`;
}

export function generateTokenId(): string {
  return `tok-${crypto.randomBytes(8).toString("hex")}`;
}

// Hash for storage — use SHA-256 (not bcrypt, since tokens are high-entropy random)
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function isApiToken(authHeader: string): boolean {
  return authHeader.startsWith("Bearer nex_t_");
}

export function extractToken(authHeader: string): string {
  return authHeader.slice(7); // Remove "Bearer " prefix
}
```

**Why SHA-256 instead of bcrypt:** API tokens are 256-bit random — they have maximum entropy and cannot be brute-forced. bcrypt is designed for low-entropy passwords. SHA-256 is faster and equally secure for high-entropy tokens. This is the standard practice (GitHub, Stripe, etc. all use SHA-256 for API tokens).

### 5.2 — Token CRUD API endpoints

**File:** `src/server.ts`

**Create token:**
```typescript
// POST /api/tokens/create
// Body: { display_name: string, expires_in_days?: number }
// Returns: { token: "nex_t_...", token_id: "tok-...", display_name, expires_at }
// NOTE: full token is only returned ONCE at creation time

1. Validate session
2. Generate token: generateApiToken()
3. Generate token ID: generateTokenId()
4. Hash token: hashToken(token)
5. Calculate expiry: expires_in_days ? Date.now() + days * 86400000 : null
6. Store: store.createApiToken({
     tokenId, tokenHash: hash, userId, accountId,
     displayName: body.display_name, expiresAtMs
   })
7. Return: { token, token_id: tokenId, display_name, expires_at: expiresAtMs }
```

**List tokens:**
```typescript
// GET /api/tokens
// Returns: [{ token_id, display_name, last_used, expires_at, created_at }]

1. Validate session
2. const tokens = store.listApiTokens(session.userId)
3. Return tokens (no hashes)
```

**Revoke token:**
```typescript
// DELETE /api/tokens/:tokenId
// Returns: { ok: true }

1. Validate session
2. Verify ownership: token belongs to user's account
3. store.revokeApiToken(tokenId)
4. Return { ok: true }
```

### 5.3 — Token validation in auth pipeline

**File:** `src/server.ts`

Add to the request auth pipeline (before route handling):

```typescript
// For platform API requests (frontdoor.nexushub.sh/api/...):
if (!session && authHeader && isApiToken(authHeader)) {
  const token = extractToken(authHeader);
  const hash = hashToken(token);
  const tokenRecord = store.getApiTokenByHash(hash);

  if (!tokenRecord) {
    return sendJson(res, 401, { error: "invalid_token" });
  }
  if (tokenRecord.revokedAtMs) {
    return sendJson(res, 401, { error: "token_revoked" });
  }
  if (tokenRecord.expiresAtMs && tokenRecord.expiresAtMs < Date.now()) {
    return sendJson(res, 401, { error: "token_expired" });
  }

  // Set session-like context from token
  session = {
    userId: tokenRecord.userId,
    accountId: tokenRecord.accountId,
    // ... minimal session fields needed
  };

  // Update last_used
  store.touchApiToken(tokenRecord.tokenId);
}
```

For tenant subdomain requests, token validation is handled in `resolveTenantAuth()` (Phase 4.4).

### 5.4 — Dashboard UI for token management

**File:** `public/index.html`

Add a "API Tokens" section in the dashboard (accessible from settings/account area):

**Token list view:**
```html
<div id="tokens-section">
  <h3>API Tokens</h3>
  <p>Use API tokens for programmatic access to your servers via MCP, CLI tools, or custom integrations.</p>
  <button onclick="showCreateTokenModal()">Create Token</button>
  <div id="tokens-list">
    <!-- Populated by renderTokens() -->
    <!-- Each token card shows: name, created date, last used, expiry, revoke button -->
  </div>
</div>
```

**Create token modal:**
```html
<div id="create-token-modal" class="modal-overlay hidden">
  <div class="modal-box">
    <h3>Create API Token</h3>
    <label>Token name</label>
    <input type="text" id="token-name" placeholder="e.g., My MCP Token" />
    <label>Expires</label>
    <select id="token-expiry">
      <option value="">Never</option>
      <option value="30">30 days</option>
      <option value="90" selected>90 days</option>
      <option value="365">1 year</option>
    </select>
    <button onclick="createToken()">Create</button>
    <button onclick="hideCreateTokenModal()">Cancel</button>
  </div>
</div>
```

**Token created modal (shows token ONCE):**
```html
<div id="token-created-modal" class="modal-overlay hidden">
  <div class="modal-box">
    <h3>Token Created</h3>
    <p>Copy this token now — it won't be shown again.</p>
    <code id="new-token-value" class="token-display"></code>
    <button onclick="copyToken()">Copy</button>
    <hr>
    <h4>Usage example (MCP)</h4>
    <pre id="token-usage-example">
{
  "mcpServers": {
    "spike": {
      "url": "https://t-xyz.nexushub.sh/app/spike/mcp",
      "headers": {
        "Authorization": "Bearer nex_t_..."
      }
    }
  }
}
    </pre>
    <button onclick="hideTokenCreatedModal()">Done</button>
  </div>
</div>
```

**JavaScript handlers:**
```javascript
async function createToken() {
  const name = document.getElementById('token-name').value;
  const expiryDays = document.getElementById('token-expiry').value;
  const body = { display_name: name || 'Unnamed Token' };
  if (expiryDays) body.expires_in_days = Number(expiryDays);

  const res = await api('/api/tokens/create', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();

  // Show the token ONCE
  document.getElementById('new-token-value').textContent = data.token;
  // Update usage example with actual tenant URL
  hideCreateTokenModal();
  showTokenCreatedModal();
  refreshTokenList();
}

async function revokeToken(tokenId) {
  if (!confirm('Revoke this token? Any integrations using it will stop working.')) return;
  await api(`/api/tokens/${tokenId}`, { method: 'DELETE' });
  refreshTokenList();
}

async function refreshTokenList() {
  const res = await api('/api/tokens');
  const data = await res.json();
  renderTokens(data.tokens);
}
```

---

## Usage Example

After this phase, a user can:

1. Create a token in the dashboard: "My Spike MCP Token"
2. Copy the token: `nex_t_8f3a9c2b7d1e4f5a...`
3. Configure their local MCP client:
   ```json
   {
     "mcpServers": {
       "spike": {
         "url": "https://t-abc123.nexushub.sh/app/spike/mcp",
         "headers": {
           "Authorization": "Bearer nex_t_8f3a9c2b7d1e4f5a..."
         }
       }
     }
   }
   ```
4. MCP client sends request → frontdoor validates token (Tier 1) → proxies to VPS → spike handles MCP protocol

---

## Verification

- [ ] `POST /api/tokens/create` → returns token (shown once)
- [ ] `GET /api/tokens` → lists tokens without hashes
- [ ] `DELETE /api/tokens/:id` → revokes token
- [ ] Token auth works for platform API: `curl -H "Authorization: Bearer nex_t_..." /api/servers`
- [ ] Token auth works for tenant subdomain: request proxied with X-Nexus-* headers
- [ ] Revoked tokens return 401
- [ ] Expired tokens return 401
- [ ] `last_used_ms` updated on each use
- [ ] Dashboard shows token list, create, revoke UI
- [ ] Token creation modal shows usage example with actual tenant URL
