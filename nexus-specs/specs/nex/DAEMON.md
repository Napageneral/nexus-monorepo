# NEX Daemon

**Status:** CANONICAL
**Last Updated:** 2026-03-06
**Related:** [NEXUS_REQUEST_TARGET.md](./NEXUS_REQUEST_TARGET.md), [COMMUNICATION_MODEL.md](./COMMUNICATION_MODEL.md), [WORK_DOMAIN_UNIFICATION.md](./WORK_DOMAIN_UNIFICATION.md), [ADAPTER_INTERFACE_UNIFICATION.md](./ADAPTER_INTERFACE_UNIFICATION.md), [RUNTIME_API_BOUNDARY_AND_EXTENSION_OWNERSHIP.md](./RUNTIME_API_BOUNDARY_AND_EXTENSION_OWNERSHIP.md)

---

## Overview

The NEX daemon is the persistent runtime process for Nexus.

It owns:

- configuration loading
- ledger lifecycle
- the 5-stage request pipeline
- internal pubsub
- runtime API surfaces
- adapter supervision
- the durable work dispatcher and queue workers
- work runtime supervision

It is the one long-lived process that turns external ingress, internal runtime events, jobs, and agent execution into one coherent system.

---

## Operator Experience

From an operator perspective:

- when the daemon is up, adapters can ingest, the runtime API can serve requests, scheduled work can fire, and agent runs can proceed
- when the daemon is down, Nexus is effectively offline
- health reporting comes from one place
- startup and shutdown are explicit, supervised, and auditable

The daemon should feel like the single runtime boundary for the whole platform, not one service among many loosely coupled peers.

---

## Core Runtime Model

At runtime, the daemon coordinates these subsystems:

```text
config
  -> ledgers
  -> pipeline
  -> pubsub
  -> runtime API surfaces
  -> adapter manager
  -> work runtime
```

### Ledgers

The daemon opens and migrates the runtime ledgers it owns:

- `records.db`
- `agents.db`
- `identity.db`
- `memory.db`
- `embeddings.db`
- `runtime.db`
- `work.db`

### Pipeline

All operations, regardless of source, flow through:

```text
acceptRequest -> resolvePrincipals -> resolveAccess -> executeOperation -> finalizeRequest
```

`record.ingest` is the canonical live-ingress path for one external record.

### PubSub

Internal runtime notifications are published on pubsub.

Examples:

- `record.ingested`
- broker lifecycle events
- worker lifecycle events
- system readiness or degradation events

Pubsub is internal runtime signaling.
It is not the persisted record ledger.

### Adapter Manager

The adapter manager supervises inbound and outbound adapter connections.

Platform adapters:

- emit external records into `record.ingest`
- perform outbound delivery for broker-invoked agent responses

### Work Runtime

The work runtime supervises:

- `event_subscriptions`
- `job_schedules`
- `job_queue`
- `job_runs`
- DAG advancement
- job execution

Time-based work is executed as jobs.
The daemon does **not** model time as synthetic inbound records.

---

## Startup Sequence

Canonical startup order:

1. acquire PID lock
2. load and validate config
3. initialize logging
4. open and migrate ledgers
5. initialize pubsub
6. initialize the request pipeline and hookpoint dispatch
7. start runtime API surfaces
8. start the adapter manager and enabled adapter connections
9. start the work runtime, dispatcher, queue workers, and cron evaluation loop
10. publish ready state and accept normal traffic

This order matters:

- ledgers must exist before runtime services can write state
- the pipeline must exist before adapters or runtime API surfaces can submit operations
- the work runtime should only start after the pipeline and ledgers are available

---

## Locking and Single-Process Ownership

The daemon owns a PID lock under Nexus state.

Rules:

1. only one daemon instance may own the runtime state at a time
2. stale locks from crashed processes may be cleared after process liveness verification
3. startup fails fast if another live daemon already owns the lock

This prevents split-brain behavior across ledgers, adapters, and cron execution.

---

## Configuration

The daemon loads canonical Nexus configuration before touching runtime state.

Representative configuration areas:

- `runtime.*`
- `adapters.*`
- `memory.*`
- `work.*`
- `pubsub.*`

Configuration validation is fail-fast:

- invalid config prevents startup
- partial boot is not acceptable

---

## Database Initialization

Each ledger is opened and migrated before the daemon begins accepting traffic.

Rules:

1. every owned ledger has schema-version tracking
2. migrations either complete successfully or startup fails
3. the daemon never runs with partially migrated state

The ledgers serve distinct roles:

- `records.db` for canonical external records
- `agents.db` for conversations, sessions, turns, messages, and tool calls
- `identity.db` for entities, contacts, ACL, grants, and audit
- `memory.db` for elements and sets
- `embeddings.db` for vector search structures
- `runtime.db` for runtime requests, adapter state, Nexus-owned runtime configuration, workspaces, and internal runtime bookkeeping
- `work.db` for jobs, event subscriptions, job schedules, DAGs, mutable leased queue state, immutable job runs, and agent configs

---

## Ingress Responsibilities

The daemon accepts operations from multiple sources, but all of them converge into one pipeline.

### External Record Ingress

External platform traffic arrives through adapters and becomes `record.ingest`.

Canonical flow:

```text
adapter -> record.ingest -> pipeline -> persist/dedupe record -> publish record.ingested
```

### Runtime API Operations

The runtime API may submit:

- `record.ingest`
- read operations
- management operations
- broker and work operations

These still use the same request pipeline.

### Internal Runtime Signals

Internal runtime signals do **not** masquerade as external records.

Examples:

- readiness changes
- cron firings
- broker hook points
- worker lifecycle events

These are internal pubsub events or direct work-runtime actions.

---

## Adapter Supervision

The daemon is responsible for adapter lifecycle:

- starting enabled adapters
- monitoring health
- restarting when policy allows
- tracking connection status
- routing outbound delivery requests

The important boundary is:

- adapters own external protocol behavior
- the daemon owns runtime coordination, stamping, and supervision

The daemon should verify that each running adapter instance is allowed to represent the configured source it claims to handle.

---

## Work Runtime Responsibilities

The daemon owns the work runtime loop.

That includes:

- evaluating due `job_schedules`
- matching internal runtime events against active `event_subscriptions`
- enqueueing durable work into `job_queue`
- leasing queue rows to workers
- creating and finalizing `job_runs`
- advancing DAGs after upstream node completion
- recording job status and metrics

The work runtime may invoke:

- pure jobs
- broker-managed agent runs
- follow-on internal runtime publications

Blocking hook-point jobs remain inline on the request or broker lifecycle path.
They may still produce `job_runs`, but they do not require queue leasing.

The key architecture rule is:

**time-based and event-reactive work is modeled as jobs, durable queue state, and immutable job runs, not as synthetic external ingress records**

---

## Health Model

The daemon exposes a health surface for operators and tooling.

Health should at minimum cover:

- daemon liveness
- ledger availability
- adapter status
- pipeline capacity
- work-runtime status

Overall health should distinguish:

- healthy
- degraded
- unhealthy

The goal is operational clarity, not just “process exists”.

---

## Shutdown

Canonical shutdown order:

1. stop accepting new runtime API traffic
2. stop accepting new adapter ingress
3. stop dispatching new scheduled work
4. allow in-flight requests and jobs to finish or abort by policy
5. flush logs and final runtime state
6. close ledgers
7. remove PID lock

Shutdown should be clean and predictable.
The daemon should not leave half-owned adapter processes or ambiguous cron ownership behind.

---

## Non-Goals

The daemon is not:

- a fake ingress adapter that converts internal timers into external records
- a plugin host for parallel legacy extension systems
- a separate routing model from the request pipeline

Those older shapes are superseded by the canonical pipeline, pubsub, and work runtime model.

---

## Naming Locks

- external persisted ingress object: `record`
- internal notification: `event`
- canonical live ingress operation: `record.ingest`
- canonical internal ingest notification: `record.ingested`
- time-based and event-reactive work primitives: `event_subscriptions` + `job_schedules` + `job_queue` + `job_runs`
- no top-level `automation` subsystem
