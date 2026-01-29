## CHUNK-14: Control UI

### Summary
Upstream delivers a major UI overhaul: new chat layout and rendering pipeline, channel management views, and a new config-form renderer. This is a strong upgrade and should be taken wholesale with a branding pass.

### Status (2026-01-20)
**COMPLETE** — remaining diffs are intentional Nexus branding, plus removal of old `connections*` UI files that upstream no longer ships (replaced by `channels*` views).

### Key Changes
- Large CSS and layout refresh, including grouped chat rendering, tool cards, and sidebar refinements.
- New channel views and controllers, plus expanded navigation and view state handling.
- New config form renderer (analyze/render/node/shared layers) with improved UX.
- Added logs/exec-approvals views and expanded tests/snapshots.

### Nexus Conflicts
- UI branding: `Legacy Control`, `legacy-app`, `legacy-control-ui`, and `/apps/legacy` base paths.
- Config path text/labels reference `~/.legacy/legacy.json`.
- Env vars and storage keys are `LEGACY_*`-prefixed.
- CLI examples/commands in UI copy use `legacy`.

### Recommendation
**TAKE_UPSTREAM + Rename**

### Adaptation Notes
- Replace all `legacy`/`LEGACY_*` strings, base paths, and config paths with Nexus equivalents.
- Update UI copy to reference `nexus` CLI commands and `~/nexus/state/nexus.json`.
- Rename custom element/tag identifiers if they are user-visible or used in tests.

### Questions for Tyler
- None.
