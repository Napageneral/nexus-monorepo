# TASK-04: Agents Tool Registry

You are working in the bulk-sync worktree at:
`/Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync`

## Objective
Consolidate tool registry with upstream, preserve Nexus tool policy.

## Context
Upstream consolidated tools via `createLegacyTools` with plugin allowlist and A2A gating. We want this functionality but named `createNexusTools`.

See: CHUNK-02_SPEC.md Section B

## Key Decisions (from spec)
1. Adopt upstream tool registry + plugin tools
2. Preserve Nexus tool policy behavior
3. Canonicalize A2A gating to `tools.agentToAgent`
4. Support alias from `routing.agentToAgent`

## Steps

1. **Review current state:**
```bash
# Nexus tools
ls src/agents/*tools*.ts

# Upstream tools
git ls-tree -r --name-only upstream/main -- src/agents/ | grep tool
```

2. **Port upstream tool registry:**
   - `src/agents/legacy-tools.ts` → rename to `nexus-tools.ts`
   - `src/agents/pi-tools.ts` updates
   - `src/plugins/tools.ts` (plugin tool resolution)
   - `src/agents/tool-policy.ts` (new groups/profile logic)

3. **Key rename:**
   - `createLegacyTools` → `createNexusTools`
   - Keep function signature compatible

4. **Preserve policy chain:**
   - Global → sandbox → subagent policies
   - Add `group:plugins` expansion
   - Keep Nexus policy checks

5. **A2A gating:**
   - Canonical: `tools.agentToAgent`
   - Alias: `routing.agentToAgent` for compatibility

6. **Verify:**
```bash
rg "createLegacyTools\|createNexusTools" src/
rg "agentToAgent" src/agents/
```

## DO NOT
- Remove Nexus-specific tools
- Break tool policy chain
- Lose A2A gating

## Acceptance
- [ ] `createNexusTools` exists and is used
- [ ] Plugin tools respect allowlist
- [ ] A2A gating functional
- [ ] Tool policy groups include plugins

## Reference
- [CHUNK-02_SPEC.md](../CHUNK-02_SPEC.md) Section B
- [DEEPDIVE_TOOL_REGISTRY_AND_A2A.md](../DEEPDIVE_TOOL_REGISTRY_AND_A2A.md)
