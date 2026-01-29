# Fresh Fork Plan: Nexus from Moltbot

**Goal:** Start fresh from moltbot HEAD, apply automated branding, graft unique nexus features.

**Created:** 2026-01-21  
**Updated:** 2026-01-28 (migrated from worktrees to standalone repos)

---

## Repository References

| Repo | Location | Purpose |
|------|----------|---------|
| **nexus-cli** | `~/nexus/home/projects/nexus/nexus-cli` | Your fork (downstream) |
| **moltbot** | `~/nexus/home/projects/moltbot` | Upstream (always pull latest) |

---

## Overview

Instead of porting upstream changes INTO a diverged nexus codebase, we:

1. **Fork fresh** from current moltbot HEAD
2. **Apply branding** via automated, re-runnable script
3. **Graft unique features** — the 63 nexus-specific commits
4. **Ongoing sync** — merge upstream, re-run branding script

---

## Phase 1: Identify Unique Nexus Work

### Reference Points

| Commit | Description |
|--------|-------------|
| `61206b8ab` | First nexus commit: "T1-BASELINE - Verify all existing tests pass" |
| `053bb76bb` | Current nexus-cli HEAD (where bundle porting started) |
| moltbot main | Always pull latest from `~/nexus/home/projects/moltbot` |

### Your 63 Unique Commits

Neatly organized with story IDs:

**Branding (RENAME-1 → RENAME-7)**
```
93564e35b RENAME-1 - src/config/
1bf87a721 RENAME-2 - src/cli/
32ad67b4d RENAME-3 - src/agents/
73235a422 RENAME-4 - remaining src/
c50896fda RENAME-5 - skills/
4a794f475 RENAME-6 - docs/, test/, ui/
e52136b2a RENAME-7 - root files
```

**ODU Architecture (On-Device Unit)**
```
8033bf1f8 CTRL-1 - Define AgentControlPlane interface
cb2b7fa8e CTRL-2 - Implement SingleAgentControlPlane
d335b95f1 CTRL-3 - Add control plane config option
f78834e08 BROKER-1 - Port ActiveMessageBroker from magic-toolbox
b10b9a37d BROKER-2 - Port ODURuntime from magic-toolbox
10fe88f62 ODU-1 - Implement ODUControlPlane
613f6b6d9 ODU-PROMPT-1 - InteractionAgent.md system prompt
4def2c107 ODU-PROMPT-2 - ExecutionAgent.md system prompt
437beaf5a ODU-TOOLS-1 - IA tools (send_message, list_agents, inspect_agent)
823d95c2a ODU-EXEC-1 - chatSync() for InteractionAgent
ed9af8e02 ODU-EXEC-2 - execute() for ExecutionAgent
```

**Session Format**
```
d89273c0a SESSION-1 - New session storage format (agent-grouped)
f210e97ed SESSION-2 - Update SingleAgentControlPlane
a70a290a7 SESSION-3 - Update ActiveMessageBroker
19ea6b064 SESSION-4 - Update ODUControlPlane
439d50fce SESSION-COMPAT-1 - Compaction tests with pi-agent
```

**Compaction**
```
3a4e49e1d COMPACT-1 - Compaction with archive preservation
e08a31bd7 COMPACT-FIX-1 - Keep recent messages (pi-agent style)
e564422af COMPACT-FIX-2 - Cursor-style history reference
9a10face8 COMPACT-FIX-3 - Integrate with pi-agent session
```

**Tests**
```
b9d8404ff TEST-LAYER-1 - Nexus Core layer tests
aa63aeefd TEST-LAYER-2 - Agent Control Plane tests
3b9235bf6 TEST-LAYER-3 - Gateway (Access Plane) tests
ce69f993c ODU-TEST-1 - ODUControlPlane unit tests
570c7fce3 ODU-TEST-2 - IA → EA delegation tests
5974ad197 ODU-TEST-3 - ODU end-to-end flow
3706c05fe BROKER-TEST-1 - ActiveMessageBroker unit tests
58bb3bdc7 BROKER-TEST-2 - Broker agent lifecycle tests
46a9a6572 QUEUE-TEST-1 - Queue behaviors (batch, single, interrupt)
f57937910 ODU-TEST-REAL-1 - Integration with mocked Claude API
126b7c322 TEST-REAL-1 - Convert ODU mocks to real API
883050806 TEST-REAL-2 - Convert compaction mocks to real API
6a0a9bb12 E2E-1 - End-to-end: nexus init -> eve -> messages
```

**Other Features**
```
bca132f28 INIT-1 - nexus init command
126a6ad45 INIT-2 - nexus reset command
9521a82f4 GIT-1 - Git repo setup in nexus init
e52136b2a EVE-1 - Eve skill
81c0f6950 CURSOR-1 - Cursor rules template
572ccfc4b CURSOR-2 - CLAUDE.md generation
7befc4ba3 QUEUE-MODE-1 - Queue modes (steer, followup, collect)
1cdc0ba05 SYNC-1 - upstream-sync skill
6893ea2dc SYNC-2 - nexus cron for sync check
0b7efb374 MODEL-CONFIG-1 - ODU-specific model config
```

---

## Phase 2: Create Branding Script

### What the RENAME commits changed

From `93564e35b` (RENAME-1):
```
Core type renames (with legacy aliases):
- ClawdbotConfig → NexusConfig
- ClawdbotSchema → NexusSchema
- STATE_DIR_CLAWDBOT → STATE_DIR_NEXUS
- CONFIG_PATH_CLAWDBOT → CONFIG_PATH_NEXUS

Environment variables (NEXUS_* primary, CLAWDBOT_* fallback):
- NEXUS_STATE_DIR → ~/.nexus
- NEXUS_CONFIG_PATH → ~/.nexus/nexus.json
- NEXUS_NIX_MODE
- NEXUS_GATEWAY_PORT
- NEXUS_OAUTH_DIR

User-facing strings:
- Schema title: "ClawdbotConfig" → "NexusConfig"
- UI placeholders: "/clawdbot" → "/nexus"
- Comment examples: "[clawdbot]" → "[nexus]"
```

### Script Strategy

Create `scripts/rebrand.sh` that:

1. **package.json**: Update name, bin, repository
2. **Type names**: ClawdbotConfig → NexusConfig (with aliases)
3. **Constants**: STATE_DIR_CLAWDBOT → STATE_DIR_NEXUS
4. **Env vars**: Add NEXUS_* as primary
5. **Paths**: ~/.clawdbot → ~/nexus/state
6. **User strings**: "clawdbot" → "nexus" in comments, docs, UI
7. **App branding**: Bundle IDs, app names (separate from code)

**Key principle:** Keep clawdbot aliases for backward compatibility where it makes sense, but nexus-first for new users.

---

## Phase 3: Execution Plan

### Step 1: Set Up Fresh Fork

```bash
# You already have moltbot locally
cd ~/nexus/home/projects/moltbot
git pull origin main  # Get latest

# Create a fresh nexus branch from moltbot
git checkout -b nexus-fresh

# Add your fork remote
git remote add nexus https://github.com/Napageneral/nexus.git
```

### Step 2: Develop Branding Script

```bash
# Work on branding script
# Iterate on scripts/rebrand.sh until:
./scripts/rebrand.sh
pnpm install
pnpm build
pnpm test  # All tests pass
```

### Step 3: Graft Unique Features

Two approaches:

**Option A: Cherry-pick commits**
```bash
# Add nexus-cli as remote (your 63 unique commits)
git remote add nexus-old ~/nexus/home/projects/nexus/nexus-cli

# Cherry-pick the ODU/unique commits (skip RENAME commits - handled by script)
git cherry-pick <commit>...
```

**Option B: Extract as patches**
```bash
# From nexus-cli repo
cd ~/nexus/home/projects/nexus/nexus-cli
git format-patch 61206b8ab..053bb76bb --stdout > ~/nexus/home/projects/nexus/upstream-sync/nexus-features.patch

# Review and apply in moltbot
cd ~/nexus/home/projects/moltbot
git apply --check ~/nexus/home/projects/nexus/upstream-sync/nexus-features.patch
```

### Step 4: Set Up Ongoing Sync

```bash
# .github/workflows/upstream-sync.yml
# Weekly job that:
# 1. git fetch upstream (moltbot)
# 2. git merge upstream/main
# 3. ./scripts/rebrand.sh
# 4. pnpm test
# 5. Create PR if tests pass
```

---

## Phase 4: Decide What to Keep

### Must Keep (Core Nexus Identity)
- [ ] Branding (via script)
- [ ] `nexus init` / `nexus reset` commands
- [ ] ~/nexus/state layout

### Evaluate (May Not Need)
- [ ] ODU architecture — do you still want this multi-agent control plane?
- [ ] ActiveMessageBroker — is the queue mode system needed?
- [ ] Custom session format — or use upstream's?
- [ ] Compaction changes — or use upstream's approach?

### Probably Skip
- [ ] Eve skill (can re-add later)
- [ ] CLAUDE.md generation (Cursor rules)
- [ ] Sync skill/cron (will be replaced by new system)

---

## Quick Reference

### Current State

| Repo | Location | Branch |
|------|----------|--------|
| **nexus-cli** | `~/nexus/home/projects/nexus/nexus-cli` | `main` @ `053bb76bb` |
| **moltbot** | `~/nexus/home/projects/moltbot` | `main` (pull for latest) |

### Key Commands

```bash
# See your unique commits (in nexus-cli)
cd ~/nexus/home/projects/nexus/nexus-cli
git log --oneline 61206b8ab..053bb76bb

# See RENAME commits (branding reference)
git log --oneline 93564e35b..e52136b2a

# Diff your unique work vs baseline
git diff 61206b8ab^..053bb76bb -- src/

# See what moltbot looks like now
cd ~/nexus/home/projects/moltbot
git log --oneline main | head -20
```

---

## Next Actions

1. [ ] **Validate this plan** — does it capture your intent?
2. [ ] **Decide what ODU features to keep** — the 63 commits have a lot of architecture
3. [ ] **Start branding script** — use RENAME commits as reference
4. [ ] **Fork fresh from moltbot** when ready to execute

---

*This plan replaces the bulk-sync worktree approach with standalone repos.*
