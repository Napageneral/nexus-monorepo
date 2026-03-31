# AIB-005 Website Input Materialization And Session-Source Facts

## Goal

Materialize canonical website input rows into app-owned web-event facts and
session-source projections.

## Acceptance

1. collector rows map into app-owned `web_events`
2. `website_installation_id`, `browser_id`, `session_id`, canonical
   `event_name`, and evidence fields are preserved
3. session-source facts are materialized as inspectable app-owned state
4. the app does not rewrite the website-input contract during ingest
