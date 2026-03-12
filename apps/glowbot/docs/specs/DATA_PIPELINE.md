# GlowBot — Data Pipeline & Data Model

> Metric taxonomy, funnel computation, element schemas, and pipeline execution via nex primitives.

> Detailed persisted derived-output canon now lives in:
>
> - [GLOWBOT_DERIVED_OUTPUT_MODEL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_DERIVED_OUTPUT_MODEL.md)
> - [GLOWBOT_BENCHMARK_NETWORK.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_BENCHMARK_NETWORK.md)
> - [GLOWBOT_CLINIC_PROFILE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_CLINIC_PROFILE.md)
> - [GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md)

---

## Design Principles

1. **Build on nex core** — GlowBot's pipeline is expressed as nex jobs operating on nex elements, not as a separate application with its own database. No parallel data infrastructure.
2. **Raw data first** — shared adapters emit canonical `record.ingest` envelopes carrying metric facts. A `metric_extract` job reacts downstream to `record.ingested` and converts those canonical records into metric elements with full granularity.
3. **Funnel is a computed view** — stitched from metric elements across adapters, not a predefined abstraction. Stored as observation elements.
4. **Name metrics what they are** — `calls_total`, `appointments_booked`, `ad_spend`. Never over-generalize. Collapse later if needed, never prematurely.
5. **Never transform in place** — metric elements are immutable source of truth. Computed elements (funnel snapshots, trends, recommendations) are re-derived on each pipeline run.
6. **Source traceability** — every metric element preserves the originating runtime `connection_id`; `adapter_id` remains source classification. Every computed element links back to the metric elements it was derived from via `element_links`.
7. **Pipeline as DAG** — the pipeline is a nex DAG definition with explicit dependencies, enabling parallel execution and context accumulation between steps.
8. **Hard cutover** — no backwards compatibility with legacy app-local pipeline storage. All data flows through nex primitives.
9. **SDK only** — GlowBot uses the nex Platform SDK (`ctx.nex.runtime.callMethod(...)`) to interact with records, elements, sets, links, jobs, DAGs, schedules, and durable event subscriptions. No direct database access.
10. **Multi-location via metadata** — all metric elements carry `clinic_id` in metadata. Pipeline can aggregate per-location or rolled-up across all locations. Location is a query filter, not an architectural boundary.
11. **Ownership boundary is explicit** — nex core owns generic storage, indexing, scheduling, and orchestration primitives. GlowBot owns product-specific computation modules such as metric normalization, funnel math, trend analysis, drop-off detection, and recommendation logic.
12. **Benchmark publication uses app-owned clinic identity** — benchmark snapshots include the canonical GlowBot `ClinicProfile` owned by the clinic app; the hub resolves cohorts from that object.
13. **Clinic runtimes reach the hub through the hosted gateway** — clinic-facing product APIs flow through the frontdoor-mediated product-control-plane gateway, not direct hub URLs.

### Why nex Primitives?

GlowBot could maintain its own separate application database, but this would be a parallel data system alongside nex's memory.db. Instead, GlowBot's data model maps naturally onto nex's existing primitives:

- **Inbound adapter data → Records** (`record.ingest` / `record.ingested`) — canonical external source material carrying metric facts
- **Metric data → Elements** (type: `metric`) — atomic derived facts with structured metadata
- **Period groupings → Sets** — collections of metric elements for computation windows
- **Pipeline steps → Jobs** — deterministic or LLM-driven computation
- **Pipeline orchestration → DAG** — multi-step workflow with dependencies and parallelism
- **Attribution chains → Element Links** — provenance from computed outputs back to raw inputs

This means GlowBot automatically benefits from nex's FTS5 search, element versioning, job audit trail, processing logs, and future improvements to the core system.

### Ownership Boundary: Nex Core vs GlowBot App Code

The target state is:

- nex core owns the generic primitives:
  - element storage and query
  - element link storage and traversal
  - job registration and run records
  - DAG orchestration
  - schedule evaluation
  - canonical record ingestion
  - durable event-subscription wake-up
- GlowBot owns the product-specific computation code:
  - metric normalization rules for GlowBot concepts
  - clinic-profile-backed benchmark snapshot assembly
  - funnel computation
  - trend computation
  - drop-off detection
  - recommendation generation

GlowBot does not move its product semantics into nex core. Instead, GlowBot job
handlers call app-owned computation modules and persist the results through nex
primitives.

For benchmark publication, the clinic app combines:

- metric elements
- the canonical GlowBot `ClinicProfile`
- app-owned computation logic

and sends the resulting snapshot through the frontdoor-mediated product control
plane gateway to `glowbot-hub`.

---

## 1. Metric Taxonomy

### 1.1 Raw Metrics by Source

| Source | Metrics Captured |
|--------|-----------------|
| Google Ads | `ad_spend`, `ad_impressions`, `ad_clicks`, `ad_conversions`, `ad_cost_per_click`, `ad_cost_per_conversion` — per campaign, per ad group, per day |
| Meta Ads | `ad_spend`, `ad_impressions`, `ad_clicks`, `ad_conversions`, `ad_cost_per_result`, `ad_reach` — per campaign, per ad set, per day |
| Patient Now | `patients_new`, `patients_returning`, `appointments_booked`, `appointments_completed`, `appointments_noshow`, `appointments_cancelled`, `treatments_completed`, `revenue` — per day |
| Zenoti | Same EMR metrics as Patient Now (normalized to same schema) + `revenue_per_service_category` |
| Google Business Profile | `listing_views_search`, `listing_views_maps`, `listing_clicks_website`, `listing_clicks_directions`, `listing_clicks_phone`, `reviews_count`, `reviews_rating_avg`, `reviews_new` — per day |
| CallRail | `calls_total`, `calls_answered`, `calls_missed`, `calls_first_time`, `calls_duration_avg`, `calls_by_source`, `calls_by_campaign`, `leads_qualified`, `leads_converted` — per day |
| Twilio | `calls_total`, `calls_inbound`, `calls_outbound`, `calls_completed`, `calls_failed`, `calls_duration_avg`, `calls_cost_total` — per day |
| Apple Maps | `reviews_count`, `reviews_rating_avg`, `reviews_new` — per day (CSV only) |

### 1.2 Metric Naming Convention

```
{domain}_{what}
```

Examples:
- `ad_spend` — advertising domain, spend metric
- `appointments_booked` — EMR domain, bookings
- `listing_views_search` — local domain, search views
- `calls_total` — call tracking domain, total calls
- `calls_first_time` — call tracking domain, new callers
- `leads_converted` — call tracking domain, converted leads

Metrics are named what they are. `calls_total` is calls. `appointments_booked` is bookings. No premature abstraction.

The `adapter_id` in the element metadata tells you which source family
(`google`, `meta-ads`, `callrail`, etc.) produced the metric. The canonical
provenance identity is `connection_id`, not `adapter_id`. GlowBot product
bindings, ingest provenance, and deduplication must not assume one connection
per adapter.

---

## 2. Data Model (memory.db Elements)

### 2.1 Why Not a Separate Database?

An app-local pipeline database was considered and rejected because it would duplicate storage, querying, and provenance primitives that already belong in nex memory and work domains.

The nex memory.db system already provides:
- **Elements** — typed knowledge units with metadata, timestamps, entity linking, FTS5 search
- **Sets** — polymorphic collections grouping elements for computation
- **Jobs** — processing units with audit trail, input/output tracking, idempotency
- **DAGs** — multi-step workflow orchestration with dependencies and context accumulation
- **Element Links** — typed relationships (causal, supports, derived_from) between elements

GlowBot's data fits these primitives exactly. Metric values are facts. Funnel snapshots are observations. Recommendations are mental models. The pipeline is a DAG.

### 2.2 Element Definitions

GlowBot registers its custom element types in the memory element-definition
registry. The definition config carries the owner app identity and the metadata
schema contract for the type, including the distinction between source
classification (`adapter_id`) and canonical connection provenance
(`connection_id`).

#### SDK Operations

```text
memory.elements.definitions.list   → list registered element types
memory.elements.definitions.get    → get a registered type definition
memory.elements.definitions.create → register a new element type with config
```

#### GlowBot Registration

```typescript
await ctx.nex.runtime.callMethod('memory.elements.definitions.create', {
  id: 'metric',
  name: 'metric',
  description: 'Daily metric data point from an adapter',
  config: {
    ownerAppId: ctx.app.id,
    metadataSchema: {
      type: 'object',
      required: ['connection_id', 'adapter_id', 'metric_name', 'metric_value', 'date'],
      properties: {
        connection_id: { type: 'string' },
        adapter_id: { type: 'string' },
        connection_profile_id: { type: 'string' },
        auth_method_id: { type: 'string' },
        connection_scope: { type: 'string', enum: ['server', 'app'] },
        source_app_id: { type: 'string' },
        metric_name: { type: 'string' },
        metric_value: { type: 'number' },
        date: { type: 'string', format: 'date' },
        clinic_id: { type: 'string' },
        metadata_key: { type: 'string' }
      }
    }
  }
});

// Register funnel_snapshot, trend_delta, dropoff_analysis, recommendation types...
```

Definitions exist so the runtime can treat GlowBot types as first-class typed content and so validation and query tooling can discover those types without GlowBot-specific hardcoding.

### 2.3 Custom Element Types

GlowBot registers the following element types during its `install` hook:

#### Metric Element (`type: "metric"`)

Created by the `metric_extract` job from canonical adapter-emitted records
carrying canonical connection provenance.

```typescript
{
  id: "01J...",                    // ULID
  type: "metric",
  content: "ad_spend: $1,234.56 on 2026-03-04 from google (campaign: Brand) [Atlanta Buckhead]",
  entity_id: "clinic-123",        // links to the clinic entity
  as_of: 1709510400000,           // 2026-03-04 as Unix timestamp
  source_record_id: "rec_...",    // the canonical record that carried this
  source_job_id: "job_...",       // the metric_extract job run
  metadata: {
    connection_id: "conn_google_glowbot_01",
    adapter_id: "google",
    connection_profile_id: "glowbot-managed-google",
    auth_method_id: "oauth_managed",
    connection_scope: "app",
    source_app_id: "glowbot",
    metric_name: "ad_spend",
    metric_value: 1234.56,
    date: "2026-03-04",
    clinic_id: "center_atl_01",    // multi-location: which clinic/center/location
    metadata_key: "campaign:Brand"  // granularity key; "" for totals
  }
}
```

**Querying metric elements via SDK:**
```typescript
const metrics = await ctx.nex.runtime.callMethod('memory.elements.list', {
  type: 'metric',
  metadataFilter: {
    connection_id: 'conn_google_glowbot_01',
    adapter_id: 'google',
    clinic_id: 'center_atl_01'
  }
});

// Or via memory.recall for search-based access
const results = await ctx.nex.runtime.callMethod('memory.recall', {
  query: 'ad_spend google 2026-02',
  scope: ['metric']
});
```

`connection_id` is required for target-state ingest. GlowBot does not invent
adapter-singleton provenance when multiple same-adapter connections can coexist.
Additional connection context such as `connection_profile_id`,
`auth_method_id`, `connection_scope`, and `source_app_id` is preserved when the
runtime provides it.

**Deduplication:** The `metric_extract` job uses the processing log to avoid
creating duplicate elements for the same canonical source record. Additionally, a UNIQUE-like
constraint can be enforced via the combination of `(connection_id, clinic_id,
metric_name, date, metadata_key)` in metadata — the extract job checks for
existing elements before creating new ones (upsert semantics via element
versioning with `parent_id`). `adapter_id` is intentionally not sufficient as a
dedup key because multiple same-adapter connections may be valid at once.

#### Funnel Snapshot Element (`type: "observation"`)

Created by the `funnel_compute` job. Uses observation type with a `kind` field in metadata.

```typescript
{
  type: "observation",
  content: "Funnel step 'clicks': 2,340 total (Google: 1,800, Meta: 540). Conversion from impressions: 2.3%. Peer median: 3.1%. Gap: -0.8pp.",
  entity_id: "clinic-123",
  as_of: 1709251200000,           // end of period
  source_job_id: "job_...",       // the funnel_compute job run
  metadata: {
    kind: "funnel_snapshot",
    period_start: "2026-02-01",
    period_end: "2026-02-28",
    step_name: "clicks",
    step_order: 3,
    step_value: 2340,
    prev_step_value: 98500,
    conversion_rate: 0.023,
    peer_median: 0.031,
    delta_vs_peer: -0.008,
    source_breakdown: { "google": 1800, "meta-ads": 540 }
  }
}
```

#### Trend Delta Element (`type: "observation"`)

Created by the `trend_compute` job.

```typescript
{
  type: "observation",
  content: "ad_spend from google increased 15.2% ($5,200 → $5,990) comparing Feb vs Jan 2026",
  entity_id: "clinic-123",
  source_job_id: "job_...",
  metadata: {
    kind: "trend_delta",
    metric_name: "ad_spend",
    adapter_id: "google",
    current_period: { start: "2026-02-01", end: "2026-02-28" },
    previous_period: { start: "2026-01-01", end: "2026-01-31" },
    current_total: 5990,
    previous_total: 5200,
    delta: 790,
    delta_percent: 15.2
  }
}
```

#### Drop-Off Analysis Element (`type: "observation"`)

Created by the `dropoff_detect` job.

```typescript
{
  type: "observation",
  content: "Weakest funnel step: clicks → bookings conversion at 1.2% (peer median: 2.8%). Also flagged: impressions → clicks at 2.3% (peer: 3.1%).",
  entity_id: "clinic-123",
  source_job_id: "job_...",
  metadata: {
    kind: "dropoff_analysis",
    period_start: "2026-02-01",
    period_end: "2026-02-28",
    weakest_step: { step_name: "bookings", conversion_rate: 0.012 },
    flagged_gaps: [
      { step_name: "bookings", conversion_rate: 0.012, peer_median: 0.028, gap: -0.016 },
      { step_name: "clicks", conversion_rate: 0.023, peer_median: 0.031, gap: -0.008 }
    ]
  }
}
```

#### Recommendation Element (`type: "mental_model"`)

Created by the `recommend` job.

```typescript
{
  type: "mental_model",
  content: "Increasing Meta Ad spend by 15% could yield ~12 more patients/month. Current Meta CPC is $1.20 vs Google at $3.50 — Meta has better cost efficiency for this clinic's demographic. Redirect $500/month from Google to Meta.",
  entity_id: "clinic-123",
  source_job_id: "job_...",
  metadata: {
    kind: "recommendation",
    rank: 1,
    title: "Shift Ad Budget to Meta",
    delta_value: 12,
    delta_unit: "new patients per month",
    confidence: "HIGH",
    category: "demand",
    reasoning: "Meta CPC $1.20 vs Google $3.50, 3x more efficient for this clinic's age 30-55 demographic"
  }
}
```

### 2.3 Element Links for Attribution

Element links (`element_links` table) provide provenance chains. The metric
element metadata carries connection-level source identity; the links preserve
how computed outputs were derived from those concrete inputs:

```
metric_element (ad_spend from google via conn_google_glowbot_01, 2026-03-04)
  ←── derived_from ── funnel_snapshot_element (ad_spend step, Feb 2026)
  ←── derived_from ── trend_delta_element (ad_spend trend, Feb vs Jan)
  ←── derived_from ── recommendation_element (shift budget to Meta)
```

Link types used:
- `derived_from` — funnel snapshots derived from metric elements
- `supports` — trend data supporting a recommendation
- `supersedes` — new recommendation replacing an outdated one

### 2.4 Peer Benchmarks

Peer benchmark data is stored as elements with type `observation` and `kind: "peer_benchmark"`:

```typescript
{
  type: "observation",
  content: "Med spa peer benchmark: Google Ads CTR median 3.6% (P25: 2.0%, P75: 5.0%)",
  metadata: {
    kind: "peer_benchmark",
    period: "2026-02",
    clinic_profile: { specialty: "med-spa", size_tier: "small" },
    metric_name: "google_ads_ctr",
    peer_median: 0.036,
    peer_p25: 0.020,
    peer_p75: 0.050,
    sample_size: null,
    source: "industry_report"
  }
}
```

Initially seeded from industry data (source: `industry_report`). Gradually replaced by actual peer medians from the clinic network (source: `peer_network`).

---

## 3. Traceable Funnel

### 3.1 Funnel Steps

The funnel stitches metric elements from different adapters into a linear progression:

```
Step 1: Ad Spend ($)                    ← google, meta-ads
Step 2: Impressions                     ← google, meta-ads
Step 3: Clicks                          ← google, meta-ads
Step 4: Phone Calls                     ← callrail, twilio
Step 5: Page Views                      ← (future: website analytics adapter)
Step 6: Bookings                        ← patient-now-emr, zenoti-emr, callrail (leads_converted)
Step 7: Consults (completed)            ← patient-now-emr, zenoti-emr
Step 8: Purchases (revenue)             ← patient-now-emr, zenoti-emr
```

> **Note:** Steps 4 (Phone Calls) and 5 (Page Views) represent parallel paths to conversion, not necessarily sequential. A patient might click an ad (Step 3) and then either call (Step 4) or visit the website (Step 5) before booking (Step 6). The funnel computes conversion rates between adjacent steps, but the real power is in the source breakdown showing which channels drive actual bookings.

### 3.2 Funnel Definition

```typescript
interface FunnelStep {
  name: string
  order: number
  metricSources: { adapterId: string; metricName: string }[]
  aggregation: 'sum' | 'latest'
}

const FUNNEL_DEFINITION: FunnelStep[] = [
  {
    name: 'ad_spend',
    order: 1,
    metricSources: [
      { adapterId: 'google', metricName: 'ad_spend' },
      { adapterId: 'meta-ads', metricName: 'ad_spend' },
    ],
    aggregation: 'sum',
  },
  {
    name: 'impressions',
    order: 2,
    metricSources: [
      { adapterId: 'google', metricName: 'ad_impressions' },
      { adapterId: 'meta-ads', metricName: 'ad_impressions' },
      { adapterId: 'google', metricName: 'listing_views_search' },
      { adapterId: 'google', metricName: 'listing_views_maps' },
    ],
    aggregation: 'sum',
  },
  {
    name: 'clicks',
    order: 3,
    metricSources: [
      { adapterId: 'google', metricName: 'ad_clicks' },
      { adapterId: 'meta-ads', metricName: 'ad_clicks' },
      { adapterId: 'google', metricName: 'listing_clicks_website' },
      { adapterId: 'google', metricName: 'listing_clicks_directions' },
    ],
    aggregation: 'sum',
  },
  {
    name: 'phone_calls',
    order: 4,
    metricSources: [
      { adapterId: 'callrail', metricName: 'calls_total' },
      { adapterId: 'twilio', metricName: 'calls_inbound' },
      { adapterId: 'google', metricName: 'listing_clicks_phone' },
    ],
    aggregation: 'sum',
  },
  {
    name: 'page_views',
    order: 5,
    metricSources: [],  // Future: website analytics adapter
    aggregation: 'sum',
  },
  {
    name: 'bookings',
    order: 6,
    metricSources: [
      { adapterId: 'patient-now-emr', metricName: 'appointments_booked' },
      { adapterId: 'zenoti-emr', metricName: 'appointments_booked' },
      { adapterId: 'callrail', metricName: 'leads_converted' },
    ],
    aggregation: 'sum',
  },
  {
    name: 'consults',
    order: 7,
    metricSources: [
      { adapterId: 'patient-now-emr', metricName: 'appointments_completed' },
      { adapterId: 'zenoti-emr', metricName: 'appointments_completed' },
    ],
    aggregation: 'sum',
  },
  {
    name: 'purchases',
    order: 8,
    metricSources: [
      { adapterId: 'patient-now-emr', metricName: 'revenue' },
      { adapterId: 'zenoti-emr', metricName: 'revenue' },
    ],
    aggregation: 'sum',
  },
]
```

The funnel definition is **code, not config** — stored in the pipeline module. When adapters are added, their metrics are wired into the `metricSources` arrays.

### 3.3 Source Breakdown

Each funnel snapshot observation stores a `source_breakdown` in metadata showing which adapters contributed:

```json
{
  "google": 15234,
  "meta-ads": 8901
}
```

This enables answering: "Which ads bring in the most valuable customers?" by tracing `purchases` back through `bookings` back through `clicks` to the originating `ad_spend` source.

---

## 4. Pipeline Execution (nex DAG)

### 4.1 Pipeline as a DAG

The GlowBot pipeline is defined as a nex DAG with four nodes:

```
DAG: "glowbot_pipeline"
  node_1 → job: "metric_extract"     (depends_on: [])
  node_2 → job: "funnel_compute"     (depends_on: [node_1])
  node_3 → job: "trend_compute"      (depends_on: [node_1])     ← parallel with node_2
  node_4 → job: "dropoff_detect"     (depends_on: [node_2])
  node_5 → job: "recommend"          (depends_on: [node_2, node_3, node_4])
```

**Execution flow:**
1. `metric_extract` runs first — creates metric elements from recent canonical records surfaced through `record.ingested`
2. `funnel_compute` and `trend_compute` run **in parallel** (both depend only on node_1)
3. `dropoff_detect` runs after funnel computation
4. `recommend` runs last (depends on funnel + trends + dropoffs — needs all context)

Nodes 2 and 3 running in parallel is a real win — they operate on different slices of the same metric elements and don't interfere.

### 4.2 Job Definitions

#### `metric_extract` — `record.ingested` → Metric Elements

**Type:** Deterministic (no LLM)
**Input:** Canonical records emitted by shared adapters and routed through durable `events.subscriptions` wake-up
**Output:** Metric elements in memory.db

```typescript
// Pseudocode for metric_extract job script
async function execute(input: JobInput): Promise<JobOutput> {
  const records = getQueuedRecordsForIngest(input)
  const created: string[] = []

  for (const record of records) {
    const {
      connection_id,
      adapter_id,
      connection_profile_id,
      auth_method_id,
      connection_scope,
      source_app_id,
      metric_name,
      metric_value,
      date
    } = record.metadata

    if (!connection_id) {
      throw new Error("metric_extract requires canonical connection_id provenance")
    }

    const clinic_id = record.metadata.clinic_id || ""
    const metadata_key = record.metadata.metadata_key || ""

    // Upsert: check for existing element with same (connection_id, clinic_id, metric_name, date, metadata_key)
    const existing = findExistingMetricElement(
      connection_id,
      clinic_id,
      metric_name,
      date,
      metadata_key
    )

    if (existing && existing.metadata.metric_value === metric_value) {
      continue  // No change, skip
    }

    const element = createElement({
      type: "metric",
      content: `${metric_name}: ${metric_value} on ${date} from ${adapter_id} via ${connection_id}`,
      entity_id: input.clinic_entity_id,
      as_of: dateToTimestamp(date),
      source_record_id: record.id,
      parent_id: existing?.id,  // version chain if updating
      metadata: {
        connection_id,
        adapter_id,
        connection_profile_id,
        auth_method_id,
        connection_scope,
        source_app_id,
        metric_name,
        metric_value,
        date,
        clinic_id,
        metadata_key
      }
    })

    created.push(element.id)
  }

  return { element_ids: created, count: created.length }
}
```

#### `funnel_compute` — Metric Elements → Funnel Snapshots

**Type:** Deterministic (no LLM)
**Input:** Context from `metric_extract` (which clinic, which period)
**Output:** Observation elements (kind: `funnel_snapshot`)

The logic is the same as the existing `computeFunnelSnapshots()` function, but:
- Reads metric elements from memory.db instead of an app-local metrics table
- Writes funnel snapshot elements instead of `funnel_snapshots` table rows
- Creates `derived_from` element links back to source metric elements

#### `trend_compute` — Period Comparison

**Type:** Deterministic (no LLM)
**Input:** Context from `metric_extract`
**Output:** Observation elements (kind: `trend_delta`)

Queries metric elements for current period vs previous period, computes deltas.

#### `dropoff_detect` — Funnel Analysis

**Type:** Deterministic (no LLM)
**Input:** Funnel snapshot elements from `funnel_compute`
**Output:** Observation elements (kind: `dropoff_analysis`)

Identifies weakest conversion steps and peer benchmark gaps.

#### `recommend` — LLM Synthesis

**Type:** LLM-driven
**Input:** DAG context containing funnel snapshots + trends + dropoffs
**Output:** Mental model elements (kind: `recommendation`)

Sends the complete analysis package to a nex agent with the `glowbot-analysis` skill. The agent synthesizes human-readable growth recommendations.

### 4.3 Pipeline Scheduling

Via nex schedules:

```typescript
await ctx.nex.runtime.callMethod('schedules.create', {
  job_definition_id: 'glowbot_pipeline_dag',
  expression: '0 0 */6 * * *',
  timezone: 'UTC'
});
```

The schedule fires the DAG, which executes all nodes in dependency order.

| Schedule | Action |
|----------|--------|
| Every 6 hours | DAG: metric_extract → funnel_compute ‖ trend_compute → dropoff_detect → recommend |
| Daily | Report anonymized metrics to central hub |
| Daily | Pull updated peer benchmarks from central hub |

### Manual Trigger

```
glowbot.pipeline.trigger()  → Starts a DAG run immediately
glowbot.pipeline.status()   → Returns current DAG run status
```

### 4.4 Context Flow Through the DAG

Each node's `output_json` merges into the DAG run's `context_json`. This enables downstream nodes to access upstream results:

```
DAG context after node_1 (metric_extract):
  { metrics_created: 142, clinic_id: "clinic-123", period: "2026-02" }

DAG context after node_2 (funnel_compute):
  { ...above, funnel_snapshot_ids: ["elem_1", "elem_2", ...], funnel_steps: 8 }

DAG context after node_3 (trend_compute):
  { ...above, trend_ids: ["elem_10", "elem_11", ...], significant_changes: 3 }

DAG context after node_4 (dropoff_detect):
  { ...above, dropoff_ids: ["elem_20"], weakest_step: "bookings" }

Node_5 (recommend) receives the full accumulated context.
```

---

## 5. Data Flow Diagram

```
Adapters (monitor.start polling + event.backfill)
  │
  ├── Google adapter (Ads + GBP via gog CLI, 6h/24h polling)
  ├── Meta Ads adapter (Marketing API, 6h polling)
  ├── PatientNow adapter (EMR API, 15m polling)
  ├── Zenoti adapter (EMR API + webhooks, 1h)
  ├── CallRail adapter (Call API + webhooks, 6h)
  └── Twilio adapter (Call API + webhooks, 1h)
  │
  ↓ canonical record.ingest envelopes (JSONL stdout → nex runtime)
  ↓ record.ingested
  ↓ durable events.subscriptions wake `metric_extract`
  │
  ↓ metric_extract job (deterministic)
  │
  memory.db elements (type: "metric")
  │
  ↓ DAG: glowbot_pipeline
  │
  ├── funnel_compute ──────┐
  │   ↓                    │
  │   observation elements │
  │   (kind: funnel_snapshot)
  │   ↓                    │
  │   dropoff_detect       │
  │   ↓                    │
  │   observation elements │
  │   (kind: dropoff)      │ ← in parallel
  │                        │
  ├── trend_compute ───────┘
  │   ↓
  │   observation elements
  │   (kind: trend_delta)
  │
  ↓ recommend job (LLM)
  │
  mental_model elements (kind: recommendation)
  │
  ↓ Next.js UI reads elements via nex control plane
```

---

## 6. Forecasting Extension

### Approach: Prophet

For forecasting features ("you're on track for X bookings this month"), start with Meta's Prophet rather than TimesFM:

**Why Prophet first:**
- Designed for daily metrics with seasonality — exactly GlowBot's data shape
- Handles day-of-week, monthly, yearly patterns automatically
- Produces interpretable components (trend + seasonal + holidays) that clinics can understand
- Battle-tested, simpler deployment, no GPU needed
- Gets 75-85% of TimesFM's accuracy with dramatically less complexity

**When to consider TimesFM upgrade:**
- 10+ clinics (can leverage cross-clinic learning)
- Prophet accuracy isn't meeting client needs
- Engineering resources available for model ops

**Forecasting as a job:**
```
job: "forecast_compute"
  Input: metric elements for the last 12+ months
  Output: observation elements (kind: "forecast") with predicted values and confidence intervals
  Schedule: After funnel_compute, optional node in the DAG
```

Data requirements: 100+ data points per metric (3+ months daily). With adapter backfill pulling 1-3 years of historical data, this threshold is met immediately.

---

## 7. Peer Benchmark Seeding

With only a few initial clinics, peer benchmarks are seeded from industry data as observation elements:

```typescript
// Seed example: med spa industry averages
createElement({
  type: "observation",
  content: "Med spa peer benchmark: Google Ads CTR median 3.6%",
  metadata: {
    kind: "peer_benchmark",
    period: "seed",
    clinic_profile: { specialty: "med-spa" },
    metric_name: "google_ads_ctr",
    peer_median: 0.036,
    peer_p25: 0.020,
    peer_p75: 0.050,
    sample_size: null,
    source: "industry_report"
  }
})
```

As real clinic data accumulates, seeded benchmarks are superseded by actual peer medians (new element with `source: "peer_network"` and element link type `supersedes` pointing to the seed).

---

## 8. Data Retention

Since GlowBot data is stored as elements in memory.db, retention follows nex's element lifecycle:

- **Metric elements** (type: `metric`): Keep indefinitely (raw source of truth, relatively small per clinic)
- **Funnel/trend/dropoff observations**: Keep last 24 months; can be re-derived from metric elements if needed
- **Recommendation mental models**: Keep last 12 months
- **Peer benchmark observations**: Updated on each pipeline run; old versions preserved via parent_id chain

Storage estimate: ~50MB per clinic per year at full adapter coverage (comparable to the standalone SQLite approach since the data volume is the same — just stored in memory.db elements instead of domain-specific tables).

---

## 9. SDK Operations Used by GlowBot

GlowBot interacts with nex exclusively through the Platform SDK. Here are the specific operations used:

### Memory Domain

| Operation | GlowBot Usage |
|-----------|--------------|
| `memory.elements.create` | Create metric, funnel_snapshot, trend_delta, dropoff_analysis, recommendation elements |
| `memory.elements.list` | Query metric elements for pipeline computation and UI reads |
| `memory.elements.get` | Get specific element for UI display |
| `memory.elements.resolve_head` | Resolve to latest version of a metric element (upsert semantics) |
| `memory.elements.links.create` | Create `derived_from` links for attribution chains |
| `memory.elements.links.traverse` | Walk attribution graph for source traceability |
| `memory.sets.create` | Create computation window sets (e.g., "Feb 2026 metrics") |
| `memory.sets.members.add` | Add metric elements to computation sets |
| `memory.elements.definitions.create` | Register custom element types during install hook |
| `memory.elements.definitions.list` | List registered types for validation |

### Work Domain

| Operation | GlowBot Usage |
|-----------|--------------|
| `jobs.create` | Register pipeline job definitions (metric_extract, funnel_compute, etc.) |
| `jobs.invoke` | Manually trigger a pipeline job |
| `jobs.runs.list` | Pipeline status reporting for UI |
| `dags.create` | Register pipeline DAG (5-node dependency graph) |
| `dags.runs.start` | Start pipeline DAG run (manual trigger) |
| `dags.runs.get` | Get current DAG run status for UI |
| `schedules.create` | Schedule pipeline DAG to run every 6 hours |

### Adapter Domain

| Operation | GlowBot Usage |
|-----------|--------------|
| `events.subscriptions.create` | Seed durable `record.ingested` wake-up for `metric_extract` |
| `ctx.nex.adapters.list()` | List connected adapters for integrations UI |

---
