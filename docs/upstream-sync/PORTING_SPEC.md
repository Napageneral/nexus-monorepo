# Upstream Sync Spec (Direct Commits First)

This spec defines how Nexus tracks, bundles, and ports upstream changes from
`legacy/legacy` into `Napageneral/nexus`. The primary focus is the
maintainer's direct commits, with PR merges tracked separately and lower
priority.

---

## Goals

1. **Never re-process the same upstream commit.**
2. **Keep state accurate without manual cleanup.**
3. **Bundle direct commits into a chronological, manageable queue.**
4. **Prioritize features/refactors before later fixes.**
5. **Capture porting decisions and differences in one place.**

## Non-goals (for now)

- GitHub Projects or PR-based tracking UI.
- Full diff-equivalence detection (patch-id) for ported commits.
- Automatic merging without review.

---

## Baseline

We explicitly set a baseline commit in upstream and consider everything after
that commit as the "backlog."

**Initial baseline (agreed):**
- Upstream commit: `3a8bfc0a5` (Merge PR #733)
- Baseline date: 2026-01-11

The baseline is stored in state and can be moved forward later.

---

## Data Sources

### Upstream (authoritative)
- Remote: `upstream` -> `https://github.com/legacy/legacy.git`
- Branch: `upstream/main`
- Query: `git log <baseline>..upstream/main`

### Nexus (local)
- Branch: `main`
- Used to validate that port commits actually exist.

---

## State Model

We keep **minimal persistent state** and recompute the queue every run.

### Persistent State (source of truth)
File: `.upstream-sync/state.json`

```json
{
  "baseline": "3a8bfc0a5",
  "baselineDate": "2026-01-11",
  "baselineNote": "PR #733 merge",
  "processed": {
    "<upstream-sha>": {
      "status": "ported|skipped",
      "portedIn": ["<nexus-sha>", "..."],
      "reason": "optional skip reason",
      "notes": "optional",
      "updatedAt": "ISO timestamp"
    }
  },
  "bundleState": {
    "<bundle-id>": {
      "status": "queued|in_progress|ready_for_review|merged|skipped",
      "portBranch": "port/bundle-...",
      "portCommit": "<sha>",
      "updatedAt": "ISO timestamp"
    }
  }
}
```

### Derived State (recomputed each run)
File: `.upstream-sync/queue.json` (generated, not manually edited)

```json
{
  "generatedAt": "ISO timestamp",
  "upstreamHead": "<sha>",
  "queue": [
    {
      "id": "bundle-001-feat-2026-01-11-15d286b6",
      "type": "feat",
      "dateRange": "2026-01-11",
      "commits": ["<sha>", "..."],
      "status": "queued"
    }
  ]
}
```

### Append-only Ledger (optional but recommended)
File: `.upstream-sync/ledger.jsonl`

Each line records a decision or transition:
```
{"ts":"...","action":"ported","upstream":"<sha>","portedIn":"<sha>"}
{"ts":"...","action":"skipped","upstream":"<sha>","reason":"windows-only"}
```

---

## Commit Classification

We parse conventional commit types from subject lines:

- **Gating types (block progress):** `feat`, `refactor`
- **Supporting types (batchable):** `fix`, `docs`, `test`, `chore`, `style`, `ci`, `build`
- **Other:** anything else (treated as supporting unless configured)

This classification is deterministic and re-runs on every sync.

---

## Bundling and Ordering (Chronological + Gating)

We want **chronological ordering** and **feature/refactor-first gating**.

### High-level rule

> Bundle supporting commits until a feature/refactor appears.  
> Then handle the feature/refactor *first* before continuing.

### Algorithm (deterministic)

1. Get upstream commits since baseline, oldest -> newest.
2. Skip any commit already in `processed`.
3. Build a queue of bundles using a gating walk:

```
supporting = []
queue = []

for commit in chronological_upstream:
  if commit.type in {feat, refactor}:
    # 1) create a gating bundle for this commit (or small cluster)
    queue.append(gating_bundle(commit))

    # 2) flush supporting bundle(s) that occurred before this gating commit
    queue.extend(bundle_supporting(supporting))
    supporting = []
  else:
    supporting.append(commit)

# flush remaining supporting commits
queue.extend(bundle_supporting(supporting))
```

### Supporting bundle rules

- Group by **type + date** within each segment.
- If a bundle exceeds a size threshold, split into parts (A/B/C).
- Keep supporting bundles strictly chronological **within their segment**.

### Gating bundle rules

- Default: one gating commit per bundle
- Optional: allow small clusters by (date + scope) if needed

### Ordering Guarantee

The queue is ordered so that **no fixes/docs/tests from after a feature/refactor
are processed before that feature/refactor is handled.**

---

## Verification & Reconciliation (Every Run)

**On every sync run:**

1. `git fetch upstream main`
2. Rebuild the upstream commit list from baseline
3. Recompute derived queue
4. Validate persistent state:
   - If `portedIn` commit does not exist in `main`, mark as `needs_attention`
   - If a bundle marked `in_progress` has no branch, reset to `queued`
   - If a processed upstream SHA no longer exists (force-push), mark `orphaned`
5. Save updated state and queue

**Key invariants:**
- **No commit appears in queue if status is `ported` or `skipped`.**
- **Queue order is deterministic and reproducible.**
- **Every state transition is logged.**

---

## Coordination (Multi‑Agent Safe)

The CLI uses a **state lock** to serialize updates.  
Workers should use `bundle-pop` to claim work without conflicts.

If a lock becomes stale (agent crashed), remove it with `trash .upstream-sync/state.lock`.

Example:
```
bun run src/cli/upstream-sync-cli.ts bundle-pop --agent echo
```

This claims the next queued bundle and sets it to `in_progress`.

---

## Porting Workflow

1. **Pick next bundle** from queue (top of list).
2. Mark bundle `in_progress`.
2. Create port branch: `port/<bundle-id>`.
3. Port commits (manual or agent) using `PORTING_CONTEXT.md`.
4. Mark bundle `ready_for_review`.
5. Review and merge into `main`.
6. Mark bundle `merged`.
7. For each upstream commit in the bundle:
   - Mark as `ported`
   - Record the nexus port commit SHA(s)

---

## Documentation & Decision Tracking

All porting docs live inside `.upstream-sync/`.

```
.upstream-sync/
├── PORTING_SPEC.md        (this file)
├── DIFFERENCES.md         (how nexus diverges from legacy)
├── DECISIONS.md           (why we ported/skipped things)
└── NOTES/                 (per-bundle notes, optional)
```

**Rules:**
- Any non-trivial adaptation gets a note in `DECISIONS.md`.
- If upstream changes conflict with Nexus direction, record skip reason.

---

## Agent Context (Quality Ports)

Agents must be given:

- `.upstream-sync/DIFFERENCES.md`
- `.upstream-sync/DECISIONS.md`
- `.upstream-sync/PORTING_CONTEXT.md`

They should be instructed to:
- Preserve Nexus-specific architecture (ODU, Nexus config extensions)
- Avoid legacy branding regressions
- Document adaptations in commit message

---

## Status Summary Output (CLI)

`upstream-sync status` should report:

- Baseline commit + date
- Upstream head
- Total direct commits since baseline
- Processed: ported / skipped
- Queue: queued / in_progress / ready_for_review / merged
- Backlog: remaining unqueued bundles

---

## Implementation Notes

- Use the **local upstream remote** (no separate clone).
- Avoid patch-id matching; ports are adapted, not identical.
- Keep persistent state minimal and authoritative.
- Keep queue derived and reproducible.

