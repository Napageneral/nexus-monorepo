# OCI-001 Harness and Boot Infrastructure

## Goal

Create the operator console cleanroom integration script that extends the
existing nex Docker cleanroom infrastructure to test console-specific RPC paths.

## Existing Infrastructure (DO NOT DUPLICATE)

The following already exist and must be reused:

- `nex/scripts/e2e/Dockerfile` — shared Docker image
- `nex/scripts/e2e/runtime-capability-matrix-cleanroom-docker.sh` — existing
  capability matrix that already tests: runtime.health, status, search.status,
  models.defaults.get, memory.sets/elements, entities.list, contacts.list,
  credentials CRUD, workspaces CRUD+files, roles CRUD, agents.sessions lifecycle
- `nex/src/api/call.ts` — the `callRuntime()` WebSocket RPC helper
- `nex/scripts/e2e/capture-cleanroom-proof.sh` — shared proof capture

## Scope

- `nex/scripts/e2e/operator-console-domains-cleanroom-docker.sh` — Docker
  wrapper following the exact same pattern as
  `runtime-capability-matrix-cleanroom-docker.sh` (same Dockerfile, same boot,
  same init+onboard sequence, same `callRuntime` import)
- The inline Node.js test section covers ONLY the console-specific RPC methods
  NOT already covered by the capability matrix:
  - agents.list/create/update/delete
  - agents.identity.get, agents.files.*, agents.skills.status
  - adapters.connections.list, channels.*, apps.*
  - config.get/set/apply
  - schedule.jobs.* CRUD
  - identity.surface, identity.merge.*
  - memory.review.*, memory.search
  - monitor.operations.list/stats
  - auth.tokens.* (ingress credentials)
  - acl.requests.list
  - presence.list, sessions.list, logs.recent, debug.snapshot, usage.*
  - agents.conversations.*, agents.sessions.send
- `nex/scripts/e2e/operator-console-domains-cleanroom-capture.sh` — Proof
  capture wrapper

## Dependencies

- Working `nex/scripts/e2e/Dockerfile` (already exists)
- `capture-cleanroom-proof.sh` (already exists)
- `src/api/call.ts` with `callRuntime` (already exists)

## Acceptance

1. The script boots nex in Docker using the existing Dockerfile
2. Uses the same init+onboard+start_runtime pattern as the capability matrix
3. Exercises every console-specific RPC method listed above
4. Writes structured proof artifacts (domain-level JSON files)
5. The capture wrapper produces a proof bundle

## Validation

- The script runs to completion inside Docker
- All domain tests pass or fail with structured error messages
- No overlap with tests already in runtime-capability-matrix
