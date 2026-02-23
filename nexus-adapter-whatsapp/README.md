# Nexus WhatsApp Adapter

External WhatsApp adapter binary for the NEX adapter manager.

## Commands

- `info`
- `monitor --account <id>`
- `send --account <id> --to <target> --text <text> [--reply-to <id>]`
- `health --account <id>`
- `accounts list`

## Build + Test

```bash
npm run build
npm test
```

## Runtime Requirements

This adapter requires `@whiskeysockets/baileys` from normal Node module resolution.

Auth state directory resolution order:

1. `runtime.config.auth_dir` / `runtime.config.authDir`
2. `NEXUS_WHATSAPP_AUTH_DIR`
3. `~/nexus/state/credentials/whatsapp/<account>`

## Target Format

Accepted `--to` examples:

- `whatsapp:+14155550123`
- `14155550123`
- `120363401234567890@g.us`
- `14155550123@s.whatsapp.net`

## Contract Smoke

`npm test` validates:

- adapter `info` payload
- strict v2 event shape normalization from Baileys message objects
- health behavior when auth session is missing
