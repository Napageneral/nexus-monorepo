# TASK-01: Gateway Server Core

You are working in the bulk-sync worktree at:
`/Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync`

## Objective
Port the gateway server core modules from upstream with Nexus naming.

## Context
Upstream has overhauled the gateway server architecture with new runtime/config/reload modules and websocket handling. See CHUNK-07_REVIEW.md.

## Steps

1. **See what's different:**
```bash
git diff HEAD upstream/main --stat -- src/gateway/server*.ts src/gateway/runtime*.ts
```

2. **Key files to port:**
   - `src/gateway/server.ts` — main server
   - `src/gateway/server.impl.ts` — implementation (if exists)
   - `src/gateway/server-methods/` — method handlers
   - Any new runtime/websocket modules

3. **For each file:**
   - Compare Nexus vs upstream: `git diff HEAD upstream/main -- <file>`
   - If file is new upstream, copy and rename
   - If file exists in both, merge carefully:
     - Keep Nexus auth header (`x-nexus-token`)
     - Keep Nexus config paths (`nexus.json`)
     - Take upstream functionality improvements

4. **Verify no legacy naming in auth:**
```bash
rg -i "x-legacy" src/gateway/
rg "LEGACY_" src/gateway/
```

## Key Renames
- Headers: `x-legacy-token` → `x-nexus-token`
- Config: `legacy.json` → `nexus.json`
- Env: `LEGACY_*` → `NEXUS_*`
- Types: `LegacyConfig` → `NexusConfig`

## Acceptance
- [ ] Server modules updated
- [ ] Auth uses `x-nexus-token`
- [ ] Config paths reference `nexus.json`
- [ ] No `LEGACY_` env vars

## Reference
- [CHUNK-07_REVIEW.md](../CHUNK-07_REVIEW.md)
