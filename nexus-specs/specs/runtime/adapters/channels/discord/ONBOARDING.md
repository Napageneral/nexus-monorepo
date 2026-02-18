# Discord Adapter Onboarding (Credentials + Config)

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-17  
**Related:** `../../ADAPTER_CREDENTIALS.md`, `../../ADAPTER_SYSTEM.md`, `../../OUTBOUND_TARGETING.md`, `CHANNEL_SPEC.md`

---

## Goal

Bring up a Discord adapter account in a way that:

- uses the Nexus credential system (Keychain pointer preferred on macOS)
- keeps secrets out of config and argv
- defaults to safe IAM behavior (owner DMs allowed, everything else denied/ask)
- preserves structured delivery fields (`peer_kind`, `peer_id`, `thread_id`, `reply_to_id`)

---

## Prerequisites (Discord Side)

1. Create a Discord application + bot in the Discord Developer Portal.
2. Enable required intents (at minimum message content for DM flows; guild message intents if you plan to read guild channels).
3. Invite the bot to the desired server(s) with required permissions.
4. Obtain the bot token.

---

## Step 1: Add Credential (Credentials-First)

Create a credential entry under:

`~/nexus/state/credentials/discord/<account>.json`

Example (token stored in Keychain):

```json
{
  "service": "discord",
  "account": "echo-bot",
  "owners": ["user"],
  "credentials": [
    {
      "id": "token",
      "kind": "token",
      "storage": {
        "provider": "keychain",
        "service": "nexus.discord",
        "account": "echo-bot"
      },
      "configuredAt": "2026-02-17T00:00:00.000Z"
    }
  ],
  "configuredAt": "2026-02-17T00:00:00.000Z"
}
```

**Verification:** NEX should provide a `nexus credential verify discord` or adapter health check that confirms the token can authenticate.

---

## Step 2: Register Adapter Binary

Register the adapter command with NEX:

```bash
nexus adapter register --name discord --command "<discord-adapter-command>"
```

The adapter’s `info` should declare:

- `channel = "discord"`
- `credential_service = "discord"`
- `multi_account = true`
- `supports` includes `monitor` and `send` (and optionally `stream`)

---

## Step 3: Link + Enable Account

Link the adapter account to the credential ref:

- account id: `echo-bot`
- credential ref: `discord/echo-bot`

Then enable monitor/backfill as desired:

```bash
nexus adapter account add discord/echo-bot --credential discord/echo-bot
nexus adapter enable discord/echo-bot --monitor
```

NEX will:

1. Resolve the credential pointer
2. Spawn `discord ... monitor --account echo-bot --format jsonl`
3. Inject secrets via `NEXUS_ADAPTER_CONTEXT_PATH` (see `ADAPTER_CREDENTIALS.md`)

---

## Step 4: Configure Safety Defaults (Recommended)

### IAM Defaults

Recommended default IAM stance for Discord:

- Allow owner DMs
- Deny all group/channel messages unless explicitly allowlisted

This policy should be expressed in IAM (not in adapter code).

### Adapter Config (Optional, Non-Authoritative)

Some Discord-specific knobs can be implemented as adapter-side pre-filtering for performance or cost reasons, but they MUST NOT be relied on for security or correctness.

The long-term design is:

- IAM decides `allow|deny|ask` (the security boundary).
- Manager/automations decide "respond vs observe" behavior (mention gating, noise handling).
- Adapter does I/O and normalization only.

If adapter-side filtering is added, NEX MUST still enforce the same policy in IAM, and the adapter filtering must be treated as a best-effort optimization that can be disabled without changing system behavior.

Examples of pre-filters (optional):

- `include_guild_ids`: only emit events for these guild ids
- `include_channel_ids`: only emit events for these channel ids
- `drop_unmentioned_in_guild_channels`: only emit guild-channel events where `mentions_bot = true`

If used, these settings live in `nex.yaml` under the adapter account config and are passed via runtime context injection.

For the policy mapping, see `POLICY_SURFACE.md`.

---

## Threading + Replies

Discord must preserve:

- `delivery.peer_id` = parent channel (or DM channel)
- `delivery.thread_id` = thread channel ID when applicable
- `delivery.reply_to_id` = message ID being replied to

Outbound adapter must accept `--thread` and `--reply-to` and translate them to Discord API fields (`message_reference`, thread channel routing). See `OUTBOUND_TARGETING.md`.
