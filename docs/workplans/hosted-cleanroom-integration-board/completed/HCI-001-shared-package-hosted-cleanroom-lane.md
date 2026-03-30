# HCI-001 Shared Package Hosted Cleanroom Lane

## Goal

Provide one shared path that can release a package, optionally publish it, and
prove it on a fresh Frontdoor-created server with cleanup.

## Scope

- shared package wrapper in `packages/scripts/`
- fresh-server hosted smoke integration with frontdoor
- package validation ladder update
- manual workflow entrypoint for operator-run hosted cleanroom proof

## Acceptance

1. one shared package script can drive hosted cleanroom smoke from a package root
2. the hosted cleanroom smoke provisions a fresh server rather than reusing an existing one
3. cleanup is explicit and defaults to disposable cleanup
4. shared package validation docs describe this path
5. GitHub Actions exposes a manual hosted cleanroom lane without changing the default structural CI path

## Validation

- syntax checks for the new scripts
- `git diff --check`
- workflow and doc alignment review
