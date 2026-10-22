# Flexport Adapter Validation

**Last Updated:** 2026-10-22

## Required proof

- package unit tests, type checking and build pass, and `./dist/index.js adapter.info` reflects the `api_key` method, `adapter.monitor.start`, `records.backfill`, exactly the eight declared methods and `supports_payload_file: true`;
- `adapter.nexus.json` methods equal the reflected methods (names, action, `mutates_remote`, `connection_required`, params, response) and the manifest, `package.json`, lockfile and `adapter.info` carry one version; the manifest carries no `supports_payload_file` (its schema is strict);
- against the local fake Flexport API: one token request across many calls and concurrent processes; the 24 h token budget refuses before anything is sent; a changed credential fingerprint discards the token, a new secret keeps the client's request history and a new client id resets it; an unsafe or linked token cache is refused;
- a 401 on a token issued minutes earlier records `auth_failed_at`, sends no token request for an hour and ends the pass at once (one token request, one bundle call for twelve shipments); a 401 on an older token retires it once;
- renewal keeps a still-valid token while the token endpoint fails, and failed token requests back off 15 min, 1 h, 4 h until a success resets them;
- no redirect is followed and no token is sent to another origin; error text carries no response body, token or secret;
- collections page by number with their original filters and drop rows of another shipment;
- the bundle has the six keys the Python reader takes, identical input builds a byte-identical Record, an unchanged bundle is not re-emitted within 24 h and is re-emitted byte for byte after 24 h, and a backfill re-emits identical Records;
- timestamps are monotonic per Record: a return to an earlier exact bundle or network is a newer Record, and an unchanged re-emission keeps its timestamp;
- a final document is downloaded once, attached with `local_path` under the state directory, and archived documents are never attached; a download that fails (400, 302) leaves only that attachment off, the bundle is still emitted, the pass succeeds with `document_failures` in the status file, and the next pass attaches it;
- health and `flexport.status` never call the network and report `automatic_writes: false`;
- every write refuses without `go`, `confirm` and a matching `body_sha256`, before any network call, and otherwise sends `body_json` byte for byte; `flexport.documents.create` maps `data[0]`;
- the built executable sends a `flexport.documents.create` payload over 200 KiB from `--payload-file` byte for byte; the SDK refuses `--payload-json` with `--payload-file`, a link, a non-regular file and malformed JSON without quoting it;
- `install-runtime-package.sh` and `register-connection.sh` never put the runtime token in curl's argv (checked with a curl shim against a loopback fake runtime);
- a fresh Docker cleanroom repeats tests, lint, build and `adapter.info`;
- the runtime cleanroom installs the exact release into a throwaway Nex runtime with PostgreSQL 17, backfills from the fake Flexport server inside the runtime container, reads back one shipment bundle Record with its document attachment (the stored `payload.attachments[0].source_url` is a `nex-artifact:` URL and its `content_sha256` matches), one network Record and the eight-method catalog, and sends one `flexport.documents.create` over 200 KiB through the runtime that the fake receives byte for byte;
- production install readback identifies the exact committed release; the created connection reads back as adapter `flexport`, service `flexport`, account `moonsleep`, connection `moonsleep-flexport`;
- the first live read against `api.flexport.com` happens only on Tyler's go, and its token request count is read back from the health details.
