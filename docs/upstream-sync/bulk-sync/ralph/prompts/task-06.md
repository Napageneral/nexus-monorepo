# TASK-06: Agents Multi-Agent Scope

You are working in the bulk-sync worktree at:
`/Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync`

## Objective
Port multi-agent config and scope handling from upstream.

## Context
Upstream added multi-agent support with per-agent config, default agent resolution, and subagent/sandbox handling.

## Steps

1. **Review changes:**
```bash
git diff HEAD upstream/main -- src/agents/agent-scope.ts
git diff HEAD upstream/main -- src/agents/agent-paths.ts
```

2. **Key functionality:**
   - Default agent resolution
   - Per-agent config overrides
   - Subagent/sandbox/tool overrides
   - Agent directory structure

3. **Port with renames:**
   - `LEGACY_*` → `NEXUS_*`
   - Agent dir paths should use Nexus conventions
   - Identity strings should say "Nexus"

4. **Verify:**
```bash
rg "LEGACY_" src/agents/agent-*.ts
rg "defaultAgent\|agentScope" src/agents/
```

## Acceptance
- [ ] Multi-agent config works
- [ ] Default agent resolution correct
- [ ] Agent paths use Nexus conventions
- [ ] No LEGACY_ env vars

## Reference
- [CHUNK-02_REVIEW.md](../CHUNK-02_REVIEW.md)
