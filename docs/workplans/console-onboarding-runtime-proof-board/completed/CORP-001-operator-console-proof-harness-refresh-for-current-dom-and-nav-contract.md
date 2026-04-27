# CORP-001 Operator Console Proof Harness Refresh For Current DOM And Nav Contract

## Goal

Refresh the Operator Console cleanroom proof harness so it measures the current
Console shell instead of failing on stale `.v2-*` assumptions.

## Why

The live baseline proof already showed that the Console renders in the cleanroom,
but the suite still waits for stale selectors like `.v2-shell`.

That means the proof currently reports a false product failure before it even
reaches the real onboarding story.

## Scope

- update shared Playwright helpers to the current shell and nav contract
- update broad smoke and navigation assertions to current class names and route
  semantics
- keep the proof runtime-backed
- keep the same VM recording substrate

## Acceptance

- the baseline Console proof no longer fails immediately on stale shell
  selectors
- navigation and page-ready helpers work against the current Console DOM
- the refreshed proof becomes the new starting point for the rest of this board

