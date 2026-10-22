# Flexport Adapter Validation

**Last Updated:** 2026-10-21

## Required proof

- package unit tests, type checking and build pass, and `./dist/index.js adapter.info` reflects the `api_key` method, `adapter.monitor.start`, `records.backfill` and exactly the eight declared methods;
- `adapter.nexus.json` methods equal the reflected methods (names, action, `mutates_remote`, `connection_required`, params, response) and the manifest, `package.json`, lockfile and `adapter.info` carry one version;
- against the local fake Flexport API: one token request across many calls and concurrent processes; the 24 h token budget refuses before anything is sent; a changed credential fingerprint discards the token and keeps the request history; an unsafe or linked token cache is refused;
- no redirect is followed and no token is sent to another origin; error text carries no response body, token or secret;
- collections page by number with their original filters and drop rows of another shipment;
- the bundle has the six keys the Python reader takes, identical input builds a byte-identical Record, an unchanged bundle is not re-emitted, and a backfill re-emits identical Records;
- a final document is downloaded once, attached with `local_path` under the state directory, and archived documents are never attached;
- health and `flexport.status` never call the network and report `automatic_writes: false`;
- every write refuses without `go`, `confirm` and a matching `body_sha256`, before any network call, and otherwise sends `body_json` byte for byte; `flexport.documents.create` maps `data[0]`;
- a fresh Docker cleanroom repeats tests, lint, build and `adapter.info`;
- the runtime cleanroom installs the exact release into a throwaway Nex runtime with PostgreSQL 17, backfills from the fake Flexport server inside the runtime container, and reads back one shipment bundle Record with its document attachment, one network Record and the eight-method catalog;
- production install readback identifies the exact committed release; the created connection reads back as adapter `flexport`, service `flexport`, account `moonsleep`, connection `moonsleep-flexport`;
- the first live read against `api.flexport.com` happens only on Tyler's go, and its token request count is read back from the health details.
