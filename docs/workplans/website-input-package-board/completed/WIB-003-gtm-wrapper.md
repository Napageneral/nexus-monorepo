# WIB-003 GTM Wrapper

## Status

Completed.

## Outcome

The shared GTM wrapper now exists at:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/sdk/gtm/index.mjs`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/sdk/gtm/index.test.mjs`

## Resolution

The GTM lane now maps data-layer events into the same canonical website-event
contract used by direct installs:

- canonical `event_name` mapping
- shared descriptor capture
- shared attribution capture
- explicit bridge fields at the top level and in the nested bridge view

The GTM wrapper does not create a second taxonomy.
