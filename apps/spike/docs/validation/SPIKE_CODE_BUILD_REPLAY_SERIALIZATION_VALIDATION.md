---
summary: "Validation ladder for durable Spike code-build serialization."
title: "Spike Code Build Replay Serialization Validation"
---

# Spike Code Build Replay Serialization Validation

## Rung 1: Repeated Direct Build

Pass when repeated direct `spike.code.build` calls for the same snapshot return
success and leave exactly one `code_files` row per `(snapshot_id, file_path)`.

## Rung 2: Concurrent Build

Pass when concurrent callers for the same `snapshot_id` do not race into
duplicate-row failures, including when they originate from separate
`codeintel.Service` instances.

## Rung 3: Failed Build Recovery

Pass when a build that enters `failed` leaves a truthful durable state and a
later retry can transition the same `snapshot_id` to `ready`.

## Rung 4: Replay Job Idempotency

Pass when repeated queued replay of the same git record does not fail with
`UNIQUE constraint failed: code_files.snapshot_id, code_files.file_path`.

## Rung 5: Hosted Proof

Pass when hosted repeated replay of the same commit remains green and produces
one truthful ready snapshot.
