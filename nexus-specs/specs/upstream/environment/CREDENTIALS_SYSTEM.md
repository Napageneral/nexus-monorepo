# OpenClaw Credentials System

**Status:** Reference Documentation  
**Last Updated:** 2026-02-04  
**Source:** OpenClaw `src/agents/auth-profiles/`, `src/agents/cli-credentials.ts`

---

This document provides a complete reference for the OpenClaw credentials/auth-profiles system. Use it to understand what to port vs. redesign for Nexus.

## Table of Contents

1. [Overview](#1-overview)
2. [Storage Structure](#2-storage-structure)
3. [Credential Types](#3-credential-types)
4. [Profile ID Convention](#4-profile-id-convention)
5. [Auth Profile Store Schema](#5-auth-profile-store-schema)
6. [External CLI Credential Sync](#6-external-cli-credential-sync)
7. [OAuth Token Refresh](#7-oauth-token-refresh)
8. [Profile Order & Rotation](#8-profile-order--rotation)
9. [Usage Stats & Cooldowns](#9-usage-stats--cooldowns)
10. [Environment Variable Fallbacks](#10-environment-variable-fallbacks)
11. [Per-Agent Inheritance](#11-per-agent-inheritance)
12. [CLI Commands](#12-cli-commands)
13. [Type Definitions](#13-type-definitions)
14. [Source Files Reference](#14-source-files-reference)
15. [Nexus Considerations](#15-nexus-considerations)

---

## 1. Overview

OpenClaw uses a centralized `auth-profiles.json` file that stores credentials **directly** (including raw secrets). This is a key architectural difference from Nexus's pointer-based approach.

### Key Characteristics

- **Direct storage:** API keys, tokens, and OAuth credentials stored in plaintext JSON
- **Multi-profile:** Multiple credentials per provider (e.g., `anthropic:work`, `anthropic:personal`)
- **Auto-sync:** Automatically imports credentials from external CLI tools
- **Rotation:** Built-in profile ordering and cooldown system
- **Inheritance:** Subagents inherit credentials from main agent

### Critical Security Note

OpenClaw stores raw secrets in `~/.openclaw/auth-profiles.json`. Nexus intentionally diverges from this pattern by storing only **pointers** to credentials in secure backends (Keychain, 1Password, env vars).

---

## 2. Storage Structure

### 2.1 File Locations

```
~/.openclaw/
├── auth-profiles.json              # Main credential store (secrets inline)
├── auth.json                       # Legacy (migrated to auth-profiles.json)
├── credentials/
│   └── oauth.json                  # Legacy OAuth storage (merged into profiles)
└── {agentDir}/
    └── auth-profiles.json          # Per-agent credentials (inherits from main)
```

### 2.2 Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENCLAW_STATE_DIR` | Override state directory (default: `~/.openclaw`) |
| `OPENCLAW_OAUTH_DIR` | Override OAuth directory |
| `OPENCLAW_CONFIG_PATH` | Override config file path |

### 2.3 Example Directory Structure

```
~/.openclaw/
├── auth-profiles.json
├── config.yaml
├── skills/                        # Managed skills from hub
│   └── my-skill/
│       └── SKILL.md
└── agents/
    └── coding-agent/
        └── auth-profiles.json     # Inherited/overridden credentials
```

---

## 3. Credential Types

### 3.1 API Key (`api_key`)

For services that use static API keys:

```typescript
type ApiKeyCredential = {
  type: "api_key";
  provider: string;
  key?: string;                    // RAW API KEY STORED DIRECTLY
  email?: string;
  metadata?: Record<string, string>;  // Provider-specific metadata
};
```

**Example:**
```json
{
  "type": "api_key",
  "provider": "openai",
  "key": "sk-proj-abc123...",
  "email": "user@example.com"
}
```

### 3.2 Token (`token`)

For static bearer-style tokens (not auto-refreshable):

```typescript
type TokenCredential = {
  type: "token";
  provider: string;
  token: string;                  // RAW TOKEN STORED DIRECTLY
  expires?: number;               // Optional expiry (ms since epoch)
  email?: string;
};
```

**Example:**
```json
{
  "type": "token",
  "provider": "github-copilot",
  "token": "gho_abc123...",
  "expires": 1737897600000
}
```

### 3.3 OAuth (`oauth`)

For OAuth credentials with refresh capability:

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

**Example:**
```json
{
  "type": "oauth",
  "provider": "anthropic",
  "access": "sk-ant-...",
  "refresh": "refresh_token_here",
  "expires": 1737897600000,
  "email": "user@example.com"
}
```

---

## 4. Profile ID Convention

OpenClaw uses `{provider}:{account}` format for profile IDs:

| Profile ID | Provider | Account |
|------------|----------|---------|
| `anthropic:claude-cli` | anthropic | claude-cli |
| `anthropic:manual` | anthropic | manual |
| `openai:default` | openai | default |
| `github-copilot:github` | github-copilot | github |
| `qwen-portal:qwen-cli` | qwen-portal | qwen-cli |

### Special Profile IDs

- `anthropic:claude-cli` — Auto-synced from Claude Code CLI
- `openai-codex:codex-cli` — Auto-synced from Codex CLI
- `qwen-portal:qwen-cli` — Auto-synced from Qwen CLI
- `minimax-portal:minimax-cli` — Auto-synced from MiniMax CLI

---

## 5. Auth Profile Store Schema

### 5.1 Store Structure

```typescript
type AuthProfileStore = {
  version: number;                              // Currently 1
  profiles: Record<string, AuthProfileCredential>;
  order?: Record<string, string[]>;             // Per-provider profile order
  lastGood?: Record<string, string>;            // Last working profile per provider
  usageStats?: Record<string, ProfileUsageStats>;
};
```

### 5.2 Example auth-profiles.json

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
  },
  "usageStats": {
    "anthropic:claude-cli": {
      "lastUsed": 1707000000000,
      "errorCount": 0
    }
  }
}
```

---

## 6. External CLI Credential Sync

OpenClaw automatically syncs credentials from external CLI tools on every load.

### 6.1 Supported CLI Sources

| CLI | Profile ID | Source Locations |
|-----|------------|------------------|
| Claude Code CLI | `anthropic:claude-cli` | macOS Keychain → `~/.claude/.credentials.json` |
| Codex CLI | `openai-codex:codex-cli` | macOS Keychain → `$CODEX_HOME/auth.json` |
| Qwen CLI | `qwen-portal:qwen-cli` | `~/.qwen/oauth_creds.json` |
| MiniMax CLI | `minimax-portal:minimax-cli` | MiniMax config file |

### 6.2 Claude Code CLI Sync

```typescript
// 1. Try macOS Keychain (preferred)
security find-generic-password -s "Claude Code-credentials" -w
// Returns JSON with claudeAiOauth.{accessToken,refreshToken,expiresAt}

// 2. Fallback to file
~/.claude/.credentials.json
```

### 6.3 Codex CLI Sync

```typescript
// 1. Try macOS Keychain
security find-generic-password -s "Codex Auth" -a "cli|{hash}" -w
// Account is derived from SHA256 of $CODEX_HOME path

// 2. Fallback to file
$CODEX_HOME/auth.json
```

### 6.4 Sync Behavior

```typescript
// From src/agents/auth-profiles/external-cli-sync.ts
function syncExternalCliCredentials(store: AuthProfileStore): boolean {
  let mutated = false;
  const now = Date.now();

  // Sync from Qwen Code CLI
  const existingQwen = store.profiles[QWEN_CLI_PROFILE_ID];
  const shouldSyncQwen = !existingQwen || 
                         existingQwen.provider !== "qwen-portal" || 
                         !isExternalProfileFresh(existingQwen, now);
  
  if (shouldSyncQwen) {
    const qwenCreds = readQwenCliCredentialsCached({ ttlMs: 15 * 60 * 1000 });
    if (qwenCreds && shouldUpdate) {
      store.profiles[QWEN_CLI_PROFILE_ID] = qwenCreds;
      mutated = true;
    }
  }

  // Similar for MiniMax CLI...
  
  return mutated;
}
```

### 6.5 Sync Timing

- Sync runs on every `ensureAuthProfileStore()` call
- 15-minute TTL cache prevents excessive reads
- Tokens refreshed if within 10 minutes of expiry
- OAuth credentials preferred over token-only
- Changes written back to store after sync

---

## 7. OAuth Token Refresh

### 7.1 Locked Refresh Flow

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
5. Sync back to Claude CLI if profile is `anthropic:claude-cli`
6. Release lock

### 7.2 Providers with Refresh Support

- Anthropic (via `@mariozechner/pi-ai`)
- GitHub Copilot
- Google Gemini CLI / Antigravity
- Qwen Portal
- MiniMax Portal
- Chutes (custom)

### 7.3 Lock Options

```typescript
const AUTH_STORE_LOCK_OPTIONS = {
  stale: 30000,           // 30s stale timeout
  retries: {
    retries: 5,
    minTimeout: 100,
    maxTimeout: 1000,
  },
};
```

---

## 8. Profile Order & Rotation

### 8.1 Order Resolution

```typescript
function resolveAuthProfileOrder(params: {
  cfg?: OpenClawConfig;
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

### 8.2 Example Order Resolution

```yaml
# Config
auth:
  order:
    anthropic:
      - anthropic:work
      - anthropic:personal

# Store order (lower priority)
{
  "order": {
    "anthropic": ["anthropic:claude-cli", "anthropic:manual"]
  }
}
```

Config order takes precedence, resulting in: `[work, personal, claude-cli, manual]`

---

## 9. Usage Stats & Cooldowns

### 9.1 Usage Stats Schema

```typescript
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

### 9.2 Cooldown System

When a profile fails, it enters cooldown:

| Failure Reason | Initial Cooldown | Max Cooldown |
|----------------|------------------|--------------|
| `billing` | 5 hours | 24 hours |
| `rate_limit` | Per-provider | varies |
| `auth` | 1 hour | 12 hours |
| Other | 5 minutes | 1 hour |

Cooldowns use exponential backoff based on `errorCount`.

### 9.3 Profile Selection with Cooldowns

```typescript
function selectAvailableProfile(profiles: string[], stats: Record<string, ProfileUsageStats>): string | null {
  const now = Date.now();
  
  for (const profileId of profiles) {
    const stat = stats[profileId];
    
    // Skip if in cooldown
    if (stat?.cooldownUntil && stat.cooldownUntil > now) continue;
    
    // Skip if disabled
    if (stat?.disabledUntil && stat.disabledUntil > now) continue;
    
    return profileId;
  }
  
  return null;  // All profiles in cooldown
}
```

---

## 10. Environment Variable Fallbacks

When no profile matches, OpenClaw checks env vars:

| Provider | Environment Variable(s) |
|----------|------------------------|
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

### Resolution Order

1. Try profiles in order (respecting cooldowns)
2. Fall back to environment variables
3. Return null if nothing available

---

## 11. Per-Agent Inheritance

### 11.1 Inheritance Flow

```typescript
// When loading auth for a subagent
function loadAuthProfileStoreForAgent(agentDir?: string): AuthProfileStore {
  const authPath = resolveAuthStorePath(agentDir);
  const raw = loadJsonFile(authPath);
  
  // If subagent has its own store, use it
  if (coerceAuthStore(raw)) {
    return syncExternalCliCredentials(raw);
  }
  
  // Otherwise, inherit from main agent
  if (agentDir) {
    const mainStore = loadAuthProfileStoreForAgent(undefined);
    if (Object.keys(mainStore.profiles).length > 0) {
      // Clone main store to subagent directory
      saveJsonFile(authPath, mainStore);
      return mainStore;
    }
  }
  
  return { version: 1, profiles: {} };
}
```

### 11.2 Merged Resolution

```typescript
function ensureAuthProfileStore(agentDir?: string): AuthProfileStore {
  const store = loadAuthProfileStoreForAgent(agentDir);
  
  // Always merge with main store
  if (agentDir) {
    const mainStore = loadAuthProfileStoreForAgent(undefined);
    return mergeAuthProfileStores(mainStore, store);
  }
  
  return store;
}
```

**Merge behavior:** Subagent profiles override main profiles with same ID.

---

## 12. CLI Commands

### 12.1 Via `openclaw models auth`

| Command | Description |
|---------|-------------|
| `login` | Interactive provider login |
| `setup-token` | Run `claude setup-token` and import |
| `paste-token` | Paste a token directly |
| `add` | Interactive add new profile |

### 12.2 Login Flow

```bash
openclaw models auth login --provider anthropic
```

1. Lists available provider plugins
2. User selects provider and auth method
3. Runs provider-specific auth flow (OAuth, API key paste, etc.)
4. Stores credential via `upsertAuthProfile()`
5. Updates config with `auth.profiles` entry

### 12.3 Profile Management

```bash
# List all profiles
openclaw models auth list

# Add a new profile
openclaw models auth add --provider openai --key sk-...

# Remove a profile
openclaw models auth remove --profile openai:default

# Test a profile
openclaw models auth test --profile anthropic:claude-cli
```

---

## 13. Type Definitions

### Core Types

```typescript
// Union of all credential types
type AuthProfileCredential = ApiKeyCredential | TokenCredential | OAuthCredential;

// API Key
type ApiKeyCredential = {
  type: "api_key";
  provider: string;
  key?: string;
  email?: string;
  metadata?: Record<string, string>;
};

// Token (static, not refreshable)
type TokenCredential = {
  type: "token";
  provider: string;
  token: string;
  expires?: number;
  email?: string;
};

// OAuth (refreshable)
type OAuthCredential = {
  type: "oauth";
  provider: string;
  access: string;
  refresh: string;
  expires: number;
  clientId?: string;
  email?: string;
  enterpriseUrl?: string;
  projectId?: string;
  accountId?: string;
};

// Store structure
type AuthProfileStore = {
  version: number;
  profiles: Record<string, AuthProfileCredential>;
  order?: Record<string, string[]>;
  lastGood?: Record<string, string>;
  usageStats?: Record<string, ProfileUsageStats>;
};

// Usage tracking
type ProfileUsageStats = {
  lastUsed?: number;
  cooldownUntil?: number;
  disabledUntil?: number;
  disabledReason?: AuthProfileFailureReason;
  errorCount?: number;
  failureCounts?: Partial<Record<AuthProfileFailureReason, number>>;
  lastFailureAt?: number;
};

type AuthProfileFailureReason = 
  | "auth" | "format" | "rate_limit" | "billing" | "timeout" | "unknown";
```

---

## 14. Source Files Reference

| File | Purpose |
|------|---------|
| `src/agents/auth-profiles/types.ts` | TypeScript type definitions |
| `src/agents/auth-profiles/store.ts` | Load/save/merge store operations |
| `src/agents/auth-profiles/paths.ts` | Path resolution |
| `src/agents/auth-profiles/constants.ts` | Profile IDs, timing constants |
| `src/agents/auth-profiles/oauth.ts` | OAuth resolution/refresh |
| `src/agents/auth-profiles/external-cli-sync.ts` | External CLI credential sync |
| `src/agents/auth-profiles/order.ts` | Profile order resolution |
| `src/agents/auth-profiles/profiles.ts` | Profile CRUD operations |
| `src/agents/auth-profiles/usage.ts` | Usage tracking, cooldowns |
| `src/agents/auth-profiles/display.ts` | CLI display formatting |
| `src/agents/auth-profiles/doctor.ts` | Health check/diagnostics |
| `src/agents/auth-profiles/repair.ts` | Profile ID migration/repair |
| `src/agents/cli-credentials.ts` | External CLI reading |
| `src/agents/model-auth.ts` | Provider auth resolution |
| `src/config/types.auth.ts` | Config auth types |
| `src/config/paths.ts` | State/OAuth directory paths |

---

## 15. Nexus Considerations

### What OpenClaw Does Well

1. **Auto-sync from external CLIs** — Convenient for onboarding
2. **Profile rotation with cooldowns** — Graceful handling of rate limits
3. **Per-agent inheritance** — Clean subagent credential sharing
4. **Usage stats tracking** — Good observability
5. **Locked refresh flow** — Race condition protection

### What Nexus Must Diverge On

#### 1. Pointer Architecture (Critical)

OpenClaw stores raw secrets. Nexus stores pointers:

```json
// OpenClaw (insecure)
{
  "type": "api_key",
  "key": "sk-proj-abc123..."
}

// Nexus (secure)
{
  "type": "api_key",
  "storage": "keychain",
  "path": "nexus/openai/default"
}
```

#### 2. Hierarchical Structure

Nexus uses `{service}/accounts/{account}/auth/{authId}`:

```
~/.nexus/state/credentials/
├── index.json                    # Fast lookup
├── anthropic/
│   └── accounts/
│       └── claude-cli/
│           └── auth/
│               └── oauth.json    # Pointer, not raw secret
└── openai/
    └── accounts/
        └── default/
            └── auth/
                └── api-key.json
```

#### 3. Storage Backend Flexibility

Nexus supports multiple secure backends:

| Backend | Description |
|---------|-------------|
| `keychain` | macOS Keychain |
| `1password` | 1Password via `op` CLI |
| `env` | Environment variable |
| `command` | External command execution |
| `gog` | GOG-managed Google OAuth |

#### 4. Policy-Based Access Control

Nexus credentials have ownership and access policies:

```json
{
  "owner": "user",
  "access": {
    "agents": ["atlas"],
    "channels": ["discord:general"],
    "scopes": ["read", "write"]
  }
}
```

### Integration with Skills

Nexus credentials should integrate with skills:

```yaml
# SKILL.md
requires:
  credentials: [google-oauth]  # Skill needs this credential type
```

The CLI can verify credentials before marking skills as ready:

```bash
nexus credential verify google-oauth
# ✓ google-oauth: valid (expires in 7d)
```

### Recommended Nexus Implementation

1. **Keep profile rotation** — Adopt OpenClaw's order/cooldown system
2. **Keep auto-sync** — But store pointers after import, not raw secrets
3. **Keep locked refresh** — Critical for OAuth race conditions
4. **Add policies** — Per-credential access control
5. **Add verification** — `nexus credential verify` command
6. **Add deep scan** — Pattern detection for env var discovery

---

*This document captures the complete OpenClaw credentials system for reference in Nexus development.*
