# Nexus Telegram Adapter

External Telegram adapter binary for the NEX adapter manager.

## Commands

- `info`
- `monitor --account <id>`
- `send --account <id> --to <target> --text <text> [--thread <id>] [--reply-to <id>]`
- `health --account <id>`
- `accounts list`

## Build + Test

```bash
npm install
npm run build
npm test
```

## Runtime Credentials

Credential resolution order:

1. `NEXUS_ADAPTER_CONTEXT_PATH` runtime credential (`credential.value`)
2. `TELEGRAM_BOT_TOKEN` env var

## Target Format

Accepted `--to` examples:

- `telegram:-1001234567890`
- `chat:@my_channel_or_user`
- `-1001234567890`

## Contract Smoke

`npm test` validates:

- adapter `info` payload
- strict v2 event shape normalization
- outbound thread/reply mapping for `send`
