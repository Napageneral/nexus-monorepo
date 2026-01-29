# Review Dispatch Guide

Use this to dispatch parallel agents to review each chunk.

## Reference Baseline

- Nexus reference commit: `2eec9f10c6f6b111cbe67ccfb55fcad22146a5f8`
- Reference branch: `bulk-sync-ref`
- Compare with: `git diff bulk-sync-ref..upstream/main -- <path>`

## Quick Reference

| Chunk | Area | Files | Risk | Can Parallelize With |
|-------|------|-------|------|---------------------|
| CHUNK-00 | Config & Schema | ~113 | HIGH | None (do first) |
| CHUNK-01 | Infrastructure | ~146 | MED | None (do second) |
| CHUNK-02 | Agents Core | ~360 | HIGH | CHUNK-03 |
| CHUNK-03 | Agent Tools | ~54 | MED | CHUNK-02 |
| CHUNK-04 | Auto-Reply | ~208 | HIGH | CHUNK-05 |
| CHUNK-05 | Commands | ~252 | MED | CHUNK-04 |
| CHUNK-06 | CLI | ~174 | MED | CHUNK-07 |
| CHUNK-07 | Gateway | ~166 | MED | CHUNK-06 |
| CHUNK-08 | Browser | ~76 | LOW | CHUNK-09 |
| CHUNK-09 | Channels | ~85 | LOW | CHUNK-08 |
| CHUNK-10 | Telegram | ~72 | LOW | 11, 12, 13 |
| CHUNK-11 | Discord | ~54 | LOW | 10, 12, 13 |
| CHUNK-12 | Slack | ~53 | LOW | 10, 11, 13 |
| CHUNK-13 | Signal/iMessage | ~32 | LOW | 10, 11, 12 |
| CHUNK-14 | Control UI | ~103 | MED | 15, 16, 17 |
| CHUNK-15 | macOS App | ~200+ | MED | 14, 16, 17 |
| CHUNK-16 | iOS App | ~200+ | MED | 14, 15, 17 |
| CHUNK-17 | Android App | ~200+ | MED | 14, 15, 16 |
| CHUNK-18 | Docs | ~406 | LOW | CHUNK-19 |
| CHUNK-19 | Skills | ~218 | LOW | CHUNK-18 |
| CHUNK-20 | Scripts/CI | ~93 | LOW | CHUNK-21 |
| CHUNK-21 | Root Config | ~10 | MED | CHUNK-20 |

---

## Agent Dispatch Prompts

Copy-paste these to dispatch review agents.

### CHUNK-00: Config & Schema (HIGH PRIORITY)

```
You are reviewing CHUNK-00 for the Nexus bulk upstream sync.

**Task:** Review all changes in `src/config/` between Nexus and upstream legacy.

**Context:**
- Worktree: /Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync
- Upstream commit: d4df747f9
- Nexus reference: 2eec9f10 (bulk-sync-ref)
- This is the config schema layer — changes here affect everything

**Nexus Concerns:**
- Nexus has config extensions (ODU, nexus-cloud integration)
- Config file is `nexus.json` not `legacy.json`
- Preserve any `nexus.*` config keys

**Your task:**
1. Run: `git diff bulk-sync-ref..upstream/main -- src/config/`
2. Identify all changes
3. For each significant change, determine:
   - TAKE_UPSTREAM (safe to apply directly)
   - ADAPT (need modifications for Nexus)
   - SKIP (doesn't apply to Nexus)
   - REVIEW_NEEDED (needs Tyler's decision)

**Output format:**
- Summary of changes
- List of files with recommendations
- Any questions for Tyler
- Specific adaptation notes if ADAPT
```

### CHUNK-02: Agents Core (HIGH PRIORITY)

```
You are reviewing CHUNK-02 for the Nexus bulk upstream sync.

**Task:** Review all changes in `src/agents/` (excluding tools/) between Nexus and upstream.

**Context:**
- Worktree: /Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync
- Upstream commit: d4df747f9
- Nexus reference: 2eec9f10 (bulk-sync-ref)
- This is the core agent framework

**Nexus Concerns:**
- Nexus has ODU (On-Device Unit) agent runners in `src/control-plane/odu/`
- Subagent architecture may differ
- Preserve any nexus-specific agent integrations

**Your task:**
1. Run: `git diff bulk-sync-ref..upstream/main -- src/agents/ ':!src/agents/tools/'`
2. Identify framework changes, runner changes, execution model changes
3. Categorize each change as TAKE_UPSTREAM/ADAPT/SKIP/REVIEW_NEEDED

**Output format:**
- Summary of agent framework changes
- Key new features
- Potential conflicts with Nexus ODU
- Recommendations per file/area
```

### CHUNK-04: Auto-Reply System (HIGH PRIORITY)

```
You are reviewing CHUNK-04 for the Nexus bulk upstream sync.

**Task:** Review all changes in `src/auto-reply/` between Nexus and upstream.

**Context:**
- Worktree: /Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync
- Upstream commit: d4df747f9
- Nexus reference: 2eec9f10 (bulk-sync-ref)
- This is the core reply handling system

**Nexus Concerns:**
- Reply formatting may have Nexus customizations
- Streaming/chunking behavior
- Reasoning display

**Your task:**
1. Run: `git diff bulk-sync-ref..upstream/main -- src/auto-reply/`
2. Focus on: reply handlers, streaming logic, formatting
3. Categorize changes as TAKE_UPSTREAM/ADAPT/SKIP/REVIEW_NEEDED

**Output format:**
- Summary of reply system changes
- New features added
- Breaking changes
- Recommendations
```

### Platform Chunks (Tier 5 - can run all 4 in parallel)

```
You are reviewing CHUNK-[10|11|12|13] for the Nexus bulk upstream sync.

**Task:** Review changes in `src/[telegram|discord|slack|signal|imessage]/`

**Context:**
- Worktree: /Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync
- Upstream commit: d4df747f9
- Nexus reference: 2eec9f10 (bulk-sync-ref)
- These are platform integrations (generally safe to take upstream)

**Nexus Concerns:**
- Minimal — platform code is usually portable
- Check for any hardcoded "legacy" strings

**Your task:**
1. Run the appropriate diff command
2. List new features/fixes
3. Flag any branding issues
4. Generally expect TAKE_UPSTREAM for most changes

**Output:** Summary + recommendations
```

### App Chunks (Tier 6 - can run all 4 in parallel)

```
You are reviewing CHUNK-[14|15|16|17] for the Nexus bulk upstream sync.

**Task:** Review changes in `[ui/|apps/macos/|apps/ios/|apps/android/]`

**Context:**
- Worktree: /Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync  
- Upstream commit: d4df747f9
- Nexus reference: 2eec9f10 (bulk-sync-ref)
- Apps are branding-sensitive

**Nexus Concerns:**
- App names (Nexus not Legacy)
- Bundle IDs
- User-facing strings
- Info.plist / AndroidManifest changes

**Your task:**
1. Run the appropriate diff
2. Identify new features to port
3. Flag ALL branding that needs adaptation
4. Note any structural changes

**Output:** Summary + branding checklist + recommendations
```

---

## Recommended Dispatch Order

### Wave 1 (Sequential - Foundation)
1. CHUNK-00 (Config) — **must complete first**
2. CHUNK-01 (Infra) — **must complete second**

### Wave 2 (Parallel - Core)
Dispatch simultaneously:
- CHUNK-02 (Agents Core)
- CHUNK-03 (Agent Tools)
- CHUNK-04 (Auto-Reply)
- CHUNK-05 (Commands)

### Wave 3 (Parallel - Gateway/CLI)
Dispatch simultaneously:
- CHUNK-06 (CLI)
- CHUNK-07 (Gateway)
- CHUNK-08 (Browser)
- CHUNK-09 (Channels)

### Wave 4 (Parallel - Platforms)
Dispatch all simultaneously:
- CHUNK-10 (Telegram)
- CHUNK-11 (Discord)
- CHUNK-12 (Slack)
- CHUNK-13 (Signal/iMessage)

### Wave 5 (Parallel - Apps)
Dispatch all simultaneously:
- CHUNK-14 (UI)
- CHUNK-15 (macOS)
- CHUNK-16 (iOS)
- CHUNK-17 (Android)

### Wave 6 (Parallel - Docs/Build)
Dispatch all simultaneously:
- CHUNK-18 (Docs)
- CHUNK-19 (Skills)
- CHUNK-20 (Scripts/CI)
- CHUNK-21 (Root Config)

---

## Decision Template

After each agent reports back, record decisions here:

```markdown
### CHUNK-XX Decision

**Agent recommendation:** [TAKE_UPSTREAM | ADAPT | SKIP | REVIEW_NEEDED]
**Tyler decision:** [APPROVED | MODIFIED | REJECTED]
**Notes:** [any additional context]
**Applied:** [ ] Yes / [ ] No
```

