# CallRail Adapter Package Install Validation

## Goal

Prove that the CallRail adapter is a real installable Nex adapter package and
that the runtime rehydrates it after restart.

## Validation Status

Status: complete.

## Ladder

1. static package contract exists
2. local build passes
3. package artifact is emitted under `dist/`
4. isolated runtime installs the tarball through `/api/operator/packages/install`
5. package health reports `healthy == true`
6. restart rehydrates the active package from durable state

## Completed Result

Validated on March 11, 2026 in an isolated runtime on `ws://127.0.0.1:19123`.

Observed evidence:

- `dist/nexus-adapter-callrail-0.1.0.tar.gz` built successfully
- install returned `status = active`
- package health returned `healthy = true`
- restart rehydration logged `rehydrated active adapter "nexus-adapter-callrail" from durable package state`
