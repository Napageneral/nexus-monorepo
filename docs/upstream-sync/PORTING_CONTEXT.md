# Upstream Porting Context

This document provides context for agents porting changes from legacy to nexus.

## Key Facts

- **Upstream**: `legacy/legacy` (GitHub)
- **Fork**: `Napageneral/nexus` (this repo)
- **Baseline**: PR #733 merge (`3a8bfc0a5`) - Jan 11, 2026
- **Divergence**: ~180 nexus-specific commits since fork

## Nexus-Specific Differences

### 1. Branding/Naming
- Replace "legacy" → "nexus" in user-facing strings
- Replace "Legacy" → "Nexus" in titles/headers
- Package name: `@intent-systems/nexus` (not legacy)

### 2. Nexus Additions (don't overwrite these)
- `src/control-plane/odu/` - ODU (On-Device Unit) architecture
- `skills/` folder - Nexus skill system
- `state/` folder - Runtime state management
- Nexus cloud sync functionality

### 3. Config Differences
- `nexus.json` has nexus-specific schema extensions
- Additional model config for ODU agents

## Porting Guidelines

### DO:
- Apply the core logic/functionality from upstream
- Adapt imports if file locations differ
- Update tests to match nexus patterns
- Preserve nexus-specific functionality in modified files

### DON'T:
- Overwrite nexus branding with legacy branding
- Remove nexus-specific features from files you're modifying
- Assume file paths are identical (check first)

### When Conflicts Occur:
1. Keep nexus-specific code
2. Integrate upstream changes around it
3. Note any significant adaptation in commit message

## Files That Often Diverge

These files have nexus customizations - merge carefully:
- `src/config/*.ts` - May have nexus schema extensions
- `src/cli/*.ts` - May have nexus commands
- `package.json` - Different name, some different deps
- `README.md` - Nexus-specific docs

## Commit Message Format

When porting, use this format:
```
feat: port <original-type>: <original-subject>

Ported from upstream commit: <sha>
Original author: <author>

[Any adaptation notes]
```

## Verification Checklist

After porting:
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes (or known failures documented)
- [ ] No legacy branding leaked into user-facing strings
- [ ] Nexus-specific features still work
