# Mailchimp read-only history contract

The adapter has two source families:

1. Marketing campaigns, content, and per-recipient activity.
2. Transactional message history and template metadata.

Every provider method is a read with `mutates_remote: false`. Ingestion emits
stable Nex records with provider identity, timestamp, direction, delivery
state, recipient email SHA-256, and an exact revision hash. Raw recipient email
addresses are removed before record ingestion.

Provider delivery evidence does not reset a customer communication timer. It
becomes a qualifying operational update only after the MoonSleep application
binds it to an exact order obligation and a human certifies all policy elements.

No send, contact mutation, campaign mutation, template mutation, or delete
surface belongs in this package.
