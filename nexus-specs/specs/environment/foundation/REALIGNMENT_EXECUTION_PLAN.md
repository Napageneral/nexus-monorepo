# Runtime Realignment Execution Plan

**Status:** ACTIVE IMPLEMENTATION PLAN  
**Last Updated:** 2026-02-12  
**Scope:** `nexus-specs` + `nex` only

---

## Purpose

This document is the working execution plan for closing remaining spec/code gaps after decision lock in:

- `RUNTIME_REALIGNMENT_DECISIONS.md`
- `WORKSPACE_LAYOUT_REFERENCE.md`
- `environment/interface/cli/COMMANDS.md`

This is a **big-bang** migration plan:

- no backward-compat requirement
- no legacy alias guarantee
- no dependence on external/legacy projects

---

## Workstreams

| ID | Workstream | Goal | Status |
|----|------------|------|--------|
| W1 | Canonical CLI surface | Implement root `status`, `capabilities`, `identity`, `credential`, `config`, `init`, plus runtime control-plane | COMPLETE |
| W2 | Runtime rename completion | Remove/rename `gateway` terminology and command surface where still user-facing | IN PROGRESS |
| W3 | Canonical init/bootstrap | Implement `nexus init` and align created files/directories to canonical workspace layout | COMPLETE |
| W4 | Branding/type cleanup | Remove `OpenClaw` naming and legacy env/dir aliases from code paths and types | IN PROGRESS |
| W5 | Cortex local DB contract | Ensure shared local Cortex DB at `state/cortex/cortex.db` is implemented as canonical | NOT STARTED |
| W6 | Canonical config schema | Align top-level config domains to canonical namespaced contract | NOT STARTED |

---

## Command Collision Register

This table captures where canonical command names intersect existing CLI surface.

| Canonical Command | Current State in `nex` | Collision Type | Proposed Handling |
|-------------------|-------------------------|----------------|-------------------|
| `status` | Exists at root | Semantic drift | Keep command; align behavior/output to orientation contract |
| `capabilities` | Missing at root; exists in channel sub-surface (`channels capabilities`) | Name overlap only | Add root `capabilities`; keep subcommand variant for now |
| `identity` | Missing at root; related commands under `agents set-identity` | Functional overlap | Add root read-focused `identity`; keep agent mutation commands until review |
| `credential` | Missing at root; credentials logic scattered | Namespace introduction | Add new root `credential` group; leave existing auth/config flows temporarily |
| `config` | Exists at root | Semantic drift | Keep command; align schema/path behavior |
| `init` | Missing; `setup`/`onboard` currently used | Lifecycle overlap | Add canonical `init`; keep `setup`/`onboard` as temporary non-canonical commands pending review |
| `runtime` | Exists as command, but implementation still gateway-heavy | Internal naming drift | Keep command; complete internals/help/JSON rename from gateway to runtime |

Open decisions to review with maintainer:

1. Whether `setup` becomes a thin alias to `init` or is removed after migration.
2. Whether root `health` and `sessions` remain root or move strictly under `runtime`.
3. Final ownership split between root orientation and runtime operational commands.

---

## Rename Strategy: Rip vs Rename

Use the following rule for each `gateway` occurrence:

1. **RIP** when feature/surface is non-canonical and redundant.
2. **RENAME** when capability is canonical but terminology is stale.
3. **RETAIN TEMPORARILY** only when needed to complete adjacent migration steps in same pass.

### Priority rip targets

- stale docs/help text that references gateway-only concepts
- legacy compatibility branches that preserve old config/state names
- duplicate command paths that conflict with canonical runtime/control-plane boundary

### Priority rename targets

- user-facing command descriptions/help
- JSON output keys surfaced by `status`, `doctor`, security/audit reporting
- config namespace and type names where `gateway` remains but behavior is canonical runtime

---

## Phase Plan

### Phase A - CLI Surface (W1)

Deliverables:

- root command registration for `capabilities`, `identity`, `credential`, `init`
- explicit root vs runtime boundary in help and docs
- tests for grammar, help text, and command routing

Exit criteria:

- canonical root commands callable from `nexus --help`
- no ambiguity in command ownership between root orientation and runtime plane

### Phase B - Runtime Rename + Contract Alignment (W2)

Deliverables:

- runtime-facing outputs no longer use `gateway` terminology
- evaluate each gateway module for rip/rename/relocate
- update e2e expectations to runtime naming

Exit criteria:

- user-facing runtime surfaces are runtime/control-plane named
- remaining `gateway` references are internal-only debt with explicit follow-up list

### Phase C - Canonical Init + Layout (W3)

Deliverables:

- `nexus init` implemented
- canonical layout creation:
  - `state/data/`
  - `state/cortex/`
  - `state/agents/`
  - `state/user/`
  - `state/credentials/`
  - `state/nexus/config.json`
- bootstrap identity paths aligned to `state/agents/{name}` + `state/user/IDENTITY.md`

Exit criteria:

- clean workspace initialized to canonical structure in one command
- tests validate idempotent init behavior

### Phase D - Branding + Legacy Alias Removal (W4)

Deliverables:

- remove `OpenClaw*` public type names and stale branding terms
- remove legacy env aliases and legacy path discovery in canonical code paths

Exit criteria:

- canonical naming used in types/config/runtime modules
- no compatibility-first fallback paths on the critical config/state startup path

### Phase E - Cortex Local DB Canonicalization (W5)

Deliverables:

- canonical local `state/cortex/cortex.db` ownership defined and implemented
- runtime integrations (hooks/automation/pipeline) read/write through canonical local Cortex contract

Exit criteria:

- local shared Cortex DB is the source for derived artifacts
- runtime starts and operates correctly with canonical local Cortex path

### Phase F - Config Schema Canonicalization (W6)

Deliverables:

- top-level config domains aligned to canonical contract (`agent`, `credentials`, `runtime`, `hooks`, `automation`, `acl`, `channels`, `cortex`, etc.)
- schema validation and CLI `config` behavior aligned to canonical path + keys

Exit criteria:

- `state/nexus/config.json` validates under canonical domain schema
- no contradictory schema/docs between env specs and runtime implementation

---

## Validation Matrix

| Area | Validation |
|------|------------|
| CLI grammar | unit + integration tests for command registration and help output |
| Runtime naming | e2e contract tests for status/doctor/runtime outputs |
| Init/layout | filesystem integration tests against canonical directory/file set |
| Branding cleanup | static grep checks for forbidden legacy terms in public surfaces |
| Cortex | runtime integration tests using local `state/cortex/cortex.db` |
| Config schema | schema validation tests + CLI read/write tests |

---

## Tracking Checklist

### W1 - Canonical CLI surface
- [x] Add `init` root command.
- [x] Add `capabilities` root command.
- [x] Add `identity` root command.
- [x] Add `credential` root command group.
- [x] Verify `status`, `config`, `runtime` semantics against canonical contract.
- [x] Add/adjust tests.

### W2 - Runtime rename completion
- [x] Complete first-pass runtime wording on primary CLI/orientation surfaces (`status`, `config`, `runtime`, `logs`, `cron`, `tui`, `devices`, `update`).
- [x] Enumerate remaining user-facing `gateway` strings and classify rip vs rename.
- [x] Update runtime-related help/output JSON keys.
- [ ] Align e2e tests and docs to runtime naming (targeted runtime e2e suites now passing; continue full-surface docs/test parity).

### W3 - Canonical init/bootstrap
- [x] Implement canonical directory creation in `nexus init`.
- [x] Align bootstrap file placement to `state/agents` + `state/user`.
- [x] Ensure idempotent behavior.

### W4 - Branding/type cleanup
- [ ] Replace legacy public type names (including `OpenClaw*`) with canonical naming.
- [ ] Remove legacy env/state fallback logic on primary path.
- [ ] Add regression checks for reintroduction.

### W5 - Cortex local DB
- [ ] Implement/verify canonical local Cortex DB path `state/cortex/cortex.db`.
- [ ] Align runtime services to local shared DB contract.
- [ ] Add integration coverage.

### W6 - Config schema
- [ ] Align top-level config domains.
- [ ] Ensure CLI config operations target canonical schema + path.
- [ ] Update docs/examples/tests.

---

## Immediate Next Action

Continue **W2 + W4**:

1. finish residual runtime/control-plane terminology cleanup (remaining gateway-heavy subcommands and status-all/health-adjacent text)
2. complete docs parity pass for runtime/control-plane naming
3. continue high-visibility branding cleanup (`OpenClaw` public-facing strings and help text)
