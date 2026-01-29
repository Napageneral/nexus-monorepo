# Tool Registry + A2A Gating Deep Dive

## Nexus reference behavior
- Core tool list in `src/agents/nexus-tools.ts`.
- Policy chain in `src/agents/pi-tools.ts`:
  - Global `agent.tools` profile/allow/deny
  - Sandbox tool policy
  - Subagent tool policy
- A2A gating in `routing.agentToAgent`:
  - Session tools check `cfg.routing?.agentToAgent`
  - Allows wildcard patterns (for cross-agent access)

## Upstream (legacy)
- Consolidated registry in `src/agents/legacy-tools.ts`:
  - Adds `message`, `agents_list`, `session_status`, `web_search`, `web_fetch`
  - Integrates plugin tools via `resolvePluginTools()`
  - Optional plugin tools are allowed only if allowlist contains tool name,
    plugin id, or `group:plugins`
- Tool policy updates in `src/agents/tool-policy.ts`:
  - New groups: `group:web`, `group:plugins`, `group:legacy`
  - `group:runtime` includes `bash`
  - `group:messaging` now uses `message` tool
  - Profiles updated to include `session_status`
  - Plugin group expansion helpers
- A2A gating moved to `tools.agentToAgent`:
  - Session tools read `cfg.tools?.agentToAgent`
  - `sessions_send` accepts `label` + `agentId`, with allowlist patterns

## Differences that matter
- Config location changed: `routing.agentToAgent` -> `tools.agentToAgent`.
- Plugin tool allowlist is new and separate from core allow/deny.
- New tool groups and default profiles change what is enabled by default.
- `message` tool replaces provider-specific messaging in tool groups.

## Best-of-Both Compatibility Plan
1. Adopt upstream consolidated registry and plugin tool integration.
2. Keep Nexus policy chain but extend it:
   - Include plugin group expansion (`group:plugins`)
   - Add new groups (`group:web`, `group:legacy`) and tool names
3. A2A gating:
   - Take upstream behavior (use `tools.agentToAgent` as canonical).
   - Provide a short‑term alias from `routing.agentToAgent` if needed.
4. Ensure plugin tools pass through the same policy chain (global -> sandbox -> subagent).

## Decisions (current)
- **Adopt upstream tool registry consolidation + plugin allowlist + A2A gating.**
