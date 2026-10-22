# Testing

Run:

```bash
npm test
npm run lint
npm run build
./dist/index.js adapter.info
nexus package validate .
```

The tests run against `testdata/fake-flexport.mjs`, a fake Flexport API bound to 127.0.0.1 on a random port that serves the fixtures in Flexport's `/api/response` envelope, and, for the token clock, a scripted in-process fetch on a fake clock. They prove one token request across many calls and concurrent processes, the daily token budget, the credential and client fingerprints, the one-hour pause after a fresh token is refused and that a 401 ends the pass at once, that renewal keeps a still-valid token while the token endpoint fails and that failed token requests back off 15 min, 1 h, 4 h, that no redirect is followed and no token leaves the base origin, that errors carry no response body, the bundle shape and deterministic Records, that unchanged bundles are not re-emitted within 24 h and are re-emitted byte for byte after it, that timestamps are monotonic so a return to an earlier state is a newer Record, that a failed document download leaves only that attachment off and is retried, that documents are downloaded once and attached from the state directory, that health never calls the network, and that every write refuses without `go`, `confirm` and a matching sha256 and otherwise sends `body_json` byte for byte. The built executable sends a `flexport.documents.create` payload of more than 200 KiB from `--payload-file`. `src/scripts.test.ts` runs the install and registration scripts against a loopback fake runtime with a curl shim and proves the runtime token never reaches curl's argv; it also checks the runtime cleanroom's Record filter against a `records.scan`-shaped Record and `bash -n` on every script (skipped without `jq`). Nothing in the tests calls `api.flexport.com`.

The SDK's own suite (`packages/adapters/nexus-adapter-sdks/nexus-adapter-sdk-ts`, `npx vitest run` with `NEXUS_ADAPTER_PROTOCOL_CONTRACT_DIR` pointing at Nex's `docs/specs/adapters/contract`) covers `--payload-file` and `supportsPayloadFile`. Rebuild its `dist/` (`npm run build`) before building this package.

`scripts/cleanroom-proof.sh` repeats tests, lint, build and `adapter.info` in a fresh `node:24-bookworm` container.

`scripts/runtime-cleanroom-proof.sh` installs the released `dist/flexport-0.1.0.tar.gz` into a throwaway Nex runtime and PostgreSQL 17 on a private Docker network, runs the fake Flexport server inside the runtime container, creates connection `cleanroom-flexport` with fake credentials, runs `records.backfill`, checks the shipment bundle Record (its stored attachment descriptor's `source_url` is a `nex-artifact:` URL), the network Record and the method catalog, and sends one `flexport.documents.create` of more than 200 KiB through the runtime (the payload-file path; inline it would fail with E2BIG on Linux) that the fake must receive byte for byte. It needs `NEX_RELEASE_IMAGE` and `POSTGRES_RELEASE_IMAGE` and writes a private JSON receipt.

Production package installation uses `scripts/install-runtime-package.sh` inside a separately governed package-install activity. The script accepts an exact committed source revision and artifact digest, uploads only to a loopback Nex runtime, and writes private upload/install receipts.

`scripts/register-connection.sh` then creates the `moonsleep-flexport` connection from a private 0600 request file (`adapters.connections.create`), prints only status, connection id, account and service, and keeps the response as a private receipt. The request body is never printed. Both scripts hand curl the runtime token through a private 0600 header file (`-H @file`, curl 7.55+), never on a command line.
