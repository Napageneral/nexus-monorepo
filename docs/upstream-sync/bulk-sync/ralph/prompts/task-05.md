# TASK-05: Agents CLI Runner

You are working in the bulk-sync worktree at:
`/Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync`

## Objective
Port the CLI backend/runner for external models (Claude CLI, Codex, etc.)

## Context
Upstream added CLI runner support for invoking external model CLIs. This is a straightforward port with naming updates.

## Steps

1. **See what exists:**
```bash
git diff HEAD upstream/main --stat -- src/agents/cli-*.ts
git ls-tree -r --name-only upstream/main -- src/agents/ | grep cli
```

2. **Port files:**
   - `src/agents/cli-backends.ts`
   - `src/agents/cli-runner.ts`
   - Related helpers

3. **Rename:**
   - `LEGACY_*` → `NEXUS_*` env vars
   - Any `legacy` paths or identifiers

4. **Verify integration:**
   - Check how cli-runner is invoked
   - Ensure session handling works
   - Model aliases resolve correctly

## Acceptance
- [ ] CLI runner files exist
- [ ] External CLI models can be invoked
- [ ] Session handling functional
- [ ] No LEGACY_ env vars

## Reference
- [CHUNK-02_REVIEW.md](../CHUNK-02_REVIEW.md)
