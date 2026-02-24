# Memory V2 + IAM End-State Execution Spec

**Status:** EXECUTION SPEC  
**Date:** 2026-02-24  
**Owners:** Runtime, IAM, Memory

## Execution Status Update (2026-02-24)

### Completed

1. IAM role-gate unification into canonical control-plane IAM path:
   - Added role gate in `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/iam-authorize.ts` (`authorizeControlPlaneClientRole`).
   - Removed parallel role gate usage from `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-methods.ts`.
2. `tools.invoke` envelope enforcement cleanup:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/tool-invoke.ts` now enforces only the compiled `request.access` envelope (`hasToolAccess`) and resolves tools from `createNexusTools(...)` without secondary runtime policy compilation/filtering in this path.
3. Episode-native fact attribution:
   - `facts.source_episode_id` + index + migration guard in `/Users/tyler/nexus/home/projects/nexus/nex/src/db/memory.ts`.
   - Writer tool contract + enforcement in `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/tools/memory-writer-tools.ts`:
     - `source_episode_id` required for memory writer sessions.
     - `source_event_id` remains optional for single-event precision.
   - Retain/consolidation + backfill metrics updated to query by `source_episode_id`:
     - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/automations/meeseeks/memory-retain-episode.ts`
     - `/Users/tyler/nexus/home/projects/nexus/nex/src/cli/memory-backfill-cli.ts`
4. Adapter-driven contact seeding:
   - Metadata ingest contract implemented in `/Users/tyler/nexus/home/projects/nexus/nex/src/iam/identity.ts` (`ingestAdapterContactSeedsFromMetadata`).
   - Live path integration in `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/stages/resolveIdentity.ts`.
   - Backfill pre-seed pass integration in `/Users/tyler/nexus/home/projects/nexus/nex/src/cli/memory-backfill-cli.ts`.
5. Schema bootstrap ordering fixes (runtime drift hardening):
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/db/memory.ts` (`ensureMemorySchema` ordering).
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/db/events.ts` (`ensureEventsSchema` ordering).
6. IAM bootstrap taxonomy hard-cutover (`sender` match key):
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/iam/policies.ts` bootstrap policies now use `match.sender` consistently.
   - Policy session template placeholders are now `sender`-based (`{sender.id}`, `{sender.name}`, `{sender.relationship}`), replacing `principal` placeholders in IAM policy tests/bootstrap.

### Validation Completed

1. Targeted lint: clean on all touched files (`oxlint`).
2. Targeted test suite: all pass
   - IAM core/conformance/compiler/authorize/access-resolution
   - retain access helper
   - control-plane scope authz + IAM authorize
   - resolve identity stage
   - retain episode automation
3. Additional regression checks: pass
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/db/events.fts.test.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/recall.test.ts`

### Remaining (outside this execution slice)

1. Live/backfill quality validation and output auditing on real iMessage windows.
2. Prompt/context quality tuning for writer reliability (separate track).
3. Identity normalization refinements (phone/shortcode/contact taxonomy quality pass).

## 1. Customer Experience (Primary Requirement)

The user experience we are targeting is:

1. Memory retain runs are deterministic and reliable across live + backfill paths.
2. Writer agents always run with the expected permissions and tool access shape.
3. Facts written from episode retention are attributable at episode level without hacks.
4. Contact/identity resolution uses canonical linkage from adapter-provided contact mappings so facts resolve to real people/entities, not fragmented handles.
5. Failures are loud and clean (no hidden fallback hacks, no silent degradation).

## 2. Scope

This spec executes three workstreams together:

1. IAM end-state unification (remaining runtime/control-plane/tool-invoke drift).
2. Episode-native attribution (`source_episode_id`) in memory facts and writer contract.
3. Adapter-driven contact seeding into canonical identity linkage.

Hard-cutover posture applies for this slice.

## 3. Current-State Findings

1. Retain access is now policy-compiled, but still wired via helper path:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/retain-access.ts`
   - Uses `resolveAccessStage` and policy `system-memory-retain-full-access`.
2. Control-plane still has a parallel role gate outside IAM compiler envelope:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-methods.ts` (`authorizeRuntimeMethod`).
3. `tools.invoke` has additional runtime policy filtering inside execute path:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/tool-invoke.ts`.
4. Facts schema/writer contract lacks episode-native attribution:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/db/memory.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/tools/memory-writer-tools.ts`.
5. Contact seeding contract from adapters/Eve is not first-class in runtime ingest.

## 4. Implementation Plan

## 4.1 IAM End-State Consolidation

1. Move transport role authorization enforcement from `authorizeRuntimeMethod` into canonical control-plane IAM authorize path.
2. Remove external parallel gate call from runtime request handler.
3. Keep one canonical authorization decision path before method handler execution.
4. Simplify `tools.invoke` execution path to trust canonical `request.access` envelope for permissioning (remove secondary policy re-filter layer there).

### Acceptance

1. Control-plane request auth decisions are produced by one IAM envelope path.
2. No separate role gate in `server-methods.ts`.
3. `tools.invoke` does not run independent policy compilation/filter chain after ACL decision.

## 4.2 Episode-Native Attribution

1. Add `facts.source_episode_id TEXT` + index to memory schema + migration guard.
2. Extend writer tool schema:
   - `insert_fact(..., source_episode_id?: string, source_event_id?: string)`.
3. Episode writer flow requirements:
   - episode runs must set `source_episode_id`.
   - `source_event_id` remains optional for precise single-event facts.
4. Update retain/consolidation selection and backfill metrics to query by `source_episode_id`.

### Acceptance

1. New episode-retained facts are queryable by `source_episode_id`.
2. Episode consolidation selection does not depend on `source_event_id` set membership.
3. No context-based provenance fallbacks are required.

## 4.3 Adapter/Eve Contact Seeding

1. Introduce adapter contact seed ingest contract in event metadata:
   - `event.metadata.adapter_contacts[]` entries with normalized sender identifiers + optional display names + optional alias identifiers.
2. In `resolveIdentityStage`, ingest adapter contact seeds into identity canonical mapping before normal sender resolution.
3. In memory backfill pipeline, add pre-retain identity seed pass from backfill events + adapter contact metadata to ensure canonical contact linkage exists before writer extraction.

### Acceptance

1. Adapter/Eve provided contact mappings are persisted into identity linkage pre-writer.
2. Canonical entity reuse improves for known contacts during backfill/live retain.

## 5. Validation Plan

1. IAM tests:
   - control-plane scope authz tests
   - tools.invoke HTTP tests
   - IAM conformance suite
2. Memory attribution tests:
   - writer tool insert_fact tests
   - memory retain episode automation tests
   - consolidation batch tests (fact selection by episode)
3. Contact seeding tests:
   - resolveIdentity stage ingest test for `adapter_contacts`
   - backfill seed pass test with synthetic event rows
4. Focused runtime evidence:
   - verify live writer turns show expected permissions and tool availability
   - verify new facts include `source_episode_id`

## 6. Non-Goals

1. Full redesign of agent tool surface or replacement with pure code-mode execution.
2. Immediate broad cleanup of all unrelated baseline type/test failures in the repo.
3. Backward compatibility aliases for this slice.
