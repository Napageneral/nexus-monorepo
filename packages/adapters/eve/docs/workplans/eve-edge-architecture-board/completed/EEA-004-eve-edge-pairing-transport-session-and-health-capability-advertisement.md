# EEA-004 Eve Edge Pairing, Transport Session, And Health/Capability Advertisement

## Goal

Teach Eve to behave like a macOS edge that can pair to Nex core over an
authenticated edge-initiated transport.

## Scope

- edge registration and pairing contract
- edge-initiated long-lived transport session
- heartbeats and lag reporting
- health advertisement to Nex core
- capability advertisement to Nex core

## Acceptance

- a paired macOS Eve edge can register with Nex core without a public inbound
  listener on the Mac
- Nex core can distinguish paired, degraded, and offline edge states
- capability truth is visible in core-side state rather than guessed by clients
- the transport surface is restart-safe and credential-scoped

## Validation

- focused transport and registration tests
- paired edge-to-core smoke proof
- `go test ./...` in touched roots
- `git diff --check`
