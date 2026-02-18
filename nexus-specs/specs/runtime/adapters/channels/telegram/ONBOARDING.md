# Telegram Adapter Onboarding (Credentials + Config)

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-17  
**Related:** `../../ADAPTER_CREDENTIALS.md`, `../../ADAPTER_SYSTEM.md`, `../../OUTBOUND_TARGETING.md`, `CHANNEL_SPEC.md`

---

## Goal

Bring up a Telegram adapter account in a way that:

- uses the Nexus credential system (Keychain pointer preferred on macOS)
- keeps secrets out of config and argv
- defaults to safe IAM behavior (owner DMs allowed, groups denied unless explicitly allowed)
- preserves structured delivery fields (`peer_kind`, `peer_id`, `thread_id`, `reply_to_id`)

---

## Prerequisites (Telegram Side)

1. Create a Telegram bot via BotFather.
2. Obtain the bot token.
3. Add the bot to any groups you want it to operate in (optional).

---

## Step 1: Add Credential (Credentials-First)

Create a credential entry under:

`~/nexus/state/credentials/telegram/<account>.json`

Example (token stored in Keychain):

```json
{
  "service": "telegram",
  "account": "personal-bot",
  "owners": ["user"],
  "credentials": [
    {
      "id": "token",
      "kind": "token",
      "storage": {
        "provider": "keychain",
        "service": "nexus.telegram",
        "account": "personal-bot"
      },
      "configuredAt": "2026-02-17T00:00:00.000Z"
    }
  ],
  "configuredAt": "2026-02-17T00:00:00.000Z"
}
```

---

## Step 2: Register Adapter Binary

Register the adapter command with NEX:

```bash
nexus adapter register --name telegram --command "<telegram-adapter-command>"
```

The adapter’s `info` should declare:

- `channel = "telegram"`
- `credential_service = "telegram"`
- `multi_account = true` (optional, but recommended)
- `supports` includes `monitor` and `send` (and optionally `stream`)

---

## Step 3: Link + Enable Account

Link the adapter account to the credential ref:

- account id: `personal-bot`
- credential ref: `telegram/personal-bot`

Then enable monitoring:

```bash
nexus adapter account add telegram/personal-bot --credential telegram/personal-bot
nexus adapter enable telegram/personal-bot --monitor
```

NEX injects secrets via `NEXUS_ADAPTER_CONTEXT_PATH` (see `ADAPTER_CREDENTIALS.md`).

---

## Polling vs Webhook (Config Decision)

Telegram supports both polling and webhook delivery.

Recommended default for local-first deployments:

- **Polling** (simpler, no inbound public URL requirement)

Webhook mode is useful when:

- adapter is deployed publicly
- you want lower latency and fewer polling cycles

If webhook mode is used, the adapter is responsible for running its HTTP server; NEX treats it as an external process per `ADAPTER_SYSTEM.md`.

---

## Threading + Replies (Forum Topics)

Telegram must preserve:

- `delivery.peer_id` = chat id
- `delivery.thread_id` = `message_thread_id` when the chat is a forum supergroup topic
- `delivery.reply_to_id` = `reply_to_message_id` when applicable

Outbound adapter must accept `--thread` and `--reply-to` and translate them to Telegram API fields (`message_thread_id`, `reply_to_message_id`). See `OUTBOUND_TARGETING.md`.

