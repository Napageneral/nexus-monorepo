# Shopify Customer Identity Validation

## Cleanroom

- Install a fresh MoonSleep-only Nex runtime using PostgreSQL.
- Confirm zero records, contacts, observations, jobs, runs, commerce orders and
  commerce line items; the three fresh MoonSleep seed entities remain present.
- Install MoonSleep Commerce and prove exactly two inactive projector jobs plus
  three disabled subscriptions scoped to the exact `customer`, `order`, and
  `line_item` record families. Require zero queue rows and dispatch receipts.
- Invoke `moonsleep-commerce.shopify-source.seed-identities` twice with the
  exact production shop domain and connection ID. Require the same contract
  hash, two stable canonical entity IDs, and zero new entities/contacts on the
  second run.
- Prove the Shopify store routing contact uses the shop-domain space and the
  integration routing contact uses the exact adapter connection anchor.
- Prove the full PostgreSQL profile atomically dispatches committed
  `record.ingested` events into PostgreSQL work with durable dispatch and
  idempotency receipts, while this production subscription remains dormant.
- Ingest one customer Record and prove one Entity, one Contact, one Record-native
  Episode/Fact/sealed set/accepted customer-role Observation chain, and one
  restricted `moonsleep.customer.v1` Customer Facet. Tags are hints only.
- Invoke `moonsleep-commerce.shopify-customers.project-cohort` with that exact
  committed record ID; require one projected result and zero provider-write
  authority.
- Replay the same revision and prove no count growth.
- Ingest a newer customer Record and prove the same Entity/Contact/Facet binding
  without duplicate role authority.
- Inject wrong shop, wrong GID, bad source hash, altered replay, duplicate active
  Facets, and drifted semantic profiles and prove fail-closed behavior. Missing
  tags must not revoke a valid Customer Facet.
- Require each projected Order receipt to expose the canonical
  `moonsleep.commerce_order` target using the exact `commerce_orders.row_id`
  returned by `observeCommerceOrder` and adapter contract
  `moonsleep.commerce-order.target-adapter.v1`; copied Order resources are forbidden.
- Restart Nex and repeat the readback.

## Historical backfill

- Start with the smallest representative customer+Order canary and identical
  replay. Introduce bounded historical pages only if observed risk warrants it.
- Bind the exact staged Shopify manifest, immutable scan cursors, and all page hashes.
- Call `moonsleep-commerce.shopify-customers.inspect-backfill` for the exact
  shop and connection through the runner's `--build-manifest` mode. Require the
  returned sorted IDs, record count, boundaries, and SHA-256 to agree before the
  runner atomically creates one new private mode-0600 manifest. Do not assemble
  the production ID set manually or through SQL.
- Invoke `moonsleep-commerce.shopify-customers.project-backfill` only through
  batches of at most 250 exact IDs. Require a durable checkpoint after every
  successful batch and no checkpoint advancement on a lost response.
- Before every production batch require API/Nex health, no production pause
  marker, and I/O full `avg60` below the job-local ceiling. Exit retryably before
  a write when any resource gate is red.
- Run the complete customer backfill twice with byte-identical parameters.
- Require both runs to return the same record-set and projection-result hashes.
- Require the second run to report zero created entities, zero created contacts,
  `replayed == records_projected`, adopted existing customer-role Observations,
  and adopted existing Customer Facets. Require the checkpoint v2 semantic
  counters to cover every projected Record exactly once.
- Require exactly one active canonical Customer Facet and zero copied rows in
  `core_graph_accepted_observation_receipts` after the first run, replay, and
  restart.
- Prove cancellation and restart resume at the first uncheckpointed batch; do
  not refetch or re-ingest the immutable Shopify source corpus.
- Reconcile source unique customer GIDs to active Shopify contacts.
- Require zero duplicate contact anchors and zero automatic merge proposals.
- Sample customers with names, missing names, multiple addresses, no address,
  email changes, phone changes, and no email.

## Continuous sync

- First prove each committed PostgreSQL `record.ingested` event atomically
  reaches PostgreSQL-owned work with one dispatch receipt, one idempotency key,
  and crash/replay-safe lease recovery. SQLite work must remain empty.
- Prove each `customer`, `order`, and `line_item` revision matches exactly one
  subscription and schedules exactly one projector; broad Shopify fanout is
  forbidden.
- Keep both projector jobs and all three projection subscriptions disabled until
  the separately reviewed representative customer+Order canary, identical
  replay, restart, and rollback gates pass.
- Create a new Shopify test customer through an approved provider path.
- Observe a new immutable Record, event, job, Contact, Entity, accepted
  customer-role Observation, and Customer Facet readback.
- Update the customer and prove a new observation with the same entity binding.
- Measure source update to committed projection latency.
- Stop and restart the runtime, then prove cursor and queue recovery.

No existing Shopify poller is retired until these checks and shadow parity pass.
