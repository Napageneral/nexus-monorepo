# AIP-005 Compare-Window KPIs And Attribution Strip

## Goal

Port MoonSleep's most useful KPI packaging into the attribution app so operators
can assess performance and attribution coverage at a glance.

## Closeout

This slice is now live on hosted MoonSleep in `attribution@0.1.4` and later.
The app exposes compare-window KPI packaging and an attribution strip through
`attribution.summary`, and the hosted MoonSleep runtime returns real totals,
deltas, strip counts, and coverage rates for `moonsleep-prod-shadow`.

## Acceptance

1. the app exposes compare-window KPIs for spend, traffic, outcomes, revenue,
   and attribution coverage
2. the UI includes attribution-strip style packaging instead of only raw totals
3. period-over-period deltas are available in reusable read models
4. the packaging remains multi-client and not MoonSleep-branded
