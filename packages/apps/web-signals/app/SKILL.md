# web-signals

Use this app to manage shared first-party web installations and the QA-facing
inspection surface for a site.

## What this package owns

- installation creation, lookup, listing, and rotation
- sender-token lifecycle for `web_installation_id`
- installation-scoped trust termination and proxy routing into the
  `web-journey` adapter
- records-backed event inspection for `web_installation_id`
- operator-readable inspection output

## What this package does not own

- canonical web-journey source truth
- canonical web-rum source truth
- ad-platform ingest
- backend outcome truth
- attribution scoring
- dashboard UI
