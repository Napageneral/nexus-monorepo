# Web Signals

Installable app package root for the hard-cut `web-signals` control plane.

The package owns:

- web installation creation, lookup, listing, and token rotation
- trust-termination proxy routing into the `web-journey` adapter
- QA-visible event inspection for a `web_installation_id` from `records`
- app-local storage and install lifecycle hooks
- the runtime-facing control-plane methods for the web family

This package does not own canonical journey-source truth.
`web-journey` does.

The supported browser-facing `collect` path is an installation-scoped trust
proxy, not a second source adapter.
