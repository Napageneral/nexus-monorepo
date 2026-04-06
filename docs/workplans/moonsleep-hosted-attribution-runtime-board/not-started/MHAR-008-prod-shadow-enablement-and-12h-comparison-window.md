# MHAR-008 Prod Shadow Enablement And 12h Comparison Window

## Goal

Point the real MoonSleep website shadow collector at the hosted runtime and run
the `12h` side-by-side comparison window there.

## Preconditions

- `MHAR-003` through `MHAR-007` are complete
- the prepared MoonSleep website branch remains clean and current
- the existing MoonSleep tracking path stays enabled

## Acceptance

1. the real MoonSleep website shadow deploy is env-gated and reversible
2. the hosted collector receives the real website event chain
3. the hosted attribution app can be compared against MoonSleep ops over
   approximately `12h`
4. the comparison readout is recorded with explicit wins, mismatches, and a
   continuation decision
