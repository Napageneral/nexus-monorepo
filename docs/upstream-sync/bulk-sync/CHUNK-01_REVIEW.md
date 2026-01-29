# CHUNK-01: Infrastructure Utilities

### Summary
Upstream adds a large infra layer (discovery, update/doctor tooling, outbound routing, usage tracking, exec safety, env/paths, etc.) and removes the old node bridge server. Most changes look useful, but there is heavy `legacy` naming/paths that must be renamed for Nexus.

### Key Changes
- New infra modules: archive extraction, bonjour discovery + wide‑area DNS, clipboard helpers, env file loading, exec approvals/safety, outbound routing/formatting, provider usage tracking/backoff, restart/runtime guards, transport readiness, update/doctor flows, usage upload/suggestions, voicewake utilities, system presence/events.
- Significant refactors to heartbeat handling and agent event context.
- Node pairing expanded with more metadata (core/ui versions, bins), uses config state dir, and tightens file permissions.
- Bridge server removed (`src/infra/bridge/server.ts` + tests).
- Many new tests covering the above modules.

### Nexus Conflicts
- Widespread `legacy` branding and defaults (`legacy` CLI, `~/.legacy`, `legacy.internal`, update/install strings, User‑Agent, etc.).
- Discovery and wide‑area DNS now use `_legacy-gateway._tcp` and `legacy.internal` (previously `nexus-bridge` / `nexus.internal`).
- New `legacy-root` resolver expects `package.json` name `"legacy"` (Nexus is `@intent-systems/nexus`).
- Bridge server removal is OK; no longer needed for Nexus.

### Recommendation
**ADAPT**

### Adaptation Notes
- Keep upstream infra behavior, but do a branding/paths pass: CLI name, state dir, DNS service names, User‑Agent, update/install commands, and any `legacy` string literals.
- The bridge server stays removed; focus is renaming + path normalization.
- A regex-driven rename pass is likely the fastest approach.
- Ensure `resolveLegacyPackageRoot` and update flows target the Nexus package name.

### Questions for Tyler
- For wide‑area discovery, should we keep `nexus.internal` / `_nexus-bridge._tcp` identifiers?
