# TASK-00: Gateway Schema Split

You are working in the bulk-sync worktree at:
`/Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync`

## Objective
Port the gateway protocol schema split from upstream, applying Nexus naming.

## Context
Upstream has decomposed `src/gateway/protocol/schema.ts` into domain-specific files under `src/gateway/protocol/schema/`. We need to bring this structure in with Nexus naming.

## Steps

1. **See what upstream has:**
```bash
git diff HEAD upstream/main --stat -- src/gateway/protocol/
```

2. **Check what files exist upstream:**
```bash
git ls-tree -r --name-only upstream/main -- src/gateway/protocol/schema/
```

3. **For each schema file upstream:**
   - Copy the file from upstream
   - Replace `legacy` → `nexus` in identifiers
   - Replace `LEGACY_` → `NEXUS_` in env vars
   - Replace `x-legacy-` → `x-nexus-` in headers
   - Ensure imports reference correct Nexus paths

4. **Update the main protocol/index.ts to import the new schema modules**

5. **Verify imports resolve:**
```bash
cd /Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -i "gateway/protocol" | head -20
```

## Naming Conventions
- `LegacySchema` → `NexusSchema`
- `legacy.json` → `nexus.json`
- `x-legacy-token` → `x-nexus-token`
- `LEGACY_STATE_DIR` → `NEXUS_STATE_DIR`

## Acceptance
- [ ] Schema files exist under `src/gateway/protocol/schema/`
- [ ] No `legacy` strings (except intentional upstream references)
- [ ] TypeScript compiles without errors in this area

## Reference
- [CHUNK-07_REVIEW.md](../CHUNK-07_REVIEW.md)
