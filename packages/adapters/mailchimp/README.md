# Mailchimp adapter

This package ingests read-only communication evidence from Mailchimp Marketing
and Mailchimp Transactional into Nex. It exposes bounded provider reads for
campaigns, campaign content, recipient activity, Transactional messages, and
Transactional templates.

There is deliberately no send, campaign mutation, template mutation, contact
mutation, or remote-delete method. Recipient email addresses are normalized to
SHA-256 identities before records enter Nex; raw addresses remain available
only in direct provider read responses to an authorized caller.

The two provider products use separate credential fields:

- `marketing_api_key` (or `MAILCHIMP_API_KEY`)
- `transactional_api_key` (or `MAILCHIMP_TRANSACTIONAL_API_KEY`)

The hourly monitor rereads a bounded 48-hour overlap and relies on stable
provider identities plus revision hashes for idempotent replay. Marketing
campaign content is stored once; per-recipient delivery evidence refers to that
campaign record instead of repeating HTML thousands of times.

Historical Transactional ingestion uses Mailchimp's complete activity export
for windows longer than seven days. The export job id is checkpointed in the
private adapter state directory, so a restart resumes the same export rather
than requesting another. Seven-day-or-shorter live windows use the normal
message search endpoint and fail closed if its 1,000-result ceiling is reached.

Provider responses are retried only for throttling and transient server/network
failures, with bounded exponential backoff and request timeouts. Raw recipient
addresses are hashed before Nex ingestion and never appear in records or
receipts.
