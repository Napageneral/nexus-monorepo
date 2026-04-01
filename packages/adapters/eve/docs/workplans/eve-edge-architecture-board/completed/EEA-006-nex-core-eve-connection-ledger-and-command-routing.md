# EEA-006 Nex-Core Eve Connection Ledger And Command Routing

## Goal

Teach Nex core to own Eve connection state and route commands to the correct
paired edge.

## Scope

- Eve connection ledger state in Nex core
- edge session and capability persistence
- command routing to the correct connection
- truthful error behavior when an edge is offline or lacks a capability

## Acceptance

- Nex core can address the correct Eve connection deterministically
- routed commands fail truthfully when the target edge is unavailable
- edge capability truth is part of routing decisions
- the routing contract is ready for multi-host expansion

## Validation

- command routing tests
- connection-ledger tests
- `go test ./...` in touched roots
- `git diff --check`
