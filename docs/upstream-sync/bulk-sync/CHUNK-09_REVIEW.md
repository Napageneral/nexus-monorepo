## CHUNK-09: Channel Core

### Summary
Upstream substantially expands channel core: new docking metadata, plugin architecture, allowlist/gating helpers, onboarding flows, status snapshots, and outbound tooling. Per Tyler, we should port upstream in full and only rename branding to Nexus.

### Status (2026-01-20)
**COMPLETE** — remaining diffs are intentional Nexus branding/namespace changes; no behavioral gaps identified.

### Key Changes
- New channel docking layer (`dock.ts`) with capabilities, allowlist formatting, threading defaults, and shared helpers.
- Channel registry with ordered metadata, aliases, and formatted selection/primer lines.
- Plugin architecture split into adapters/types/core, plus config helpers and catalog.
- Onboarding, pairing, status, and outbound modules per channel with extensive test coverage.
- Channel allowlist/config matching helpers and gating utilities.
- `web` channel entrypoint re-exports for web/WhatsApp helpers.

### Nexus Conflicts
- Branding strings and docs links (`legacy`, `legacy.bot`) in onboarding/status/CLI hints.
- Plugin catalog npm specs use `@legacy/*` packages.

### Recommendation
**TAKE_UPSTREAM + Rename**

### Adaptation Notes
- Rename all branding to Nexus (strings, docs links, CLI examples).
- Update plugin catalog npm specs to Nexus namespace and local extension paths.
- No compatibility shims; keep upstream channel behavior as canonical.

### Assumptions
- Docs base is `https://getnexus.sh` and website base is `https://getnexus.sh`.
