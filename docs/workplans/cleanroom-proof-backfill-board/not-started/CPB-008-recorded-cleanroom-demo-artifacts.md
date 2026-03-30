# CPB-008 Recorded Cleanroom Demo Artifacts

## Goal

Add a repeatable way for cleanroom proof runs to emit reviewable demo artifacts,
eventually including screen recordings of end-to-end feature execution.

## Acceptance

1. the recording or demo-capture target is defined against existing cleanroom
   proof paths
2. the output format is stable enough for code-review and product-review use
3. the approach does not fork into a second bespoke validation path

## Existing Hooks

Strong existing insertion points already in the repo:

1. Operator Console browser e2e and Playwright browser harnesses
2. runtime browser screenshot and PDF capture routes
3. runtime browser trace start and stop hooks
4. `nexus nodes screen record` MP4 capture
5. frontdoor demo-stack runner for hosted-style demo environments
