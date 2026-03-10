# Spike Ask Subtree Orchestration And Finalization RCA

**Status:** ACTIVE
**Last Updated:** 2026-03-06

---

## Purpose

This document captures the top-to-bottom investigation into why local Spike ask
runs can produce strong subtree artifacts but fail to finalize a clean root
guide and leave `ask_requests` rows stuck in `running`.

This is a workplan/RCA document, not a target-state spec.

---

## Customer Experience

The current user-visible failure mode is:

1. Spike starts a real ask over a hydrated tree.
2. Useful subtree answers are persisted in the ledger.
3. The CLI does not return a final root answer in a reasonable time.
4. If the operator interrupts the run, the `ask_requests` row remains
   `running`.
5. The operator has to spelunk SQLite turns/messages manually to recover the
   useful work.

That is not acceptable for the intended `guide-for-agent` workflow. The primary
artifact must be one final guide, not a pile of orphaned subtree turns.

---

## Investigation Scope

The investigation covered:

- local CLI ask entrypoint
- `OracleTree.AskWithOptions`
- recursive `OracleNode.Ask`
- broker session/turn persistence
- go-agent runtime prompt execution
- Codex SSE provider path
- the concrete `simple-login/app` task run

Primary runtime evidence came from the local run:

- tree: `swe-atlas`
- request id: `req-1772814031942984000`
- state root:
  `/Users/tyler/nexus/home/projects/spike-swe-atlas-lab/spike-state/simple-login-app-2cd6ee777f8c-125k`

---

## Observed Evidence

### 1. The root request row was created correctly

`ask_requests` received a `running` row immediately when the ask began.

That part of the pipeline is working.

### 2. Root and important child turns completed

The run persisted completed turns for:

- root interpretation: `turn:1772814066364`
- `app/api`: `turn:1772814295440`
- `app/dashboard`: `turn:1772814276709`
- synthesized `tests`: `turn:1772814301753`

This proves the ask pipeline is capable of producing useful subtree guides on
the same run where finalization fails.

### 3. `root_turn_id` was not the real failure

The root session label existed and matched the request lookup convention:

- `swe-atlas:root:stateless:req-1772814031942984000:...`

That session already had:

- `thread_id = turn:1772814066364`

So `findRootTurnIDForRequest(...)` can recover the root turn.

The fact that `ask_requests.root_turn_id` stayed empty means
`updateAskRequestResult(...)` never ran.

That only happens when `AskWithOptions(...)` never unwinds back out of the root
recursive ask.

### 4. The run stopped making progress in a tiny set of low-value subtrees

The important finding from the session ledger is that four child sessions were
created but never received a `thread_id`, never got queue items, and never got
session history:

- `root.c5.c1.c3.c1.c1` -> `static/assets/js/vendors/@chunk-2`
- `root.c5.c1.c4.c3.c1.c1` -> `static/assets/plugins/iconfonts/fonts/materialdesignicons`
- `root.c5.c1.c4.c3.c1.c2` -> `static/assets/plugins/iconfonts/fonts/simple-line-icons`
- `root.c5.c1.c4.c3.c1.c4` -> `static/assets/plugins/iconfonts/fonts/weathericons`

These sessions made it through `CreateSession(...)` but never persisted a
completed or terminal turn.

### 5. The stuck scopes were junk ask targets

The stalled scopes were not meaningful code paths.

They were:

- one virtual chunk corresponding to `bootstrap.bundle.min.js.map`
- three icon-font subtrees containing only binary/font assets such as:
  - `.woff`
  - `.woff2`
  - `.ttf`
  - `.eot`
  - `.svg`

In other words, the run got stranded in branches that should have been cheap
"nothing relevant here" exits.

### 6. The CLI interrupt path leaves orphaned `running` requests

The local CLI uses:

- `oracle.Ask(context.Background(), ...)`

in `service/cmd/spike-engine/main.go`.

So a local `SIGINT` does not flow through a cancellable context into
`AskWithOptions(...)`.

If the user interrupts the process, the process dies before it can update
`ask_requests` to a terminal status.

The HTTP server path is better here because it uses `r.Context()` and can also
layer `askTimeout` on top.

---

## Top-To-Bottom Failure Chain

### 1. Ask bookkeeping starts correctly

`OracleTree.AskWithOptions(...)`:

- loads the tree
- inserts `ask_requests(status='running')`
- builds shared `NodeContext`
- calls root `OracleNode.Ask(...)`

### 2. Root/parent ask recursion is synchronous

`OracleNode.Ask(...)` does:

1. assemble domain
2. build sandbox
3. run interpretation prompt
4. fan out to all direct children with `broker.RunParallel(...)`
5. wait for every child call to return
6. run synthesis prompt
7. return synthesized content upward

This means the root cannot finalize until every child recursion returns.

### 3. Child execution depends on `executePrompt(...)`

Every prompt call goes through:

- `NodeContext.executePrompt(...)`
- `Broker.Execute(...)`
- `goAgentHandle.Prompt(...)`
- `Runtime.Prompt(...)`
- provider `Complete(...)`

If any one of those calls does not return, the child goroutine does not return,
and the parent `RunParallel(...)` cannot finish.

### 4. The broker only persists a turn after prompt completion or terminal error

In `Broker.Execute(...)`:

- successful completion persists the turn and sets `session.thread_id`
- terminal error persists a failed/aborted turn and also sets
  `session.thread_id`

So a session with:

- no `thread_id`
- no queue items
- no session history

means `handle.Prompt(...)` never returned success or terminal error.

### 5. The go-agent runtime has no extra watchdog around provider completion

`goAgentHandle.Prompt(...)` calls:

- `h.runtime.Prompt(message)`

`Runtime.runLoop()` calls provider `Complete(...)` repeatedly until:

- success with no tool calls
- tool iteration completes
- explicit abort
- iteration cap hit

There is no additional per-leaf watchdog at the Spike/oracle layer.

### 6. The Codex provider uses SSE and waits for clean completion

The `openai-codex` path uses:

- `completeResponses(..., openAIResponsesModeCodex)`
- `parseCodexSSEResponse(resp.Body)`

The parser waits for:

- `response.completed`
- `response.done`
- `error`
- `EOF`

If the stream is slow or stalls, the leaf prompt remains in flight until the
HTTP layer times out or the process is aborted.

### 7. The local CLI path makes orphaning worse

Because local CLI ask uses `context.Background()`, a user interrupt does not
gracefully abort the ask or mark the request as terminal.

The run dies with:

- useful subtree turns persisted
- `ask_requests.status = 'running'`
- no final answer preview

---

## Root Cause Analysis

## Primary root cause

The ask pipeline requires every child recursion to return before parent
synthesis, but it allows low-value child prompts to consume full live model
turns without deterministic fast exits.

When a junk leaf or junk subtree prompt stalls, the whole root ask remains open.

## Contributing cause A

There is no ask-layer per-node watchdog or deadline in the local CLI path.

The system relies on provider/runtime behavior to eventually resolve each leaf.
That is too weak for exhaustive fan-out.

## Contributing cause B

Empty, binary-only, and generated-asset subtrees are not deterministically
short-circuited.

The run proved this concretely:

- one stalled node corresponded to a source-map chunk
- three stalled nodes were icon-font branches

These nodes should not require live LLM turns just to conclude they are not
authoritative for backend/API behavior.

## Contributing cause C

Current failure handling is all-or-nothing:

- if a child returns an error, the parent ask fails

That means even if we add timeouts, a single timed-out child would still poison
the whole ask unless we change synthesis semantics.

This conflicts with the intended Spike philosophy of completion and accuracy
over aggressive pruning.

## Contributing cause D

The local CLI interrupt path is not cancellation-aware, so interrupted runs
leave orphaned `ask_requests` rows.

## Contributing cause E

Observability is too coarse:

- no per-node ask progress table
- no persisted node phase markers
- root request only gets a final status row

This makes RCA much harder than it should be.

---

## Non-Causes

The evidence does **not** support these as the primary cause:

- `findRootTurnIDForRequest(...)` mismatch
- `ask_requests` schema/write failure
- `RunParallel(...)` deadlock
- meaningful `app/api` or `tests` subtrees being unable to answer

Those parts worked well enough to persist strong subtree artifacts.

---

## Hardening Options

## Option 1: Add per-prompt execution deadlines

### Change

Wrap each `executePrompt(...)` call in a cancellable timeout context instead of
allowing a leaf prompt to wait indefinitely for provider/runtime completion.

Primary touch points:

- `service/internal/prlm/tree/oracle_node.go`
- `service/internal/broker/engine_go_agent.go`
- `pi-mono/go-coding-agent/pkg/agent/runtime.go`
- `pi-mono/go-coding-agent/pkg/providers/openai.go`

### Pros

- directly bounds worst-case leaf runtime
- prevents one leaf from blocking the whole ask forever
- easy to reason about operationally

### Cons

- without other changes, timeouts become child errors
- current parent behavior would still fail the whole ask on one timeout
- relevant but slow branches can get cut off too aggressively

### Recommendation

Required, but not sufficient on its own.

---

## Option 2: Deterministic fast-path for empty local scope

### Change

If a node has:

- no local text-bearing files
- or no local files at all

then skip the live interpretation turn and return a deterministic local response.

For parents with children, the deterministic interpretation should say:

- no local evidence here
- delegate to children

For leaves, it should say:

- no relevant local evidence found

Primary touch points:

- `service/internal/prlm/tree/oracle_node.go`
- `service/internal/prlm/tree/code_substrate.go`

### Pros

- preserves exhaustive traversal
- removes pointless model turns on empty nodes
- directly addresses the observed stalled empty chunk case

### Cons

- requires a reliable definition of "text-bearing local scope"
- must avoid misclassifying meaningful nodes as empty

### Recommendation

Required.

This is aligned with Spike philosophy because it does not prune a meaningful
branch heuristically. It only avoids spending a live model turn where there is
no local evidence to inspect.

---

## Option 3: Deterministic fast-path for binary-only and generated-asset nodes

### Change

Classify local files into:

- code/text-bearing
- binary/non-code
- generated/minified artifact

For nodes whose local scope is entirely non-code or generated assets, skip the
live ask turn and emit a deterministic response describing the asset type and
stating that no authoritative code evidence exists locally.

At minimum this should cover:

- fonts/images/binary blobs
- `.woff`, `.woff2`, `.ttf`, `.eot`
- obviously generated asset chunks

Potentially:

- `.map`
- large minified vendor artifacts

Primary touch points:

- `service/internal/prlm/tree/code_substrate.go`
- `service/internal/prlm/tree/filesystem.go`
- `service/internal/prlm/tree/oracle_node.go`

### Pros

- directly addresses the observed stalled font branches
- cuts token waste dramatically
- reduces provider stall surface without changing routing philosophy

### Cons

- `.map` and generated assets can occasionally still be useful
- needs careful classification rules

### Recommendation

Required for clear binary-only scopes.

Use metadata-only deterministic responses for ambiguous generated assets rather
than hard-pruning them at first.

---

## Option 4: Tolerate child timeouts/failures and synthesize partial answers

### Change

Replace the current all-or-nothing behavior:

- `if len(childErrors) > 0 { return error }`

with partial synthesis behavior:

- synthesize from successful child outputs
- explicitly list timed-out/failed child scopes
- mark the final answer as partial where necessary

Primary touch points:

- `service/internal/prlm/tree/oracle_node.go`
- `service/internal/prlm/tree/oracle.go`
- ask response/status model

### Pros

- best match for Spike's completion-first philosophy
- one bad static branch no longer kills the whole guide
- makes timeouts operationally safe

### Cons

- requires a clear "partial" contract in ask output and request status
- downstream consumers must understand partial completeness

### Recommendation

High priority.

If we add timeouts without this, the system will simply fail faster instead of
returning a useful guide.

---

## Option 5: Make local CLI ask cancellation-aware

### Change

Use signal-aware context in `cmdAsk(...)` so local interrupts propagate through
`AskWithOptions(...)`.

On cancellation:

- persist terminal request status such as `aborted`
- persist `root_turn_id` if available
- stop active broker sessions for the request prefix

Primary touch points:

- `service/cmd/spike-engine/main.go`
- `service/internal/prlm/tree/oracle.go`
- `service/internal/broker/broker_core.go`

### Pros

- fixes orphaned `running` rows on user interrupt
- improves local operator experience immediately
- low conceptual risk

### Cons

- does not solve provider stalls by itself
- requires a small request-status model expansion

### Recommendation

Required.

---

## Option 6: Add stale-running request reconciliation

### Change

Add a sweeper/reconciler that marks old `ask_requests(status='running')` rows as
terminal if:

- no live process/lease owns them
- no session activity has occurred for a threshold

Potential statuses:

- `aborted`
- `timed_out`
- `partial`

### Pros

- cleans up historical zombie runs
- improves dashboard/UI correctness

### Cons

- requires a lease/heartbeat story or careful inactivity heuristics
- more infrastructure than the other fixes

### Recommendation

Recommended, but second wave after deterministic fast-paths and cancellation.

---

## Option 7: Add node-level ask progress persistence

### Change

Persist explicit node progress records per request:

- request id
- node id
- phase (`interpret`, `dispatch`, `synthesize`)
- session label
- status
- turn id
- error
- started/completed timestamps

### Pros

- makes RCA and UI inspection straightforward
- exposes exactly which node is blocking
- enables request inspectors without ledger spelunking

### Cons

- more schema and persistence work
- not required to fix the immediate operator pain

### Recommendation

Recommended, second wave.

---

## Option 8: Keep exhaustive routing but prioritize meaningful branches first

### Change

Retain all-child coverage, but schedule likely-code branches ahead of clearly
low-value asset branches.

This is not pruning. It is execution ordering.

### Pros

- preserves Spike philosophy
- gets useful evidence upward sooner
- reduces time-to-first-meaningful-guide

### Cons

- does not remove the need for timeouts and deterministic non-code exits
- introduces scheduler complexity

### Recommendation

Nice-to-have after the core hardening is in place.

---

## Recommended Overall Path

## Phase 1: Make ask completion robust without changing Spike philosophy

Implement together:

1. local CLI signal-aware cancellation
2. per-prompt execution deadlines
3. deterministic fast-path for empty local scopes
4. deterministic fast-path for binary-only/non-code local scopes
5. partial synthesis when some child branches time out or fail

This is the highest-value cut.

It preserves:

- exhaustive dispatch
- child self-pruning
- completion-first behavior

while removing the specific failure chain observed in the simple-login run.

## Phase 2: Improve observability and cleanup

Implement:

1. stale-running request reconciliation
2. node-level ask progress persistence
3. early root-turn attachment / better request inspection

## Phase 3: Improve throughput without losing coverage

Implement:

1. execution ordering that prefers code-bearing branches
2. better substrate classification for generated assets
3. optional metadata-only handling for large generated artifacts

---

## Concrete File-Level Work

### Request lifecycle

- `service/cmd/spike-engine/main.go`
- `service/internal/prlm/tree/oracle.go`

### Ask recursion and partial synthesis

- `service/internal/prlm/tree/oracle_node.go`
- `service/internal/prlm/tree/oracle.go`

### Substrate classification

- `service/internal/prlm/tree/code_substrate.go`
- `service/internal/prlm/tree/filesystem.go`

### Broker/runtime cancellation and stop behavior

- `service/internal/broker/broker_core.go`
- `service/internal/broker/engine_go_agent.go`
- `pi-mono/go-coding-agent/pkg/agent/runtime.go`
- `pi-mono/go-coding-agent/pkg/providers/openai.go`

### Tests

- `service/internal/prlm/tree/oracle_*_test.go`
- `service/internal/broker/broker_core_test.go`
- `service/cmd/spike-engine/main_remote_test.go`
- new interrupt/timeout/partial-synthesis coverage

---

## Validation To Add

We do not currently have test coverage for the failure modes that actually
matter here.

Required new coverage:

1. ask over a tree with empty local nodes returns cleanly
2. ask over binary-only/font-only nodes returns cleanly
3. timed-out child does not block root forever
4. parent returns partial synthesis when one child fails
5. local CLI interrupt marks request terminal instead of leaving it `running`
6. root request row gets a final terminal status and answer preview

---

## Final Recommendation

Do **not** change Spike's exhaustive routing model.

The right fix is to harden execution around it:

- deterministic non-LLM exits for empty/non-code scopes
- bounded leaf execution
- partial synthesis instead of all-or-nothing failure
- cancellation-aware finalization

That path preserves the product philosophy and directly addresses the concrete
simple-login failure we observed.
