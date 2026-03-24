# Nex Operator Console App

## Customer Experience

The Operator Console is the browser-based operator control panel for a live Nex runtime.

It is:

1. an installable Nex app package
2. operator-facing
3. mounted under `/app/console/...`
4. isolated from kernel source ownership

It is not:

1. a built-in kernel transport surface
2. a Frontdoor admin app
3. a generic product dashboard

## Package Boundary

The package owns:

1. browser assets and UI code
2. operator-facing routes and views
3. app-local packaging metadata

The kernel owns:

1. runtime APIs
2. app hosting and routing
3. install/discovery/activation
4. browser auth policy
