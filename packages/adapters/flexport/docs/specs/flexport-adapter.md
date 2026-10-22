# Flexport Adapter

**Status:** CANONICAL
**Last Updated:** 2026-10-22 (adversarial review amendments A1-A8)

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

- Provider credentials stay in Nex vault custody. The adapter exchanges them for one bearer token, cached at `<state>/token-cache/<connection>.json` (0600, owner only, written through an O_EXCL temporary and a rename, read with O_NOFOLLOW) together with the credential fingerprint `sha256(client_id + "\0" + client_secret)`, the client fingerprint `sha256(client_id)`, the token's `issued_at`, the trailing 24 h of token requests, the failure backoff (`failed_requests`, `next_request_at`) and `auth_failed_at`. A lock file serializes token requests and token retirement across processes (stale after 120 s). A request is recorded before it is sent.
- A token is used as is while more than 1 h remains. Renewal then keeps the old token until a new one is in hand: while a renewal is refused or fails, the old token is used until a minute before it expires.
- A failed token request (network error, non-2xx, refused redirect, malformed answer) backs off 15 min, then 1 h, then 4 h, persisted in the cache; a success resets it. During the backoff no token request is sent.
- A 401 retires the token it was sent with, once. A 401 on a token issued less than 10 min earlier is an authentication failure, not an expiry: it records `auth_failed_at` and no token request is sent for 60 min after it. Any 401, and any refusal to request a token, ends the current monitor or backfill pass at once instead of going on to the next shipment (so one cause cannot spend the daily budget shipment by shipment).
- A changed credential discards the cached token, the backoff and `auth_failed_at`. The request history is kept when only the secret changed and reset only when the client id changed (Flexport counts token requests per client); a cache written before the client fingerprint was recorded keeps its history.
- Health and `flexport.status` never touch the network.
- Every call sends `Authorization: Bearer`, `Flexport-Version: 2` and `Accept: application/json`, refuses redirects ("redirected (HTTP 302); not followed"), and refuses any URL whose origin differs from the base URL before sending.
- Errors carry the method, path, HTTP status and, when it is a plain slug, the envelope's `error.code`; never a response body, token or secret.
- Reads retry 429/502/503/504 three times honoring Retry-After up to 30 s (else 1, 2, 4 s). Writes retry only 429, when Flexport did not act.
- Writes are `flexport.products.create` (POST `/products`), `flexport.products.update` (PATCH `/products/{product_id}`), `flexport.bookings.create` (POST `/bookings`) and `flexport.documents.create` (POST `/documents`). Each refuses before any network call unless `body_json` is a JSON object, `body_sha256` equals its sha256, `go` holds Tyler's words and `confirm` is `SEND_TO_FLEXPORT`. The body is sent byte for byte and never logged or returned. The monitor, backfill and health never write; health reports `automatic_writes: false`.
- `adapter.info` declares `supports_payload_file: true`. The runtime then passes a method payload over 64 KiB as `--payload-file <0600 file>` instead of one inline `--payload-json` argument, which Linux caps at 128 KiB (a base64 document body passes that at about 96 KB of file). The SDK opens the file once without following a link, requires a regular file holding a JSON object, and never quotes it in an error. `adapter.nexus.json` does not carry the flag: the Nex manifest schema is strict and has no such key. Payloads of 64 KiB or less still arrive inline on the adapter's command line.
- The install and registration scripts never put the runtime token on a command line: curl reads the `Authorization` header from a private 0600 file (`-H @file`) that is removed on exit.
- The adapter has no purchase order, Dispatch, Finance, Claims, payment, customs-filing or Flexport-network mutation authority beyond those four methods.

## Records

Shipment bundle Record, one per Flexport shipment:

- routing: platform `flexport`, sender `flexport` (`Flexport`), receiver the connection, container `direct` `shipment:<id>` named after the shipment
- `external_record_id` `shipment:<id>`, `source_record_type` `flexport_shipment_bundle`, `provider_version_ref` `bundle:sha256:<sha256>`
- timestamp, monotonic per Record: the first emission uses `shipment.updated_at`, else the newest timestamp in the bundle, else the first-seen time kept in state; an emission whose bundle or attachment set differs from the last one emitted uses `max(that time, last emitted timestamp + 1)`, so a return to an earlier exact state is a newer Record rather than a replay the head never sees; an unchanged re-emission reuses the last timestamp, byte for byte
- content: `Flexport shipment <id> <name>: <status>; entries <n> (<release statuses>); invoices <n>; documents <n>`
- payload: `completeProviderSnapshot` of the bundle `{shipment, containers, legs, customs_entries, invoices, documents}` as stable JSON (keys sorted recursively, no insignificant whitespace), with `contract: "moonsleep.flexport_shipment_bundle.v1"` and `flexport_shipment_id`
- attachments: one per final (not archived) document whose bytes are in custody, `{id: "document:<id>", filename, mime_type, size, content_hash, local_path, metadata: {flexport_document_id, document_type, uploaded_at}}`

The bundle comes from `GET /shipments/{id}` and the `f.shipment.id` lists of `/ocean/shipment_containers`, `/shipment_legs`, `/customs_entries`, `/invoices` and `/documents`. Lists are read with `per=100` and `page=1,2,...` carrying the original query every time; Flexport's `next` link only says another page exists (a documented `next` drops the shipment filter). Child rows that name a different shipment are dropped.

Network Record: `external_record_id` `network:me`, `source_record_type` `flexport_network`, container `network`, provider object `{me_company, company_entities, companies, locations}` from `/network/me/companies` and the three network lists, contract `moonsleep.flexport_network.v1`. Its timestamp is the emission time when its sha256 changes, kept strictly after the last one emitted; an unchanged re-emission reuses the last timestamp.

Documents are downloaded from `GET /documents/{id}/download` (same origin, `Accept: */*`, capped at `max_document_bytes`) once per document id and `uploaded_at`, stored as `<state>/attachment-custody/sha256/<aa>/<sha256>` (0600 files, 0700 directories) and indexed in `<state>/documents/<connection>.json`. A document over the cap is skipped, remembered and logged. A download that fails (a non-2xx answer, a refused redirect, a timeout) is skipped for that pass only: one log line names the document id and the HTTP status, the bundle is still emitted without that attachment, the pass counts it in `document_failures`, and the download is tried again on the next pass (when it succeeds the attachment set changes, so a newer Record follows). A 401 on a download still ends the pass.

Every Record line the adapter writes is re-written at least once every 24 h while its shipment is selected (the network when it is read and its last emission is 24 h old), even when unchanged: the same bytes and timestamp, which the runtime turns into a cheap replay. A written line is not an acknowledgement, so a version the runtime dropped is sent again. The last emission per Record (`bundle_sha256`, `attachments_sha256`, `emitted_at`, `timestamp`) is kept in `<state>/emitted/<connection>.json`.

Consumers read the bundle as `json.loads(payload_json)["source_metadata"]["provider_payload"]["provider_object_json"]` and verify `provider_object_sha256`.

## Monitor, backfill and status

- Monitor: until aborted, one pass (list shipments by `updated_at desc`; bundle each shipment updated within `lookback_days` or not delivered in full; download new final documents; emit a bundle when its sha256 or its attachment set differs from the last one emitted, or when its last emission is 24 h old; the network when `network_interval_ms` has elapsed), then the checkpoint `{scope: "monitor", key: "poll", value: {last_success_at, shipments_listed, bundles_read, records_emitted, network_at}}` when the runtime manages checkpoints, then `<state>/status/<connection>.json` (the same value plus `document_failures`), then sleep `poll_interval_ms`. A shipment whose bundle fails is logged in one line and the pass goes on to the others, except that a 401 or a refused token request ends the pass at once. A pass whose only failures are document downloads is a successful pass. A pass with any other failure (or a failed listing or network read) logs one line without any body, records `last_error_at` and `last_error` in the status file, emits no checkpoint, and sleeps 5 min.
- Backfill (`since`, `to`): one pass over shipments whose `updated_at` falls in the window, plus the network. A backfill is an explicit re-read, so it emits every bundle in the window (the runtime deduplicates identical Records) and updates the emitted state. A failed shipment makes the backfill exit non-zero after the rest were emitted; document download failures alone do not.
- Health: `connected` means the credential fields are present; details carry `token_cached` (an unexpired token for this credential), `token_expires_at`, `token_requests_24h`, `token_request_failures`, `token_requests_paused_until`, `auth_failed_at`, `last_success_at`, `last_error_at`, `document_failures` (of the last successful monitor pass), `remote_write_methods` and `automatic_writes: false`. No poll having run yet is never a disconnection.

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
