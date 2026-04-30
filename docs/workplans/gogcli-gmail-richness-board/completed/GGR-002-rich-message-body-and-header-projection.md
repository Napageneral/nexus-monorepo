# GGR-002 Rich Message Body And Header Projection

## Goal

Upgrade Gmail records from snippet-heavy metadata to rich message records with
full body and delivery/threading headers.

## Current Gap

`buildEventFromMessage` calls `gog gmail get --format metadata`, then records
subject, from, to, snippet, label ids, message id, and thread id. It does not
persist full plain text body, HTML body, size estimate, history id, or complete
RFC threading/delivery headers.

## Scope

- inspect upstream `gogcli v0.14.0` JSON shapes for:
  - `gmail messages search --include-body --full --body-format text`
  - `gmail messages search --include-body --full --body-format html`
  - `gmail get --format full`
  - `gmail get --format metadata`
- choose the cheapest command path that preserves full message content
- project plain text body into canonical record content when available
- preserve HTML body in metadata or an attachment/artifact reference if record
  size makes inline metadata inappropriate
- preserve RFC headers needed for identity, threading, and delivery audit
- preserve internal date, history id, size estimate, label ids, message id, and
  thread id
- keep records idempotent by Gmail message id

## Acceptance

1. fixture tests cover metadata-only, text-body, HTML-body, multipart, empty
   body, and malformed header cases
2. bounded live proof emits one real Gmail record with full body/header
   projection and redacted artifact summary
3. backfill still emits page-by-page without holding a whole mailbox in memory
4. no secret-bearing message body or token appears in docs or committed
   artifacts

## Completion Notes

- `buildEventFromMessage` now uses `gog gmail get --format full`.
- The adapter decodes Gmail `text/plain` and `text/html` body parts from the
  full payload tree.
- Canonical record content prefers full plain text body over snippet fallback.
- Metadata now preserves normalized headers, RFC Message-ID, In-Reply-To,
  References, Date, Reply-To, List-Unsubscribe, history id, internal date, size
  estimate, text body, and HTML body.
- `go test ./...` passes in the GOG adapter package.
- Bounded live proof against `casey@moonsleep.co` emitted one record with:
  - `body_text_len=12841`
  - `body_html_len=98433`
  - `has_headers=true`
  - `has_rfc_message_id=true`
  - `has_history_id=true`

The live proof summary intentionally omitted message body content.
