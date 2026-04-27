# Web Signals Control-Plane Boundary

## Goal

Keep `web-signals` as a control-plane app rather than drifting back toward a
hybrid ingest package.

## Current Reality

`web-signals` already owns the right control-plane primitives:

- installation lifecycle
- sender tokens
- adapter binding
- installation-scoped QA reads

It also currently exposes browser-facing proxy methods for `web-journey`:

- `web-signals.web-journey.collect`
- `web-signals.web-journey.collect.batch`

## Required Boundary

The supported boundary is:

- `web-signals` owns trust termination
- `web-journey` owns journey-source truth

The browser-facing proxy path is acceptable only while all of these remain
true:

1. `web-signals` validates sender-token scope and installation identity
2. `web-signals` forwards the canonical `web-journey` payload shape
3. `web-journey` performs the canonical normalization and `record.ingest`
4. QA reads come from records emitted by `web-journey`, not from a competing
   app-owned event model

## Open Closure Work

Remaining work for this package boundary:

1. keep package-local docs explicit about the proxy posture
2. ensure skill text matches the proxy posture
3. ensure validation proves trust termination plus adapter-owned ingest
4. audit naming drift so `web-signals` never appears to own journey-source
   truth

## Done When

1. the app-local corpus says the same thing as the umbrella and platform specs
2. the package validation ladder proves the control-plane responsibilities
3. no supported docs describe `web-signals` as the middle-funnel source
