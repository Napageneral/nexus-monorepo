# Flexport Adapter

**Status:** CANONICAL
**Last Updated:** 2026-10-21

## Purpose

This adapter connects MoonSleep's Flexport API v2 client to Nex. It turns each Flexport shipment, with its containers, legs, customs entries, invoices and documents, into one immutable shipment bundle Record, turns MoonSleep's Flexport network into one network Record, keeps final document files in Record attachment custody, and carries the four Flexport writes MoonSleep uses, each only on an exact approved body. It reads facts; it does not interpret them. Matching a Flexport shipment to a purchase order, applying dates, and holding schedule moves for Tyler belong to the moonsleep-v1 sync job.

## Connection identity

- adapter and platform: `flexport`; version `0.1.0`
- auth method: `flexport_client_credentials` (`api_key`, service `flexport`) with fields `client_id` (text, required), `client_secret` (secret, required), `account` (text, optional)
- production connection: `moonsleep-flexport`, account `moonsleep`, credential row `flexport/moonsleep-flexport`
- the adapter reads only `credential.fields.client_id` and `credential.fields.client_secret`, never `credential.value`
- no setup handlers: an `api_key` adapter with setup would receive the raw secret as a setup payload
- health returns account contact `{platform: "flexport", space_id: "", contact_id: <connection id>}` so the runtime grounds the receiver contact on the owner entity

Connection config (`runtime.config`, never secret):

| key | default | rule |
|---|---|---|
| `poll_interval_ms` | 1800000 | one monitor pass every 30 min |
| `network_interval_ms` | 86400000 | network snapshot daily |
| `lookback_days` | 90 | bundle shipments updated within this window or not yet delivered in full |
| `token_budget_per_day` | 8 | refuse a token request when this many were made in the trailing 24 h; capped at 10 (Flexport's limit) |
| `max_document_bytes` | 52428800 | document download cap; capped at the runtime's 50 MiB attachment limit |
| `base_url` | `https://api.flexport.com` | the only override is `http://127.0.0.1:<port>` or `http://localhost:<port>`; anything else is refused at client creation |
| `backfill_since` | none | the runtime's automatic backfill lower bound |

## Authority boundary

- Provider credentials stay in Nex vault custody. The adapter exchanges them for one bearer token, cached at `<state>/token-cache/<connection>.json` (0600, owner only, written through an O_EXCL temporary and a rename, read with O_NOFOLLOW) together with the credential fingerprint `sha256(client_id + "\0" + client_secret)` and the trailing 24 h of token requests. A token is reused while more than 1 h remains. A lock file serializes token requests across processes (stale after 120 s). A request is recorded before it is sent.
- Health and `flexport.status` never touch the network.
- Every call sends `Authorization: Bearer`, `Flexport-Version: 2` and `Accept: application/json`, refuses redirects ("redirected (HTTP 302); not followed"), and refuses any URL whose origin differs from the base URL before sending.
- Errors carry the method, path, HTTP status and, when it is a plain slug, the envelope's `error.code`; never a response body, token or secret.
- Reads retry 429/502/503/504 three times honoring Retry-After up to 30 s (else 1, 2, 4 s). Writes retry only 429, when Flexport did not act.
- Writes are `flexport.products.create` (POST `/products`), `flexport.products.update` (PATCH `/products/{product_id}`), `flexport.bookings.create` (POST `/bookings`) and `flexport.documents.create` (POST `/documents`). Each refuses before any network call unless `body_json` is a JSON object, `body_sha256` equals its sha256, `go` holds Tyler's words and `confirm` is `SEND_TO_FLEXPORT`. The body is sent byte for byte and never logged or returned. The monitor, backfill and health never write; health reports `automatic_writes: false`.
- The adapter has no purchase order, Dispatch, Finance, Claims, payment, customs-filing or Flexport-network mutation authority beyond those four methods.

## Records

Shipment bundle Record, one per Flexport shipment:

- routing: platform `flexport`, sender `flexport` (`Flexport`), receiver the connection, container `direct` `shipment:<id>` named after the shipment
- `external_record_id` `shipment:<id>`, `source_record_type` `flexport_shipment_bundle`, `provider_version_ref` `bundle:sha256:<sha256>`
- timestamp: `shipment.updated_at`, else the newest timestamp in the bundle, else the first-seen time kept in state
- content: `Flexport shipment <id> <name>: <status>; entries <n> (<release statuses>); invoices <n>; documents <n>`
- payload: `completeProviderSnapshot` of the bundle `{shipment, containers, legs, customs_entries, invoices, documents}` as stable JSON (keys sorted recursively, no insignificant whitespace), with `contract: "moonsleep.flexport_shipment_bundle.v1"` and `flexport_shipment_id`
- attachments: one per final (not archived) document whose bytes are in custody, `{id: "document:<id>", filename, mime_type, size, content_hash, local_path, metadata: {flexport_document_id, document_type, uploaded_at}}`

The bundle comes from `GET /shipments/{id}` and the `f.shipment.id` lists of `/ocean/shipment_containers`, `/shipment_legs`, `/customs_entries`, `/invoices` and `/documents`. Lists are read with `per=100` and `page=1,2,...` carrying the original query every time; Flexport's `next` link only says another page exists (a documented `next` drops the shipment filter). Child rows that name a different shipment are dropped.

Network Record: `external_record_id` `network:me`, `source_record_type` `flexport_network`, container `network`, provider object `{me_company, company_entities, companies, locations}` from `/network/me/companies` and the three network lists, contract `moonsleep.flexport_network.v1`, timestamp the first-seen time of that content.

Documents are downloaded from `GET /documents/{id}/download` (same origin, `Accept: */*`, capped at `max_document_bytes`) once per document id and `uploaded_at`, stored as `<state>/attachment-custody/sha256/<aa>/<sha256>` (0600 files, 0700 directories) and indexed in `<state>/documents/<connection>.json`. A document over the cap is skipped, remembered and logged.

Consumers read the bundle as `json.loads(payload_json)["source_metadata"]["provider_payload"]["provider_object_json"]` and verify `provider_object_sha256`.

## Monitor, backfill and status

- Monitor: until aborted, one pass (list shipments by `updated_at desc`; bundle each shipment updated within `lookback_days` or not delivered in full; download new final documents; emit a bundle only when its sha256 or its attachment set differs from the last one emitted, kept in `<state>/emitted/<connection>.json`; the network when `network_interval_ms` has elapsed), then the checkpoint `{scope: "monitor", key: "poll", value: {last_success_at, shipments_listed, bundles_read, records_emitted, network_at}}` when the runtime manages checkpoints, then `<state>/status/<connection>.json`, then sleep `poll_interval_ms`. A shipment whose bundle fails is logged in one line and the pass goes on to the others; a pass with any failure (or a failed listing or network read) logs one line without any body, records `last_error_at` and `last_error` in the status file, emits no checkpoint, and sleeps 5 min.
- Backfill (`since`, `to`): one pass over shipments whose `updated_at` falls in the window, plus the network. A backfill is an explicit re-read, so it emits every bundle in the window (the runtime deduplicates identical Records) and updates the emitted state. A failed shipment makes the backfill exit non-zero after the rest were emitted.
- Health: `connected` means the credential fields are present; details carry `token_cached`, `token_expires_at`, `token_requests_24h`, `last_success_at`, `last_error_at`, `remote_write_methods` and `automatic_writes: false`. No poll having run yet is never a disconnection.

## Methods

| method | action | params | result |
|---|---|---|---|
| `flexport.status` | read | `{}` | health details, no network |
| `flexport.shipments.list` | read | `{limit?: 1..100}` (default 100) | `{shipments: [{id, name, status, updated_at, transportation_mode}]}` |
| `flexport.shipments.bundle` | read | `{shipment_id}` | `{bundle, bundle_sha256}` |
| `flexport.network.get` | read | `{}` | `{network, network_sha256}` |
| `flexport.products.create` | write | `{body_json, body_sha256, go, confirm}` | `{status: "sent", path, flexport_id, object}` |
| `flexport.products.update` | write | `{product_id, body_json, body_sha256, go, confirm}` | same |
| `flexport.bookings.create` | write | `{body_json, body_sha256, go, confirm}` | same |
| `flexport.documents.create` | write | `{body_json, body_sha256, go, confirm}` | same, from `data[0]` |

Every method is connection-scoped. Write methods are `mutates_remote: true`. `flexport_id` is the Flexport object's `id` as a string, or null when Flexport returned none. `adapter.nexus.json` declares the same eight methods, byte for byte, as `adapter.info` reflects.
