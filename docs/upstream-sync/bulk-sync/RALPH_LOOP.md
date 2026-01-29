# RALPH_LOOP: Nexus Bulk Upstream Sync

> "I'm helping!" — Ralph Wiggum

## Goal
Complete the port of Nexus to upstream Legacy HEAD (`d4df747f9`), preserving Nexus branding, ODU architecture, and nexus-cloud features.

## Current State
- **Progress**: ~75% complete (based on staged files vs. remaining delta)
- **Active Focus**: Gap areas (gateway, agents, skills)
- **Last Updated**: 2026-01-20
- **Blockers**: None

## Quick Stats
- **Commits since baseline**: 190
- **Staged files**: 2,327 (295k insertions)
- **Unstaged files**: 1,759 (13k insertions)

---

## Chunk Status

| ID | Area | Status | Staged/Total | Notes |
|----|------|--------|--------------|-------|
| CHUNK-00 | `src/config/` | ✅ done | 111/113 (98%) | Config schema ported |
| CHUNK-01 | `src/infra/` | ✅ done | 138/146 (95%) | Infra utils ported |
| CHUNK-02 | `src/agents/` (core) | 🟡 **gap** | 103/414 (~30%) | ~15k/51k insertions done |
| CHUNK-03 | `src/agents/tools/` | ⚠️ partial | (included in 02) | Part of agents |
| CHUNK-04 | `src/auto-reply/` | ✅ done | 204/208 (98%) | Reply system ported |
| CHUNK-05 | `src/commands/` | ✅ done | 221/252 (88%) | Commands ported |
| CHUNK-06 | `src/cli/` | ✅ done | 162/174 (93%) | CLI ported |
| CHUNK-07 | `src/gateway/` | 🔴 **gap** | 19/166 (~8%) | ~1.6k/20k insertions - biggest gap |
| CHUNK-08 | `src/browser/` | ✅ done | 74/76 (97%) | Browser automation ported |
| CHUNK-09 | `src/channels/` | ✅ done | 85/85 (100%) | Channel abstractions ported |
| CHUNK-10 | `src/telegram/` | ✅ done | 70/72 (97%) | Telegram ported |
| CHUNK-11 | `src/discord/` | ✅ done | 53/54 (98%) | Discord ported |
| CHUNK-12 | `src/slack/` | ✅ done | 53/53 (100%) | Slack ported |
| CHUNK-13 | `src/signal/`, `src/imessage/` | ✅ done | 32/32 (100%) | Signal + iMessage ported |
| CHUNK-14 | `ui/` | ✅ done | 98/103 (95%) | Control UI ported |
| CHUNK-15 | `apps/macos/` | ⚠️ partial | (in apps) | Part of apps - 78% overall |
| CHUNK-16 | `apps/ios/` | ⚠️ partial | (in apps) | Part of apps |
| CHUNK-17 | `apps/android/` | ⚠️ partial | (in apps) | Part of apps |
| CHUNK-18 | `docs/` | ⚠️ partial | 290/378 (77%) | Docs need branding pass |
| CHUNK-19 | `skills/` | 🟡 **gap** | 74/178 (42%) | Needs attention |
| CHUNK-20 | `scripts/`, `.github/` | ⚠️ partial | 72/85 (85%) | CI/scripts mostly done |
| CHUNK-21 | Root config | ⚠️ partial | see notes | package.json, tsconfig, etc. |

---

## Priority Work Queue

### Priority 1: Critical Gaps (blocks build/functionality)

#### CHUNK-07: Gateway (`src/gateway/`)
- **Status**: 🔴 19/166 files (~8%), 1.6k/20.3k insertions
- **Risk**: HIGH — gateway is core infrastructure
- **Review**: [CHUNK-07_REVIEW.md](./CHUNK-07_REVIEW.md)
- **Action**: Port upstream gateway changes, preserve Nexus auth/paths
- **Note**: 19 files in worktree (unstaged), 147 more files to go

```bash
# See what's missing
git diff HEAD upstream/main --stat -- src/gateway/
# See what's in worktree (unstaged)
git diff --stat -- src/gateway/
```

#### CHUNK-02/03: Agents (`src/agents/`)
- **Status**: 🟡 103/414 files (~30%), 15.6k/51.3k insertions
- **Risk**: HIGH — agent framework is core
- **Review**: [CHUNK-02_REVIEW.md](./CHUNK-02_REVIEW.md), [CHUNK-02_SPEC.md](./CHUNK-02_SPEC.md)
- **Action**: Port auth-profiles, tool registry, runners
- **Note**: Good progress on auth-profiles in worktree

```bash
# See what's missing
git diff HEAD upstream/main --stat -- src/agents/
# See what's in worktree
git diff --stat -- src/agents/
```

### Priority 2: Moderate Gaps

#### CHUNK-19: Skills (`skills/`)
- **Status**: 🟡 74/178 files (42%)
- **Risk**: LOW — skills are mostly additive
- **Review**: [CHUNK-19_REVIEW.md](./CHUNK-19_REVIEW.md)
- **Action**: Port new skills, preserve nexus-specific ones

#### CHUNK-18: Docs (`docs/`)
- **Status**: ⚠️ 290/378 files (77%)
- **Risk**: LOW — just content
- **Action**: Complete doc port, branding sweep

### Priority 3: Finishing Touches

- **apps/**: 78% done, need branding verification
- **scripts/**: 85% done
- **Root config**: Verify package.json, tsconfig alignment

---

## Iteration Protocol

### Starting Work
```
You are Ralph. Read RALPH_LOOP.md in the bulk-sync worktree.
Focus on the highest priority gap (CHUNK-07 gateway or CHUNK-02 agents).
Do ONE of these:
1. Port a specific set of files from upstream
2. Run and fix a build
3. Verify a chunk is complete
Update this doc when done.
```

### Per-Chunk Work Pattern
1. Read the REVIEW file for context
2. Read the SPEC file if one exists
3. Run `git diff HEAD upstream/main --stat -- <path>` to see what's missing
4. Port files, applying Nexus adaptations per the review
5. Run `pnpm build` to verify (install deps first if needed)
6. Update this status doc

### Completing a Chunk
When a chunk reaches 95%+ and builds:
1. Mark status as ✅ done
2. Update the staged/total numbers
3. Add completion notes
4. Move to next priority

---

## Verification Commands

```bash
# Install deps
pnpm install --no-frozen-lockfile

# Build check
pnpm build

# Test check  
pnpm test

# Per-area diff check
git diff HEAD upstream/main --stat -- src/gateway/

# Full remaining delta
git diff HEAD upstream/main --stat | tail -5
```

---

## Acceptance Criteria

- [ ] All chunks marked ✅ done or explicitly skipped
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes (or failures documented)
- [ ] No "legacy" branding in user-facing strings
- [ ] Nexus-specific features preserved (ODU, nexus-cloud)
- [ ] All staged changes committed
- [ ] PR ready for review

---

## Nexus Preservation Checklist

**Must preserve:**
- [ ] `package.json`: name=`@intent-systems/nexus`, bin=`nexus`
- [ ] `README.md`: Nexus branding
- [ ] `src/control-plane/odu/`: ODU architecture
- [ ] `native/nexus-cloud/`: Cloud sync engine
- [ ] All `NEXUS_*` env vars (not `LEGACY_*`)
- [ ] `nexus.json` config file (not `legacy.json`)
- [ ] Nexus-specific skills in `skills/`

---

## Session Log

### 2026-01-20 - Initial Assessment
- Created RALPH_LOOP from existing chunk reviews
- Identified major gaps: gateway (0.6%), agents (20%), skills (42%)
- 75% overall completion confirmed
- Priority queue established

---

*See [RALPH_WIGGUM_TECHNIQUE.md](./RALPH_WIGGUM_TECHNIQUE.md) for the general pattern.*
