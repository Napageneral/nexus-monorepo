# Bulk Upstream Sync Plan

**Goal:** Bring Nexus to parity with upstream `legacy/legacy` main in one shot.

**Created:** 2026-01-20  
**Upstream HEAD:** `d4df747f9`  
**Nexus Reference Commit:** `2eec9f10c6f6b111cbe67ccfb55fcad22146a5f8`  
**Reference Branch:** `bulk-sync-ref`  

---

## Summary of Changes

| Area | Files Changed | Priority | Notes |
|------|---------------|----------|-------|
| `src/agents/` | 414 | HIGH | Core agent framework, tools, runners |
| `src/commands/` | 252 | HIGH | Command system overhaul |
| `src/auto-reply/` | 208 | HIGH | Reply handling, reasoning |
| `src/cli/` | 174 | MEDIUM | CLI commands |
| `src/gateway/` | 166 | MEDIUM | Gateway server |
| `src/infra/` | 146 | MEDIUM | Infrastructure utilities |
| `src/config/` | 113 | HIGH | Config schema - careful merge |
| `src/browser/` | 76 | MEDIUM | Browser automation |
| `src/telegram/` | 72 | LOW | Platform-specific |
| `src/discord/` | 54 | LOW | Platform-specific |
| `src/slack/` | 53 | LOW | Platform-specific |
| `apps/` | 622 | MEDIUM | iOS/macOS/Android - branding sensitive |
| `ui/` | 103 | MEDIUM | Control UI |
| `docs/` | 406 | LOW | Documentation |
| `skills/` | 218 | LOW | Skill definitions |

---

## Strategy: Upstream-First by Area

Treat upstream as the base, then re-apply Nexus-specific changes from the reference
branch only where required (branding, ODU, nexus-cloud, etc.).

### Phase 1: Core Infrastructure (do first)
These are foundational - other areas depend on them.

1. **`src/config/`** - Config schema, types, validation
2. **`src/infra/`** - Shared utilities, error handling
3. **`src/agents/`** - Agent framework, tool definitions

### Phase 2: Features
Build on the infrastructure.

4. **`src/commands/`** - Command system
5. **`src/auto-reply/`** - Reply handling
6. **`src/cli/`** - CLI commands
7. **`src/gateway/`** - Gateway server
8. **`src/browser/`** - Browser automation

### Phase 3: Platform Integrations
Lower risk, can be done in parallel.

9. **`src/telegram/`**
10. **`src/discord/`**
11. **`src/slack/`**
12. **`src/signal/`**, **`src/imessage/`**

### Phase 4: Apps & UI

13. **`ui/`** - Control UI
14. **`apps/macos/`** - macOS app (branding sensitive)
15. **`apps/ios/`** - iOS app
16. **`apps/android/`** - Android app

### Phase 5: Docs & Skills

17. **`docs/`** - Documentation
18. **`skills/`** - Skill definitions

---

## Nexus-Specific Preservations

**NEVER overwrite these:**
- `package.json` name/bin/homepage → keep `@intent-systems/nexus`
- `src/control-plane/odu/` → Nexus ODU architecture
- `native/nexus-cloud/` → Nexus cloud sync
- `skills/` nexus-specific skills
- `README.md` → Nexus branding
- Any `legacy` → `nexus` branding in user-facing strings

---

## Execution Method

For each area:

```bash
# 0. Ensure the Nexus reference branch exists
git branch bulk-sync-ref 2eec9f10c6f6b111cbe67ccfb55fcad22146a5f8

# 1. Create a working branch from upstream
git checkout -b bulk-sync/phase-1-infra upstream/main

# 2. Compare upstream vs Nexus reference for this area
git diff bulk-sync-ref..HEAD -- src/config/

# 3. Re-apply Nexus-specific changes as needed (branding, ODU, nexus-cloud)
# 4. Build and test
pnpm build && pnpm test

# 5. Commit with clear message
git commit -m "chore: bulk sync src/config/ from upstream d4df747f9"

# 6. Repeat for next area, then merge to main
```

---

## Post-Sync

Once at parity:

1. **Update baseline** in `state.json`:
   ```json
   {
     "baseline": "d4df747f9",
     "baselineDate": "2026-01-20",
     "baselineNote": "Bulk sync to upstream HEAD"
   }
   ```

2. **Clear processed commits** - start fresh

3. **Resume bundle-by-bundle** for ongoing sync

---

## Quick Start

```bash
# Fetch latest upstream
git fetch upstream main

# Create reference branch (once)
git branch bulk-sync-ref 2eec9f10c6f6b111cbe67ccfb55fcad22146a5f8

# Create bulk sync branch from upstream
git checkout -b bulk-sync/all upstream/main

# Start with config (foundation)
git diff bulk-sync-ref..HEAD -- src/config/
# Re-apply Nexus-specific changes, then:
pnpm build  # Fix any issues
git add -A && git commit -m "bulk sync: src/config/"

# Continue with each area...
```

---

## Estimated Effort

| Phase | Areas | Effort |
|-------|-------|--------|
| 1 | Config, Infra, Agents | 2-4 hours |
| 2 | Commands, Reply, CLI, Gateway, Browser | 3-5 hours |
| 3 | Platforms (Telegram, Discord, etc.) | 2-3 hours |
| 4 | Apps, UI | 2-3 hours |
| 5 | Docs, Skills | 1-2 hours |

**Total:** ~10-17 hours of focused work, but can be parallelized.

