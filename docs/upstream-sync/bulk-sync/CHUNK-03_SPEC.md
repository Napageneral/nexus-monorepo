# CHUNK-03 Implementation Spec (Agent Tools)

This spec covers the tool-layer upgrades and Nexus renames for CHUNK‑03.

## Scope
- Tool schema refactors (browser tool schema split, new parameters)
- Sessions tools changes (label/agent targeting, A2A flow updates, gating)
- Web tools (web_search + richer web_fetch)
- Tool-facing text + config path renames

---

## Decisions
- **TAKE_UPSTREAM + Rename** (low risk)
- A2A gating follows upstream (`tools.agentToAgent`), with alias support if needed.

---

## Files to touch
- `src/agents/tools/browser-tool.schema.ts`
- `src/agents/tools/browser-tool.ts`
- `src/agents/tools/sessions-send-tool.ts`
- `src/agents/tools/sessions-spawn-tool.ts`
- `src/agents/tools/sessions-helpers.ts`
- `src/agents/tools/sessions-send-tool.a2a.ts`
- `src/agents/tools/web-tools.ts`
- `src/agents/tools/web-search.ts`
- `src/agents/tools/web-fetch.ts`
- Tool tests under `src/agents/tools/*.test.ts`

---

## Steps
1. **Adopt upstream tool changes**
   - Import browser schema split and any updated tool parameter validation.
   - Pull in sessions tooling updates (label + agentId targeting, A2A flow refactor).
   - Add new `web_search` + updated `web_fetch` behavior.
2. **Config + gating alignment**
   - Ensure `tools.agentToAgent` is the canonical config key.
   - If needed, add a short-term alias from `routing.agentToAgent`.
3. **Rename pass**
   - Replace `legacy` strings in tool descriptions, hints, docs, and error messages.
   - Update config path references to Nexus (`~/nexus/state/nexus.json` or equivalent).
4. **Tests**
   - Update test fixtures and expected strings to Nexus branding.
   - Ensure new tool schema tests pass with renamed text.

---

## Acceptance criteria
- New tools (`web_search`, updated `web_fetch`) work with Nexus config.
- Session tools honor A2A gating and label/agent targeting.
- All user-facing text references Nexus (no `legacy` left).
