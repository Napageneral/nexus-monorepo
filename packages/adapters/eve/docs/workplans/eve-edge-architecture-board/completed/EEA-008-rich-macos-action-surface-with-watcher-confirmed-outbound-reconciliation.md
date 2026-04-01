# EEA-008 Rich macOS Action Surface With Watcher-Confirmed Outbound Reconciliation

## Goal

Expand Eve from baseline send into a richer capability-gated iMessage action
surface while keeping durable truth on the watcher path.

## Scope

- reply
- reaction add and remove
- edit and unsend
- thread creation and rename
- participant add and remove
- watcher-confirmed outbound reconciliation

## Acceptance

- richer actions route through Nex to the correct edge
- unsupported actions fail clearly and truthfully
- local execution results do not become durable history by fiat
- watcher-confirmed evidence reconciles local actions into canonical history

## Validation

- focused action tests
- paired edge action proofs
- `go test ./...` in touched roots
- `git diff --check`
