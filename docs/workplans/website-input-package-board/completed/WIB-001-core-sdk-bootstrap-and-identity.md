# WIB-001 Core SDK Bootstrap And Identity

## Status

Completed.

## Outcome

The shared website input package now has a concrete browser SDK foundation at:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/sdk/core/index.mjs`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/sdk/core/index.test.mjs`

## Resolution

The browser SDK now owns the browser-plus-session identity foundation for the
shared website input package family:

- `website_installation_id`
- `browser_id`
- `session_id`
- canonical event helpers
- explicit consent-state handling
- explicit bridge-field capture in the canonical event payload

This foundation is reusable by direct installs and wrapper lanes.
