# GlowBot — Validation Ladder

> Active validation ladder for bringing GlowBot code to parity with the active
> spec set.
>
> **Status:** ACTIVE
> **Last Updated:** 2026-03-10
> **Covers:** target-state specs, active workplan, and live cutover runbook

---

## How To Use This Ladder

1. validate in milestone order
2. use evidence, not intent
3. keep upstream/runtime dependency gaps separate from GlowBot-owned gaps
4. do not collapse on-demand read-path completion into persisted
   derived-output completion
5. hard-gate destructive or live-clinic steps

---

## Milestone 0: Canonical Spec Lock ✅

The target-state canon is coherent and stable enough to drive implementation.

| # | Checkpoint | Pass Criteria |
|---|---|---|
| S1 | Package topology locked | `GLOWBOT_PACKAGE_TOPOLOGY.md` defines `app/admin/hub/website/shared` |
| S2 | Object vocabulary locked | `GLOWBOT_OBJECT_TAXONOMY.md` defines package and hosted terms |
| S3 | Pipeline boundary locked | `DATA_PIPELINE.md` states nex core vs GlowBot app-code ownership |
| S4 | Hub shell locked | `GLOWBOT_HUB_SERVICE_SHELL.md` defines shell modules and private ingress |
| S5 | Benchmark boundary locked | `GLOWBOT_BENCHMARK_NETWORK.md` locks `ClinicBenchmarkSnapshot` and peer benchmark behavior |
| S6 | Clinic profile ownership locked | `GLOWBOT_CLINIC_PROFILE.md` defines app-owned clinic profile truth and early-rollout `"unknown"` rules |
| S7 | Clinic app -> hub gateway locked | `GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md` locks the frontdoor-mediated hosted transport model |
| S8 | Admin surface locked | `GLOWBOT_ADMIN_SURFACE.md` locks admin role and method families |
| S9 | Derived-output target locked | `GLOWBOT_DERIVED_OUTPUT_MODEL.md` locks the local derived-output target state |
| S10 | Hard cutover policy locked | active specs consistently reject backwards compatibility |

---

## Milestone 1: Monorepo Topology Cutover ✅

The repository layout teaches the same structure as the canonical package
topology.

| # | Checkpoint | Pass Criteria |
|---|---|---|
| T1 | Clinic app package renamed | `consumer/` replaced by `app/` |
| T2 | Clinic UI folded into app package | former `consumer-ui/` lives under `app/ui/` |
| T3 | Operator package remains explicit | `admin/` remains a top-level app package |
| T4 | Public package remains explicit | `website/` remains a top-level package |
| T5 | Hub package boundary exists | `hub/` exists as a top-level control-plane app-package boundary |
| T6 | Workspace config is real | root workspace config references actual packages only |

---

## Milestone 2: Hosted Package And Deployment Model ✅

GlowBot manifests now teach the intended package and deployment truth.

| # | Checkpoint | Pass Criteria |
|---|---|---|
| P1 | Clinic app declares shared adapter dependencies | clinic app manifest uses `requires.adapters` for shared adapter packages |
| P2 | No adapter path escapes remain | no adapter `command` paths escape the package root |
| P3 | App-facing integration metadata is profile-based | manifest uses `adapters[].connectionProfiles` |
| P4 | Shared constants reflect current adapter reality | unified `google` plus `callrail` and `twilio` are canonical |
| P5 | Shared types reflect connection-profile model | contracts do not expose legacy app-local auth form canon |
| P6 | Clinic app does not locally require `glowbot-hub` | clinic-server manifest does not imply product-control-plane co-installation |
| P7 | Admin app declares the correct local app dependency model | admin manifest and package metadata match the dedicated control-plane server model |
| P8 | Hub package metadata is real | `glowbot-hub` has real app/package metadata for control-plane deployment |

Current state note:

- P1-P8 are materially landed in the app/admin/hub manifests
- remaining work is deployed control-plane validation, not local manifest
  parity

---

## Milestone 3: Runtime Adapter Connection Surface ✅

The app-facing runtime SDK is now connection-based in code and tests.

| # | Checkpoint | Pass Criteria |
|---|---|---|
| R1 | `adapters.list()` returns usable connection state | clinic app receives connection/profile-aware runtime state |
| R2 | `adapters.disconnect()` is wired | clinic app can disconnect through runtime |
| R3 | `adapters.test()` is wired | clinic app can run connection tests through runtime |
| R4 | `adapters.getHealth()` is wired | clinic app can read connection health/status through runtime |
| R5 | `adapters.connect()` is profile-aware and connection-based | flow selection does not rely on adapter-singleton assumptions |
| R6 | `adapters.backfill()` has a deliberate runtime contract | GlowBot is not faking backfill locally |
| R7 | Stable `authMethodId` resolution exists | runtime uses stable auth-method identity rather than array position |
| R8 | Coexisting scopes are canonical | `server`-scoped and `app`-scoped connections can coexist cleanly for one adapter package |
| R9 | Managed profile routing is canonical | runtime/frontdoor path preserves `connection_id`, profile identity, and owner resolution |

Current state note:

- R1-R9 are materially landed in the runtime/frontdoor/GlowBot code path
- remaining work is deployed hosted validation in Milestone 13, not local
  workaround implementation

---

## Milestone 4: Pipeline Write Path Baseline ✅

GlowBot writes raw metric data into nex primitives through the canonical Nex
write path.

| # | Checkpoint | Pass Criteria |
|---|---|---|
| W1 | Install registers the metric element definition | `memory.elements.definitions.*` contains the GlowBot `metric` type |
| W2 | Install registers jobs/DAG/schedules | GlowBot work primitives exist in the nex work domain under canonical `schedules.*` nouns |
| W3 | Durable ingest wake-up exists | `metric_extract` is woken by `events.subscriptions.*` on `record.ingested`, not transient app-local adapter event hooks |
| W4 | Metric extraction writes elements | canonical records produce `metric` elements via nex APIs |
| W5 | Deduplication is connection-aware | repeated runs do not duplicate the same metric for the same connection, and distinct same-adapter connections remain distinct |
| W6 | Multi-location tagging works | metric elements carry canonical `clinic_id` when present |
| W7 | Provenance metadata preserves connection context | metric metadata carries `connection_id` and preserves additional connection context when runtime provides it |
| W8 | No adapter-singleton ingest assumptions remain | write-path keys, queries, and element schemas do not collapse multiple same-adapter connections into one source |
| W9 | Write path is ready for future link creation | the metric write path can support derived-output provenance links later |

Current state note:

- W1-W9 are materially landed
- remaining provenance-link materialization now belongs to Milestone 12 rather
  than the raw metric write path baseline

---

## Milestone 5: Clinic Read Path And On-Demand Computation ✅

Clinic-facing GlowBot reads from nex primitives and computes higher-level views
on demand.

| # | Checkpoint | Pass Criteria |
|---|---|---|
| C1 | Clinic methods no longer depend on a local pipeline store | overview/funnel/modeling/agents/pipeline status do not read from SQLite |
| C2 | Read model uses metric elements | clinic read surfaces derive from `memory.elements.list` and app-owned computation code |
| C3 | Manual trigger queues nex work | `glowbot.pipeline.trigger` invokes the nex work path rather than a local pipeline runner |
| C4 | UI response contracts remain usable | clinic UI continues to render without method contract regressions |
| C5 | App-level tests and build pass | focused app tests and clinic UI build succeed |

---

## Milestone 6: Hard Cutover Deletion ✅

The old local pipeline has been removed from the active clinic app path.

| # | Checkpoint | Pass Criteria |
|---|---|---|
| H1 | `glowbot.db` creation removed | clinic app no longer creates the old database |
| H2 | Legacy pipeline store removed | `pipeline/store.ts` deleted |
| H3 | Legacy schema helpers removed | old SQLite schema/setup files deleted |
| H4 | `DatabaseSync` removed | no direct SQLite pipeline access remains in active clinic code |
| H5 | Old package/path assumptions removed from active app path | active clinic app path no longer depends on `consumer/`, `consumer-ui/`, or adapter path escapes |
| H6 | App validates after deletion | focused app tests and build succeed without the old store |

---

## Milestone 7: Hub Service Shell 🟡

The product control plane shell is materially landed in code, but deployment and
validation closure are still open.

| # | Checkpoint | Pass Criteria |
|---|---|---|
| HS1 | Hub package is executable | `hub/` is more than a README and has real app/package metadata |
| HS2 | Private ingress endpoints exist | frontdoor relay endpoints are implemented at the canonical paths |
| HS3 | Private ingress enforces caller auth | unauthenticated or malformed relay requests are rejected |
| HS4 | Managed profile registry exists | durable managed-profile storage and lookup are implemented |
| HS5 | Secret reference model exists | hub resolves secret refs server-side without leaking long-lived secret material |
| HS6 | Diagnostics module exists | hub can report health and recent relay failures |
| HS7 | Audit module exists | relay and operator actions are captured with enough metadata for review |
| HS8 | Config module exists | product flags/threshold/config storage exists in the shell |

Current state note:

- HS1-HS8 are materially landed in the hub package
- hosted deployment truth is now proven through Milestone 7A
- remaining work is stronger secret-storage and managed-profile relay
  verification rather than greenfield shell creation

## Milestone 7A: Package Publish And Deploy Rehearsal ✅

| # | Checkpoint | Pass Criteria |
|---|---|---|
| PR1 | `glowbot` artifact exists | real tarball emitted from package-release tooling |
| PR2 | `glowbot-admin` artifact exists | real tarball emitted from package-release tooling |
| PR3 | `glowbot-hub` artifact exists | real tarball emitted from package-release tooling |
| PR4 | clinic install uses real artifact | hosted clinic-server install is driven from published package artifact |
| PR5 | control-plane install uses dependency planning | installing `glowbot-admin` also installs `glowbot-hub` |
| PR6 | admin visibility is operator-only | deployed admin surface is not visible in normal customer inventory |
| PR7 | `productControlPlane.call` works against deployed control plane | clinic app reaches the installed control plane through the hosted path |

Current state note:

- PR1-PR7 are landed and validated in the hosted GlowBot deployment rehearsal

---

## Milestone 8: GlowBot-Managed Profiles 🟡

The first real product-managed connection path must exist on top of the shell.

| # | Checkpoint | Pass Criteria |
|---|---|---|
| MP1 | Managed profiles can be created and listed | hub exposes real managed-profile objects |
| MP2 | Full tuple resolution works | profile resolution uses `managed_profile_id`, `app_id`, `adapter_id`, `connection_profile_id`, and `auth_method_id` |
| MP3 | Secret-backed exchange works | the hub can perform the first real GlowBot-managed provider operation |
| MP4 | Long-lived secrets stay in the hub | secret material is not returned to clinic runtimes or browsers |
| MP5 | Frontdoor relay to GlowBot-managed profile works | runtime -> frontdoor -> hub path succeeds for the first real managed profile |

Current state note:

- MP1-MP4 are materially landed in hub code
- MP5 still needs end-to-end validation through the real runtime/frontdoor/hub
  path

---

## Milestone 9: Admin Surface 🟡

The operator-facing admin app must become real.

| # | Checkpoint | Pass Criteria |
|---|---|---|
| A1 | Stale `glowbot-admin.credentials` concept is removed | admin manifest and handlers use canonical admin surface names |
| A2 | Overview surface is real | admin can load real control-plane overview state |
| A3 | Managed-profile views are real | admin can inspect and manage managed profiles through the hub |
| A4 | Clinics views are real | admin can inspect clinic participation and support-safe clinic state |
| A5 | Diagnostics views are real | admin can inspect relay failures, health, and diagnostics from the hub |
| A6 | Benchmark/cohort/seed views are real | admin can operate benchmark-network controls through the hub |
| A7 | Product flags/config views are real | admin can inspect and update product config through the hub |
| A8 | Admin access and visibility are correct | admin is operator-only and hidden from normal customer app inventory |

Current state note:

- A1-A7 are materially landed at the method-contract level
- A8 and full operator-surface validation remain open until the dedicated
  control-plane deployment path is exercised

---

## Milestone 13A: Synthetic Deployed Rehearsal ✅

| # | Checkpoint | Pass Criteria |
|---|---|---|
| SDR1 | Real GlowBot package artifacts publish cleanly | `glowbot`, `glowbot-admin`, and `glowbot-hub` are published as real hosted artifacts |
| SDR2 | Deployed control-plane split is real | `glowbot-admin` and `glowbot-hub` run on a dedicated control-plane runtime and `glowbot` runs on a separate clinic runtime |
| SDR3 | Synthetic record ingest reaches the clinic runtime | canonical synthetic `record.ingest` payloads are accepted on the deployed clinic runtime |
| SDR4 | `metric_extract` materializes metric elements | deployed downstream work writes real `metric` elements from those synthetic records |
| SDR5 | Clinic methods read sane outputs | deployed `overview`, `funnel`, `modeling`, and recommendations methods return coherent data |
| SDR6 | Benchmark snapshot publish/query works | the deployed clinic app and control plane exchange benchmark-safe snapshots successfully |
| SDR7 | Deployed product-control-plane reads work | product flags and other control-plane reads succeed through `productControlPlane.call` |

Current state note:

- SDR1-SDR7 are landed and validated in the hosted GlowBot synthetic deployed
  rehearsal

---

## Milestone 10: Benchmark Network 🟡

The shared benchmark network must become real on top of the hub.

| # | Checkpoint | Pass Criteria |
|---|---|---|
| BN1 | Snapshot publication endpoint exists | clinic app can publish `ClinicBenchmarkSnapshot` to the hub |
| BN2 | Snapshot validation is enforced | malformed or privacy-unsafe snapshots are rejected |
| BN3 | Cohort resolution is deterministic | hub assigns canonical profile/cohort keys from clinic profile data |
| BN4 | Peer benchmark aggregation exists | hub computes or updates peer benchmark records |
| BN5 | Seed dataset storage exists | hub can persist and list seed benchmark records |
| BN6 | Query returns peer or seed data honestly | source attribution, freshness, and sample size are preserved |
| BN7 | Network health exists | admin can inspect cohort coverage, stale publishers, and sample-size health |

Current state note:

- BN1-BN7 are materially landed in the hub
- what remains open is real clinic-app publication/query usage against the
  canonical clinic profile and hosted gateway path

---

## Milestone 11: Clinic App Hub Integration ✅

The clinic-facing app must consume the real hub rather than placeholders.

| # | Checkpoint | Pass Criteria |
|---|---|---|
| CI1 | Clinic app owns a canonical clinic profile | clinic runtime can resolve a `ClinicProfile` with required `specialty` and allowed `"unknown"` bands |
| CI2 | Clinic app publishes snapshots to the hub | benchmark-safe clinic summaries are sent to `glowbotHub.benchmarks.publishSnapshot` |
| CI3 | Clinic app queries benchmark data from the hub | peer benchmark context comes from the hub rather than local seeds alone |
| CI4 | Clinic app consumes hub-backed product flags when needed | hub is the real source of product-control data |
| CI5 | Clinic app uses the hosted product-control-plane gateway | clinic app does not require direct hub URLs or tenant-local hub auth secrets |
| CI6 | Managed profile flows resolve through the real hub | the clinic app relies on runtime/frontdoor/hub rather than local placeholder assumptions |
| CI7 | Clinic app no longer teaches local hub co-installation | clinic app package metadata matches the deployment model |

Current state note:

- CI1-CI7 are materially landed in app/runtime/hub code
- dedicated control-plane deployment validation now belongs to Milestone 13,
  not this local integration milestone

---

## Milestone 12: Persisted Derived Outputs And DAG Automation 🟡

Persisted higher-level observations remain future work and are still required
for full parity with the target-state derived-output spec.

| # | Checkpoint | Pass Criteria |
|---|---|---|
| D1 | Derived element definitions are registered | `funnel_snapshot`, `trend_delta`, `dropoff_analysis`, and `recommendation` types exist |
| D2 | Compute jobs are real | `funnel_compute`, `trend_compute`, `dropoff_detect`, and `recommend` are implemented jobs |
| D3 | Derived outputs are persisted canonically | jobs write derived outputs into nex primitives instead of returning only on-demand results |
| D4 | Derived outputs preserve provenance | derived elements link back to source metric elements |
| D5 | Recommendations are versioned canonically | recommendation elements use active/superseded semantics rather than overwrite |
| D6 | Read path can use persisted outputs | clinic surfaces can consume persisted derived outputs where intended |
| D7 | DAG execution is real end to end | DAG runs advance through node execution rather than serving as registration-only scaffolding |
| D8 | Schedule-driven refresh is real end to end | scheduled execution produces real work, not only records |

Current state note:

- the March 10 Nex validation packet no longer justifies treating D7-D8 as
  upstream-blocked by default
- the remaining work in this milestone is now primarily GlowBot-owned

---

## Milestone 13: Live Clinic Cutover 🚧

Real credentials and real clinic data validate the end-to-end customer
experience.

| # | Checkpoint | Pass Criteria |
|---|---|---|
| L1 | Clinic server is provisioned and GlowBot reachable | hosted launch path works |
| L2 | Real connection flow works | chosen GlowBot connection profile connects through runtime and, when managed, resolves through frontdoor to the GlowBot product control plane |
| L3 | Real connection test works | runtime test returns success and usable health/status |
| L4 | First real data arrives | live metric elements land in nex primitives |
| L5 | Benchmark publication and query work live | clinic publishes snapshots and receives peer/seed data from the hub |
| L6 | Live pipeline behavior is correct | live manual/scheduled work behaves as expected for the implemented pipeline stage |
| L7 | Clinic UI shows real data | overview/funnel/modeling/agents surfaces populate with real data |
| L8 | Disconnect/reconnect is repeatable | no orphaned connection or data-state corruption |
| L9 | Evidence captured | follow the live cutover runbook and retain artifacts |

---

## Live Credential Runbook

Live-clinic validation details are tracked in:

- [LIVE_CREDENTIAL_CUTOVER_RUNBOOK.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/validation/LIVE_CREDENTIAL_CUTOVER_RUNBOOK.md)

---

## Milestone 13A: Synthetic Deployed Rehearsal 🚧

Synthetic canonical records validate the deployed two-server GlowBot shape
before live credentials arrive.

| # | Checkpoint | Pass Criteria |
|---|---|---|
| SR1 | Control-plane server is installed | `glowbot-admin` and `glowbot-hub` are installed on a dedicated server |
| SR2 | Clinic server is installed | `glowbot` is installed on a separate clinic server |
| SR3 | Product flag update works through deployed admin path | operator update reaches the real control plane |
| SR4 | Clinic profile update works on deployed clinic app | benchmark-capable clinic profile truth is persisted |
| SR5 | Synthetic canonical record ingress works | deployed clinic runtime accepts canonical `record.ingest` |
| SR6 | Metric extraction runs downstream | synthetic records produce real `metric` elements |
| SR7 | Overview/funnel/modeling/recommendations are sane | deployed clinic methods return coherent responses |
| SR8 | Benchmark publish/query works on deployed topology | clinic app and control plane round-trip benchmark data |
| SR9 | Clinic can read product flags through `productControlPlane.call` | deployed gateway path is real for product config reads |

Current state note:

- this milestone is the next active non-credential validation slice
- once complete, targeted hub/admin hardening can be driven by the evidence it
  surfaces
