# EVP-001 Linux Cleanroom Core And Proof Harness

## Goal

Bring up a disposable Linux-hosted `nex-core` proof target and define the
repeatable harness Eve validation will use.

## Scope

- Linux cleanroom choice and bootstrap path
- runtime token and edge-pairing path for the cleanroom
- proof harness commands and teardown rules
- explicit statement of what this lane can and cannot prove without macOS

## Acceptance

- a disposable Linux `nex-core` target exists
- the harness can expose the runtime URL and token a macOS edge needs
- setup and teardown are documented and repeatable
- the limitation boundary between Linux cleanroom proof and macOS operator proof
  is explicit

## Validation

- cleanroom bootstrap transcript
- explicit harness commands
- `git diff --check`

## Harness Env

- default to loopback mode for the fresh cleanroom runtime
- set `FRESH_BOOT_SANDBOX_BIND=lan` only when the substrate exposes the
  runtime to the host
- provide `FRESH_BOOT_RUNTIME_URL` and `FRESH_BOOT_RUNTIME_HTTP_BASE_URL` when
  the emitted summary/metadata should advertise host-visible URLs
- set `FRESH_BOOT_KEEP_RUNTIME_ALIVE=1` when the next proof lane needs to pair
  a real macOS edge into the fresh runtime after bootstrap

## Result

Completed on 2026-03-31.

The disposable Linux proof target was a fresh Nex sandbox exposed to the host
at `ws://127.0.0.1:63704` with token `fresh-nex-sandbox`.

Recorded cleanroom surfaces:

- sandbox id:
  `5cf220a8-4223-4120-b519-0969d8523a84`
- container id:
  `7b1177ea635a`
- runtime log:
  `/tmp/nex-eve-orchestrator.e5GbZR/state/sandboxes/5cf220a8-4223-4120-b519-0969d8523a84/artifacts/server-under-test-runtime.log`
- cleanroom workspace:
  `/tmp/nex-eve-orchestrator.e5GbZR/state/sandboxes/5cf220a8-4223-4120-b519-0969d8523a84/artifacts/fresh-nex-workspace`

This lane proved the host-visible runtime URL and token path a real macOS edge
needs. It also established the limit of the lane clearly: Linux can host
`nex-core`, but it cannot provide native iMessage authority, so a real macOS
edge remains mandatory for operator proof.
