# Shopify Customer Identity Workplan

1. Merge and select the PostgreSQL Nex runtime.
2. Install this app in a fresh MoonSleep-only Nex instance.
3. Ingest a small read-only Shopify customer cohort.
4. Run the customer identity projector twice.
5. Prove stable customer-GID contact anchors and zero duplicate entities.
6. Backfill all Shopify customer revisions from the sealed page manifest.
7. Reconcile unique source customers, contacts, entities, tags, and observations.
8. Enable continuous record ingestion and projector work in shadow mode.
9. Prove restart, replay, cursor recovery, and update latency.
10. Keep existing Shopify and MoonSleep jobs active until measured parity.

The order and line-item projector follows as a separate reviewed slice after
customer identity is green.
