## CHUNK-03: Agent Tools

### Summary
Tooling gets a big upstream upgrade: browser tool schema split, sessions tools expanded (labels, A2A flow, stricter gating), and new web tools (web_search + richer web_fetch). This chunk looks low‑risk and mostly about feature adds plus `legacy` branding in tool text/config hints.

### Key Changes
- Browser tool refactor: schema extracted, profile support, improved snapshot/label handling.
- Sessions tools expanded: `sessions_send` supports label+agent targeting, A2A flow helpers, gating moved under `tools.agentToAgent`; `sessions_spawn` adds agentId/model/thinking/runTimeout and subagent registry hooks.
- Web tooling: new `web_search` (Brave/Perplexity), richer `web_fetch` with readability/caching/Firecrawl options.
- Updates across channel‑specific tools (Discord/Slack/Telegram/WhatsApp) and tool schemas/tests.

### Nexus Conflicts
- `legacy` naming in tool descriptions, error messages, config paths, and web headers (e.g. `legacy configure --section web`, `https://legacy.com`).
- Session gating config key moved to `tools.agentToAgent` (from older routing settings).

### Recommendation
**TAKE_UPSTREAM + Rename**

### Adaptation Notes
- Rename all tool‑facing strings/paths/commands to Nexus equivalents.
- Preserve upstream tool behavior and schemas; keep new web tools and session gating, but map config keys to Nexus conventions.

### Questions for Tyler
- None; assume upstream behavior + Nexus renames.
