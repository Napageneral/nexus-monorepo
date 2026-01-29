# Auth Profiles + Credential Storage Deep Dive

## Current Nexus (reference)
- Canonical credential store in `src/credentials/*`:
  - Records stored under `credentials/<service>/accounts/<account>/auth/<authId>.json`
  - Index in `credentials/index.json` with order/usage stats
  - Storage backends: `keychain`, `1password`, `env`, `external`, `gog`
  - Policy enforcement in `src/credentials/policy.ts`
  - Gateway resolution via `src/credentials/broker.ts`
- Auth profiles are a projection in `src/agents/auth-profiles.ts`:
  - Built from credential entries + index
  - Usage/order live in the credential index
  - `upsertAuthProfile()` writes env or keychain (mac) and updates index

## Upstream (legacy)
- Removes `src/credentials/*` entirely (store/broker/policy deleted).
- Canonical store becomes `auth-profiles.json` in agent dir:
  - `src/agents/auth-profiles/store.ts`
  - Auto-syncs external CLI creds on every load
  - Migrates legacy `auth.json`, merges `oauth.json`
  - Per-agent store with main-agent inheritance
- CLI credential sync:
  - `src/agents/cli-credentials.ts` reads:
    - Claude: `~/.claude/.credentials.json` + macOS keychain
    - Codex: `~/.codex/auth.json` + keychain "Codex Auth"
    - Qwen: `~/.qwen/oauth_creds.json`
  - `src/agents/auth-profiles/external-cli-sync.ts` syncs CLAUDE/CODEX/QWEN
  - TTL + near-expiry logic; avoids oauth -> token downgrade
- OAuth refresh:
  - `src/agents/auth-profiles/oauth.ts` refreshes tokens and writes back to Claude CLI
- Usage stats:
  - `disabledUntil`, `disabledReason`, `failureCounts`, etc.

## Key Gaps / Risks
- Loss of multi-backend storage pointers (env/keychain/1password/gog/external).
- Loss of credential policy/broker gating for gateway access.
- Secrets stored directly in `auth-profiles.json` instead of external providers.
- Auto-sync on load can overwrite or mask Nexus-managed sources.

## Best-of-Both Compatibility Plan (side-by-side)
1. Keep `src/credentials/*` as the canonical store and keep broker/policy.
2. Support **plain‑text storage** in the credential store (auth‑profiles.json compatibility):
   - Allow direct `key/token/access` values for records that opt in.
   - Keep pointer backends (keychain/1password/env/external/gog) as first‑class.
3. Keep `auth-profiles.json` as a compat layer:
   - Ingest on read, but do not make it the only canonical store.
   - Optionally mirror to compare side-by-side.
4. Unified resolver:
   - Sources: credential store, auth-profiles.json, CLI sync
   - Emit a merged view with `source` tags (credential-store vs auth-profiles vs cli)
   - Configurable precedence (prefer credential store by default).
5. Adopt upstream usage stats fields:
   - Store in credential index to keep round-robin + cooldown behavior.
6. CLI sync:
   - Read CLI creds -> upsert into credential store (external/keychain/env/plaintext)
   - Optional mirror into auth-profiles.json to compare behavior
7. Migration strategy:
   - Import existing auth-profiles.json into credential store once
   - Keep file for comparison until final decision

## Decisions (current)
- **Allow plaintext credentials** in the Nexus credential store for compatibility.
- **Retain pointer backends** (keychain/1password/env/external/gog) as the primary value add.
- **Support both views** (credential store + auth-profiles.json) side‑by‑side.
