# Bulk Upstream Sync Plan

**Goal:** Bring Nexus to parity with upstream `legacy/legacy` main in one shot.

**Created:** 2026-01-20  
**Upstream HEAD:** `d4df747f9`  
**Nexus HEAD:** `22d136ccc`  
**Commits to port:** ~1742 since baseline

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

## Strategy: Merge by Area

Rather than cherry-picking commits, we'll do a **strategic merge** by functional area.

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
# 1. Create a working branch
git checkout -b bulk-sync/phase-1-infra

# 2. Check out upstream version of the directory
git checkout upstream/main -- src/config/

# 3. Review changes, revert branding regressions
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

# Create bulk sync branch
git checkout -b bulk-sync/all main

# Start with config (foundation)
git checkout upstream/main -- src/config/
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
