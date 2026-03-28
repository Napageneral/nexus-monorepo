# OCI-005 Identity, Memory, and Schedules Domain Tests

## Goal

Prove that the identity graph, memory review, and schedule/jobs controller paths
work against a real runtime.

## Scope

Tests for:

**Identity:**
- `identity.surface` — returns contacts, channels, groups, policies, merges
- `entities.list` — returns entities array
- `contacts.list` — returns contacts array
- `identity.merge.candidates` — returns merge candidates (may be empty)

**Memory:**
- `memory.review.runs` — returns memory runs (may be empty on fresh boot)
- `memory.review.episodes` — returns episodes for a run
- `memory.search` — performs a search (may return empty results)
- `memory.review.quality.summary` — returns quality summary

**Schedules:**
- `schedule.jobs.list` — returns jobs array
- `schedule.jobs.add` — creates a scheduled job
- `schedule.jobs.list` (post-add) — includes the new job
- `schedule.jobs.toggle` — enables/disables a job
- `schedule.jobs.run` — triggers immediate execution
- `schedule.jobs.remove` — deletes a job
- `schedule.runs.list` — returns run history

## Dependencies

- OCI-001 (harness and boot)

## Acceptance

1. Identity endpoints return valid shapes (may be empty)
2. Memory endpoints return valid shapes (may be empty)
3. Schedule CRUD lifecycle completes without errors
4. Schedule list after add includes the new job
5. Schedule list after remove excludes the deleted job

## Validation

- Identity surface returns the expected top-level keys
- Schedule CRUD round-trip proves create-list-toggle-remove consistency
