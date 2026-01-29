# Credential System Specification

**Status:** SPEC IN PROGRESS  
**Last Updated:** 2026-01-27

---

## Overview

The Nexus credential system provides secure storage and retrieval of secrets with multiple backend support. 

**Core Principles:**
1. **No plaintext secrets** — Credential files are *pointers* to secure backends (Keychain, 1Password, env, external commands)
2. **Service-first hierarchy** — Service → Account → Credentials[]
3. **Flexible ownership** — Credentials can be owned by user, agents, or both
4. **Consumer-centric policies** — Access control at Gateway/agent level, not credential level
5. **Auto-sync** — External CLI credentials are imported automatically
6. **Opt-in rotation** — Profile rotation only for configured services (LLM APIs)

---

## 1. Directory Structure

```
~/nexus/state/credentials/
├── index.json                          # Fast lookup + rotation state
└── {service}/
    ├── _client.json                    # OAuth client config (if applicable)
    ├── {account}.json                  # Account with credentials[]
    └── ...
```

### Hierarchy

```
Service (primary key)
└── Account (secondary key)
    └── Credentials[] (array of credentials for this account)
```

| Level | Purpose | Examples |
|-------|---------|----------|
| **Service** | What provider/API | `google`, `anthropic`, `discord`, `github` |
| **Account** | Whose credentials | `tnapathy@gmail.com`, `echo-bot`, `work-api` |
| **Credentials** | Array of auth methods | OAuth, API key, token — same account can have multiple |

**Key insight:** One account can have multiple credentials (e.g., Google account with both OAuth and API key). These are NOT rotated — they serve different purposes. Rotation is opt-in for specific services like LLM APIs.

### Account Naming Conventions

| Source | Account Name | Notes |
|--------|--------------|-------|
| OAuth flow | Email address | Discovered from OAuth response |
| CLI import | Try to discover email | Call user info API if possible |
| CLI import (fallback) | `{source}-{date}` | e.g., `claude-cli-2026-01-27` |
| Manual entry | User-provided | Encourage email when applicable |
| Bot tokens | Bot identifier | e.g., `echo-bot`, `nexus-discord` |

---

## 2. Unified Credential Schema

Each account file contains an array of credentials. One account can have multiple auth methods.

### Account File Schema

```typescript
type AccountFile = {
  // === Identity ===
  service: string;           // Primary key
  account: string;           // Secondary key (email, username, bot-id)
  
  // === Ownership ===
  owners: string[];          // ["user"] or ["agent:echo"] or ["user", "agent:echo"]
  
  // === Credentials ===
  credentials: Credential[]; // Array of credentials for this account
  
  // === Metadata ===
  configuredAt: string;      // When account was first added
  lastUsed?: string;         // Last access to any credential
};

type Credential = {
  // === Identity within account ===
  id: string;                // Unique within account: "oauth", "api_key", "token", etc.
  
  // === The Secret ===
  kind: "api_key" | "token" | "oauth";
  storage: StoragePointer;   // Where the usable secret lives
  expiresAt?: number;        // When this secret expires (ms since epoch)
  
  // === OAuth-specific (only if kind: "oauth") ===
  oauth?: {
    refreshStorage?: StoragePointer;  // Where refresh token lives
    tokenEndpoint?: string;           // Where to POST for refresh
    scopes?: string[];                // What permissions were granted
    // clientId and clientSecret come from {service}/_client.json
  };
  
  // === Credential Metadata ===
  configuredAt: string;      // ISO timestamp
  lastVerified?: string;     // Last successful verification
  lastUsed?: string;         // Last access time
  lastError?: string | null; // Error message if broken
  
  // === Rotation Stats (only for rotatable services) ===
  stats?: {
    errorCount: number;
    cooldownUntil?: number;  // Don't use until this timestamp
    failureReasons?: Record<string, number>;  // "rate_limit": 2, "auth": 1
  };
};
```

### Storage Pointer Types

```typescript
type StoragePointer =
  | { provider: "keychain"; service: string; account: string }
  | { provider: "1password"; vault: string; item: string; field: string }
  | { provider: "env"; var: string }
  | { provider: "external"; command: string; format?: "json"; jsonPath?: string }
  | { provider: "gog"; account: string; format?: "json"; jsonPath?: string };
```

### Ownership Model

Credentials have an `owners` array:

| Value | Meaning |
|-------|---------|
| `"user"` | The human user owns this credential |
| `"agent:{id}"` | Specific agent owns this credential |

**Examples:**
- `["user"]` — User's personal credential
- `["agent:echo"]` — Echo agent's credential only
- `["user", "agent:echo"]` — Shared between user and Echo agent
- `["agent:echo", "agent:atlas"]` — Shared between two agents

---

## 3. Service-Level OAuth Client Config

For OAuth services (Google, Anthropic OAuth, etc.), client credentials are stored at the service level.

**File:** `{service}/_client.json`

```json
{
  "type": "oauth_client",
  "clientId": "xxxxx.apps.googleusercontent.com",
  "projectId": "nexus-oauth",
  "clientSecretStorage": {
    "provider": "keychain",
    "service": "nexus.google.client",
    "account": "client_secret"
  },
  "authUri": "https://accounts.google.com/o/oauth2/auth",
  "tokenUri": "https://oauth2.googleapis.com/token",
  "redirectUris": ["http://localhost:8080/callback"]
}
```

**Why separate?**
- Client credentials are per-app, not per-user
- Shared across all user accounts for that service
- Avoids duplication in every user credential file
- Can be omitted for services that don't need it (Anthropic API key doesn't need client config)

**Token refresh flow:**
1. Read user's `refreshStorage` pointer → get refresh token
2. Read `{service}/_client.json` → get clientId, resolve clientSecret
3. POST to `tokenEndpoint` with client_id + client_secret + refresh_token
4. Update user's `storage` pointer with new access token

---

## 4. Credential Examples

### API Key (Anthropic)

**File:** `anthropic/tnapathy@anthropic.com.json`

```json
{
  "service": "anthropic",
  "account": "tnapathy@anthropic.com",
  "owners": ["user"],
  "credentials": [
    {
      "id": "api_key",
      "kind": "api_key",
      "storage": {
        "provider": "keychain",
        "service": "nexus.anthropic",
        "account": "tnapathy@anthropic.com"
      },
      "configuredAt": "2026-01-18T19:40:40.564Z",
      "lastVerified": "2026-01-26T10:00:00.000Z"
    }
  ],
  "configuredAt": "2026-01-18T19:40:40.564Z"
}
```

### Bearer Token (Discord Bot)

**File:** `discord/echo-bot.json`

```json
{
  "service": "discord",
  "account": "echo-bot",
  "owners": ["user", "agent:echo"],
  "credentials": [
    {
      "id": "token",
      "kind": "token",
      "storage": {
        "provider": "keychain",
        "service": "nexus.discord",
        "account": "echo-bot"
      },
      "configuredAt": "2026-01-18T22:40:18.825Z"
    }
  ],
  "configuredAt": "2026-01-18T22:40:18.825Z"
}
```

### Google Account with Multiple Credentials (OAuth + API Key)

**File:** `google/_client.json`

```json
{
  "type": "oauth_client",
  "clientId": "xxxxx.apps.googleusercontent.com",
  "projectId": "nexus-oauth",
  "clientSecretStorage": {
    "provider": "keychain",
    "service": "nexus.google.client",
    "account": "client_secret"
  },
  "tokenUri": "https://oauth2.googleapis.com/token"
}
```

**Note:** The `_client.json` filename is arbitrary — Google doesn't require a specific name. This is just where Nexus stores the OAuth client config. The important content is the client_id and client_secret.

**File:** `google/tnapathy@gmail.com.json`

```json
{
  "service": "google",
  "account": "tnapathy@gmail.com",
  "owners": ["user"],
  "credentials": [
    {
      "id": "oauth",
      "kind": "oauth",
      "storage": {
        "provider": "gog",
        "account": "tnapathy@gmail.com",
        "format": "json",
        "jsonPath": "access_token"
      },
      "expiresAt": 1737901200000,
      "oauth": {
        "refreshStorage": {
          "provider": "gog",
          "account": "tnapathy@gmail.com",
          "format": "json",
          "jsonPath": "refresh_token"
        },
        "scopes": ["calendar", "gmail", "drive", "contacts"]
      },
      "configuredAt": "2026-01-18T21:30:00.000Z",
      "lastVerified": "2026-01-26T10:00:00.000Z"
    },
    {
      "id": "api_key",
      "kind": "api_key",
      "storage": {
        "provider": "keychain",
        "service": "nexus.google.api",
        "account": "tnapathy@gmail.com"
      },
      "configuredAt": "2026-01-20T10:00:00.000Z"
    }
  ],
  "configuredAt": "2026-01-18T21:30:00.000Z"
}
```

**Reference format:** `google/tnapathy@gmail.com/oauth` or `google/tnapathy@gmail.com/api_key`

### OAuth (Claude CLI Import)

**File:** `anthropic/tnapathy@anthropic.com.json` (after import discovers email)

```json
{
  "service": "anthropic",
  "account": "tnapathy@anthropic.com",
  "owners": ["user"],
  "credentials": [
    {
      "id": "claude-cli",
      "kind": "oauth",
      "storage": {
        "provider": "external",
        "command": "security find-generic-password -s 'Claude Code-credentials' -w",
        "format": "json",
        "jsonPath": "claudeAiOauth.accessToken"
      },
      "expiresAt": 1737901200000,
      "oauth": {
        "refreshStorage": {
          "provider": "external",
          "command": "security find-generic-password -s 'Claude Code-credentials' -w",
          "format": "json",
          "jsonPath": "claudeAiOauth.refreshToken"
        },
        "tokenEndpoint": "https://console.anthropic.com/oauth/token"
      },
      "configuredAt": "2026-01-20T10:00:00.000Z",
      "stats": {
        "errorCount": 0
      }
    }
  ],
  "configuredAt": "2026-01-20T10:00:00.000Z"
}
```

---

## 5. Index File

The index provides fast lookup and tracks rotation state across all credentials.

**File:** `index.json`

```typescript
type CredentialIndex = {
  version: number;                              // Schema version
  lastUpdated: string;                          // ISO timestamp
  lastExternalSync?: string;                    // Last CLI sync timestamp
  
  services: Record<string, {
    hasClient?: boolean;                        // Has _client.json
    accounts: Array<{
      id: string;                               // Account identifier
      owners: string[];                         // Ownership array
      kind: "api_key" | "token" | "oauth";      // Credential type
      status: "active" | "ready" | "broken" | "cooldown";
      expiresAt?: number;                       // Token expiration
      lastUsed?: string;                        // ISO timestamp
      lastError?: string | null;
    }>;
  }>;
  
  // Rotation state
  order: Record<string, string[]>;              // Preferred order per service
  lastGood: Record<string, string>;             // Last working credential per service
  
  usageStats: Record<string, {                  // Key: "service:account"
    lastUsed?: number;                          // Unix timestamp
    errorCount: number;
    cooldownUntil?: number;
    failureReasons?: Record<string, number>;
  }>;
};
```

### Status Values

| Status | Meaning | Action |
|--------|---------|--------|
| `ready` | Configured but never used | Try it |
| `active` | Working, has been used | Use it |
| `broken` | Failed verification or recent errors | Skip, needs attention |
| `cooldown` | Temporarily disabled (rate limit, etc.) | Wait until `cooldownUntil` |

---

## 6. Access Control (Consumer-Centric Policies)

Access control is defined at the **consumer level** (Gateway, agents), not at the credential level. This is more intuitive — you configure what each consumer can access, not what each credential allows.

### Policy Location

Policies live in the consumer's config, not in the credentials directory:

```
state/nexus/config.json                    # Gateway access config
state/agents/{agent}/config.json           # Per-agent access config (if needed)
```

### Security Levels

#### Level 0: Trust Everything (Not Recommended)

- No restrictions, everything accessible
- Simple but insecure
- Use only for development/testing

#### Level 1: Opt-Out (Default Recommended)

Gateway can access all `user`-owned credentials by default. User can explicitly block sensitive credentials.

**Config:**
```json
{
  "gateway": {
    "credentials": {
      "level": 1,
      "blocked": [
        "google/tnapathy@gmail.com",
        "github/tnapathy"
      ]
    }
  }
}
```

**CLI:**
```bash
nexus gateway block google/tnapathy@gmail.com
nexus gateway unblock google/tnapathy@gmail.com
```

**Agent assistance:** Agent can suggest which credentials should be blocked based on sensitivity (email, code repos, etc.).

#### Level 2: Opt-In (Higher Security)

Gateway cannot access ANY credentials by default. Must explicitly allow each one.

**Config:**
```json
{
  "gateway": {
    "credentials": {
      "level": 2,
      "allowed": [
        "discord/echo-bot",
        "anthropic/*",
        "openai/*"
      ]
    }
  }
}
```

**CLI:**
```bash
nexus config set gateway.credentials.level 2
nexus gateway allow discord/echo-bot
nexus gateway allow "anthropic/*"   # Wildcard for all anthropic accounts
```

#### Level 3: Scoped Access (Fine-Grained)

Credentials can have scope restrictions — only usable for specific purposes.

**Config:**
```json
{
  "gateway": {
    "credentials": {
      "level": 3,
      "allowed": ["discord/echo-bot", "anthropic/*"],
      "scopes": {
        "discord/echo-bot": ["provider:discord"],
        "anthropic/*": ["provider:*", "agent:*"]
      }
    }
  }
}
```

**Scope format:** `{type}:{value}` where type is `provider`, `agent`, `channel`, etc.

#### Level 4: Agent-Specific (Multi-Agent)

Different agents have different access levels. Each agent has its own credential access config.

**Gateway config (default for all):**
```json
{
  "gateway": {
    "credentials": {
      "level": 1,
      "blocked": ["google/*"]
    }
  }
}
```

**Agent-specific override:**
```json
// state/agents/echo/config.json
{
  "credentials": {
    "level": 2,
    "allowed": ["discord/echo-bot", "anthropic/*"]
  }
}
```

**CLI:**
```bash
nexus agent echo credentials allow discord/echo-bot
nexus agent echo credentials block google/tnapathy@gmail.com
```

### Policy Summary

| Level | Default | Security | Setup Required |
|-------|---------|----------|----------------|
| **0: Trust All** | Allow all | Low | None |
| **1: Opt-Out** | Allow, can block | Medium | Block sensitive |
| **2: Opt-In** | Deny, must allow | High | Allow each |
| **3: Scoped** | Deny + scope check | Very high | Allow + define scopes |
| **4: Agent-Specific** | Per-agent rules | Maximum | Per-agent config |

### Policy Schema

```typescript
type CredentialAccessConfig = {
  level: 0 | 1 | 2 | 3;               // Security level
  
  // Level 1: blocked list (everything else allowed)
  blocked?: string[];                  // ["google/*", "github/work"]
  
  // Level 2+: allowed list (everything else denied)
  allowed?: string[];                  // ["discord/echo-bot", "anthropic/*"]
  
  // Level 3: scope restrictions
  scopes?: Record<string, string[]>;   // { "discord/echo-bot": ["provider:discord"] }
};

// Supports wildcards:
// "anthropic/*" - all accounts under anthropic
// "*/echo-bot" - echo-bot account under any service (unusual)
// "*/*" - everything (same as level 0)
```

### Resolution Flow

```
Gateway requests credential: "discord/echo-bot/token"
       │
       ▼
Check gateway.credentials.level
       │
       ├─ Level 0 → Allow
       │
       ├─ Level 1 → Check blocked list
       │     └─ In blocked? → Deny
       │     └─ Not in blocked? → Allow
       │
       ├─ Level 2 → Check allowed list
       │     └─ In allowed (or matches wildcard)? → Allow
       │     └─ Not in allowed? → Deny
       │
       └─ Level 3 → Check allowed + scopes
             └─ In allowed? → Check scope matches
             └─ Scope matches? → Allow
             └─ Otherwise → Deny
```

---

## 7. Auto-Sync from External CLIs

Nexus automatically imports credentials from external CLI tools.

### Sync Triggers

| Trigger | When |
|---------|------|
| `nexus status` | On every status check |
| Gateway startup | When daemon starts |
| `nexus credential sync` | Manual trigger |
| TTL expiry | 15 minutes since last sync |

### Supported Sources

#### Claude Code CLI

**Keychain:** `Claude Code-credentials`

**File fallback:** `~/.claude/.credentials.json`

**Import behavior:**
1. Read credential from source
2. Try to discover email (API call with token)
3. Create external storage pointer (not copy)
4. Account name: email if discovered, else `claude-cli-{date}`

#### Codex CLI

**Keychain:** `Codex Auth` (account derived from SHA256 of `$CODEX_HOME`)

**File fallback:** `$CODEX_HOME/auth.json`

#### Qwen CLI

**File:** `~/.qwen/oauth_creds.json`

### Sync Algorithm

```typescript
async function syncExternalCLIs(): Promise<void> {
  const lastSync = index.lastExternalSync;
  const ttl = 15 * 60 * 1000; // 15 minutes
  
  if (lastSync && Date.now() - new Date(lastSync).getTime() < ttl) {
    return; // Cache still valid
  }
  
  // Claude CLI
  const claudeCreds = await importFromClaudeCli();
  if (claudeCreds) {
    await upsertCredential(claudeCreds);
  }
  
  // Codex CLI
  const codexCreds = await importFromCodexCli();
  if (codexCreds) {
    await upsertCredential(codexCreds);
  }
  
  // Qwen CLI
  const qwenCreds = await importFromQwenCli();
  if (qwenCreds) {
    await upsertCredential(qwenCreds);
  }
  
  index.lastExternalSync = new Date().toISOString();
  await saveIndex();
}
```

---

## 8. Profile Rotation & Cooldowns (Opt-In)

Rotation is **opt-in per service**. It makes sense for LLM APIs where you have multiple API keys or CLI imports. It does NOT make sense for services like Google where different accounts mean different data.

### Rotatable Services

Configure which services support rotation:

```json
{
  "credentials": {
    "rotation": {
      "enabled": ["anthropic", "openai", "gemini", "openrouter"],
      "disabled": ["google", "discord", "github"]
    }
  }
}
```

**Default rotatable:** LLM API providers (anthropic, openai, gemini, groq, etc.)

**Default non-rotatable:** Everything else

### Rotation Flow (When Enabled)

```
Request credential for service "anthropic" (rotatable)
       │
       ▼
Get ordered list of accounts: ["tnapathy@anthropic.com", "work-api"]
       │
       ▼
For each account in order:
  ├─ Get credentials[] for account
  ├─ For each credential in account:
  │   ├─ Check cooldownUntil — skip if in cooldown
  │   ├─ Check status — skip if broken
  │   ├─ Try to use credential
  │   │   ├─ Success → update lastGood, return
  │   │   └─ Failure → increment errorCount, maybe cooldown, try next
       │
       ▼
All failed → return error
```

### Non-Rotatable Services

For non-rotatable services (like Google), you must specify which account:

```typescript
// This works (explicit account)
resolveCredential({ service: "google", account: "tnapathy@gmail.com" });

// This fails (no default rotation for Google)
resolveCredential({ service: "google" });  // Error: must specify account
```

### Cooldown Rules

| Failure Reason | Initial Cooldown | Max Cooldown |
|----------------|------------------|--------------|
| `rate_limit` | 1 minute | 1 hour |
| `billing` | 5 hours | 24 hours |
| `auth` | 10 minutes | 2 hours |
| `timeout` | 30 seconds | 5 minutes |
| `unknown` | 1 minute | 30 minutes |

Cooldowns use exponential backoff based on `errorCount`.

### Order Resolution (Rotatable Services)

Priority for credential selection:

1. Explicit `account` parameter (if provided)
2. `lastGood[service]` — what worked last time
3. `order[service]` — configured preference order
4. All accounts for service, sorted by `lastUsed` (most recent first)

---

## 9. OAuth Token Refresh

For OAuth credentials, the system handles automatic token refresh.

### Refresh Flow

```
Access token expired (expiresAt < now)
       │
       ▼
Acquire file lock on credential file
       │
       ▼
Re-read credential (race condition protection)
       │
       ▼
Still expired?
  ├─ No → release lock, return current token
  └─ Yes → continue
       │
       ▼
Read _client.json for service
       │
       ▼
Resolve refresh token from refreshStorage
       │
       ▼
POST to tokenEndpoint:
  client_id + client_secret + refresh_token
       │
       ▼
Update credential:
  - New access token in storage
  - New expiresAt
  - Clear lastError
       │
       ▼
Release lock, return new token
```

### Refresh with External Storage

For credentials stored in external CLIs (like Claude CLI), we don't write back — the external CLI manages its own refresh. We just re-read the external source.

---

## 10. Skills Integration

Credentials link to skills via the service name.

### The Linking Model

```
Skill (gog)
  capabilities: [email, calendar]
  requires.credentials: [google]   ← Service name
         │
         ▼
Credential Store
  google/tnapathy@gmail.com.json   ← Matches service
         │
         ▼
If missing, find connector
  google-oauth                     ← capabilities: [google]
```

### Status Detection

```typescript
function getSkillStatus(skill: Skill): SkillStatus {
  const meta = skill.metadata?.nexus;
  
  // Check credentials
  const requiredServices = meta?.requires?.credentials ?? [];
  for (const service of requiredServices) {
    const creds = getCredentialsForService(service);
    if (creds.length === 0) {
      return { status: "needs-setup", missing: { credentials: [service] } };
    }
    if (creds.every(c => c.status === "broken")) {
      return { status: "broken", reason: "all credentials broken" };
    }
  }
  
  // Has been used?
  if (hasUsage(skill.name)) {
    return { status: "active" };
  }
  
  return { status: "ready" };
}
```

---

## 11. Environment Variable Scanning

The `nexus credential scan` command discovers credentials in environment variables, with an optional deep scan for comprehensive detection.

### Known Environment Variables

Standard scan checks these predefined variables:

```typescript
const KNOWN_ENV_SPECS = [
  { env: "ANTHROPIC_API_KEY", service: "anthropic", type: "api_key" },
  { env: "OPENAI_API_KEY", service: "openai", type: "api_key" },
  { env: "GEMINI_API_KEY", service: "gemini", type: "api_key" },
  { env: "GOOGLE_API_KEY", service: "gemini", type: "api_key" },
  { env: "GOOGLE_GENERATIVE_AI_API_KEY", service: "gemini", type: "api_key" },
  { env: "BRAVE_API_KEY", service: "brave-search", type: "api_key" },
  { env: "GITHUB_TOKEN", service: "github", type: "token" },
  { env: "DISCORD_BOT_TOKEN", service: "discord", type: "token" },
  { env: "SLACK_BOT_TOKEN", service: "slack", type: "token" },
  { env: "FIRECRAWL_API_KEY", service: "firecrawl", type: "api_key" },
  { env: "APIFY_API_TOKEN", service: "apify", type: "token" },
  { env: "ELEVENLABS_API_KEY", service: "elevenlabs", type: "api_key" },
];
```

### Deep Scan

When `--deep` is enabled, scans ALL environment variables using multiple heuristics:

#### Name Pattern Matching

Variables with names matching this pattern are candidates:

```typescript
const namePattern = /(api[_-]?key|token|secret|password|auth|credential)/i;
```

#### Value Pattern Detection

Known token formats are detected by prefix:

| Pattern | Service | Type | Example |
|---------|---------|------|---------|
| `sk-ant-*` | anthropic | api_key | `sk-ant-abc123...` |
| `sk-*` | openai | api_key | `sk-xyz789...` |
| `xox[baprs]-*` | slack | token | `xoxb-123-456...` |
| `ghp_*`, `gho_*`, `github_pat_*` | github | token | `ghp_abc123...` |
| `AIza*` (20+ chars) | gemini | api_key | `AIzaSyAbc...` |
| 40+ alphanumeric | (unknown) | (unknown) | Generic detection |

#### Name-Based Service Hints

If value pattern doesn't identify service, the variable name is checked:

```typescript
const hints = [
  { key: "anthropic", service: "anthropic" },
  { key: "openai", service: "openai" },
  { key: "gemini", service: "gemini" },
  { key: "google", service: "gemini" },
  { key: "brave", service: "brave-search" },
  { key: "github", service: "github" },
  { key: "discord", service: "discord" },
  { key: "slack", service: "slack" },
  // ... etc
];
```

#### Filtering

- **Minimum length:** 8 characters
- **Skip paths:** Values starting with `/`, `./`, `~/`, or containing `:/`, `\`
- **Skip known:** Variables already in KNOWN_ENV_SPECS

### Import Flow

When `--import` is used:

1. Combines known and discovered (if deep scan ran)
2. Filters to entries with identified `service` and `type`
3. Checks existing credentials to avoid duplicates
4. Creates credentials with:
   - **Account:** `env:{VAR_NAME}` (e.g., `env:MY_ANTHROPIC_KEY`)
   - **Storage:** `{ provider: "env", var: "{VAR_NAME}" }`

### Example Output

```
$ nexus credential scan --deep

Scanning environment variables...

Known variables:
  ✓ ANTHROPIC_API_KEY → anthropic (sk-ant...4x7f)
  ✓ GITHUB_TOKEN → github (ghp_ab...9xyz)

Not found:
  ○ OPENAI_API_KEY
  ○ DISCORD_BOT_TOKEN

Discovered (pattern match):
  ? MY_WORK_OPENAI_KEY → openai (sk-proj...abc) [pattern:sk, hint:openai]
  ? CUSTOM_AUTH_TOKEN → (unknown) (MjE4Nz...base64) [pattern:generic]

Run with --import to add discovered credentials.
```

---

## 12. CLI Commands

### Listing & Viewing

```bash
nexus credential list                    # All credentials
nexus credential list --service google   # Filter by service
nexus credential list --status broken    # Filter by status
nexus credential list --json

nexus credential get google/tnapathy@gmail.com           # Get value (default credential)
nexus credential get google/tnapathy@gmail.com/oauth     # Get specific credential
nexus credential get google/tnapathy@gmail.com --record  # Show record, not value
```

### Adding Credentials

```bash
# API key to Keychain
nexus credential add \
  --service anthropic \
  --account tnapathy@anthropic.com \
  --id api_key \
  --kind api_key \
  --value "sk-ant-..."

# From environment variable
nexus credential add \
  --service anthropic \
  --account env-default \
  --id api_key \
  --kind api_key \
  --storage env \
  --env-var ANTHROPIC_API_KEY

# From 1Password
nexus credential add \
  --service anthropic \
  --account work-api \
  --id api_key \
  --kind api_key \
  --storage 1password \
  --vault Work \
  --item "Anthropic API" \
  --field api_key
```

### Importing & Syncing

```bash
nexus credential import claude-cli       # Import from Claude CLI
nexus credential import codex-cli        # Import from Codex CLI
nexus credential sync                    # Force sync all external CLIs

nexus credential scan                    # Scan known env vars
nexus credential scan --deep             # Scan ALL env vars
nexus credential scan --deep --import    # Import discovered credentials
nexus credential scan --deep --yes       # Skip confirmation prompt
```

### Verification

```bash
nexus credential verify anthropic                        # Verify all anthropic credentials
nexus credential verify google/tnapathy@gmail.com        # Verify all credentials for account
nexus credential verify google/tnapathy@gmail.com/oauth  # Verify specific credential
```

### Gateway Access Control

Policy management is at the Gateway level, not credential level:

```bash
# View current access config
nexus gateway credentials

# Level 1: Block specific credentials (default allows all)
nexus gateway block google/tnapathy@gmail.com
nexus gateway block "github/*"           # Wildcard: all github accounts
nexus gateway unblock google/tnapathy@gmail.com

# Level 2: Switch to opt-in mode
nexus config set gateway.credentials.level 2
nexus gateway allow discord/echo-bot
nexus gateway allow "anthropic/*"

# Level 3: Add scope restrictions
nexus gateway allow discord/echo-bot --scope provider:discord
```

### Agent-Specific Access

```bash
# Configure access for specific agent
nexus agent echo credentials allow discord/echo-bot
nexus agent echo credentials block google/tnapathy@gmail.com
nexus agent echo credentials level 2     # Set agent to opt-in mode
```

### Rotation Management

```bash
nexus credential order anthropic         # View current order
nexus credential order anthropic --set "tnapathy@anthropic.com,work-api"

nexus credential cooldown                # View credentials in cooldown
nexus credential cooldown --clear anthropic/work-api  # Clear cooldown
```

### Maintenance

```bash
nexus credential flag anthropic/default --error "rate limited"  # Mark broken
nexus credential flag anthropic/default                         # Clear error

nexus credential remove anthropic/old-account
```

---

## 13. Configuration

### Config Keys

| Key | Default | Description |
|-----|---------|-------------|
| `gateway.credentials.level` | `1` | Access control level (0-3) |
| `gateway.credentials.blocked` | `[]` | Blocked credentials (level 1) |
| `gateway.credentials.allowed` | `[]` | Allowed credentials (level 2+) |
| `gateway.credentials.scopes` | `{}` | Scope restrictions (level 3) |
| `credentials.syncOnStatus` | `true` | Auto-sync on `nexus status` |
| `credentials.syncTtlMinutes` | `15` | TTL for external CLI sync |
| `credentials.defaultStorage` | `keychain` | Default storage provider |
| `credentials.rotation.enabled` | `["anthropic", "openai", ...]` | Services with rotation enabled |

### Example Config

```json
{
  "gateway": {
    "credentials": {
      "level": 1,
      "blocked": ["google/*", "github/*"]
    }
  },
  "credentials": {
    "syncOnStatus": true,
    "syncTtlMinutes": 15,
    "defaultStorage": "keychain",
    "rotation": {
      "enabled": ["anthropic", "openai", "gemini", "openrouter", "groq"]
    }
  }
}
```

---

## 14. Resolution Flow

Complete flow when code requests a credential:

```
resolveCredential({ service: "google", scope: "provider:google" })
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Get ordered credentials for service                          │
│    - Check lastGood, order, then lastUsed                       │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. For each credential:                                         │
│    a. Skip if in cooldown                                       │
│    b. Skip if status === "broken"                               │
│    c. Check policy (if Gateway request)                         │
│       - Level 1: blocked? → skip                                │
│       - Level 2+: allowed? → continue, else skip                │
│       - Level 3+: scope matches? → continue, else skip          │
│       - Level 4: agent allowed? → continue, else skip           │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Check expiration (OAuth)                                     │
│    - If expired, refresh token                                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Resolve secret from storage pointer                          │
│    - keychain → security find-generic-password                  │
│    - 1password → op read                                        │
│    - env → process.env[var]                                     │
│    - external → exec(command), parse JSON if needed             │
│    - gog → gog auth tokens export                               │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Return credential value                                      │
│    - Update lastUsed, lastGood                                  │
│    - Return { value, service, account }                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Summary

| Feature | Status |
|---------|--------|
| Pointer-based storage | ✅ Core principle — no plaintext secrets |
| Multiple storage backends | ✅ Keychain, 1Password, env, external, GOG |
| Unified credential schema | ✅ AccountFile with `credentials[]` array |
| Multiple credentials per account | ✅ OAuth + API key for same account |
| Service-level OAuth client | ✅ `_client.json` for shared config |
| Ownership model | ✅ `owners: string[]` array |
| Auto-sync from CLIs | ✅ Claude CLI, Codex CLI, Qwen CLI (TTL cached) |
| Env var scanning | ✅ Known vars + deep pattern detection |
| Opt-in rotation | ✅ Only for configured services (LLM APIs) |
| Cooldown management | ✅ Exponential backoff per failure type |
| Consumer-centric access control | ✅ Policies at Gateway/agent level |
| Access control levels | ✅ Levels 0-3, default Level 1 (opt-out) |
| Skills integration | ✅ Via service name linking |

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Credentials[] per account | Same account can have OAuth + API key |
| Policies at consumer level | More intuitive — configure what Gateway/agent can access |
| Opt-in rotation | Only LLM APIs need rotation; Google accounts are different data |
| External storage pointers | CLI imports stay fresh without copying secrets |
| Service as primary key | Links cleanly to skills `requires.credentials` |

---

## Source Files

| File | Purpose |
|------|---------|
| `src/credentials/store.ts` | Storage providers, credential CRUD |
| `src/credentials/index.ts` | Index management, rotation state |
| `src/credentials/access.ts` | Consumer-centric access control |
| `src/credentials/sync.ts` | External CLI auto-sync |
| `src/credentials/refresh.ts` | OAuth token refresh |
| `src/credentials/rotation.ts` | Profile rotation, cooldowns |
| `src/credentials/scan.ts` | Environment variable scanning |
| `src/commands/credential.ts` | High-level operations |
| `src/cli/credential-cli.ts` | CLI command registration |
| `src/gateway/credentials.ts` | Gateway credential resolution |
