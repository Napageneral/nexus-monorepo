# WIS-015 Runtime Restart Fencing And Active-Job Draining

## Goal

Prevent runtime restarts from tearing down active Dispatch and validation work
without graceful handling.

## Scope

- define the runtime behavior when restart or shutdown is requested while
  critical jobs are active
- add restart fencing, draining, or explicit interruption semantics for
  long-running stage jobs and proof lanes
- ensure active validation runs are either allowed to finish, drained
  deliberately, or marked interrupted before shutdown completes
- keep the runtime lifecycle truthful without leaving stuck leases or zombie
  jobs behind

## Acceptance

- a runtime restart no longer silently kills active Dispatch stage jobs
- active validation work is either drained gracefully or surfaced as an
  intentional interrupted state before shutdown
- operator- or supervisor-triggered restarts behave deterministically around
  active dogfood runs

## Current Evidence

- `nexus runtime restart --json` now fences restart while active work is
  running, instead of silently killing validation or Dispatch work mid-flight
- the live runtime restart request was initially blocked while `SPEC-259`
  still had active work, then succeeded once the runtime was idle again
- the old `dagrun_08c25142-1249-4b1a-9005-55f0b3a708c4` failure is no longer
  the current truth on the runtime lifecycle surface
