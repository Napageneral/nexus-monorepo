# Shopify Customer Identity Validation

## Cleanroom

- Install a fresh MoonSleep-only Nex runtime using PostgreSQL.
- Confirm zero records, contacts, entities, tags, observations, jobs, and runs.
- Install MoonSleep Commerce and prove exactly one active Shopify subscription.
- Ingest one customer revision and prove one entity, one contact, two tags, and
  one observation.
- Replay the same revision and prove no count growth.
- Ingest a newer revision and prove the same entity/contact binding plus one new
  observation.
- Inject wrong shop, wrong GID, bad source hash, altered replay, and missing tag
  cases and prove fail-closed behavior.
- Restart Nex and repeat the readback.

## Historical backfill

- Bind the exact staged Shopify manifest and all page hashes.
- Run the complete customer backfill twice.
- Reconcile source unique customer GIDs to active Shopify contacts.
- Require zero duplicate contact anchors and zero automatic merge proposals.
- Sample customers with names, missing names, multiple addresses, no address,
  email changes, phone changes, and no email.

## Continuous sync

- Create a new Shopify test customer through an approved provider path.
- Observe a new immutable record, event, job, contact, entity, and tags.
- Update the customer and prove a new observation with the same entity binding.
- Measure source update to committed projection latency.
- Stop and restart the runtime, then prove cursor and queue recovery.

No existing Shopify poller is retired until these checks and shadow parity pass.
