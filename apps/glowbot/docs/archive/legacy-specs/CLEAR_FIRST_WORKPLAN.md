# GlowBot Clear-First Adapter Workplan

Date: 2026-02-26
Status: execution-ready
Strategy: implement highest-clarity adapters first, then run focused spec spikes before ambiguous integrations.

---

## 1) Prioritization Framework

We prioritize by:

1. API/model clarity (known endpoints + known payload shapes + known auth flow).
2. Time-to-value (how quickly we can get real clinic data into `metrics_daily`).
3. Dependency risk (partner approvals, NDA docs, external lead time).

Execution order based on current clarity:

1. Google Ads (`gog ads`) - highest clarity.
2. Google Business Profile fast path (`gog places` + `place_id`) - high clarity.
3. Meta Ads PAT fast path - medium clarity.
4. Zenoti API-key fast path - medium clarity.
5. Patient Now API-key path - lowest clarity until partner/private docs are available.
6. Google Business Profile full OAuth partner path - deferred partner-gated scope.

---

## 2) Work Waves

## Wave A - Clear and Build Now

Goal: complete the adapters with the clearest contracts and validate end-to-end ingestion plus pipeline output.

Scope:

1. Finalize `nexus-adapter-gog-ads` and register it in runtime adapter config.
2. Finalize `nexus-adapter-gog-places` (GBP fast path) and register it in runtime adapter config.
3. Validate `adapter.connections.*` for both adapters (`connect -> test -> backfill -> disconnect`).
4. Confirm backfill output lands in canonical metrics model (`metrics_daily` shape and metric names).
5. Keep pipeline auto-trigger on successful connect/upload paths and verify resulting run state transitions.

Acceptance criteria:

1. Both adapters appear in Integrations with correct auth manifests.
2. Both adapters pass connection health checks with real/stub credentials.
3. Backfill generates canonical metric rows used by funnel computation.
4. Dashboard reflects non-seed values after adapter sync + pipeline trigger.

Validation:

1. Adapter unit tests (Go).
2. Control-plane integration tests (`adapter.connections.*`).
3. GlowBot pipeline/API tests + app build.

---

## Wave B - Medium Ambiguity + Focused Spec Spikes

Goal: implement the next two adapters, but require a short spec checkpoint before coding each.

Scope:

1. Meta Ads PAT fast path adapter.
2. Zenoti API-key fast path adapter.

Mandatory mini-spec before each adapter (time-boxed):

1. Lock exact auth fields and token lifecycle behavior.
2. Lock endpoint list and response fields used for mapping.
3. Lock canonical metric mapping and CSV parity fallback.
4. Lock rate-limit/retry policy.

Acceptance criteria:

1. Each adapter supports at least one production-usable auth path plus CSV fallback.
2. Metric mappings are deterministic and traceable to source fields.
3. Backfill + recent sync windows are validated against sample payloads.

---

## Wave C - High Ambiguity / External Dependency

Goal: avoid speculative implementation; execute only once external contracts/docs are available.

Scope:

1. Patient Now adapter implementation after contract/docs/access.
2. Google Business Profile full OAuth partner flow after partner approval.

Preconditions:

1. Patient Now docs + endpoint contracts + auth provisioning path are available.
2. Any required HIPAA/BAA constraints are confirmed for data handling scope.
3. GBP partner approval granted for performance metrics endpoints.

Acceptance criteria:

1. No guessed fields or inferred private endpoints in production code.
2. Security/compliance requirements are explicitly tested before enabling broad rollout.

---

## 3) Immediate TODO Queue (Start Now)

1. Wire runtime registration for `nexus-adapter-gog-ads` and `nexus-adapter-gog-places`.
2. Add integration tests for both adapters through `adapter.connections.apikey.save|oauth.start|test|disconnect`.
3. Add ingestion verification: emitted adapter metrics are persisted and consumed by GlowBot pipeline views.
4. Run end-to-end dry run: connect -> sync/backfill -> pipeline trigger -> dashboard data check.
5. Create Meta Ads mini-spec (PAT-only slice first), then implement.
6. Create Zenoti mini-spec (API-key-only slice first), then implement.
7. Defer Patient Now and GBP full OAuth until next-week contract/access milestone.

---

## 4) Ambiguity Escalation Rules

Stop implementation and run a spec spike when any of these occur:

1. Required endpoint field is undocumented or inconsistent across accounts.
2. Auth token lifecycle cannot be validated from official docs/test responses.
3. Metric mapping requires assumptions about business semantics (status meanings, conversion attribution, revenue treatment).
4. Compliance obligations change data retention or storage requirements.

Output of each spike:

1. One short adapter-specific addendum in `specs/` with locked request/response examples.
2. Updated implementation tasks and explicit out-of-scope notes.

