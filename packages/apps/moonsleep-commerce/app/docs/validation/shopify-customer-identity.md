# Shopify Customer Identity Validation

## Cleanroom

- Install a fresh MoonSleep-only Nex runtime using PostgreSQL.
- Confirm zero records, contacts, entities, tags, observations, jobs, and runs.
- Install MoonSleep Commerce and prove exactly one inactive Shopify subscription
  and one inactive customer projector job.
- Invoke `moonsleep-commerce.shopify-source.seed-identities` twice with the
  exact production shop domain and connection ID. Require the same contract
  hash, two stable canonical entity IDs, and zero new entities/contacts on the
  second run.
- Prove the Shopify store routing contact uses the shop-domain space and the
  integration routing contact uses the exact adapter connection anchor.
- Prove activation remains dormant until the governed PostgreSQL event-to-work
  handoff is installed and independently validated.
- Ingest one customer revision and prove one entity, one contact, two tags, and
  one observation.
- Invoke `moonsleep-commerce.shopify-customers.project-cohort` with that exact
  committed record ID; require one projected result and zero provider-write
  authority.
- Replay the same revision and prove no count growth.
- Ingest a newer revision and prove the same entity/contact binding plus one new
  observation.
- Inject wrong shop, wrong GID, bad source hash, altered replay, and missing tag
  cases and prove fail-closed behavior.
- Restart Nex and repeat the readback.

## Historical backfill

- Bind the exact staged Shopify manifest and all page hashes.
- Call `moonsleep-commerce.shopify-customers.inspect-backfill` for the exact
  shop and connection. Retain the returned record count, boundaries, and
  SHA-256 as the public-runtime snapshot identity.
- Call `project-complete-backfill` with that count and SHA-256; require its
  internal re-scan to match before the first identity write.
- Invoke `moonsleep-commerce.shopify-customers.project-backfill` with the exact
  sorted committed customer record IDs and the SHA-256 of their compact JSON
  array.
- Run the complete customer backfill twice with byte-identical parameters.
- Require both runs to return the same record-set and projection-result hashes.
- Require the second run to report zero created entities, zero created contacts,
  and `replayed == records_projected`.
- Reconcile source unique customer GIDs to active Shopify contacts.
- Require zero duplicate contact anchors and zero automatic merge proposals.
- Sample customers with names, missing names, multiple addresses, no address,
  email changes, phone changes, and no email.

## Continuous sync

- First prove each PostgreSQL `record.ingested` event reaches SQLite-owned work
  through the governed receipt-bound handoff with crash/replay idempotency.
- Create a new Shopify test customer through an approved provider path.
- Observe a new immutable record, event, job, contact, entity, and tags.
- Update the customer and prove a new observation with the same entity binding.
- Measure source update to committed projection latency.
- Stop and restart the runtime, then prove cursor and queue recovery.

No existing Shopify poller is retired until these checks and shadow parity pass.
