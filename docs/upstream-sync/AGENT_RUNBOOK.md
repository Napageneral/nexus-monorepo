# Upstream Sync Agent Runbook

This runbook lets any agent pick up the upstream sync workflow immediately.
It explains how the queue works, how to claim work, and how to port safely.

---

## 1) What This Tool Tracks

**Pipeline (authoritative):**
```
Commits → Bundles → In Progress → Ready for Review → Merged
```

**Key files:**
```
.upstream-sync/state.json    # Persistent state (processed + bundle status)
.upstream-sync/queue.json    # Derived ordered queue (recomputed every run)
.upstream-sync/PORTING_CONTEXT.md
.upstream-sync/DIFFERENCES.md
.upstream-sync/DECISIONS.md
.upstream-sync/NOTES/
```

**Important rule:** The queue is fully ordered; there is no window.  
New commits appear at the end of the ordered list.

---

## 2) How the Queue Is Built

**Inputs:**
- Upstream: `upstream/main`
- Baseline: `3a8bfc0a5` (PR #733 merge)

**Rules:**
- Only **direct commits** are bundled into the queue.
- **Gating commits** = `feat` / `refactor`.
- Supporting commits = `fix` / `docs` / `test` / `chore` / `style` / `ci` / `build`.

**Ordering logic:**
1. Walk commits in chronological order.
2. When a gating commit appears:
   - enqueue that gating bundle immediately
   - flush any accumulated supporting bundles before continuing
3. Supporting bundles are grouped by `type + date`.

This ensures fixes from “next week” do not jump ahead of the features they
depend on.

---

## 3) Multi‑Agent Strategy (Recommended)

**Do NOT share a worktree.**  
Each agent should work in its own worktree and branch.

**Central coordination is built into the CLI:**
- Agents claim work via `bundle-pop`.
- The CLI uses a lock file so only one agent can claim at a time.
- State is updated automatically (no manual coordinator required).

---

## 4) Worktree Setup (per agent)

Create a new worktree and branch:
```
cd /Users/tyler/nexus/home/projects/nexus/nexus-cli
git worktree add -b port/<bundle-id>-<agent> ../worktrees/<agent>-<bundle-id> main
```

Example:
```
git worktree add -b port/bundle-2026-01-12-feat-32affaee-echo \
  ../worktrees/echo-bundle-2026-01-12-feat-32affaee main
```

---

## 5) How to Claim Work (Worker Flow)

Claim the next bundle in order:
```
bun run src/cli/upstream-sync-cli.ts bundle-pop --agent <name>
```

This marks the bundle `in_progress` and prints the bundle ID.
Create your worktree + branch immediately after claiming.
Record any special context in `.upstream-sync/DECISIONS.md` or a note under
`.upstream-sync/NOTES/`.

---

## 6) What the Agent Actually Does

Inside its worktree:

1. **Inspect upstream commits**
   ```
   git show <upstream-sha>
   ```
2. **Port changes into Nexus**
   - Preserve Nexus differences (see `DIFFERENCES.md`)
   - Follow `PORTING_CONTEXT.md`
3. **Commit**
   ```
   git commit -m "feat: port <original-type>: <subject>"
   ```
4. **Report back to coordinator**
   - Bundle ID
   - Port commit SHA
   - Notes on any adaptation

---

## 7) Mark Ready for Review / Merged

**Coordinator only:**

Ready for review:
```
bun run src/cli/upstream-sync-cli.ts bundle-status <bundle-id> \
  --status ready_for_review \
  --port-commit <sha>
```

Once merged:
```
bun run src/cli/upstream-sync-cli.ts mark-bundle <bundle-id> \
  --ported-in <sha>
```

If skipped:
```
bun run src/cli/upstream-sync-cli.ts mark-bundle <bundle-id> \
  --skip --reason "<why>"
```

---

## 8) Capture Learnings (Ralph‑style)

Whenever a port required adaptation:

- Add a note to `.upstream-sync/DECISIONS.md`
- Or create a bundle‑specific note in `.upstream-sync/NOTES/`

Suggested naming:
```
bundle-YYYY-MM-DD-<type>-<short-title>.md
```

---

## 9) Lock File Notes

State updates are protected by `.upstream-sync/state.lock`.

If you hit a lock error:
1. Read the lock file to see the PID and timestamp.
2. If the process is gone, remove the lock with `trash .upstream-sync/state.lock`.
3. Re-run the command.

You can tune lock timeouts with:
```
NEXUS_UPSTREAM_LOCK_WAIT_MS=5000
NEXUS_UPSTREAM_LOCK_STALE_MS=120000
```

---

## 10) Quality Bar

Follow:
- `.upstream-sync/PORTING_CONTEXT.md`
- `.upstream-sync/DIFFERENCES.md`

Avoid:
- Reverting Nexus branding
- Removing ODU/Nexus‑specific features

---

## 11) Quick Start (for new agents)

```
# 1) Ask coordinator for bundle ID
# 2) Create worktree + branch
# 3) Port changes
# 4) Send back commit SHA and notes
```
