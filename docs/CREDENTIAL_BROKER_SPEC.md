## Credential Broker Spec (Gateway Access)

Status: Draft

### Problem

We want the gateway to access credentials (Discord tokens, etc.) without storing
secrets in config files, while keeping a clean user flow that works locally and
remotely. We also want to avoid interactive prompts (Keychain biometrics /
1Password UI) once a credential is approved for gateway use.

### Goals

- Keep config purely behavioral (no plaintext secrets).
- Store secrets in the credential store (keychain, 1Password, env pointers).
- Allow users to explicitly approve which credentials the gateway may access.
- Support non-interactive retrieval for approved credentials.
- Enable safe updates without manual edits (inject + restart provider).
- Provide auditability (who approved, when, where used).
 - Provide a deterministic storage waterfall (keychain first on macOS).

### Non-Goals

- Expose all environment variables to the gateway.
- Store secrets in `config.json`.
- Enable unrestricted secret access for agents.
- Require Keychain or 1Password UI prompts during normal operation.

### Current State (Baseline)

- Gateway reads config from `~/nexus/state/nexus/config.json`.
- Providers (Discord, Telegram, etc.) read tokens from env or config at startup.
- Config hot reload can restart providers when config changes.
- Credentials are stored under `~/nexus/state/credentials/*`.

### Proposed Architecture

**Credential Broker (local service or gateway module)**
- Owns access policy for secrets.
- Retrieves approved secrets from storage (keychain/1Password/env).
- Supplies secrets to the gateway on startup or provider restart.
- Exposes a local-only API (loopback or unix socket).

**Policy Store**
- A lightweight policy file per credential, e.g.:
  - `allow: true|false`
  - `scope: [provider:discord]`
  - `approvedBy`, `approvedAt`, `reason`
- The CLI writes this when the user approves gateway access.

**Injection Strategy**
- Gateway should never read secrets from config.
- Secrets should be injected at runtime by the broker.
- Provider restarts should re-fetch secrets from the broker.

**Config References**
- Replace inline tokens with credential IDs (e.g. `discord:echo-bot`).
- Gateway resolves credential IDs at runtime via the broker.
- Config stays behavioral; secrets never appear in config or logs.

### Secret Retrieval (Non-Interactive)

**Keychain**
- Grant access to the `nexus` binary for specific items (no prompts).
- Ensure the Keychain ACL allows background access (no Touch ID prompts).
- Store the pointer in credentials; broker resolves.

**1Password**
- Use service account tokens or 1Password Connect for headless access.
- Store service account token as a credential (not in config).

**Storage Waterfall (Write-Time Defaults)**
1. Keychain (macOS default)
2. 1Password (if configured)
3. External command (explicit)
4. Env pointer (dev-only, opt-in)

### User Flow

1. **Add credential**:
   - `nexus credential add ...`
   - Prompt: "Allow gateway access?" (yes/no/ask later)
2. **Approve gateway access**:
   - `nexus credential expose --service <svc> --account <acct>`
   - Writes policy + optional reason.
3. **Apply to gateway**:
   - Broker injects secret to gateway and restarts the relevant provider.
4. **Revoke access**:
   - `nexus credential revoke --service <svc> --account <acct>`
   - Broker removes secret and restarts provider (or gateway).

### Runtime Behavior

- Gateway never sees full env; only secrets explicitly approved.
- Secrets are fetched from broker on provider startup/restart.
- Config reload triggers provider restarts when settings change.
- Secret changes trigger provider restart (or gateway restart if required).

### Security + Auditing

- Broker only serves requests from the local gateway process.
- All approvals/revocations logged with timestamps.
- Optional notifications for secret usage in remote sessions.
- No secrets are written to config or logs.

### Open Questions

- Should the broker be a standalone daemon or embedded in the gateway?
- Do we need per-session approvals for some providers?
- How should remote agent requests be audited / approved?

