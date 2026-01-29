# TASK-07: Skills Metadata

You are working in the bulk-sync worktree at:
`/Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync`

## Objective
Preserve Nexus skills metadata, add new upstream skills.

## Context
Upstream removed Nexus-specific skill entries. We need to keep our metadata AND add new upstream skills.

See: CHUNK-19_REVIEW.md and DEEPDIVE_SKILLS_METADATA.md

## Key Decisions (from spec)
1. Keep Nexus metadata schema intact
2. Keep Nexus-specific skills (nexus-cloud, etc.)
3. Add compatibility for upstream `metadata.legacy.*` fields
4. Port new upstream skills

## Steps

1. **Review skills:**
```bash
# Nexus skills
ls skills/

# Upstream skills  
git ls-tree -r --name-only upstream/main -- skills/ | head -30
```

2. **Compare skill sets:**
```bash
# What's new upstream
git diff HEAD upstream/main --stat -- skills/
```

3. **Port new skills:**
   - Copy new skill directories from upstream
   - Keep Nexus-specific skills untouched
   - If conflicts, prefer Nexus version

4. **Metadata compatibility:**
   - If upstream skill has `metadata.legacy.*`, map to Nexus fields
   - Keep Nexus `metadata.nexus.*` as canonical

5. **Verify:**
```bash
# Skills metadata intact
rg "metadata:" skills/ -A5 | head -30
```

## DO NOT
- Remove Nexus-specific skills (nexus-cloud, etc.)
- Break skill metadata schema
- Overwrite Nexus hub/manifest tooling

## Acceptance
- [ ] Nexus skills preserved
- [ ] New upstream skills added
- [ ] Metadata schema intact
- [ ] `nexus skill list` works

## Reference
- [CHUNK-19_REVIEW.md](../CHUNK-19_REVIEW.md)
- [DEEPDIVE_SKILLS_METADATA.md](../DEEPDIVE_SKILLS_METADATA.md)
