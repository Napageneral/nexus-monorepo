# Mailchimp read-only history contract

The adapter has two source families:

1. Marketing campaigns, content, and per-recipient activity.
2. Transactional message history and template metadata.

Every provider method is a read with `mutates_remote: false`. Ingestion emits
stable Nex records with provider identity, timestamp, direction, delivery
state, recipient email SHA-256, and an exact revision hash. Raw recipient email
addresses are removed before record ingestion.

Marketing emits one campaign-content record and one lightweight recipient
delivery record per campaign recipient. Transactional live sync bootstraps a
48-hour closed window, then advances a durable cursor with a five-minute replay
overlap over the capped recent search. An explicit backfill window uses the
recent search only when it is uncapped and starts inside the search horizon;
every other window uses the provider's activity export, whose checkpoint is
persisted before polling and reused after restart, and fails closed when the
export cannot cover what the search saw. The capped recent search is never
completeness authority for history. Every source identity remains replay-stable
(export rows reuse the search identity when the search also returned the
message) and Nex owns canonical revision deduplication. Each run also retains
an immutable, sanitized receipt containing its window, mode, source, export id,
counts, result class, and output digest.

The adapter never converts provider evidence directly into a customer-contact
clock. A separate MoonSleep projector reads accepted Nex records and creates
review-only certification candidates. Ambiguous recipient/order matches remain
quarantined until a human reviews them.

Provider delivery evidence does not reset a customer communication timer. It
becomes a qualifying operational update only after the MoonSleep application
binds it to an exact order obligation and a human certifies all policy elements.

No send, contact mutation, campaign mutation, template mutation, or delete
surface belongs in this package.
