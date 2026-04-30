# GGR-005 Rich Send Reply Forward And Draft Methods

## Goal

Expose the richer upstream Gmail composition surface through truthful Nex
methods.

## Current Gap

The adapter only exposes basic `gmail.send` with plain text, target recipient,
thread id, and reply-to message id. Upstream now supports richer composition
features.

## Scope

- extend `gmail.send` or add adjacent methods for:
  - plain text body
  - HTML body
  - attachments
  - reply-to message id
  - thread id
  - reply-all
  - quoted replies
  - send-as aliases
  - Reply-To header
  - signatures
  - tracking controls
- add `gmail.forward` with attachment preservation and skip-attachment options
- add draft create/update/read/send methods where upstream JSON output is
  stable enough
- surface upstream `--gmail-no-send` and dry-run/no-input controls for safe
  agent validation
- keep mutation declarations truthful for every method

## Acceptance

1. unit tests cover argument construction for every rich composition option
2. dry-run/no-send validation proves payload construction without sending real
   mail
3. live send proof remains separately gated and opt-in
4. action responses include message id/thread id where upstream returns them
5. failures are classified as permanent input rejection, permission failure, or
   retryable provider/network failure

## Completion Notes

- Added rich `gmail.send` support for plain text, HTML, attachments, reply-to
  message id, thread id, reply-all, quote, send-as, Reply-To, signature
  selection, and tracking controls.
- Added `gmail.forward` with recipient, note/note-file, send-as, and
  skip-attachments controls.
- Added `gmail.drafts.list`, `gmail.drafts.get`, `gmail.drafts.create`,
  `gmail.drafts.update`, and `gmail.drafts.send` with truthful read/write
  mutation declarations.
- Added dry-run/no-input/gmail-no-send global flag wiring. Normal validation
  uses `--dry-run --no-input`; `--gmail-no-send` is exposed as an upstream hard
  safety block.
- Added wrapper tests for rich arg construction, dry-run flag placement,
  catalog metadata, and ambiguous signature rejection.
- Validation:
  - `go test ./...`
  - `go build -o ./bin/gog-adapter ./cmd/gog-adapter`
  - upstream `gogcli v0.14.0` dry-runs for rich send, forward, draft create,
    draft update, and draft send
