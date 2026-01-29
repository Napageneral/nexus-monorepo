## CHUNK-11: Discord

### Summary
Upstream refactors Discord monitoring and sending into a modular pipeline with allow-listing, message preflight/process stages, and richer send helpers. The changes are large but focused and should be safe to take as-is.

### Key Changes
- Monitor split into focused modules (`monitor/*`) with preflight/process handlers and reply delivery.
- New chunking helpers, gateway logging, typing/threading helpers, and expanded send flows.
- Accounts, audit logging, resolve helpers, and improved probe/target logic.
- Large new test suite covering mentions, status replies, threading, chunking, and send variants.

### Nexus Conflicts
- Minor `legacy` references in test data and sticker fixtures.
- Any user-facing strings or action IDs should be Nexus-branded.

### Recommendation
**TAKE_UPSTREAM**

### Adaptation Notes
- Rename user-facing strings where they surface (fixtures, logs, prompts).
- Optional: update any `legacy_*` identifiers (e.g., sticker names) to match Nexus branding.

### Questions for Tyler
- None.
