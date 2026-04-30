# GGR-008 Gmail Native Method Catalog And Guardrails

## Goal

Expose the useful upstream Gmail-native method catalog through Nex without
turning the adapter into a narrow custom wrapper.

## Current Gap

The adapter currently declares only `gmail.labels.list` and `gmail.send` as
native methods. Upstream `gogcli` has a broader Gmail surface around messages,
threads, attachments, labels, batch operations, drafts, filters, settings,
send-as aliases, vacation settings, forwarding, watch, and tracking.

## Scope

- inventory upstream `gogcli v0.14.0` Gmail commands and JSON stability
- define the first full-surface method set to expose
- mark every method as read or write truthfully
- mark connection requirements truthfully
- ensure mutating methods support dry-run/no-input/no-send where upstream
  offers it
- add method fixtures for request/response shape
- update OpenAPI/catalog artifacts after implementation

## Acceptance

1. method catalog covers the agreed Gmail upstream surface
2. every method has action and mutation metadata
3. read methods are safe for agent use in cleanroom
4. write methods are gated by explicit mutation semantics and validation
5. package catalog and generated OpenAPI remain valid

## Completion Notes

- Inventoried upstream `gogcli v0.14.0` Gmail commands.
- Added guarded native wrappers instead of raw arbitrary command passthrough:
  - `gmail.native.read`
  - `gmail.native.write`
- `gmail.native.read` allowlist:
  - `messages.search`
  - `message.get`
  - `labels.get`
  - `history.list`
  - `watch.status`
- `gmail.native.write` allowlist:
  - `labels.create`
  - `labels.rename`
  - `labels.delete`
  - `message.modify`
  - `thread.modify`
  - `archive`
  - `mark_read`
  - `mark_unread`
  - `trash`
  - `watch.start`
  - `watch.renew`
  - `watch.stop`
- Guardrails:
  - no arbitrary args field
  - named params only
  - every command is allowlisted
  - writes require `dry_run=true` or `confirm_mutation=true`
  - destructive live writes require `force=true`
  - dry-run/no-input/no-send globals are wired through
- Validation:
  - `go test ./...`
  - `go build -o ./bin/gog-adapter ./cmd/gog-adapter`
  - fake-CLI dry-run proof for native write flag placement
