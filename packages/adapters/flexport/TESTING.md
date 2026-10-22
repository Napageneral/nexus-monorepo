# Testing

Run:

```bash
npm test
npm run lint
npm run build
./dist/index.js adapter.info
nexus package validate .
```

The tests run against `testdata/fake-flexport.mjs`, a fake Flexport API bound to 127.0.0.1 on a random port that serves the fixtures in Flexport's `/api/response` envelope. They prove one token request across many calls and concurrent processes, the daily token budget, the credential fingerprint, that no redirect is followed and no token leaves the base origin, that errors carry no response body, the bundle shape and deterministic Records, that unchanged bundles are not re-emitted, that documents are downloaded once and attached from the state directory, that health never calls the network, and that every write refuses without `go`, `confirm` and a matching sha256 and otherwise sends `body_json` byte for byte. Nothing in the tests calls `api.flexport.com`.

`scripts/cleanroom-proof.sh` repeats tests, lint, build and `adapter.info` in a fresh `node:24-bookworm` container.

`scripts/runtime-cleanroom-proof.sh` installs the released `dist/flexport-0.1.0.tar.gz` into a throwaway Nex runtime and PostgreSQL 17 on a private Docker network, runs the fake Flexport server inside the runtime container, creates connection `cleanroom-flexport` with fake credentials, runs `records.backfill`, and checks the shipment bundle Record (with its document attachment), the network Record and the method catalog. It needs `NEX_RELEASE_IMAGE` and `POSTGRES_RELEASE_IMAGE` and writes a private JSON receipt.

Production package installation uses `scripts/install-runtime-package.sh` inside a separately governed package-install activity. The script accepts an exact committed source revision and artifact digest, uploads only to a loopback Nex runtime, and writes private upload/install receipts.

`scripts/register-connection.sh` then creates the `moonsleep-flexport` connection from a private 0600 request file (`adapters.connections.create`), prints only status, connection id, account and service, and keeps the response as a private receipt. The request body is never printed.
