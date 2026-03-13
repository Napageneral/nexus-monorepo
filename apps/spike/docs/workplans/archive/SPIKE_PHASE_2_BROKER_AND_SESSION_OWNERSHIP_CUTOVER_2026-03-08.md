# Spike Phase 2 Broker And Session Ownership Cutover

**Status:** ACTIVE
**Last Updated:** 2026-03-08

---

## Purpose

This document is the dedicated implementation workplan for Phase 2 of
`SPIKE_WORKPLAN.md`.

It turns the new canonical Spike ownership specs into one concrete backend
cutover plan:

- keep the Spike DAG and product behavior
- delete the private Spike broker as the primary execution substrate
- move durable execution history into Nex-owned session APIs and `agents.db`

This is a hard cutover plan.

**NO BACKWARD COMPATIBILITY.**

---

## Customer Experience

The intended customer experience during and after Phase 2 is:

1. the user selects an `AgentIndex`
2. the user asks Spike a question
3. `spike.ask` still returns one usable final answer from the same Spike
   product surface
4. Spike still performs the same recursive routing, prompt construction,
   sandboxed code inspection, and final synthesis
5. ask-request inspection is still possible, but the durable history now comes
   from Nex-owned session history instead of a private Spike ledger

The intended operator experience is:

1. Spike remains the owner of repository, worktree, index, and ask-request
   product behavior
2. Nex becomes the owner of session, turn, message, tool-call, and execution
   lineage storage
3. there is no second transcript system inside Spike

---

## Scope

This workplan covers:

- `spike.ask` backend execution
- recursive DAG prompt execution in `OracleNode`
- ask-request execution linkage
- session and transcript ownership cutover
- removal of live `spike.sessions.*` and `/sessions/*` surfaces

This workplan does not cover:

- major UI redesign
- full `tree_id` vocabulary cleanup beyond what Phase 2 must touch
- Git history / memory ingest
- GitHub callback ownership cleanup
- hosted package lifecycle cleanup

Those remain in later phases of `SPIKE_WORKPLAN.md`.

---

## Current State

The current code path is still split across a Spike-local execution system.

### Product path

- the main UI in `app/dist/index.html` already calls `spike.ask` with
  `index_id`
- `service/cmd/spike-engine/nex_handlers.go` routes `spike.ask` into
  `tree.oracle.AskWithOptions(...)`

### DAG execution path

- `service/internal/prlm/tree/oracle.go` creates `ask_requests` rows and then
  runs the recursive DAG
- `service/internal/prlm/tree/oracle_node.go` builds sandboxes, dispatches
  child work, and executes prompts
- each prompt step currently does:
  1. build or reuse the node sandbox
  2. create a Spike-local broker session
  3. execute the prompt through the Spike broker
  4. stop the session
  5. persist session history inside Spike-owned tables

### Storage path

- `service/internal/spikedb/schema.go` and
  `service/internal/prlm/store/schema.go` still define `ask_requests` around
  `tree_id` and `root_turn_id`
- `service/internal/broker/ledger.go` still owns `sessions`, `turns`,
  `messages`, and `tool_calls` in Spike storage

### Surface residue

- `app/app.nexus.json` still exposes `spike.sessions.*`
- `service/cmd/spike-engine/serve.go` still mounts `/sessions/*`
- `service/cmd/spike-engine/nex_protocol.go` still registers local
  `spike.sessions.*` handlers

### Structural note

`service/internal/prlm/tree/oracle_node.go` also imports
`broker.RunParallel(...)` as a generic fan-out helper. That helper must be
extracted or replaced during the cutover so harmless concurrency code does not
keep the losing broker package alive.

---

## Canonical Decisions

### 1. `spike.ask` remains a Spike-owned product operation

`spike.ask` does not become a thin alias for `events.ingest`.

The correct model is:

- the UI calls `spike.ask`
- Spike owns the DAG and product orchestration
- Spike uses Nex as the execution substrate and transcript ledger under that
  product surface

### 2. Spike keeps the DAG

Spike continues to own:

- `AgentIndex` selection
- domain assembly
- recursive routing
- interpret / dispatch / synthesize prompt construction
- degraded-completion policy
- sandbox creation and cleanup

Phase 2 replaces the execution substrate, not the Spike DAG.

### 3. Nex owns execution and transcript history

Every prompt step that is currently executed through the private Spike broker
must move to canonical Nex execution.

Spike must not directly write `agents.db`.

Spike must call canonical runtime operations from the app service side.

### 4. `spike.ask` remains synchronous in Phase 2

The product response contract stays the same for now:

- Spike returns a final answer from `spike.ask`
- Spike may internally orchestrate multiple Nex calls to achieve that
- async ask and UI redesign remain later work

### 5. One ask request has one primary execution lineage

Each `ask request` has one primary Nex execution lineage anchored by a
deterministic root session key:

- `spike:ask:{request_id}`

That root lineage is the canonical execution anchor stored on the
Spike-owned `ask_requests` row.

### 6. Each DAG prompt step gets its own child session

To preserve current Spike behavior, each prompt step remains stateless at the
execution level.

The execution unit is:

- one node
- one phase
- one attempt

Each such step gets a deterministic child session key:

- `spike:ask:{request_id}:node:{node_id}:phase:{phase}:attempt:{attempt}`

This preserves the current “fresh execution per prompt step” behavior instead
of collapsing the entire DAG into one long shared conversation.

### 7. Stable workspace and per-step working directory are split

The canonical execution context split is:

- one stable Nex `workspace_id` per `AgentIndex`
- one per-step `working_dir` equal to the concrete Spike node sandbox path

That means:

- Spike still owns mirror/worktree/index filesystem state
- Spike still builds the actual sandbox directory
- Nex executes within that directory and records it as turn `working_dir`

Spike does not give Nex ownership of Spike sandboxes.

### 8. Phase 2 requires a small Nex execution-surface extension

The current canonical run ingress already supports:

- `personaRef`
- `thinking`
- `extraSystemPrompt`

Phase 2 also requires app-service callers to control:

- `agent_config_id`
- `working_dir`

The recommended cut is:

- extend `events.ingest` or its direct canonical app-service caller path to
  accept `agentConfigId` and `workingDir`

Spike will use:

- `agent_config_id` for provider/model/tool policy selection
- `thinking` for reasoning level
- `extraSystemPrompt` for the node/phase-specific system prompt

Phase 2 must not replace this with a Spike-private execution API.

### 9. Ask-request execution linkage is Spike-owned metadata

Spike needs product-owned metadata that maps ask requests onto the Nex
execution lineage without duplicating transcript ownership.

Phase 2 introduces:

- `ask_requests` as the top-level product record
- `ask_request_executions` as a product metadata table that links request,
  node, phase, and attempt to Nex session/run identifiers

### 10. Temporary internal scaffold is allowed until parity validation

Phase 2 remains a hard-cutover plan at the product boundary:

- no public dual-path contract
- no long-term broker compatibility surface
- no second durable transcript system inside Spike

During implementation, a temporary internal scaffold is allowed so the Spike DAG
can be refactored before the final Nex caller path is available:

- the DAG may depend on a new executor interface instead of the broker package
- the current broker-backed executor may remain as an internal adapter until
  Nex execution parity is validated
- the final destructive removal of the broker-backed live path waits until the
  Nex execution path is tested and validated

This scaffold exists only to preserve engineering momentum and validation
quality. It is not a target-state contract.

This metadata belongs in Spike because it describes the Spike DAG and ask
product object. The transcript itself still belongs to Nex.

### 10. The private broker is a losing implementation

The following are losing surfaces and must not survive as compatibility layers:

- `service/internal/broker/` as the primary ask execution substrate
- `spike.sessions.*`
- `/sessions/*`
- `root_turn_id` as the durable ask inspection anchor

---

## Rejected Approaches

### 1. Do not move the whole DAG into Nex in Phase 2

That would be a larger redesign and would blur the product boundary.

The correct Phase 2 move is to keep the Spike DAG and replace only the
execution substrate.

### 2. Do not make `spike.ask` async in Phase 2

That would force immediate UI and product-contract changes.

The chosen sequencing is:

- backend ownership cutover first
- UI rewrite later

### 3. Do not reuse one shared session across the whole DAG

That would change the current stateless-per-step execution behavior and make
per-node inspection harder.

### 4. Do not keep the Spike broker and mirror execution into Nex

That would violate the hard-cutover rule and leave two sources of truth.

---

## Target Execution Flow

## 1. `spike.ask`

When `spike.ask(index_id, query)` is called:

1. validate `index_id` and `query`
2. load the selected `AgentIndex`
3. create or reset the Spike-owned `ask_request` row
4. ensure a stable Nex `workspace_id` for that `AgentIndex`
5. ensure the root Nex session anchor `spike:ask:{request_id}`
6. run the existing Spike DAG recursion
7. return the final synthesized answer to the caller
8. persist final ask-request status and Nex linkage

## 2. One prompt-step execution

When the DAG needs one prompt execution for one node and phase:

1. Spike assembles the domain for that node
2. Spike builds or rebuilds the node sandbox
3. Spike resolves the child session key for `{request_id, node_id, phase, attempt}`
4. Spike ensures the required Nex `agent_config_id`
5. Spike creates or resolves the Nex session with the stable `workspace_id`
6. Spike dispatches the prompt through canonical Nex execution
7. Spike waits for the run to finish
8. Spike reads the resulting transcript/history from Nex
9. Spike extracts the terminal assistant content
10. Spike records the execution linkage row in `ask_request_executions`
11. Spike returns the text result to the DAG caller

## 3. Final synthesis

The root DAG node still performs the final synthesis in Spike’s recursive
logic.

The only change is that each leaf / interpret / synth step is now executed by
Nex rather than the private Spike broker.

---

## Canonical Nex Calls

The Phase 2 plan is based on these canonical runtime operations:

1. `agents.configs.*`
   Used to resolve or create the execution profile referenced by
   `agent_config_id`.

2. `agents.sessions.create`
   Used to create the root ask lineage session and child step sessions.

3. `events.ingest`
   Used to start the actual model/tool execution for a prompt step.

4. `agents.wait`
   Used by Spike to preserve the current synchronous `spike.ask` behavior.

5. `chat.history`
   Used to read the resulting transcript and extract the terminal assistant
   output.

Spike service binaries must call these through the canonical app-service to
runtime path described in `NEX_ARCHITECTURE_AND_SDK_MODEL.md`.

No direct `agents.db` mutation is allowed.

---

## Agent Config And Prompt Contract

The current Spike executor carries these execution concerns:

- provider
- model
- thinking level
- system prompt
- working directory

Phase 2 maps them as follows:

- provider/model/tool policy -> Nex `agent_config_id`
- thinking level -> `events.ingest.thinking`
- node/phase system prompt -> `events.ingest.extraSystemPrompt`
- sandbox path -> Nex turn `working_dir`
- stable index execution context -> Nex session `workspace_id`

The Phase 2 implementation must not regress any of those capabilities.

---

## Workspace And Sandbox Contract

### Stable execution workspace

Each `AgentIndex` gets one stable Nex execution workspace binding for asks.

That binding is reused across all ask requests against that index.

### Per-step sandbox

Each prompt step still gets the concrete sandbox path that Spike created for
that node.

That sandbox path is passed as the run `working_dir`.

### Ownership rule

Spike owns:

- mirror/worktree storage
- index-local runtime directories
- sandbox population and cleanup

Nex owns:

- execution inside the provided working directory
- session and turn history about that execution

---

## Schema Impact

Phase 2 does not complete the whole storage cleanup, but it does change the
ask-request metadata contract immediately.

### `ask_requests`

The surviving top-level row must move toward:

- `request_id`
- `index_id`
- `query_text`
- `status`
- `nex_root_session_key`
- `final_run_id`
- `answer_preview`
- `error_code`
- `error_message`
- `created_at`
- `completed_at`

The old broker-centric fields become losing fields:

- `tree_id`
- `root_turn_id`

### `ask_request_executions`

Phase 2 should add a dedicated execution-linkage table containing:

- `request_id`
- `node_id`
- `phase`
- `attempt`
- `nex_session_key`
- `run_id`
- `workspace_id`
- `working_dir`
- `status`
- `error_message`
- `started_at`
- `completed_at`

This is product metadata only. It is not a second transcript ledger.

---

## Implementation Sequence

## Step 1: Add a Spike-side execution interface

Introduce one internal executor seam for DAG prompt execution.

The surviving call site should let the DAG request:

- `request_id`
- `node_id`
- `phase`
- `attempt`
- `workspace_id`
- `working_dir`
- `agent_config_id`
- `thinking`
- `system_prompt`
- `prompt`

The losing broker-backed implementation should be removed after the new Nex
implementation is wired.

## Step 2: Add the app-service runtime client path

If Spike does not already have a Go-side runtime client for app-service
callbacks, add one.

This client must be able to dispatch canonical Nex runtime operations from the
Spike service binary.

## Step 3: Extend the Nex execution caller contract if needed

Ensure the canonical app-service caller path exposes:

- `agent_config_id`
- `working_dir`

The preferred cut is to expose them on `events.ingest` for app-service callers.

## Step 4: Replace `NodeContext.executePrompt`

Replace the private broker path in
`service/internal/prlm/tree/oracle_node.go` with the Nex-backed executor.

Keep:

- DAG recursion
- domain assembly
- sandbox construction
- synthesis logic

Replace:

- session creation
- prompt execution
- transcript ownership

## Step 5: Add ask-request execution linkage

Persist:

- top-level ask-request Nex linkage
- per-step execution linkage rows

Stop relying on local broker `root_turn_id`.

## Step 6: Remove live session control surfaces

Delete the canonical app/service surfaces that only exist for the private
broker:

- `spike.sessions.*`
- `/sessions/*`

## Step 7: Extract generic non-broker helpers

Move `RunParallel(...)` and any other non-ledger helper out of the losing
broker package so execution ownership can be removed cleanly.

---

## Code Targets

The expected primary code areas are:

- `service/cmd/spike-engine/nex_handlers.go`
- `service/cmd/spike-engine/nex_protocol.go`
- `service/cmd/spike-engine/serve.go`
- `service/internal/prlm/tree/oracle.go`
- `service/internal/prlm/tree/oracle_node.go`
- `service/internal/spikedb/schema.go`
- `service/internal/prlm/store/schema.go`
- `service/internal/broker/`

Expected Nex-side dependencies are:

- `nex/src/nex/control-plane/server-methods/agent.ts`
- `nex/src/nex/control-plane/server-methods/sessions-new.ts`
- `nex/src/nex/control-plane/server-methods/chat.ts`
- `nex/src/nex/control-plane/server-methods/agent-configs.ts`
- `nex/src/apps/platform-sdk.ts` or the Go-side equivalent that Phase 2 adds

---

## Exit Criteria

Phase 2 is complete when all of the following are true:

1. `spike.ask` no longer uses the private Spike broker for live execution.
2. every prompt step in the live DAG executes through canonical Nex calls.
3. Nex `agents.db` is the durable transcript system of record for Spike asks.
4. `ask_requests` store Nex execution linkage rather than local broker ids.
5. Spike has per-step execution linkage metadata for request inspection.
6. `spike.sessions.*` no longer exists as a product surface.
7. `/sessions/*` no longer exists as a product surface.
8. the surviving DAG behavior still produces the same class of subtree routing,
   sandboxed inspection, and final synthesis behavior as before.

---

## Validation

The validation ladder for this workplan must prove:

1. `spike.ask` still returns a final answer for a real `AgentIndex`.
2. a successful ask creates Nex session history visible through canonical Nex
   APIs.
3. child DAG executions create deterministic session keys under the same
   request lineage.
4. turn records include the expected `workspace_id`, `agent_config_id`, and
   `working_dir`.
5. Spike-owned storage contains only ask metadata and execution linkage, not
   transcript truth.
6. deleting or archiving a Spike ask request does not require rewriting Nex
   transcript tables directly.
7. no live ask/session path imports the private broker execution APIs.

---

## Immediate Follow-On

Once this workplan is implemented:

1. complete the Phase 3 storage cleanup
2. complete the remaining ask/request vocabulary cleanup
3. redesign the UI and inspector against the new Nex-backed execution reality

Phase 2 is the backend ownership cutover that makes those later steps safe.
