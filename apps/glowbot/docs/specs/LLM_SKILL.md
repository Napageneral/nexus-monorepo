# GlowBot — LLM Analysis Skill

> Agent configuration, analysis framework, hybrid approach, confidence scoring, and recommendation output format.
>
> The GlowBot analyst runs after deterministic pipeline jobs have produced a structured analysis package from elements and benchmark data.

---

## Overview

GlowBot uses a **single nex agent** for LLM synthesis. The UI shows 5 "agent" categories (Demand, Conversion, Local, Benchmark, Modeling) — these are **logical views for organizing recommendations**, not separate agent processes.

The LLM runs as the `recommend` node in the GlowBot pipeline DAG (see DATA_PIPELINE.md §4), after all deterministic nodes (metric_extract, funnel_compute, trend_compute, dropoff_detect) have completed. The agent receives a pre-computed analysis package built from element data and generates natural language recommendations stored as `mental_model` elements (kind: `recommendation`).

---

## 1. Agent Configuration

```json
{
  "id": "glowbot-analyst",
  "name": "GlowBot Growth Analyst",
  "model": {
    "primary": "anthropic/claude-sonnet-4"
  },
  "skills": ["glowbot-analysis"],
  "tools": {
    "allow": [
      "glowbot_query_elements",
      "glowbot_query_funnel",
      "glowbot_query_benchmarks"
    ]
  }
}
```

### Why Single Agent?

- 5 separate agents = 5x LLM cost per pipeline run
- Cross-category insights (e.g., "ad spend increase but no booking increase") require seeing all data at once
- The `category` field on recommendations maps to UI agent cards
- If the LLM needs to be more specialized later, we can split — but start simple

---

## 2. Skill File Structure

```
skills/glowbot-analysis/
  SKILL.md              # System prompt with analysis framework
  tools/
    query-elements.ts   # Tool: query metric elements via memory.elements.list (SDK)
    query-funnel.ts     # Tool: query funnel_snapshot observation elements
    query-benchmarks.ts # Tool: query peer_benchmark observation elements
```

---

## 3. Analysis Framework (SKILL.md)

The agent receives a pre-computed analysis package from the deterministic pipeline. It does NOT query raw data directly — it gets structured metrics context and synthesizes recommendations.

### Hybrid Approach: Prescriptive Checklist + Exploratory Pass

#### Pass 1 — Structured Checklist (always runs, catches the obvious)

1. **Funnel drop-off analysis**: Compare each funnel step's conversion rate to peer benchmarks. Flag gaps >10%.
2. **Ad spend ROI**: Compare cost per booking across Google Ads vs Meta Ads. Recommend shifting spend to higher-performing channel.
3. **No-show rate check**: Compare to peer median. If >10% above peers, flag with reduction strategies.
4. **Review velocity trend**: Is review velocity accelerating, flat, or declining? Compare to peer median reviews/month.
5. **Listing performance trends**: Are Google Maps impressions and clicks trending up or down over last 4 weeks?
6. **Biggest drop-off**: Identify the single biggest conversion drop-off in the funnel and recommend specific action.
7. **Period-over-period comparison**: Compare current 30-day window to previous 30-day window for all key metrics. Flag significant changes (>15% swing).
8. **Data freshness check**: Flag any adapter with stale data (>24h since last sync) or sync errors.

#### Pass 2 — Exploratory (open-ended pattern finding)

- "Given all the data, what stands out as unusual or noteworthy?"
- Cross-adapter correlations (e.g., ad spend increase but no booking increase — leak in the funnel)
- Seasonal patterns, day-of-week effects
- Campaign-level insights (one campaign drastically outperforming others)
- Emerging trends (metric that's been steadily climbing/declining for 4+ weeks)

---

## 4. Analysis Package (Input to Agent)

The pipeline builds this package from deterministic pipeline outputs:

```typescript
interface AnalysisPackage {
  // Clinic context
  clinic: {
    name: string
    specialty: string
    connectedAdapters: string[]
    dataStartDate: string
    syncStatus: Record<string, { lastSync: string, status: string }>
  }

  // Current funnel (30-day window)
  funnel: {
    periodStart: string
    periodEnd: string
    steps: {
      name: string
      value: number
      conversionRate: number | null
      peerMedian: number | null
      deltaVsPeer: number | null
      sourceBreakdown: Record<string, number>
    }[]
  }

  // Previous funnel (for trend comparison)
  previousFunnel: {
    periodStart: string
    periodEnd: string
    steps: {
      name: string
      value: number
      conversionRate: number | null
    }[]
  }

  // Key metrics with trend data
  metricTrends: {
    metricName: string
    adapterId: string
    current30d: number
    previous30d: number
    absoluteDelta: number
    percentDelta: number
  }[]

  // Campaign-level breakdowns (top campaigns by spend)
  campaignBreakdowns: {
    adapterId: string
    campaigns: {
      name: string
      spend: number
      impressions: number
      clicks: number
      conversions: number
      costPerConversion: number
    }[]
  }[]

  // Peer benchmarks
  benchmarks: {
    metricName: string
    peerMedian: number
    peerP25: number
    peerP75: number
    yourValue: number
    deltaVsPeer: number
    source: 'peer_network' | 'industry_report'
  }[]

  // Review data
  reviews: {
    platform: string
    rating: number
    reviewCount: number
    newReviewsLast30d: number
    velocityTrend: 'accelerating' | 'flat' | 'declining'
  }[]
}
```

---

## 5. Output Format

### Per Recommendation

```json
{
  "rank": 1,
  "title": "Increase Meta Ads budget by $500/month",
  "delta_value": 8,
  "delta_unit": "new patients per month",
  "description": "Your Meta Ads are converting at 3.2% while peers average 2.1%, suggesting strong creative performance. Increasing spend at current conversion rates would yield ~8 additional new patients per month.",
  "confidence": "HIGH",
  "category": "demand",
  "reasoning": "Based on 90 days of data, consistent conversion rate, strong peer outperformance.",
  "action_data": {
    "metric": "meta_ad_spend",
    "current_value": 2000,
    "recommended_value": 2500,
    "expected_impact": {
      "new_patients": 8,
      "revenue_estimate": 12000
    }
  }
}
```

### Expected Output Per Run

- 5-10 recommendations total
- At least one per active category (demand, conversion, local)
- Ranked by expected impact (highest first)
- Each tagged with confidence and category

---

## 6. Confidence Scoring Rubric

| Level | Criteria |
|-------|----------|
| **HIGH** | Backed by 60+ days of consistent data AND significant peer gap (>10%) AND clear causal chain |
| **MEDIUM** | Clear trend but limited data (30-60 days) OR moderate peer gap (5-10%) OR partially supported causal chain |
| **LOW** | Directional signal only — sparse data (<30 days), weak correlation, novel pattern, or missing adapter data to validate |

### Factors That Increase Confidence

- More days of data
- Larger peer gap
- Multiple adapters corroborating the signal
- Stable trend (low variance)
- Clear funnel position (easy to explain causally)

### Factors That Decrease Confidence

- Sparse data (few data points)
- High variance in metrics
- Missing adapters (can't validate full funnel)
- Seeded benchmarks (not real peer data)
- Novel pattern (no historical precedent)

---

## 7. Category Mapping

Each recommendation is tagged with a category that maps to the UI "agent" card:

| Category | UI Agent Card | What It Covers |
|----------|--------------|----------------|
| `demand` | Demand Agent | Ad spend optimization, campaign performance, cost per acquisition, budget allocation across channels |
| `conversion` | Conversion Agent | Funnel drop-offs, no-show reduction, booking rate improvement, consultation-to-treatment rate |
| `local` | Local Agent | Reviews, listings, local SEO, map visibility, review response rate |
| `benchmark` | Benchmark Agent | Peer comparison insights, competitive positioning, industry trends |
| `modeling` | Modeling Agent | Trend projections, what-if scenarios, seasonal forecasting |

---

## 8. Tools Available to Agent

The agent has access to three read-only query tools for when the pre-computed package needs supplementation. All tools use the nex SDK (`memory.elements.list`) under the hood — they do NOT access the database directly.

### `glowbot_query_elements`

Query metric elements from memory.db via SDK.

```typescript
// Input
{
  type: 'metric',
  metric_name?: string,
  adapter_id?: string,
  clinic_id?: string,
  date_from: string,
  date_to: string,
  group_by?: 'day' | 'week' | 'month'
}

// Output (shaped from element metadata)
{ rows: { date, adapter_id, metric_name, value, clinic_id, metadata_key }[] }
```

Under the hood: calls `memory.elements.list({ type: 'metric', metadataFilter })` and optionally narrows by the requested period and clinic metadata.

### `glowbot_query_funnel`

Query funnel snapshot observation elements.

```typescript
// Input
{ period_start: string, period_end: string, clinic_id?: string }

// Output (shaped from observation element metadata with kind: 'funnel_snapshot')
{ steps: { name, order, value, conversion_rate, peer_median, delta_vs_peer, source_breakdown }[] }
```

### `glowbot_query_benchmarks`

Query peer benchmark observation elements.

```typescript
// Input
{ metric_names?: string[], clinic_profile?: string }

// Output (shaped from observation element metadata with kind: 'peer_benchmark')
{ benchmarks: { metric_name, peer_median, peer_p25, peer_p75, sample_size, source }[] }
```

---

## 9. Prompt Engineering Notes

The SKILL.md system prompt should:

1. **Be specific about med spa / aesthetic clinic domain** — the agent should know common treatments (Botox, fillers, laser, chemical peels), typical pricing, seasonality patterns
2. **Emphasize actionability** — every recommendation should have a specific action the clinic can take, not generic advice
3. **Calibrate delta estimates conservatively** — better to under-promise than over-promise on expected impact
4. **Handle missing data gracefully** — if an adapter isn't connected, note the gap but don't penalize confidence on available data
5. **Avoid hallucinating benchmarks** — if peer data is seeded from industry reports, mention "based on industry averages" not "your peers"
6. **Keep recommendations concise** — title < 60 chars, description < 200 words

---

## 10. Cost Estimation

Per pipeline run (one clinic):
- Input tokens: ~3,000-5,000 (analysis package + system prompt)
- Output tokens: ~1,500-2,500 (5-10 recommendations)
- Estimated cost: ~$0.02-0.04 per run (Claude Sonnet pricing)
- At 4 runs/day: ~$0.08-0.16 per clinic per day
- At 30 days: ~$2.40-4.80 per clinic per month

This is negligible relative to the value delivered.
