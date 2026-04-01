# EEA-009 Multi-User And Multi-Host Connection Model

## Goal

Replace Eve's default-slot mental model with one connection per macOS user
session identity surface across one or more hosts.

## Scope

- one connection per macOS user session
- multiple Eve connections under one Nex core
- per-connection self identity and capability truth
- operator-visible host and session distinction

## Acceptance

- Nex core can manage multiple Eve connections at once
- one physical Mac can expose multiple distinct Eve connections when user
  sessions are genuinely separate
- routing remains deterministic across hosts and sessions
- self identity and capability truth stay per connection

## Validation

- multi-connection routing tests
- operator-surface state proofs
- `go test ./...` in touched roots
- `git diff --check`
