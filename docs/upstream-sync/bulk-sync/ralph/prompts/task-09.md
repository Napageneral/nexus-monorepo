# TASK-09: Branding Sweep

You are working in the bulk-sync worktree at:
`/Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync`

## Objective
Final sweep for any remaining `legacy` branding in user-facing code.

## Steps

1. **Search for legacy strings:**
```bash
# Case-insensitive search in source
rg -i "legacy" src/ --type ts | grep -v "// legacy" | grep -v "test" | head -50

# Check user-facing strings
rg -i "legacy" src/ --type ts -C2 | grep -E "(message|error|log|console|string)" | head -30
```

2. **Check specific areas:**
```bash
# CLI help text
rg "legacy" src/cli/ --type ts

# Error messages
rg "legacy" src/ --type ts | grep -i "error\|throw\|message"

# Config defaults
rg "legacy" src/config/ --type ts
```

3. **Intentional vs. accidental:**
   - `// legacy comment` — OK (internal documentation)
   - `legacyMigration` function — OK (migration helper)
   - `"Legacy"` in user message — NOT OK (should be "Nexus")
   - `LEGACY_*` env var — NOT OK (should be `NEXUS_*`)

4. **Fix any issues found:**
   - Replace user-facing "Legacy" with "Nexus"
   - Replace `LEGACY_*` env vars with `NEXUS_*`
   - Leave internal legacy references alone

5. **Verify key files:**
```bash
# README should say Nexus
head -5 README.md

# package.json name
jq '.name, .bin' package.json
```

## Acceptable Legacy References
- Comments explaining migration from legacy
- Test fixtures comparing legacy behavior
- Migration code that handles legacy formats

## Not Acceptable
- User-facing strings saying "Legacy"
- Environment variables starting with `LEGACY_`
- Config file paths like `legacy.json`
- Auth headers like `x-legacy-token`

## Acceptance
- [ ] No user-facing "Legacy" strings
- [ ] No `LEGACY_*` env vars in active code
- [ ] package.json name is `@intent-systems/nexus`
- [ ] README says "Nexus"
