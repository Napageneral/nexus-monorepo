# TASK-08: Build Verification

You are working in the bulk-sync worktree at:
`/Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync`

## Objective
Full build and test cycle to verify the port is working.

## Steps

1. **Install dependencies:**
```bash
pnpm install --no-frozen-lockfile
```

2. **Run build:**
```bash
pnpm build
```

3. **If build fails:**
   - Read the error carefully
   - Fix the specific issue
   - Re-run build
   - Document what was fixed

4. **Run tests:**
```bash
pnpm test
```

5. **Document results:**
   - If tests pass: note in state
   - If tests fail: document which tests and why
   - Decide if failures are acceptable (known issues) or blockers

6. **Check for type errors:**
```bash
pnpm exec tsc --noEmit
```

## Common Issues

**Missing imports:**
- Check if file was renamed but imports weren't updated
- Search for old import path and update

**Type mismatches:**
- Often `LegacyConfig` vs `NexusConfig`
- Check if types were renamed consistently

**Test failures:**
- May reference `legacy` paths or names
- Update test fixtures and assertions

## Acceptance
- [ ] `pnpm install` succeeds
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` results documented
- [ ] Critical failures addressed

## Output
Record build/test results in `../logs/task-08.log`
