# Upstream Clawdbot Credential System Analysis

**Status:** Reference Documentation  
**Upstream Source:** `src/agents/auth-profiles/`, `src/agents/cli-credentials.ts`, `src/agents/model-auth.ts`

---

## Overview

Upstream clawdbot uses a centralized `auth-profiles.json` file that stores credentials **directly** (including raw secrets). This contrasts with Nexus's pointer-based architecture where credentials are stored in secure backends (Keychain, 1Password, etc.) and Nexus only stores references.

---

## 1. Storage Structure

### File Locations

```
~/.clawdbot/
├── auth-profiles.json                    # Main credential store (secrets inline)
├── auth.json                             # Legacy (migrated to auth-profiles.json)
├── credentials/
│   └── oauth.json                        # Legacy OAuth storage (merged into profiles)
└── {agentDir}/
    └── auth-profiles.json                # Per-agent credentials (inherits from main)
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `CLAWDBOT_STATE_DIR` | Override state directory (default: `~/.clawdbot`) |
| `CLAWDBOT_OAUTH_DIR` | Override OAuth directory |
| `CLAWDBOT_CONFIG_PATH` | Override config file path |

---

## 2. Auth Profile Store Schema

```typescript
type AuthProfileStore = {
  version: number;                              // Currently 1
  profiles: Record<string, AuthProfileCredential>;
  order?: Record<string, string[]>;             // Per-provider profile order
  lastGood?: Record<string, string>;            // Last working profile per provider
  usageStats?: Record<string, ProfileUsageStats>;
};

type ProfileUsageStats = {
  lastUsed?: number;                            // Unix timestamp
  cooldownUntil?: number;                       // Rate limit cooldown
  disabledUntil?: number;                       // Disabled until timestamp
  disabledReason?: AuthProfileFailureReason;
  errorCount?: number;
  failureCounts?: Partial<Record<AuthProfileFailureReason, number>>;
  lastFailureAt?: number;
};

type AuthProfileFailureReason = 
  | "auth" | "format" | "rate_limit" | "billing" | "timeout" | "unknown";
```

### Example auth-profiles.json

```json
{
  "version": 1,
  "profiles": {
    "anthropic:claude-cli": {
      "type": "oauth",
      "provider": "anthropic",
      "access": "sk-ant-...",
      "refresh": "...",
      "expires": 1737897600000
    },
    "openai:default": {
      "type": "api_key",
      "provider": "openai",
      "key": "sk-...",
      "email": "user@example.com"
    },
    "github-copilot:github": {
      "type": "token",
      "provider": "github-copilot",
      "token": "gho_...",
      "expires": 1737897600000
    }
  },
  "order": {
    "anthropic": ["anthropic:claude-cli", "anthropic:manual"]
  },
  "lastGood": {
    "anthropic": "anthropic:claude-cli"
  }
}
```

---

## 3. Credential Types

### API Key (`api_key`)

```typescript
type ApiKeyCredential = {
  type: "api_key";
  provider: string;
  key: string;                    // RAW API KEY STORED DIRECTLY
  email?: string;
};
```

### Token (`token`)

```typescript
type TokenCredential = {
  type: "token";
  provider: string;
  token: string;                  // RAW TOKEN STORED DIRECTLY
  expires?: number;               // Optional expiry (ms since epoch)
  email?: string;
};
```

### OAuth (`oauth`)

```typescript
type OAuthCredential = {
  type: "oauth";
  provider: string;
  access: string;                 // RAW ACCESS TOKEN
  refresh: string;                // RAW REFRESH TOKEN
  expires: number;                // Expiry timestamp (ms)
  clientId?: string;
  email?: string;
  enterpriseUrl?: string;         // For enterprise auth
  projectId?: string;             // For Google providers
  accountId?: string;
};
```

---

## 4. Profile ID Convention

Upstream uses `{provider}:{account}` format:

| Profile ID | Provider | Account |
|------------|----------|---------|
| `anthropic:claude-cli` | anthropic | claude-cli |
| `anthropic:manual` | anthropic | manual |
| `openai-codex:codex-cli` | openai-codex | codex-cli |
| `github-copilot:github` | github-copilot | github |
| `qwen-portal:qwen-cli` | qwen-portal | qwen-cli |

**Special Profile IDs:**
- `anthropic:claude-cli` - Synced from Claude Code CLI
- `openai-codex:codex-cli` - Synced from Codex CLI
- `qwen-portal:qwen-cli` - Synced from Qwen CLI

---

## 5. External CLI Credential Sync

Upstream automatically syncs credentials from external CLI tools on every load.

### Claude Code CLI Sources

1. **macOS Keychain** (preferred)
   ```bash
   security find-generic-password -s "Claude Code-credentials" -w
   ```
   Returns JSON with `claudeAiOauth.{accessToken,refreshToken,expiresAt}`

2. **File fallback**
   ```
   ~/.claude/.credentials.json
   ```

### Codex CLI Sources

1. **macOS Keychain**
   ```bash
   security find-generic-password -s "Codex Auth" -a "cli|{hash}" -w
   ```
   Account is derived from SHA256 of `$CODEX_HOME` path

2. **File fallback**
   ```
   $CODEX_HOME/auth.json
   ```

### Qwen CLI Sources

1. **File only**
   ```
   ~/.qwen/oauth_creds.json
   ```

### Sync Behavior

- Sync runs on every `ensureAuthProfileStore()` call
- 15-minute TTL cache prevents excessive reads
- Tokens are refreshed if within 10 minutes of expiry
- OAuth credentials are preferred over token-only
- Changes are written back to store after sync

---

## 6. OAuth Token Refresh

Upstream handles OAuth refresh with file locking:

```typescript
async function refreshOAuthTokenWithLock(params: {
  profileId: string;
  agentDir?: string;
}): Promise<{ apiKey: string; newCredentials: OAuthCredentials } | null>
```

**Process:**
1. Acquire file lock on `auth-profiles.json`
2. Check if token is still valid (race condition protection)
3. Refresh token via provider-specific API
4. Update store with new credentials
5. **Sync back to Claude CLI** if profile is `anthropic:claude-cli`
6. Release lock

**Providers with refresh support:**
- Anthropic (via `@mariozechner/pi-ai`)
- GitHub Copilot
- Google Gemini CLI / Antigravity
- Chutes (custom)
- Qwen Portal (custom)

---

## 7. Profile Order & Rotation

### Order Resolution

```typescript
function resolveAuthProfileOrder(params: {
  cfg?: ClawdbotConfig;
  store: AuthProfileStore;
  provider: string;
  preferredProfile?: string;
}): string[]
```

**Precedence:**
1. Explicit `preferredProfile` parameter
2. Config `auth.order[provider]` array
3. Store `order[provider]` array
4. All profiles for provider, sorted by `lastUsed` (descending)

### Cooldown System

When a profile fails, it enters cooldown:

| Failure Reason | Initial Cooldown | Max Cooldown |
|----------------|------------------|--------------|
| `billing` | 5 hours | 24 hours |
| `rate_limit` | Per-provider | varies |
| Other | varies | varies |

Cooldowns use exponential backoff based on `errorCount`.

---

## 8. CLI Commands

### Via `clawdbot models auth`

| Command | Description |
|---------|-------------|
| `login` | Interactive provider login |
| `setup-token` | Run `claude setup-token` and import |
| `paste-token` | Paste a token directly |
| `add` | Interactive add new profile |

### Login Flow

```bash
clawdbot models auth login --provider anthropic
```

1. Lists available provider plugins
2. User selects provider and auth method
3. Runs provider-specific auth flow (OAuth, API key paste, etc.)
4. Stores credential via `upsertAuthProfile()`
5. Updates config with `auth.profiles` entry

---

## 9. Environment Variable Fallbacks

When no profile matches, upstream checks env vars:

| Provider | Env Var(s) |
|----------|------------|
| anthropic | `ANTHROPIC_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` |
| openai | `OPENAI_API_KEY` |
| github-copilot | `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN` |
| google | `GEMINI_API_KEY` |
| groq | `GROQ_API_KEY` |
| xai | `XAI_API_KEY` |
| openrouter | `OPENROUTER_API_KEY` |
| minimax | `MINIMAX_CODE_PLAN_KEY`, `MINIMAX_API_KEY` |
| zai | `ZAI_API_KEY`, `Z_AI_API_KEY` |
| qwen-portal | `QWEN_OAUTH_TOKEN`, `QWEN_PORTAL_API_KEY` |

---

## 10. Per-Agent Inheritance

Subagents can inherit auth from the main agent:

```typescript
if (agentDir) {
  const mainStore = loadAuthProfileStoreForAgent(undefined);
  if (Object.keys(mainStore.profiles).length > 0) {
    // Clone main store to subagent directory
    saveJsonFile(authPath, mainStore);
  }
}
```

Subagent stores are merged with main store on load:
```typescript
const merged = mergeAuthProfileStores(mainStore, subagentStore);
```

---

## Key Differences from Nexus

### 1. Raw Secrets vs Pointers

| Aspect | Upstream | Nexus |
|--------|----------|-------|
| Storage | Raw secrets in JSON | Pointers to secure backends |
| API keys | Stored directly | Stored in Keychain/1Password/env |
| Tokens | Stored directly | Stored in Keychain/1Password/env |
| Security | File permissions only | Backend-specific security |

**Nexus advantage:** Secrets never written to disk in plaintext.

### 2. Directory Structure

| Aspect | Upstream | Nexus |
|--------|----------|-------|
| Layout | Single `auth-profiles.json` | `{service}/accounts/{account}/auth/{authId}.json` |
| Index | N/A | `index.json` for fast lookup |
| Policies | N/A | Separate policy files |

**Nexus advantage:** Hierarchical structure, access control via policies.

### 3. Ownership Model

| Aspect | Upstream | Nexus |
|--------|----------|-------|
| Per-credential ownership | N/A | `user`, `shared`, `agent:{id}` |
| Gateway access control | N/A | Policy-based allow/deny + scopes |

**Nexus advantage:** Fine-grained access control.

### 4. Credential Discovery

| Aspect | Upstream | Nexus |
|--------|----------|-------|
| Env scanning | Basic (specific vars only) | `--deep` pattern matching |
| CLI imports | Auto-sync on load | Explicit `nexus credential import` |
| Pattern detection | N/A | Prefix-based detection (sk-ant-, ghp_, etc.) |

**Nexus advantage:** Comprehensive credential discovery.

### 5. Storage Backends

| Aspect | Upstream | Nexus |
|--------|----------|-------|
| Keychain | Read-only (for CLI sync) | Full read/write support |
| 1Password | N/A | Full support via `op` CLI |
| External commands | N/A | Arbitrary command execution |
| GOG integration | N/A | Direct GOG credential access |

**Nexus advantage:** Multiple secure storage backends.

---

## What Nexus Should Adopt

### 1. External CLI Auto-Sync ✓
Nexus already supports `nexus credential import claude-cli`. Consider auto-sync on startup like upstream.

### 2. Profile Rotation & Cooldowns ✓
Nexus already has `usageStats`, `lastGood`, `order` in index. Ensure feature parity.

### 3. OAuth Token Refresh
Upstream's locked refresh flow is solid. Nexus should ensure equivalent functionality.

### 4. Per-Agent Inheritance
Consider supporting agent-scoped credential inheritance like upstream.

### 5. Provider Plugin System
Upstream's plugin-based auth providers allow extensibility. Consider similar architecture.

---

## What Nexus Should Diverge On

### 1. Keep Pointer Architecture ✓
Never store raw secrets in JSON. This is a core Nexus security principle.

### 2. Keep Policy System ✓
Gateway access control via policies is valuable; upstream lacks this.

### 3. Keep Storage Backend Flexibility ✓
1Password, Keychain, env, external - these options are essential.

### 4. Keep Hierarchical Structure ✓
`{service}/accounts/{account}/auth/{authId}` is cleaner than flat profiles.

### 5. Keep Comprehensive CLI ✓
Nexus has better credential management CLI (`scan`, `verify`, `flag`, etc.).

---

## Source Files Reference

| Upstream File | Purpose |
|---------------|---------|
| `src/agents/auth-profiles.ts` | Re-exports (barrel file) |
| `src/agents/auth-profiles/store.ts` | Load/save/merge store |
| `src/agents/auth-profiles/types.ts` | TypeScript types |
| `src/agents/auth-profiles/paths.ts` | Path resolution |
| `src/agents/auth-profiles/constants.ts` | Profile IDs, timing constants |
| `src/agents/auth-profiles/oauth.ts` | OAuth resolution/refresh |
| `src/agents/auth-profiles/external-cli-sync.ts` | CLI credential sync |
| `src/agents/auth-profiles/order.ts` | Profile order resolution |
| `src/agents/auth-profiles/profiles.ts` | Profile CRUD operations |
| `src/agents/auth-profiles/usage.ts` | Usage tracking, cooldowns |
| `src/agents/cli-credentials.ts` | External CLI reading |
| `src/agents/model-auth.ts` | Provider auth resolution |
| `src/config/types.auth.ts` | Config auth types |
| `src/config/paths.ts` | State/OAuth directory paths |
| `src/providers/github-copilot-auth.ts` | GitHub Copilot OAuth flow |
| `src/commands/models/auth.ts` | CLI auth commands |
