# EEA-005 Canonical Record Stream, Attachment Object Flow, And Command Receipts

## Goal

Define and implement the edge-to-core payload plane for Eve records,
attachments, and command receipts.

## Scope

- canonical record stream from edge to core
- attachment object upload or durable object reference flow
- command receipt contract
- batching and retry rules for streamed payloads

## Acceptance

- canonical Eve records land in Nex core from the macOS edge
- attachment delivery no longer depends on remote clients seeing local Mac
  filesystem paths
- command receipts are visible to Nex core without being mistaken for durable
  history
- replay behavior is bounded and truthful

## Validation

- transport payload tests
- attachment object flow proof
- `go test ./...` in touched roots
- `git diff --check`
