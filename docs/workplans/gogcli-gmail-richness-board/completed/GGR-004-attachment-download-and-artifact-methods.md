# GGR-004 Attachment Download And Artifact Methods

## Goal

Add explicit attachment download support while keeping default ingest cheap.

## Current Gap

The current wrapper does not expose upstream `gog gmail attachment` or thread
attachment download behavior. Records can identify messages but cannot lazily
materialize attachment bytes through the adapter.

## Scope

- add a Gmail attachment download method using upstream:
  - `gog gmail attachment <messageId> <attachmentId>`
  - `gog gmail thread attachments <threadId> --download --out-dir <dir>`
- write downloads to an adapter-owned artifact/cache directory, not arbitrary
  caller-selected paths by default
- return stable artifact paths, MIME metadata, and byte counts
- make aggressive download an explicit policy flag, not the default monitor
  behavior
- add cache hit behavior so repeated downloads do not re-fetch unchanged
  attachments

## Acceptance

1. unit tests cover safe path construction, cache hit, cache miss, and failed
   upstream download
2. bounded live proof downloads one harmless attachment or skips truthfully when
   no test attachment is available
3. default backfill and monitor still only collect attachment metadata unless
   configured otherwise
4. artifact paths do not leak credentials or arbitrary filesystem access

## Completion Notes

- Added read-only `gmail.attachment.download`.
- The method writes to an adapter-owned cache under `NEXUS_GOG_STATE_DIR` or the
  default GOG adapter state directory.
- Caller-provided filenames are sanitized.
- Gmail message and attachment ids are compacted into bounded path tokens so
  long Gmail attachment ids do not exceed filesystem filename limits.
- Default backfill and monitor remain metadata-only.
- `go test ./...` passes.
- Bounded live proof downloaded one attachment into a temp adapter state dir:
  - first call `cached=false`, `bytes=590500`
  - second call `cached=true`, `bytes=590500`

The live proof did not commit or print attachment contents.
