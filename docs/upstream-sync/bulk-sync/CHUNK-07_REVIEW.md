## CHUNK-07: Gateway Server

### Summary
Upstream decomposes the gateway into many focused modules, splits protocol schemas by domain, adds new runtime/control surfaces (exec approvals, OpenAI HTTP entrypoint, node registry/events), and removes legacy bridge/provider infrastructure. Per Tyler, we can take upstream gateway changes with a straightforward Nexus rename pass and defer ODU-specific integration work.

### Key Changes
- Protocol schema split into domain files under `protocol/schema/` (agents, channels, cron, devices, exec-approvals, nodes, sessions, wizard, etc.).
- Server architecture overhaul: new runtime/config/reload modules, websocket runtime/connection layer, and `server.impl.ts`.
- New gateway features: OpenAI-compatible HTTP API, exec-approval manager + methods, node registry/events/subscriptions, chat abort/sanitize flows.
- Removal of legacy gateway bridge and provider layers.
- Extensive new test coverage (live/e2e gateway tests, CLI backend tests).

### Nexus Conflicts
- `legacy` naming in env vars, headers, config paths, and wizard boot flow.
- Control UI base path injection and config paths reference `legacy.json`.

### Recommendation
**TAKE_UPSTREAM + Rename**

### Adaptation Notes
- Do a consistent rename pass (`legacy` → `nexus`, `LEGACY_*` → `NEXUS_*`, config paths, headers, UI base path).
- Keep upstream gateway behavior as-is for now; do not reintroduce ODU-specific bridge logic yet.

### Assumptions
- Use `x-nexus-token` as the renamed auth header.
