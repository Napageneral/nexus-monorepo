# Spike Gap Analysis

**Status:** ACTIVE
**Last Updated:** 2026-03-08

---

## Purpose

This document compares the active Spike specs against the current Spike code,
package contract, and known hosted behavior.

It is a workplan artifact, not a target-state spec.

The goal is to identify the concrete implementation gaps that still prevent the
active Spike docs from being a faithful description of the running system.

---

## Customer And Operator Target

The intended customer and operator experience is:

1. frontdoor installs Spike as a normal hosted app
2. the user launches Spike through the frontdoor shell profile
3. Spike manages repositories, worktrees, indexes, and ask requests as a code
   research product
4. generic execution history comes from canonical Nex session APIs and
   `agents.db`
5. app-owned data and Nex-owned execution tell one coherent story

The active target-state source of truth for this review is:

- `docs/specs/SPIKE_OBJECT_TAXONOMY.md`
- `docs/specs/SPIKE_APP_AND_PACKAGE_MODEL.md`
- `docs/specs/SPIKE_PRODUCT_CONTROL_PLANE.md`
- `docs/specs/SPIKE_SESSION_AND_EXECUTION_OWNERSHIP.md`
- `docs/specs/SPIKE_STORAGE_BOUNDARY.md`
- `docs/specs/SPIKE_DATA_MODEL.md`
- `docs/specs/SPIKE_INTEGRATIONS_AND_CALLBACK_OWNERSHIP.md`
- `nexus-specs/specs/ledgers/AGENTS_LEDGER.md`
- `nexus-frontdoor/docs/specs/FRONTDOOR_HOSTED_ACCESS_AND_ROUTING.md`
- `nexus-frontdoor/docs/specs/FRONTDOOR_PACKAGE_REGISTRY_AND_LIFECYCLE.md`

---

## Gap 1: Session And Execution Ownership Drift

### Target state

The active Spike specs now say:

- Spike does not own a private broker
- Nex owns sessions, turns, messages, and tool calls
- Spike ask requests link to Nex execution instead of duplicating transcript
  ownership

### Current state

The implementation still owns a full Spike-local broker/session stack:

- `service/internal/broker/` remains active
- `service/internal/broker/ledger.go` still creates and migrates session,
  turn, message, and tool-call tables in Spike storage
- `service/internal/prlm/tree/oracle.go` still writes ask-request data beside
  local session state and reads from local `sessions`
- `service/cmd/spike-engine/nex_protocol.go` still exposes `spike.sessions.*`
- `service/cmd/spike-engine/serve_sessions_test.go` and other tests still treat
  Spike as the owner of session control-plane operations

### Why it matters

This is now the biggest architecture mismatch in the repo.

As long as Spike owns a local broker:

- `spike.db` is not telling the same story as the active specs
- the UI cannot be cleanly redesigned around Nex-owned session history
- future Git history / memory work stays bolted on rather than native to Nex

### Required cutover

1. route ask execution through canonical Nex agent/session APIs
2. remove the Spike-local broker as the target-state execution owner
3. delete the Spike-owned session control surfaces that only exist to manage
   the private broker

---

## Gap 2: Storage Boundary Drift

### Target state

The active storage docs now say:

- `spike.db` is product-only storage
- `agents.db` is the durable system of record for execution history
- ask requests store Nex linkage, not local transcript ownership

### Current state

Spike storage still encodes the old unified-db model:

- `service/internal/broker/ledger.go` adds `index_id` columns to broker tables
  in Spike storage
- `service/internal/spikedb/schema.go` still defines `ask_requests` in legacy
  `tree_id` form and still carries `tree_versions`
- `service/internal/prlm/store/schema.go` still carries the legacy ask-request
  table shape
- tests still assert that ask/session history is stored in Spike-local tables

### Why it matters

Even if execution were redirected tomorrow, the storage contract would still be
wrong.

The target-state implementation needs a clean line between:

- Spike product rows
- Nex execution history rows

### Required cutover

1. remove session/turn/message/tool-call ownership from Spike-local schema
2. rewrite `ask_requests` around `index_id` plus Nex execution linkage
3. either delete or explicitly redesign `tree_versions` if it remains needed

---

## Gap 3: Vocabulary And API Surface Drift

### Target state

Spike's external model uses:

- `AgentIndex`
- `index_id`
- `ask request`
- `git mirror`
- `worktree`

The active specs no longer treat `tree` as the default customer-facing object.

### Current state

The code and manifest still expose a mixed legacy vocabulary:

- `app/app.nexus.json` still uses `tree_id` across `spike.sync`,
  `spike.jobs.list`, `spike.ask-requests.*`, and `spike.sessions.*`
- `app/dist/inspector.html` still renders `tree_id` and `tree versions`
- `service/cmd/spike-engine/github_connector.go` still resolves connector state
  by `tree_id`
- `service/internal/spikedb/schema.go` still mixes `tree_id` and `index_id`

### Why it matters

The customer should not need to understand whether Spike's primary object is a
tree, a tree version, or an `AgentIndex`.

### Required cutover

1. hard-cut app-facing ask/request surfaces to `index_id`
2. remove or redesign `tree_versions` as part of the surviving object model
3. align manifest methods, handlers, and UI to one vocabulary

---

## Gap 4: UI Surface Drift

### Target state

The active Spike specs imply:

- repository -> worktree -> `AgentIndex` as the product flow
- ask requests as the product execution object
- session/timeline views as projections over Nex-owned history

### Current state

The live UI is still mixed-state:

- `app/dist/index.html` is more index-oriented
- `app/dist/inspector.html` is still a legacy tree-version/session inspector
- the inspector still expects `tree_id` and renders local execution concepts
  such as `root_tool_calls`

### Why it matters

Incrementally renaming fields in the current inspector would preserve the wrong
product shape.

### Required cutover

1. do not preserve the legacy inspector as the primary model
2. redesign request inspection after the backend session/storage cutover
3. make UI surfaces index-centric and ask-request-centric

---

## Gap 5: Callback And Webhook Ownership Drift

### Target state

The active integration spec says:

- reusable shared-adapter ingress is runtime-owned
- Spike-owned product callbacks live under `/app/spike/callbacks/...`
- Spike-owned product webhooks live under `/app/spike/webhooks/...`

### Current state

The service still mounts legacy routes such as:

- `/github/webhook`
- `/connectors/github/install/start`
- `/connectors/github/install/callback`
- `/connectors/github/repos`
- `/connectors/github/branches`
- `/connectors/github/commits`
- `/connectors/github/remove`
- `/connectors/github/setup`

### Why it matters

Spike is still carrying provider ingress behavior that the active docs moved
into shared adapter/runtime or canonical app-owned surfaces.

### Required cutover

1. remove legacy `/connectors/github/...` and `/github/webhook` as canonical
   product surfaces
2. keep only the surviving ownership model described by the active specs
3. update tests accordingly

---

## Gap 6: Configuration And Credential Delivery Drift

### Target state

The active docs say:

- shared adapter state lives outside Spike
- Spike consumes explicit hosted configuration and connection bindings
- undocumented process-env inheritance is not the long-term contract

### Current state

Spike service startup still reads direct process env for hosted behavior and
provider/model access, including:

- `SPIKE_AUTH_TOKEN`
- `SPIKE_TRUSTED_PROXIES`
- `SPIKE_GITHUB_WEBHOOK_SECRET`
- `SPIKE_GITHUB_APP_SLUG`
- `SPIKE_GITHUB_APP_ID`
- `SPIKE_GITHUB_APP_PRIVATE_KEY`
- `SPIKE_GITHUB_API_BASE_URL`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`

### Why it matters

The code is still wired to local environment assumptions rather than a locked
hosted contract.

### Required cutover

1. define the surviving Spike-specific config surface explicitly
2. move reusable provider state back to shared adapter/runtime ownership
3. stop treating raw env inheritance as the architecture story

---

## Gap 7: Release And Lifecycle Drift

### Target state

Hosted lifecycle docs require:

- one published package as the source of truth
- deterministic install and upgrade behavior
- runtime/operator lifecycle support that matches the docs

### Current state

Known live behavior still diverges:

- local tarball state, published package state, and tenant-installed package
  state have been able to drift
- the live tenant runtime previously lacked the expected clean upgrade path,
  forcing an on-disk hotfix instead of a normal lifecycle upgrade

### Why it matters

Even correct local code is not enough if the hosted release story is not
deterministic.

### Required cutover

1. converge local, published, and installed package state into one release
   story
2. gate install/upgrade on runtime capability
3. smoke-test the frontdoor shell and runtime bridge before release promotion

---

## Frontdoor Dependency Points

The stable frontdoor replacement docs exist, but downstream follow-through still
matters in:

- `nexus-frontdoor/docs/specs/FRONTDOOR_ARCHITECTURE.md`
- `nexus-frontdoor/docs/specs/CRITICAL_CUSTOMER_FLOWS_2026-03-02.md`
- `nexus-frontdoor/docs/specs/CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md`

This does not block Spike-local spec alignment. It does still affect final
hosted fidelity.

---

## Immediate Next Work

1. cut the Spike broker out of the ask/session path
2. rewrite Spike storage and ask-request schema around Nex execution linkage
3. remove legacy session and tree-centric API surfaces
4. redesign the UI after the backend boundary is in place
5. finish GitHub route/config ownership cleanup
