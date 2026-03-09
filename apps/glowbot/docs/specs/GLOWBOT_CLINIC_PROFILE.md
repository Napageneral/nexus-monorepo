# GlowBot Clinic Profile

> Canonical target-state source-of-truth contract for the clinic profile used by
> GlowBot benchmark publication and cohort assignment.

---

## Purpose

This document defines the canonical `ClinicProfile` object for GlowBot.

It exists to make five things explicit:

1. which package owns clinic profile truth
2. which fields are required for benchmark publication
3. which fields may remain `"unknown"` during early rollout
4. what the hub is allowed to derive from the clinic profile
5. what GlowBot must not infer heuristically from metrics as canonical truth

Related canon:

- [GLOWBOT_BENCHMARK_NETWORK.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_BENCHMARK_NETWORK.md)
- [GLOWBOT_HUB_AND_ADMIN_CONTRACT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_AND_ADMIN_CONTRACT.md)
- [DATA_PIPELINE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/DATA_PIPELINE.md)

---

## Customer And Operator Experience

The intended experience is:

1. the clinic sees benchmark comparisons against relevant peer cohorts
2. GlowBot can explain that peer grouping using explicit clinic-profile inputs
3. the clinic app owns the local product identity needed to publish benchmark
   snapshots
4. the hub resolves cohorts deterministically from that clinic profile
5. operators can inspect and correct product-level cohort behavior without
   silently replacing the clinic app as the canonical owner of clinic identity

The clinic should never be benchmarked against peers based on hidden heuristic
guesses from raw metrics alone.

---

## Non-Negotiable Design Rules

1. The clinic-facing GlowBot app owns the canonical `ClinicProfile` object.
2. The GlowBot hub owns canonical cohort definitions and `profileKey`
   resolution from `ClinicProfile`.
3. The hub must not become the canonical source of clinic identity for normal
   benchmark publication.
4. `specialty` is required for benchmark publication.
5. `monthlyAdSpendBand`, `patientVolumeBand`, and `locationCountBand` may be
   `"unknown"` during early rollout.
6. GlowBot must not treat metric-derived guesses as canonical clinic profile
   truth.
7. If operator workflows adjust clinic profile data, that change must remain
   explicit and auditable.
8. The benchmark publication contract uses symbolic band values, not raw spend
   or patient-count numbers.

---

## Canonical Object

```typescript
interface ClinicProfile {
  clinicId: string
  specialty: string
  monthlyAdSpendBand: string
  patientVolumeBand: string
  locationCountBand: string
  source: {
    updatedAtMs: number
    updatedBy: "clinic_app" | "operator"
    version: number
  }
}
```

### Field meaning

- `clinicId`
  - the clinic identity within the GlowBot installation
- `specialty`
  - required benchmark cohort axis
  - example values: `med-spa`, `dermatology`, `plastics`
- `monthlyAdSpendBand`
  - symbolic cohort band, not a raw dollar value
  - may be `"unknown"` initially
- `patientVolumeBand`
  - symbolic cohort band, not a raw count
  - may be `"unknown"` initially
- `locationCountBand`
  - symbolic cohort band for single-site vs multi-site grouping
  - may be `"unknown"` initially
- `source`
  - audit metadata for clinic-profile changes

The exact band vocabulary is product-controlled and may evolve. The canonical
requirement for now is:

- the clinic app stores symbolic band values
- `"unknown"` is a valid value during early rollout

---

## Ownership Split

| Layer | Owns |
|---|---|
| GlowBot app | canonical `ClinicProfile` object for the clinic installation |
| GlowBot hub | deterministic `profileKey` resolution and cohort assignment from the published `ClinicProfile` |
| GlowBot admin | operator workflows for inspecting and, when needed, explicitly updating clinic-profile inputs through product-control-plane workflows |

Two negative rules matter:

- the hub does not infer benchmark identity from raw metric streams as canon
- the admin app does not silently replace the clinic app as the ordinary source
  of truth

---

## Relationship To Benchmark Publication

The clinic app publishes benchmark-safe snapshots using the current
`ClinicProfile`.

```typescript
interface ClinicBenchmarkSnapshot {
  clinicId: string
  periodStart: string
  periodEnd: string
  clinicProfile: ClinicProfile
  metrics: Record<string, number | null>
  source: {
    appId: string
    generatedAtMs: number
    dataFreshnessMs: number
  }
}
```

Publication rule:

- `specialty` must be present
- the three band fields may be `"unknown"`

This means GlowBot can begin publishing benchmark snapshots before every clinic
has fully curated cohort inputs.

---

## What GlowBot Must Not Do

GlowBot must not treat these as canonical clinic profile sources:

- raw adapter metrics
- raw ad spend totals
- raw appointment counts
- raw connection count as a proxy for location count
- inferred specialty from provider names or ad copy

Those may inform operator workflows later, but they are not the canonical
`ClinicProfile` contract.

---

## Early Rollout Model

The early rollout path is intentionally simple:

1. require `specialty`
2. allow the other cohort bands to be `"unknown"`
3. rely on seed datasets and broad cohort definitions where peer-network data is
   thin

This is enough to start publishing honest benchmark snapshots without freezing a
prematurely rigid cohort taxonomy.

---

## Validation Expectations

This model is not considered real until all of these are true:

1. the clinic app can resolve a canonical `ClinicProfile`
2. `specialty` is required before snapshot publication
3. the hub accepts `"unknown"` band values during early rollout
4. the hub resolves deterministic `profileKey` values from published clinic
   profiles
5. no benchmark publication path depends on hidden metric inference as canon

