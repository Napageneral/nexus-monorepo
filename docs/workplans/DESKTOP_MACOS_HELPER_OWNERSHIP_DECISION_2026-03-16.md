---
summary: "Ownership decision for surviving nex/src/macos helpers after desktop client extraction."
title: "Desktop macOS Helper Ownership Decision"
---

# Desktop macOS Helper Ownership Decision

## Customer Experience

The desktop customer should experience one coherent boundary:

1. native desktop app behavior lives in `clients/nexus-desktop/macos/app`
2. companion adapter behavior lives in `clients/nexus-desktop/macos/adapter`
3. core runtime and CLI daemon behavior stays in `nex`
4. no file should imply that a runtime bootstrap helper is secretly the desktop app

## Research Summary

Surviving `nex/src/macos/*` files are:

1. `nex/src/macos/relay.ts`
2. `nex/src/macos/relay-smoke.ts`
3. `nex/src/macos/runtime-daemon.ts`

What they actually do:

### `relay.ts`

This is a Node/Bun entry wrapper around the existing `nex` CLI/runtime program.
It:

1. prints version text expected by Swift-side environment checks
2. preserves a no-op relay smoke flag parser
3. loads dotenv/path/logging/runtime guard behavior
4. executes the normal `nex` CLI program

This is not a native macOS app.
It is a runtime/bootstrap shim.

### `relay-smoke.ts`

This is a tiny argument parser for an old QR smoke mode.
The implementation is currently a no-op.
It only exists to preserve CLI parsing behavior.

This is not desktop-client logic.
It is stale bootstrap residue.

### `runtime-daemon.ts`

This is a Node/Bun wrapper for starting and supervising the core Nex runtime daemon.
It:

1. handles version output
2. configures runtime logging/ws-log mode
3. acquires the runtime lock
4. starts the runtime server
5. handles SIGTERM/SIGINT/SIGUSR1 lifecycle

This is core runtime ownership, not desktop-app ownership.

## Canonical Decision

### Keep In `nex`

Keep:

1. `nex/src/macos/runtime-daemon.ts`
2. `nex/src/macos/relay.ts`

Reason:

These are runtime/CLI bootstrap surfaces for the core Nex runtime.
They are not native desktop app code.
Moving them into `clients/nexus-desktop/macos/app` would incorrectly make the desktop client responsible for core runtime bootstrapping.

### Delete Later Or Inline

Candidate for later removal:

1. `nex/src/macos/relay-smoke.ts`

Reason:

It only preserves an old no-op QR smoke argument path.
That is not a meaningful desktop-client or runtime product surface.

## Rule For Future Desktop Work

If future code in `clients/nexus-desktop/macos/app` needs to:

1. query the Nex runtime version
2. launch the Nex runtime daemon
3. invoke `nexus` commands

then it should do so by calling the retained Nex runtime/CLI surface.
It should not absorb those bootstrap files just because they have `macos` in the path.

## Follow-On Cleanup Guidance

1. later rename or rehome `nex/src/macos/` if the directory name keeps misleading readers
2. consider moving retained runtime bootstrap files under a clearer runtime-owned path such as `nex/src/runtime-bootstrap/desktop/`
3. delete `relay-smoke.ts` when the remaining smoke-flag back-compat is no longer needed
