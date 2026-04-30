# GGR-001 Bundle Current Upstream Gogcli Runtime

## Goal

Make the `gog` adapter package self-contained by bundling current upstream
`gogcli` with the adapter instead of relying on a host-level `gog` binary.

## Current Gap

The host Homebrew binary can be stale. On April 29, 2026, local Homebrew was
`v0.11.0` while upstream and Homebrew stable were `v0.14.0`.

The adapter also previously shipped a non-runnable checked-in `bin/gog-adapter`
for this Mac, which made package-local smoke testing misleading until rebuilt.

## Scope

- build upstream `gogcli` at pinned tag `v0.14.0`
- package it as `bin/gog`
- keep `NEXUS_GOG_COMMAND` as an explicit local override
- make the adapter prefer package-local `bin/gog` before PATH fallback
- make package release use the installed `nexus` CLI by default instead of the
  direct Node entry path when native Node ABI state is incompatible
- document macOS Keychain ACL behavior for freshly built local binaries

## Acceptance

1. `go test ./...` passes in `/Users/tyler/nexus/home/projects/nexus/packages/adapters/gog`
2. `./scripts/package-release.sh` builds both `bin/gog-adapter` and `bin/gog`
3. release archive contains both binaries
4. `./bin/gog --version` reports the pinned upstream version
5. `adapter.health` passes with an explicit upstream binary override
6. direct bundled-binary credential behavior is documented for macOS Keychain
   and has a hosted-safe credential path before production install
