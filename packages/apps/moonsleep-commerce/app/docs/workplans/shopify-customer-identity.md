# Shopify Customer Identity Workplan

1. Merge and select the PostgreSQL Nex runtime.
2. Install this app in a fresh MoonSleep-only Nex instance.
3. Seed and replay the exact Shopify store/integration routing identities.
4. Ingest a small read-only Shopify customer cohort.
5. Run the customer identity projector twice.
6. Prove stable customer-GID contact anchors and zero duplicate entities.
7. Backfill all Shopify customer revisions from the sealed page manifest.
8. Reconcile unique source customers, contacts, entities, tags, and observations.
9. Enable continuous record ingestion and projector work in shadow mode.
10. Prove restart, replay, cursor recovery, and update latency.
11. Keep existing Shopify and MoonSleep jobs active until measured parity.

The order and line-item projector follows as a separate reviewed slice after
customer identity is green.
