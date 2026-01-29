# Nexus vs Legacy Differences

This document captures *stable* differences between Nexus and upstream
legacy that affect porting decisions.

Update this file whenever you discover a recurring difference that should
inform future ports.

---

## Branding

- User-facing branding should say **Nexus** (not Legacy).
- Package name is `@intent-systems/nexus`.

## Architecture

- Nexus has ODU (On-Device Unit) components in `src/control-plane/odu/`.
- Nexus has a richer skills system under `skills/`.
- Nexus has additional config shape in `nexus.json`.

## File/Folder Differences

- `docs/` includes Nexus-specific documentation and specs.
- Some CLI commands or config defaults differ from upstream.

---

## Native Commands (Chat Commands Registry)

**Status:** Foundation ported, platform integrations in progress.

### What's Ported

- `src/auto-reply/commands-registry.ts` - Core command registry with definitions for
  /help, /status, /restart, /activation, /send, /reset, /new, /think, /verbose,
  /elevated, /model, /queue
- `src/config/types.ts` - CommandsConfig type
- `src/config/zod-schema.ts` - CommandsSchema with `native`, `text`, `config`, `debug`,
  `restart`, `useAccessGroups` options
- `src/telegram/bot.ts` - Full native commands support via setMyCommands API

### What Needs Work

- **Discord:** Upstream migrated from discord.js to @buape/carbon for slash commands.
  Nexus still uses discord.js. The imports and config flags are added, but slash
  command registration needs implementation with discord.js slash command builders.
- **Slack:** Config flags added. Full slash command integration pending.

### Config

```yaml
commands:
  native: true | false | "auto"  # Enable native command registration
  text: true | false             # Enable text command parsing (default: true)
  useAccessGroups: true | false  # Enforce access-group allowlists
```

---

## Known Porting Hazards

- `package.json`: do not overwrite name, bin, or release settings.
- `README.md`: avoid upstream branding regression.
- `src/config/*`: includes Nexus-specific schema and defaults.

