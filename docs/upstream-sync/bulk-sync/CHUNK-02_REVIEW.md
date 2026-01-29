## CHUNK-02: Agents Core

### Summary
Large upstream refactor of the agent framework: multi-agent config and scoping, a modular auth‑profiles system with external CLI sync, new CLI backend/runner support, and expanded model/config handling. This chunk needs careful review around auth profiles, CLI credential flows, credential storage/handling, tool registry consolidation, plugin tool allowlist, and skills metadata.

### Key Changes
- Multi-agent support in `agent-scope` (default agent resolution, per‑agent config, subagent/sandbox/tool overrides).
- Agent directory/env handling renamed to `LEGACY_*` and default `agents/<id>/agent` pathing.
- Auth profiles split into many modules with CLI credential sync flows (Claude/Codex) and richer tests.
- New CLI backend config + runner for external CLI models (session handling, model aliases, bootstrap context).
- Models config refactor: implicit providers/merging extracted to `models-config.providers`, simpler `models-config.ts`.
- Tool registry consolidated via `createLegacyTools` with plugin tool allowlist and session-aware context.
- Skills metadata/usage logic changes (Nexus-specific skill entries removed upstream).

### Nexus Conflicts
- Extensive `legacy` naming for env vars, agent dirs, tmp paths, prompts, and default identity strings.
- `nexus-tools` tests/functions are renamed to `legacy-tools`.
- Skill metadata blocks that were Nexus-specific (e.g. `nexus-cloud`) are removed upstream.

### Recommendation
**ADAPT (Careful review)**

### Adaptation Notes
- Do a detailed merge on auth profiles + CLI credential sync to preserve Nexus credential storage/handling.
- Review tool registry consolidation and plugin tool allowlist behavior; keep the best of both.
- Review skills metadata removal; reintroduce Nexus‑specific metadata where needed.
- Rename all `legacy`/`LEGACY_*` identifiers and paths to Nexus equivalents (likely regex-driven).
- Keep upstream multi‑agent + CLI runner architecture; re‑apply Nexus naming and defaults.

Deep dives:
- `DEEPDIVE_AUTH_PROFILES_AND_CREDENTIALS.md`
- `DEEPDIVE_TOOL_REGISTRY_AND_A2A.md`
- `DEEPDIVE_SKILLS_METADATA.md`

Decisions captured:
- Allow plaintext credentials in the Nexus credential store for compatibility.
- Adopt upstream tool registry + plugin allowlist + A2A gating.
- Keep Nexus skills metadata + hub/manifest tooling.

### Questions for Tyler
- Any other Nexus‑specific credential handling beyond auth profiles/CLI sync?
