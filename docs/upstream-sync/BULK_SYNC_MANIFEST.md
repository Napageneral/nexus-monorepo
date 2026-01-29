# Bulk Sync Manifest

**Target:** Bring Nexus to parity with upstream legacy HEAD  
**Upstream Commit:** `d4df747f9fbf39515ce1df4b413df46237394ccd`  
**Upstream Date:** 2026-01-20 01:43:59 UTC  
**Upstream Subject:** `fix: harden doctor config cleanup`

**Worktree:** `/Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync`  
**Branch:** `bulk-sync`

---

## Nexus-Specific Preservations (NEVER Overwrite)

### 1. Branding & Identity
- `package.json`: name=`@intent-systems/nexus`, bin=`nexus`
- `README.md`: Nexus branding, docs links
- All user-facing strings: `nexus` not `legacy`

### 2. Nexus Architecture (unique to Nexus)
- `src/control-plane/odu/` — ODU (On-Device Unit) architecture
- `native/nexus-cloud/` — Nexus Cloud sync engine
- Integration points for nexus-website, nexus-collab, nexus-hub

### 3. Nexus Ecosystem Integration
From ARCHITECTURE.md:
- **nexus-cli**: Local CLI + workspace bootstrap
- **nexus-cloud**: Encrypted sync + shared spaces  
- **nexus-website**: Skills registry + capability taxonomy
- **nexus-collab**: Realtime collaboration (PartyKit + Yjs)

### 4. Config & State
- `NEXUS_ROOT` / `NEXUS_STATE_DIR` env vars
- `~/nexus/state/nexus.json` (not legacy.json)
- `state/user/IDENTITY.md`, `state/agents/{id}/IDENTITY.md`

---

## Sync Chunks (Parallel-Reviewable)

Each chunk is independent and can be reviewed by a separate agent.
Chunks are numbered by dependency order but can be parallelized within tiers.

### Tier 0: Foundation (must be first)

#### CHUNK-00: Config & Schema
**Path:** `src/config/`  
**Files:** ~113 changed  
**Risk:** HIGH — schema changes affect everything  
**Nexus concerns:** Config extensions, nexus.json schema  

**Review questions:**
1. What new config keys were added?
2. Do any changes conflict with nexus-specific config?
3. Are there schema migrations needed?

**Diff command:**
```bash
git diff HEAD..upstream/main -- src/config/
```

---

#### CHUNK-01: Infrastructure Utilities
**Path:** `src/infra/`  
**Files:** ~146 changed  
**Risk:** MEDIUM — shared utilities  
**Nexus concerns:** ODU integration points  

**Review questions:**
1. What new utilities were added?
2. Any breaking changes to existing APIs?
3. Does anything touch control-plane boundaries?

**Diff command:**
```bash
git diff HEAD..upstream/main -- src/infra/
```

---

### Tier 1: Core Agent Framework

#### CHUNK-02: Agents Core
**Path:** `src/agents/` (excluding tools/)  
**Files:** ~360 changed  
**Risk:** HIGH — core agent logic  
**Nexus concerns:** ODU agent runners, subagent architecture  

**Review questions:**
1. What agent framework changes were made?
2. How do runners/embedded runners change?
3. Any changes to tool execution model?

**Diff command:**
```bash
git diff HEAD..upstream/main -- src/agents/ ':!src/agents/tools/'
```

---

#### CHUNK-03: Agent Tools
**Path:** `src/agents/tools/`  
**Files:** ~54 changed  
**Risk:** MEDIUM — tool definitions  
**Nexus concerns:** Nexus-specific tools (sessions_*, nodes, etc.)  

**Review questions:**
1. What new tools were added?
2. What tools were modified?
3. Any schema changes to existing tools?

**Diff command:**
```bash
git diff HEAD..upstream/main -- src/agents/tools/
```

---

### Tier 2: Reply & Commands

#### CHUNK-04: Auto-Reply System
**Path:** `src/auto-reply/`  
**Files:** ~208 changed  
**Risk:** HIGH — core reply handling  
**Nexus concerns:** Reply formatting, reasoning display  

**Review questions:**
1. What reply handling changes were made?
2. Any streaming/chunking changes?
3. New reply formatting options?

**Diff command:**
```bash
git diff HEAD..upstream/main -- src/auto-reply/
```

---

#### CHUNK-05: Commands System
**Path:** `src/commands/`  
**Files:** ~252 changed  
**Risk:** MEDIUM — chat commands  
**Nexus concerns:** Nexus-specific commands  

**Review questions:**
1. What new commands were added?
2. Any command registry changes?
3. Native command infrastructure updates?

**Diff command:**
```bash
git diff HEAD..upstream/main -- src/commands/
```

---

### Tier 3: Gateway & CLI

#### CHUNK-06: CLI Commands
**Path:** `src/cli/`  
**Files:** ~174 changed  
**Risk:** MEDIUM — CLI interface  
**Nexus concerns:** `nexus` command name, wizard flow  

**Review questions:**
1. What new CLI commands were added?
2. Any onboarding/wizard changes?
3. Doctor command updates?

**Diff command:**
```bash
git diff HEAD..upstream/main -- src/cli/
```

---

#### CHUNK-07: Gateway Server
**Path:** `src/gateway/`  
**Files:** ~166 changed  
**Risk:** MEDIUM — control plane  
**Nexus concerns:** ODU gateway integration  

**Review questions:**
1. What gateway methods changed?
2. WebSocket protocol updates?
3. New server methods?

**Diff command:**
```bash
git diff HEAD..upstream/main -- src/gateway/
```

---

### Tier 4: Browser & Channels

#### CHUNK-08: Browser Automation
**Path:** `src/browser/`  
**Files:** ~76 changed  
**Risk:** LOW — browser tools  
**Nexus concerns:** None significant  

**Review questions:**
1. What browser capabilities were added?
2. Playwright/CDP changes?
3. Profile handling updates?

**Diff command:**
```bash
git diff HEAD..upstream/main -- src/browser/
```

---

#### CHUNK-09: Channel Core
**Path:** `src/channels/`  
**Files:** ~85 changed  
**Risk:** LOW — channel abstractions  
**Nexus concerns:** None significant  

**Review questions:**
1. What channel abstractions changed?
2. Plugin system updates?
3. New channel types?

**Diff command:**
```bash
git diff HEAD..upstream/main -- src/channels/
```

---

### Tier 5: Platform Integrations

#### CHUNK-10: Telegram
**Path:** `src/telegram/`  
**Files:** ~72 changed  
**Risk:** LOW  
**Diff:** `git diff HEAD..upstream/main -- src/telegram/`

#### CHUNK-11: Discord
**Path:** `src/discord/`  
**Files:** ~54 changed  
**Risk:** LOW  
**Diff:** `git diff HEAD..upstream/main -- src/discord/`

#### CHUNK-12: Slack
**Path:** `src/slack/`  
**Files:** ~53 changed  
**Risk:** LOW  
**Diff:** `git diff HEAD..upstream/main -- src/slack/`

#### CHUNK-13: Signal & iMessage
**Paths:** `src/signal/`, `src/imessage/`  
**Files:** ~32 changed  
**Risk:** LOW  
**Diff:** `git diff HEAD..upstream/main -- src/signal/ src/imessage/`

---

### Tier 6: Apps & UI

#### CHUNK-14: Control UI
**Path:** `ui/`  
**Files:** ~103 changed  
**Risk:** MEDIUM — user-facing  
**Nexus concerns:** Branding in UI  

**Review questions:**
1. What UI views changed?
2. New features in Control UI?
3. Any branding to update?

**Diff command:**
```bash
git diff HEAD..upstream/main -- ui/
```

---

#### CHUNK-15: macOS App
**Path:** `apps/macos/`  
**Files:** ~200+ changed  
**Risk:** MEDIUM — branding sensitive  
**Nexus concerns:** App name, bundle ID, branding  

**Review questions:**
1. What macOS features were added?
2. Any Info.plist/bundle changes?
3. Branding strings to preserve?

**Diff command:**
```bash
git diff HEAD..upstream/main -- apps/macos/
```

---

#### CHUNK-16: iOS App
**Path:** `apps/ios/`  
**Files:** ~200+ changed  
**Risk:** MEDIUM  
**Diff:** `git diff HEAD..upstream/main -- apps/ios/`

#### CHUNK-17: Android App
**Path:** `apps/android/`  
**Files:** ~200+ changed  
**Risk:** MEDIUM  
**Diff:** `git diff HEAD..upstream/main -- apps/android/`

---

### Tier 7: Documentation & Skills

#### CHUNK-18: Documentation
**Path:** `docs/`  
**Files:** ~406 changed  
**Risk:** LOW — but branding sensitive  
**Nexus concerns:** All legacy docs domain links, nexus branding  

**Review questions:**
1. What new docs were added?
2. Which docs need branding updates?
3. Any structural changes?

**Diff command:**
```bash
git diff HEAD..upstream/main -- docs/
```

---

#### CHUNK-19: Skills
**Path:** `skills/`  
**Files:** ~218 changed  
**Risk:** LOW  
**Nexus concerns:** Nexus-specific skills  

**Review questions:**
1. What new skills were added?
2. Any skill format changes?
3. Nexus-specific skills to preserve?

**Diff command:**
```bash
git diff HEAD..upstream/main -- skills/
```

---

### Tier 8: Build & CI

#### CHUNK-20: Scripts & CI
**Paths:** `scripts/`, `.github/`  
**Files:** ~93 changed  
**Risk:** LOW  
**Nexus concerns:** Release scripts, CI workflows  

**Diff command:**
```bash
git diff HEAD..upstream/main -- scripts/ .github/
```

---

#### CHUNK-21: Root Config Files
**Files:** `package.json`, `tsconfig.json`, `vitest.config.ts`, etc.  
**Risk:** MEDIUM — careful merge  
**Nexus concerns:** Package name, dependencies  

**Diff command:**
```bash
git diff HEAD..upstream/main -- package.json tsconfig.json vitest.config.ts biome.json
```

---

## Agent Review Protocol

Each reviewing agent should:

1. **Run the diff command** for their assigned chunk
2. **Answer the review questions** 
3. **Identify:**
   - Safe to take directly from upstream
   - Needs adaptation for Nexus
   - Conflicts with Nexus-specific code
   - New features to evaluate
4. **Output a recommendation:**
   - `TAKE_UPSTREAM` — apply directly
   - `ADAPT` — apply with modifications (specify what)
   - `SKIP` — don't apply (explain why)
   - `REVIEW_NEEDED` — needs human decision

### Review Output Format

```markdown
## CHUNK-XX: [Name]

### Summary
[1-2 sentence summary of changes]

### Key Changes
- [bullet list of significant changes]

### Nexus Conflicts
- [any conflicts with Nexus-specific code]

### Recommendation
[TAKE_UPSTREAM | ADAPT | SKIP | REVIEW_NEEDED]

### Adaptation Notes
[if ADAPT, what needs to change]

### Questions for Tyler
[any decisions needed]
```

---

## Execution Order

```
Tier 0 (sequential):     CHUNK-00 → CHUNK-01
Tier 1 (parallel):       CHUNK-02, CHUNK-03
Tier 2 (parallel):       CHUNK-04, CHUNK-05
Tier 3 (parallel):       CHUNK-06, CHUNK-07
Tier 4 (parallel):       CHUNK-08, CHUNK-09
Tier 5 (parallel):       CHUNK-10, CHUNK-11, CHUNK-12, CHUNK-13
Tier 6 (parallel):       CHUNK-14, CHUNK-15, CHUNK-16, CHUNK-17
Tier 7 (parallel):       CHUNK-18, CHUNK-19
Tier 8 (parallel):       CHUNK-20, CHUNK-21
```

After all reviews, apply in dependency order (Tier 0 → 8).

---

## Post-Sync Checklist

- [ ] All chunks applied
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes (or failures documented)
- [ ] No legacy branding in user-facing strings
- [ ] Nexus-specific features preserved (ODU, nexus-cloud, etc.)
- [ ] Update baseline in state.json to `d4df747f9`
- [ ] Clear processed commits from state.json
