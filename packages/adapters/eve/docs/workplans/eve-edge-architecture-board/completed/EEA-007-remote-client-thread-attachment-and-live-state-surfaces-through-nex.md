# EEA-007 Remote Client Thread, Attachment, And Live-State Surfaces Through Nex

## Goal

Expose Eve correctly to Android, Linux, web, and Nex app surfaces through Nex
core alone.

## Scope

- client-visible thread and attachment surfaces through Nex
- live state fanout through canonical Nex event surfaces
- capability truth surfaced to clients
- health and lag visibility for operator and client flows

## Acceptance

- remote clients can browse Eve threads through Nex without direct Mac access
- attachments are fetched through Nex-managed surfaces
- live updates arrive through Nex event surfaces
- client-visible capability truth matches the paired edge

## Validation

- API and runtime tests for thread and live-state surfaces
- one remote-client or app-facing proof path through Nex
- `go test ./...` in touched roots
- `git diff --check`
