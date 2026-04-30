# GGR-009 Cleanroom And Hosted Validation Signoff

## Goal

Prove the rich Gmail adapter through the standard adapter validation lanes
before relying on it in real hosted runtimes.

## Status

Completed on 2026-04-29.

The rich Gmail adapter has package cleanroom proof, live Gmail cleanroom
backfill/monitor/agent-use proof, and hosted MoonSleep install/restart proof.
The hosted proof records one public runtime API limitation: the legacy
Gmail-root connection row exposes count but not a stable public connection id,
so hosted restart validates install, method surface, runtime health, and
connection count preservation rather than stable id hash preservation.

## Scope

- define a structured validation profile for the rich Gmail adapter
- run package-local tests and package validation
- run cleanroom install/connect proof with real but non-leaking credentials
- run full mailbox backfill proof that captures:
  - full body/header projection
  - thread projection
  - attachment metadata
- run monitor soak proof for history/watch mode
- run fallback-polling degraded proof
- run read-method agent-use proof
- run no-send/dry-run write-method proof
- run hosted install/restart proof
- record artifact summaries without message bodies, OAuth tokens, or private
  attachment contents

## Acceptance

1. install/connect lane is green
2. backfill/monitor lane is green
3. agent-use lane is green
4. package restart preserves installed package state, runtime health, method
   surface, and public connection count
5. hosted install proof uses bundled `bin/gog`, not host PATH
6. validation docs name the canonical proof commands and artifact locations

## Progress Notes

- Package-local validation is green:
  - `go test ./...`
  - `go build -o ./bin/gog-adapter ./cmd/gog-adapter`
  - `GOGCLI_SOURCE_DIR=/tmp/nexus-gogcli-v014 ./scripts/package-release.sh`
- Package validation/release is green:
  - archive:
    `/Users/tyler/nexus/home/projects/nexus/packages/adapters/gog/dist/gog-0.1.0.tar.gz`
  - sha256:
    `5e43593faf01eeee5cf121f7a7c44adb1e645cbda76e9f6b45bd339c2466e4c3`
- Adapter manifest now declares all 13 reflected Gmail package methods, which
  fixes the hosted runtime reflection mismatch found during the first
  MoonSleep install attempt.
- Host-native package cleanroom smoke is green:
  - command:
    `./scripts/package-cleanroom-smoke.sh dist/gog-0.1.0.tar.gz`
  - proof artifacts:
    `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-package-cleanroom/20260429T201922Z`
  - source package validation passed under a clean `HOME`
  - bundled `bin/gog` reports `v0.14.0 (469f4b4 2026-04-29T17:45:00Z)`
  - adapter execution used a clean `HOME`, clean state directory, and a `PATH`
    that excludes Homebrew `gog`
  - `adapter.info` exposed 13 required Gmail methods
  - disconnected health and guarded no-send write checks passed without Gmail
    credentials or private provider contents
  - this is host-native macOS because the local archive contains macOS arm64
    Mach-O binaries, not a Linux Docker executor proof
- Live Gmail cleanroom proof is green:
  - command:
    `./scripts/gmail-live-cleanroom-proof.sh dist/gog-0.1.0.tar.gz`
  - proof artifacts:
    `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-gmail-live/20260429T201934Z`
  - setup and health completed against a clean `HOME` file-keyring credential
  - full `tnapathy@gmail.com` backfill emitted `98,243` unique Gmail records
    for `in:anywhere after:1970/01/01`
  - summary proved text body, HTML body, headers, RFC Message-ID header,
    thread ids for all records, `8,630` attachment metadata entries, and zero
    parse errors
  - live monitor soak ran for 90 seconds after a packaged CLI self-send and
    emitted one rich `record.ingest` event with body and headers
  - agent-use proof covered `gmail.native.read`, guarded
    `gmail.native.write`, and `gmail.send` dry-run/no-send behavior
- Live local runtime cross-account dogfood proof is green:
  - proof artifacts:
    `/Users/tyler/nexus/state/artifacts/validation/live/gog-gmail-other-account-runtime/20260430T143930Z`
  - a `moonsleep.co` Gmail account sent to `tnapathy@gmail.com`
  - the running local Nex Gmail monitor ingested one matching record with
    sender/receiver, subject, thread id, message id, labels, content, and
    received timestamp present
- Hosted MoonSleep install/restart proof is green:
  - hosted Linux arm64 archive sha256:
    `4b3d99bd01e0daedc80783b40e0d86f56771d4a7675030129e720d9850c0c68e`
  - published `gog@0.1.0` to Frontdoor registry for `linux/arm64`
  - proof artifacts:
    `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-hosted-moonsleep-install-restart/20260429T202232Z`
  - MoonSleep hosted server kept `gog` installed at active version `0.1.0`
    across Frontdoor archive/restore
  - runtime health was healthy before and after restore
  - 13 Gmail methods and required adapter operations were present before and
    after restore
  - Gmail-root connection count stayed `1`; stable public connection id is not
    exposed for that legacy row through current runtime inventory
- Package archive includes both `bin/gog` and `bin/gog-adapter`.

## Follow-Up

Expose a stable public connection id for the legacy Gmail-root row in hosted
runtime inventory if future hosted proofs must verify id hash preservation
instead of count preservation.
