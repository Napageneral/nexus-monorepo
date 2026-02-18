# Adapter Credentials (Linking + Injection)

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-17  
**Related:** `ADAPTER_SYSTEM.md`, `../../environment/capabilities/credentials/CREDENTIAL_SYSTEM.md`

---

## Overview

Adapters frequently require secrets (Discord bot tokens, Telegram bot tokens, OAuth access tokens, etc.).

This document defines:

1. How adapter accounts link to the Nexus credential store
2. How NEX injects resolved secrets into adapter processes safely
3. The recommended “credentials-first” onboarding flow

---

## Credential Store Is Canonical

All secrets are stored in the Nexus credential system as **pointers** (Keychain/env/1Password/etc.), not as plaintext in config files.

See: `CREDENTIAL_SYSTEM.md`.

Adapters are treated as trusted local executables, but secrets should still be:

- Kept out of argv (process list leakage)
- Kept out of stdout (protocol corruption + accidental logging)
- Logged only in redacted form

---

## Linking: `credential_service` + `credential_ref`

### `credential_service` (from adapter `info`)

If an adapter’s `info` includes:

```json
{ "credential_service": "discord" }
```

Then NEX can auto-discover credential accounts under:

`~/nexus/state/credentials/discord/*.json`

### `credential_ref` (per enabled adapter account)

Each enabled adapter account may optionally link a specific credential:

- `discord/echo-bot`
- `telegram/personal-bot`
- `google/tyler@gmail.com`

This reference:

- selects which credential account to resolve at runtime
- allows multi-account adapters to run multiple accounts concurrently

---

## Injection: How NEX Passes Secrets To Adapters

### Requirement

NEX MUST NOT pass secrets via argv flags.

### Recommended Mechanism: Runtime Context File

When spawning any adapter process (monitor/send/stream/etc.), NEX writes an ephemeral runtime context file and passes only the file path via environment:

- `NEXUS_ADAPTER_CONTEXT_PATH=/path/to/runtime-context.json`

The runtime context file contains:

- adapter channel + account id
- adapter-specific config (from `nex.yaml`)
- resolved credential values (plaintext, already dereferenced from pointers)

**Example:**

```json
{
  "channel": "discord",
  "account_id": "echo-bot",
  "config": {
    "dm_policy": "allow_owner_only",
    "guild_allowlist": ["1234567890"]
  },
  "credential": {
    "kind": "token",
    "value": "REDACTED"
  }
}
```

**Security notes:**

- File MUST be created `0600`.
- File SHOULD be stored under NEX-managed state and cleaned up on shutdown.
- Adapters MUST treat this file as sensitive and MUST NOT re-emit contents.

### Alternative (Allowed): Small Env Vars

For tiny secrets, NEX may inject via env vars (e.g. `DISCORD_TOKEN=...`). This is allowed but not preferred because:

- env vars are easier to leak via debug dumps
- env var naming is inconsistent across adapters

If used, the adapter MUST still accept `NEXUS_ADAPTER_CONTEXT_PATH` as the canonical mechanism (SDK standardization).

---

## Onboarding Flow (Credentials-First)

This is the recommended end-to-end UX:

1. **Add credentials** to the Nexus credential store (Keychain pointer preferred on macOS).
2. **Register adapter binary** with NEX (`nexus adapter register ...`).
3. **Create/link adapter account** to the credential ref (`credential_ref`).
4. **Enable account modes** (monitor/backfill/stream) and start.

Why this order:

- lets the user verify credentials independently
- makes adapter accounts deterministic and reproducible
- keeps secrets out of adapter-local config

---

## Channel Examples

### Discord

- Credential service: `discord`
- Credential kind: bearer `token`
- Account naming convention: bot identifier (e.g. `echo-bot`)

Typical flow:

1. Create a Discord bot token (Discord Developer Portal).
2. Store token in credential system (Keychain pointer).
3. Register adapter command.
4. Link account `discord/echo-bot` and enable.

See: `channels/discord/ONBOARDING.md`

### Telegram

- Credential service: `telegram`
- Credential kind: bearer `token`
- Account naming convention: bot identifier

Typical flow:

1. Create a Telegram bot token via BotFather.
2. Store token in credential system (Keychain pointer).
3. Register adapter command.
4. Link account and enable.

See: `channels/telegram/ONBOARDING.md`

