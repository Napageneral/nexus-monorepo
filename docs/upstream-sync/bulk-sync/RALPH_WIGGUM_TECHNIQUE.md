# The Ralph Wiggum Technique

> "I'm helping!" — Ralph Wiggum

## What Is This?

The Ralph Wiggum Technique is a pattern for iterative AI agent work on large, structured tasks. Instead of trying to accomplish everything in one session, you:

1. **Define a loop document** with clear state tracking
2. **Give the agent a tight scope** per iteration (one chunk, one task)
3. **Let the agent update state** as it completes work
4. **Resume from checkpoints** across sessions

This works because:
- AI agents excel at focused, well-defined tasks
- Large projects exceed context windows and session limits
- State files let you resume exactly where you left off
- Humans stay in control of the overall flow

---

## Core Components

### 1. Loop Document (`RALPH_LOOP.md`)
A markdown file that defines:
- **Goal**: What the full task accomplishes
- **Chunks**: Enumerated work units with status
- **Current State**: Which chunk is active, what step within it
- **Acceptance Criteria**: How to know a chunk is done
- **Next Action**: What Ralph should do RIGHT NOW

### 2. State Tracking
Each chunk has a status:
- `pending` — Not started
- `in_progress` — Currently being worked
- `blocked` — Waiting on external input
- `done` — Completed and verified
- `skipped` — Intentionally not doing

### 3. Iteration Protocol
On each invocation, Ralph:
1. Reads the loop document
2. Finds the current active chunk
3. Does ONE unit of work
4. Updates the state
5. Stops (or continues if explicitly told to batch)

---

## Why "Ralph Wiggum"?

Ralph Wiggum is earnest, helpful, and does exactly what he's told. He doesn't overthink, doesn't try to be clever, and happily reports "I'm helping!" when he completes a task.

This is the ideal agent mindset for iterative work:
- Follow the spec, don't improvise
- Complete the task, update state, stop
- Don't try to do everything at once
- Stay cheerful and productive

---

## Pattern Template

### Loop Document Structure

```markdown
# RALPH_LOOP: [Project Name]

## Goal
[1-2 sentence description of the overall objective]

## Current State
- **Active Chunk**: CHUNK-XX
- **Step**: [current step within chunk]
- **Last Updated**: [timestamp]
- **Blockers**: [any blockers, or "none"]

## Chunks

| ID | Name | Status | Notes |
|----|------|--------|-------|
| CHUNK-00 | First thing | done | completed 2026-01-20 |
| CHUNK-01 | Second thing | in_progress | working on step 2 |
| CHUNK-02 | Third thing | pending | |
| ... | | | |

## Acceptance Criteria
- [ ] All chunks marked `done` or `skipped`
- [ ] Build passes: `pnpm build`
- [ ] Tests pass: `pnpm test`
- [ ] [project-specific criteria]

## Iteration Protocol

### On Each Run
1. Read this document
2. Find the first `in_progress` or `pending` chunk
3. Read the chunk's REVIEW and SPEC files (if they exist)
4. Execute the specified work
5. Verify the work (build, test, manual check)
6. Update this document:
   - Mark chunk `done` if complete
   - Update "Current State" section
   - Add notes about what was done
7. Stop unless explicitly batching multiple chunks

### Commands
- **Start**: Find first `pending` chunk, mark `in_progress`, begin work
- **Continue**: Resume `in_progress` chunk
- **Skip**: Mark current chunk `skipped` with reason
- **Block**: Mark current chunk `blocked` with reason
- **Complete**: Mark current chunk `done`, find next

## Chunk Details
[Links to REVIEW/SPEC files for each chunk]
```

---

## Usage

### Starting a Loop
```
You are Ralph. Read RALPH_LOOP.md and begin work on the first pending chunk.
Follow the iteration protocol exactly.
```

### Continuing a Loop
```
You are Ralph. Continue from where you left off in RALPH_LOOP.md.
Complete the current chunk, update state, and stop.
```

### Batching Multiple Chunks
```
You are Ralph. Process the next 3 chunks in RALPH_LOOP.md.
For each chunk: complete, verify, update state, then continue to next.
Stop after 3 chunks or if you hit a blocker.
```

### Reviewing Progress
```
Summarize the current state of RALPH_LOOP.md.
What's done, what's in progress, what's blocked?
```

---

## Anti-Patterns

### Don't Do This
- **Scope creep**: "While I'm here, let me also..."
- **Skipping verification**: Moving on without checking work
- **State drift**: Forgetting to update the loop document
- **Heroic sessions**: Trying to finish everything in one run
- **Improvising**: Doing things not specified in the chunk

### Do This Instead
- **Stay focused**: One chunk, one task
- **Verify always**: Build/test after each change
- **Update state**: Keep the loop document accurate
- **Stop cleanly**: Leave a clear checkpoint
- **Follow the spec**: Trust the planning that was done

---

## Integration with Existing Work

If you already have planning documents (like REVIEW/SPEC files):
1. Reference them from the loop document
2. Don't duplicate content — link to it
3. Let the loop document track state only
4. Let the specs define the actual work

The loop document is the **conductor**, not the **score**.
