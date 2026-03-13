# Spike Storage Boundary

**Status:** CANONICAL
**Last Updated:** 2026-03-08

---

## Purpose

This document defines what data belongs in Spike-owned storage versus Nex-owned
storage.

It exists to prevent the old architecture from treating `spike.db` as a catchall
for both product state and generic agent execution history.

Related active docs:

- `SPIKE_OBJECT_TAXONOMY.md`
- `SPIKE_SESSION_AND_EXECUTION_OWNERSHIP.md`
- `SPIKE_DATA_MODEL.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/agents/agents-database-reference.md`

---

## Customer Experience

The intended operator and customer experience is:

1. Spike stores the product objects needed to understand repositories and
   indexes
2. Nex stores the generic execution history needed to understand conversations
   and tool use
3. the UI can show one coherent workflow without hiding where the source of
   truth lives
4. upgrades and future products can reuse the same Nex session and ledger model
   instead of each app inventing its own transcript store

The storage split should feel invisible to the user, but explicit in the docs.

---

## Canonical Storage Systems

| Storage system | Canonical owner | Holds |
|---|---|---|
| `spike.db` | Spike | product metadata and Spike domain objects |
| `agents.db` | Nex | sessions, threads, turns, messages, tool calls, execution history |
| Nex records/memory ledgers | Nex | generic ingest, memory, recall, and retention pipelines |
| Spike storage root on disk | Spike | git mirrors, worktrees, index-local artifacts, temporary runtime files |

---

## What Belongs In `spike.db`

`spike.db` is the product database for Spike-specific state.

It should contain Spike-owned objects such as:

- `github_connection_bindings`
- `repositories`
- `repo_refs`
- `git_mirrors`
- `worktrees`
- `agent_configs`
- `agent_indexes`
- `agent_nodes`
- `agent_node_files`
- `agent_node_bundles`
- `corpus_entries`
- `ask_requests`
- Spike-specific jobs, guide artifacts, and other product control-plane records

These objects exist because they are specific to the Spike product model.

---

## What Must Not Belong In `spike.db`

`spike.db` must not be the durable system of record for generic execution
history.

That means no canonical ownership of:

- `sessions`
- `threads`
- `turns`
- `messages`
- `tool_calls`
- compaction history
- generic execution artifacts whose source of truth is the Nex agents ledger

Spike may store foreign-key-style references to Nex execution. It must not
define a second long-term transcript ledger.

---

## Ask Request Storage Model

An ask request is the key cross-boundary record.

The Spike-owned ask-request record should include:

- `request_id`
- `index_id`
- `query_text`
- product status
- summary/result preview fields for Spike UX
- canonical Nex execution linkage
- timestamps and error metadata

The Nex execution linkage should include:

- `nex_session_key`
- any additional Nex thread/turn linkage Spike needs to resolve the transcript
  efficiently

The ask request may cache:

- `answer_preview`
- completion status
- product-level status labels

The ask request must not cache the full transcript as its source of truth.

---

## Filesystem Boundary

Spike-owned filesystem state remains local to the Spike storage root:

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

This directory is for Spike-owned product storage only.

Nex-owned ledgers such as `agents.db` are outside the Spike app-local storage
contract even when they happen to live on the same server.

---

## Deletion And Retention Rules

### Deleting Spike objects

When Spike deletes a product object, it may delete:

- product metadata in `spike.db`
- Spike-owned index artifacts
- Spike-owned filesystem state

### Deleting linked execution history

Spike must not directly rewrite or drop Nex ledger tables.

If a linked session needs archival or cleanup, Spike should request that
through canonical Nex agent/session APIs rather than mutating `agents.db`
directly.

### Retention asymmetry is allowed

It is valid for:

- a Spike ask request to be removed while Nex ledger history remains archived
- a Spike index to be deleted while prior session history still exists in Nex
- a Nex session to be archived while Spike keeps the ask-request metadata that
  referenced it

The two stores are related, not collapsed into one.

---

## Future Memory And Ingest Alignment

This storage split is also the prerequisite for future Git history and memory
work.

The intended long-term architecture is:

1. adapters ingest records into Nex-owned ledgers
2. Nex memory pipelines retain and consolidate them
3. Spike consumes those Nex-owned memory outputs alongside Spike-owned code
   index state
4. downstream ask execution still runs through Nex-owned sessions

This keeps product-specific code intelligence separate from reusable platform
memory and execution infrastructure.

---

## Non-Negotiable Rules

1. `spike.db` is a product database, not a generic transcript ledger.
2. `agents.db` is the canonical durable home of Spike-related session history.
3. Ask requests are cross-boundary product records that reference Nex execution.
4. Spike-owned filesystem state must remain limited to Spike-specific artifacts.
5. Hard cutover means the old Spike-local broker ledger model does not survive
   as a parallel target-state design.
