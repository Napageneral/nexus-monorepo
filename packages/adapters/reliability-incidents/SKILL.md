---
name: reliability-incidents
description: Use when ingesting, searching, or validating reliability incident lifecycle evidence through the Nex reliability-incidents source adapter.
---

# Reliability Incidents

This adapter turns durable operational incident transitions into canonical Nex records.

Use it to:

1. ingest a detected, updated, mitigated, recovered, or closed incident transition
2. replay a bounded source-owned incident export through `incident.capture.batch`
3. search incident titles, summaries, affected components, customer impact, remediation, and validation evidence in Nex
4. retrieve the full lifecycle by incident thread
5. measure detector precision and incident duration from durable source events

Do not use it to:

1. treat an email reminder or repeated health poll as a new incident
2. erase or rewrite source history
3. embed credentials, cookies, tokens, session material, or raw private payloads
4. restart services, deploy code, or mutate commerce, finance, fulfillment, or customer state
5. let a model-generated diagnosis replace deterministic evidence

The operational source owns detection and the durable incident event. The adapter owns validation, source binding, stable Nex record identity, channel/thread routing, exact-replay suppression, and searchable projection. Nex is a searchable evidence and orchestration substrate, not the sole copy of an incident.
