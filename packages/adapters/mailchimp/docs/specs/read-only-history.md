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
overlap. Every Transactional ingestion window uses the provider's activity
export; its checkpoint is persisted before polling and reused after restart.
The capped recent-search method remains read-only and operator-invoked, but is
never completeness authority. Every source identity remains replay-stable and
Nex owns canonical revision deduplication. Each run also retains an immutable,
sanitized receipt containing its window, export id, counts, result class, and
output digest.

The adapter never converts provider evidence directly into a customer-contact
clock. A separate MoonSleep projector reads accepted Nex records and creates
review-only certification candidates. Ambiguous recipient/order matches remain
quarantined until a human reviews them.

Provider delivery evidence does not reset a customer communication timer. It
becomes a qualifying operational update only after the MoonSleep application
binds it to an exact order obligation and a human certifies all policy elements.

No send, contact mutation, campaign mutation, template mutation, or delete
surface belongs in this package.
