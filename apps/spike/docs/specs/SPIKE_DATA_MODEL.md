# Spike Data Model

**Status:** CANONICAL
**Last Updated:** 2026-03-08

---

## Purpose

This document defines Spike's target-state data model, storage architecture,
and lifecycle behavior.

It applies the locked Spike vocabulary and the new execution/storage boundary to
the actual product model.

Related active docs:

- `SPIKE_OBJECT_TAXONOMY.md`
- `SPIKE_APP_AND_PACKAGE_MODEL.md`
- `SPIKE_SESSION_AND_EXECUTION_OWNERSHIP.md`
- `SPIKE_STORAGE_BOUNDARY.md`
- `SPIKE_INTEGRATIONS_AND_CALLBACK_OWNERSHIP.md`

This document is Spike-specific. Shared hosted runtime, ledger, and adapter
rules remain in the canonical Nex specs.

**HARD CUTOVER. NO BACKWARD COMPATIBILITY.**

---

## Customer Experience

The intended Spike experience is:

1. the user connects a repository through a Spike-visible GitHub connection
   binding
2. Spike tracks the repository, syncs it into a `git mirror`, and materializes
   a pinned `worktree`
3. Spike builds an `AgentIndex` over that worktree
4. the user asks a question against that `AgentIndex`
5. Spike creates an `ask request` and links it to Nex-owned execution
6. the user sees Spike product metadata plus Nex-owned session history as one
   coherent product flow

The user should not need to understand internal storage boundaries. The docs
still must.

---

## 1. Core Concepts

### 1.1 AgentConfig

`AgentConfig` is the Spike-owned recipe for index creation and ask preparation.

It controls Spike-specific product behavior such as:

- index capacity
- chunking and partition sizing
- concurrency settings
- model selection for Spike-owned preparation steps

`AgentConfig` is not the durable transcript or session owner.

### 1.2 Git Mirror

A `git mirror` is a bare clone of a remote repository.

It stores:

- packed git objects
- refs
- repository history needed for later fetch and worktree creation

It does not contain a checked-out working tree.

### 1.3 Worktree

A `worktree` is a detached checkout at one specific commit.

It is the filesystem corpus used to build an `AgentIndex`.

One repository may have:

- one shared `git mirror`
- many `worktree` snapshots
- one or more `AgentIndex` records per worktree

### 1.4 AgentIndex

An `AgentIndex` is Spike's point-in-time code-understanding structure over a
specific `worktree`.

An `AgentIndex` is the primary Spike product object used for:

- code navigation
- ask operations
- guide/context assembly
- persistent code-research state

`AgentIndex` is not a conversation container.

### 1.5 Ask Request

An `ask request` is the Spike product record for one question asked against an
`AgentIndex`.

It owns:

- the selected `index_id`
- the prompt or intent
- product status
- any Spike-owned context-pack or guide linkage
- a summary of the outcome for Spike UX
- linkage to Nex-owned execution

It does not own the durable transcript.

---

## 2. First-Class Spike Entities

Spike treats the following as first-class product objects:

| Entity | Description | Canonical owner |
|---|---|---|
| `GitHub connection binding` | Spike-visible binding to a shared GitHub connection | Spike |
| `repository` | Repo visible through a Spike connection binding | Spike |
| `git mirror` | Bare clone reused across worktrees | Spike |
| `worktree` | Detached checkout at one commit | Spike |
| `AgentConfig` | Spike recipe for index behavior | Spike |
| `AgentIndex` | Spike point-in-time code index | Spike |
| `ask request` | Product ask record linked to Nex execution | Spike |
| session / turn / message / tool call | Durable execution history for asks | Nex |

The last row is included because it is part of the customer experience, even
though it is not Spike-owned storage.

---

## 3. Data Relationships

```text
Account
  │
  ▼
Server
  │
  ▼
Runtime
  │
  ├── Shared adapter connections
  │     └── GitHub connection
  │
  ├── Nex agents/session system
  │     └── sessions -> threads -> turns -> messages -> tool calls
  │
  ▼
Spike engine
  │
  ├── GitHub connection bindings
  │     └── repositories
  │           └── git mirrors
  │                 └── worktrees
  │                       └── AgentIndexes
  │                             └── ask requests
  │                                   └── linked Nex session history
  │
  └── Spike-owned jobs and guide/context artifacts
```

The essential relationship is:

- Spike owns the product object graph up to `ask request`
- Nex owns the execution lineage linked from that ask request

---

## 4. Storage Architecture

### 4.1 Spike Storage Root

Spike's app-local storage root contains only Spike-owned product data:

```text
{spike_storage_root}/
├── spike.db
├── git/
│   ├── mirrors/
│   └── worktrees/
└── indexes/
    └── {index_id}/
        ├── runtime/
        └── sandboxes/
```

This directory does not define the storage location or ownership of Nex-owned
ledgers such as `agents.db`.

### 4.2 What Lives In `spike.db`

`spike.db` is the Spike product database.

It stores:

- connection bindings
- repositories and refs
- mirrors and worktrees
- `AgentConfig`
- `AgentIndex`
- PRLM or other Spike-owned index structures
- ask-request product records
- Spike-owned job and artifact metadata

### 4.3 What Does Not Live In `spike.db`

`spike.db` is not the durable home for:

- sessions
- threads
- turns
- messages
- tool calls
- generic execution compaction history
- provider auth secrets

Those belong to Nex-owned ledgers or runtime-owned adapter systems.

### 4.4 Storage Root Resolution

Spike resolves its storage root from:

1. explicit CLI flag or app configuration
2. `NEX_APP_DATA_DIR` or equivalent runtime-provided app data root
3. local development defaults

Spike file paths are derived from that root rather than accepted as arbitrary
user-supplied storage paths.

### 4.5 SQLite Rules For `spike.db`

When Spike uses SQLite for `spike.db`, it must enable:

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
```

These rules apply to the Spike product DB only. They do not redefine how Nex
opens or manages its own ledgers.

---

## 5. Spike-Owned Tables

The target-state `spike.db` includes Spike-owned tables in the following
families.

### 5.1 Connection And Repository State

Representative tables:

- `github_connection_bindings`
- `repositories`
- `repo_refs`

These records let Spike understand:

- which shared GitHub connections are visible to Spike
- which repositories are bound to those connections
- which refs currently resolve to which commits

### 5.2 Mirror And Worktree State

Representative tables:

- `git_mirrors`
- `worktrees`

These records let Spike track:

- one reusable mirror per remote URL
- pinned worktrees by commit
- mirror/worktree status, size, and last access

### 5.3 Index Configuration And Structure

Representative tables:

- `agent_configs`
- `agent_indexes`
- `agent_nodes`
- `agent_node_files`
- `agent_node_bundles`
- `corpus_entries`

These records let Spike persist its code-understanding structures without
storing generic session history beside them.

### 5.4 Ask Requests

Representative ask-request shape:

```sql
CREATE TABLE ask_requests (
    request_id        TEXT PRIMARY KEY,
    index_id          TEXT NOT NULL,
    query_text        TEXT NOT NULL,
    status            TEXT NOT NULL,
    guide_artifact_id TEXT NOT NULL DEFAULT '',
    nex_session_key   TEXT NOT NULL DEFAULT '',
    nex_thread_id     TEXT NOT NULL DEFAULT '',
    terminal_turn_id  TEXT NOT NULL DEFAULT '',
    answer_preview    TEXT NOT NULL DEFAULT '',
    error_code        TEXT NOT NULL DEFAULT '',
    error_message     TEXT NOT NULL DEFAULT '',
    created_at        INTEGER NOT NULL,
    completed_at      INTEGER
);
```

Notes:

1. `ask_requests` are Spike-owned product records.
2. `nex_session_key`, `nex_thread_id`, and `terminal_turn_id` are linkage into
   Nex-owned execution history.
3. `answer_preview` is a product convenience field, not the transcript of
   record.

### 5.5 Spike-Owned Jobs And Artifacts

Spike may additionally persist product-specific operational state such as:

- sync jobs
- index build jobs
- guide artifacts
- support-safe diagnostics

These remain Spike-owned as long as they are product-specific rather than
generic platform execution primitives.

---

## 6. Nex-Owned Execution Linkage

Spike's active data model depends on a linked Nex execution model.

The linked Nex ledger owns:

- session identity
- thread ancestry
- turns
- messages
- tool calls
- session history and archival

Spike should treat the following as foreign-system references:

- `nex_session_key`
- `nex_thread_id`
- `terminal_turn_id`

Spike may query or project that data through canonical Nex APIs, but it does
not redefine or duplicate those tables locally.

---

## 7. Engine Architecture

### 7.1 What The Spike Engine Is

The Spike engine is the Spike-owned service process responsible for:

- repository sync orchestration
- mirror/worktree materialization
- `AgentIndex` lifecycle management
- ask-request creation and status management
- guide/context preparation
- product APIs and UI-facing Spike methods

The Spike engine is not the long-term broker of record for generic session
history.

### 7.2 Startup Model

Target-state startup flow:

1. open `spike.db`
2. seed default Spike-owned product records such as default `AgentConfig`
3. initialize Spike git storage roots
4. load ready `AgentIndex` records and their associated node/corpus state
5. initialize the Spike client or adapter used to call canonical Nex
   agent/session APIs
6. expose Spike product methods

### 7.3 Ask Flow

Target-state ask flow:

1. validate that the selected `AgentIndex` is ready
2. create `ask_request` with Spike-owned metadata
3. assemble Spike-owned context and guide inputs
4. create or resolve execution through canonical Nex session APIs
5. record the returned Nex execution linkage on the ask request
6. read transcript/timeline state from Nex-owned session history
7. update Spike ask-request status and summary fields

At no point should Spike need a second broker ledger to preserve the
conversation.

---

## 8. Lifecycle Behaviors

### 8.1 AgentIndex Versioning

`AgentIndex` remains a point-in-time snapshot over a pinned `worktree`.

When a tracked branch advances:

1. Spike fetches into the shared `git mirror`
2. Spike materializes or reuses a `worktree` at the new commit
3. Spike creates a new `AgentIndex`
4. prior `AgentIndex` records remain intact for history and comparison

### 8.2 Ask Request Lifecycle

Normal ask-request lifecycle:

1. `pending`
2. `running`
3. `completed` or `failed`

Spike status is product status.

Execution status details come from the linked Nex session lineage rather than a
second Spike-local transcript table family.

### 8.3 Garbage Collection

Spike may reclaim:

- unneeded worktrees
- index-local runtime directories
- obsolete Spike-owned artifacts

Spike must not silently delete Nex ledger history by mutating app-local tables.

### 8.4 Restart Recovery

After restart:

1. Spike reloads `AgentIndex` and ask-request product state from `spike.db`
2. Spike resolves linked execution state through canonical Nex session APIs as
   needed
3. UI surfaces recover by combining Spike-owned product rows with Nex-owned
   execution history

This is the target recovery model instead of rehydrating a private broker from
`spike.db`.

---

## 9. API Surface Implications

### 9.1 Spike-Owned Methods

Spike-owned methods should cover product objects such as:

- index creation and status
- repository and worktree browsing
- ask-request creation and inspection
- Spike-specific guide and diagnostic flows

### 9.2 Ask Inspection

An ask-request inspection method should return:

- Spike ask-request metadata
- linked `AgentIndex` metadata
- linked Nex session key and related execution references
- optionally a merged session preview/history view assembled from Nex

The important rule is that transcript history comes from Nex, not a private
Spike session ledger.

---

## 10. UI Implications

The target UI model follows the same boundary:

1. primary product navigation is repository -> worktree -> `AgentIndex`
2. ask actions are anchored on `AgentIndex`
3. request inspection is anchored on `ask request`
4. transcript and timeline displays are projections over linked Nex session
   history

The legacy inspector shape should be judged against this model, not preserved by
default.

---

## Non-Negotiable Rules

1. `AgentIndex` is the Spike code-understanding object.
2. `ask request` is the Spike product ask object.
3. generic sessions, turns, messages, and tool calls are Nex-owned.
4. `spike.db` is a product database, not a generic execution ledger.
5. Spike UI surfaces must follow the same product-vs-execution boundary.
