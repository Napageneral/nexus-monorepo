## CHUNK-08: Browser Automation

### Summary
Upstream delivers a major browser automation upgrade: CDP helper extraction, executable discovery, extension relay driver, Playwright tool refactor, and new agent browser routes/tests. Per Tyler, we should take upstream wholesale and do a Nexus rename sweep only.

### Key Changes
- New CDP helper layer with auth header propagation, URL normalization, and fetch helpers.
- Browser executable detection expanded across macOS/Linux/Windows.
- Chrome extension relay server plus `extension` driver and fallback behaviors.
- Playwright tooling split into focused modules (downloads, interactions, responses, snapshot, state, storage, trace) and new role snapshots.
- Browser routes split into `agent.act`, `agent.snapshot`, `agent.storage`, `agent.debug` with extensive contract tests.
- Profile service updates: driver support, default profile logic, new timeouts, control token.

### Nexus Conflicts
- Branding strings (`legacy`, `legacy`) in logs, errors, data attributes, temp paths, and CLI hints.
- Config naming and env vars (`LegacyConfig`, `LEGACY_*`) and default profile name.

### Recommendation
**TAKE_UPSTREAM + Rename**

### Adaptation Notes
- Rename all branding to Nexus (strings, env vars, defaults, paths).
- No compatibility shims; keep upstream behavior as canonical.

### Assumptions
- Default browser profile is `nexus`, and any `legacy` identifiers are fully renamed.
