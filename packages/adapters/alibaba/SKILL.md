---
name: alibaba-messenger
description: Use when inspecting or operating the read-only Alibaba Messenger adapter, its authenticated export snapshots, canonical Nex record projection, or attachment evidence coverage.
---

# Alibaba Messenger

This adapter is a read-only evidence boundary.

Use it to:

1. inspect adapter health and the latest completed snapshot
2. run a bounded historical backfill
3. monitor completed snapshots with a rolling overlap window
4. search normalized messages and extracted attachment text through Nex records

Do not use it to:

1. send Alibaba messages
2. approve or initiate payments
3. mutate purchase orders, shipments, routing, inventory, or customer promises
4. ingest raw browser exports containing session or encrypted account material

MoonSleep owns browser capture and operational reconciliation. Nex owns canonical records, deduplication, search, events, and durable job execution.
