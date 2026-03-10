# Spike Object Taxonomy

**Status:** CANONICAL
**Last Updated:** 2026-03-05

---

## Purpose

This document locks the vocabulary used in active Spike specs.

Spike inherits the hosted platform vocabulary from:

- `../../../../nexus-specs/specs/nex/hosted/HOSTED_OBJECT_TAXONOMY.md`
- `../../../../nexus-specs/specs/nex/adapters/ADAPTER_CONNECTION_PROFILES_AND_CALLBACKS.md`

This local taxonomy pins the Spike-specific nouns layered on top of that
platform model.

---

## Non-Negotiable Rules

1. `server` is the default hosted machine term in Spike docs.
2. `workspace` is not a normal Spike app term.
3. Spike does not own generic provider auth state, provider callbacks, or reusable provider webhooks.
4. A shared adapter connection is different from a Spike binding.
5. `working_dir` is the process/tool filesystem path term; do not call it `workspace_path`.
6. `product control plane` is different from the installed `Spike app`.

---

## Spike Terms

| Term | Meaning |
|---|---|
| `Spike app` | The installable hosted Spike app package |
| `Spike engine` | The `spike-engine` service process running for the Spike app |
| `Spike admin app` | Operator-facing UI for the Spike product control plane |
| `Spike product control plane` | Shared Spike backend that owns Spike-managed provider profiles and secret-backed provider operations |
| `connection profile` | Spike-owned app-facing connection option layered on top of a shared adapter |
| `GitHub connection` | Shared runtime adapter connection owned by the generic GitHub adapter layer |
| `GitHub connection binding` | Spike-local record that references a shared GitHub connection and stores Spike-specific binding state |
| `repository` | A repo visible to Spike through a selected GitHub connection binding |
| `git mirror` | Bare clone of a remote repo, reused across worktrees |
| `worktree` | Detached checkout of one commit used as Spike index corpus |
| `AgentConfig` | Tuning parameters for index creation and ask behavior |
| `AgentIndex` | Spike's point-in-time agentic index over a worktree |
| `ask request` | Spike product record for one question against an `AgentIndex`, linked to Nex execution |
| `working_dir` | Filesystem execution directory for agent runtime activity |

---

## Spike-Specific Language Rules

### Hosted and routing terms

Use:

- `server`
- `runtime`
- `tenant_id`
- `Spike product control plane`
- `Spike admin app`

Avoid:

- `workspace`

### GitHub integration terms

Use:

- `GitHub connection`
- `GitHub connection binding`
- `connection profile`

Do not use:

- `GitHub installation` as the canonical Spike-owned object

The shared adapter layer may still talk about provider-native installation ids,
but Spike's app-local canonical object is the connection binding keyed by
`connection_id`.

### Indexing terms

Use:

- `repository`
- `git mirror`
- `worktree`
- `AgentIndex`

Do not collapse these into one generic "repo" or "tree" object in specs.

---

## Enforcement Rule

If a Spike doc needs both a shared adapter object and a Spike-local object, it
must name both explicitly rather than overloading one term.
