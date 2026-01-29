# PRD: Nexus Bulk Sync Completion

## Goal
Complete the remaining ~25% of the upstream port, focusing on gateway, agents, and skills — with thoughtful adaptation, not blind copying.

## Current State (2026-01-20)
- **Overall**: ~75% complete
- **Staged**: 2,327 files (295k insertions)
- **Main Gaps**: gateway (8%), agents (30%), skills (42%)

## Success Criteria
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes (or failures documented)
- [ ] No "legacy" branding in user-facing code
- [ ] Nexus-specific features preserved (ODU, nexus-cloud, credentials)
- [ ] All changes committed with clear messages

---

## Tasks

### TASK-00: Gateway Schema Split
- **Status**: pending
- **Chunk**: CHUNK-07
- **Approach**: TAKE_UPSTREAM + Rename
- **Scope**: Port `src/gateway/protocol/schema/` domain files from upstream
- **Prompt**: prompts/task-00.md
- **Acceptance**: 
  - Schema files exist with nexus naming
  - No `legacy` strings in schema files
  - Imports resolve correctly

### TASK-01: Gateway Server Core
- **Status**: pending
- **Chunk**: CHUNK-07
- **Approach**: TAKE_UPSTREAM + Rename
- **Scope**: Port gateway server modules (runtime, websocket, impl)
- **Prompt**: prompts/task-01.md
- **Acceptance**:
  - Server modules ported
  - `x-nexus-token` header (not `x-legacy-token`)
  - Config paths use `nexus.json`

### TASK-02: Gateway New Features
- **Status**: pending
- **Chunk**: CHUNK-07  
- **Approach**: TAKE_UPSTREAM + Rename
- **Scope**: OpenAI HTTP API, exec-approvals, node registry
- **Prompt**: prompts/task-02.md
- **Acceptance**:
  - New gateway methods functional
  - Tests passing

### TASK-03: Agents Auth Profiles
- **Status**: pending
- **Chunk**: CHUNK-02
- **Approach**: ADAPT (careful merge)
- **Scope**: Merge upstream auth-profiles with Nexus credential store
- **Prompt**: prompts/task-03.md
- **Spec**: ../CHUNK-02_SPEC.md (Section A)
- **Acceptance**:
  - Plaintext + pointer credentials both work
  - CLI sync (Claude/Codex) functional
  - Nexus credential policy preserved

### TASK-04: Agents Tool Registry
- **Status**: pending
- **Chunk**: CHUNK-02/03
- **Approach**: ADAPT
- **Scope**: Consolidate tool registry, plugin allowlist, A2A gating
- **Prompt**: prompts/task-04.md
- **Spec**: ../CHUNK-02_SPEC.md (Section B)
- **Acceptance**:
  - `createNexusTools` (not `createLegacyTools`)
  - Plugin tools respect allowlist
  - A2A gating works

### TASK-05: Agents CLI Runner
- **Status**: pending
- **Chunk**: CHUNK-02
- **Approach**: TAKE_UPSTREAM + Rename
- **Scope**: CLI backend/runner for external models
- **Prompt**: prompts/task-05.md
- **Acceptance**:
  - CLI runner functional
  - Session handling works

### TASK-06: Agents Multi-Agent Scope
- **Status**: pending
- **Chunk**: CHUNK-02
- **Approach**: TAKE_UPSTREAM + Rename
- **Scope**: Multi-agent config, agent-scope, subagent handling
- **Prompt**: prompts/task-06.md
- **Acceptance**:
  - Multi-agent config works
  - Default agent resolution correct
  - `NEXUS_*` env vars (not `LEGACY_*`)

### TASK-07: Skills Metadata
- **Status**: pending
- **Chunk**: CHUNK-19
- **Approach**: KEEP_NEXUS + Add upstream skills
- **Scope**: Preserve Nexus skills metadata, add new upstream skills
- **Prompt**: prompts/task-07.md
- **Acceptance**:
  - Nexus-specific skills preserved (nexus-cloud, etc.)
  - New upstream skills added
  - Metadata schema intact

### TASK-08: Build Verification
- **Status**: pending
- **Depends**: TASK-00 through TASK-07
- **Scope**: Full build and test cycle
- **Prompt**: prompts/task-08.md
- **Acceptance**:
  - `pnpm install` succeeds
  - `pnpm build` succeeds
  - `pnpm test` results documented

### TASK-09: Branding Sweep
- **Status**: pending
- **Depends**: TASK-08
- **Scope**: Final search for any remaining `legacy` strings
- **Prompt**: prompts/task-09.md
- **Acceptance**:
  - `rg -i legacy src/` returns only intentional references
  - User-facing strings say "Nexus"

### TASK-10: Commit & Document
- **Status**: pending
- **Depends**: TASK-09
- **Scope**: Stage all changes, commit with clear message
- **Prompt**: prompts/task-10.md
- **Acceptance**:
  - Clean git status
  - Commit message summarizes work
  - RALPH_LOOP.md updated with completion

---

## Approach Key

| Approach | Meaning |
|----------|---------|
| TAKE_UPSTREAM | Copy from upstream, rename legacy→nexus |
| ADAPT | Careful merge, preserve Nexus behavior |
| KEEP_NEXUS | Keep Nexus implementation, add upstream additions |

---

## Reference Docs
- [CHUNK-02_REVIEW.md](../CHUNK-02_REVIEW.md) — Agents review
- [CHUNK-02_SPEC.md](../CHUNK-02_SPEC.md) — Agents implementation spec
- [CHUNK-07_REVIEW.md](../CHUNK-07_REVIEW.md) — Gateway review
- [CHUNK-19_REVIEW.md](../CHUNK-19_REVIEW.md) — Skills review
- [DEEPDIVE_AUTH_PROFILES_AND_CREDENTIALS.md](../DEEPDIVE_AUTH_PROFILES_AND_CREDENTIALS.md)
- [DEEPDIVE_TOOL_REGISTRY_AND_A2A.md](../DEEPDIVE_TOOL_REGISTRY_AND_A2A.md)
