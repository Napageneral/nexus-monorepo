## CHUNK-10: Telegram

### Summary
Upstream restructures the Telegram integration into a modular pipeline with multi-account support, richer context/dispatch, audit logging, and new send/chunking behavior. The changes are broad but mostly self-contained and safe to adopt.

### Key Changes
- New account resolution and config merging (`accounts.ts`) with allow-from integration and debug hooks.
- Bot pipeline split into message context, dispatch, delivery, and native command handling; improved mention gating and reply routing.
- Audit logging, group/topic config handling, and richer inbound context (locations, replies, media).
- Send/draft rework with chunking/stream helpers and extensive test coverage.
- Polling runner tweaks (allowed updates, restart/backoff) and update-offset storage.

### Nexus Conflicts
- User-facing copy and examples include `legacy` branding (e.g., pairing messages, bot username).
- `LEGACY_STATE_DIR` and `LEGACY_DEBUG_TELEGRAM_ACCOUNTS` env usage appears in new helpers/tests.
- Temp path prefixes like `legacy-telegram-*` in tests.

### Recommendation
**TAKE_UPSTREAM**

### Adaptation Notes
- Replace all `legacy`/`LEGACY_*` strings with Nexus equivalents (pairing copy, env vars, temp dirs).
- Keep `NEXUS_STATE_DIR` semantics in state-dir helpers and tests.

### Questions for Tyler
- None.
