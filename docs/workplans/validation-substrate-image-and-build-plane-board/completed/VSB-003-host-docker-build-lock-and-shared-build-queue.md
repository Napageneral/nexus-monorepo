---
summary: "Serialize shared host Docker build work so proof lanes wait on one build plane instead of racing each other."
title: "VSB-003 Host Docker Build Lock And Shared Build Queue"
---

# VSB-003 Host Docker Build Lock And Shared Build Queue

## Goal

Make host Docker image build work explicitly serialized or budgeted as shared
infrastructure.

## Scope

- one host build lock or queue
- deduplication when the same image is requested concurrently
- clear wait and failure behavior for queued callers
- proof that build serialization does not serialize sandbox execution after
  image availability

## Acceptance

- concurrent requests for the same missing image do not start competing host
  `docker build` commands
- queued callers can observe or inherit the result of the shared build
- image-ready proof runs may still execute concurrently
- failure reporting points at the shared build plane, not a mysterious lane
  timeout

## Validation

- focused tests for lock or queue behavior
- concurrent local proof invocation against a missing image
- proof rerun after image availability to confirm concurrency remains
- `git diff --check`

## Completion Notes

- host Docker image creation now goes through one shared build-plane lock rooted
  in the machine-global Nex tmp lock area
- focused concurrency tests prove one missing image build happens once while the
  queued caller reuses the finished image instead of racing a second build
- runtime logs from the live operator-console proof show the shared build plane
  building `nexus-operator-console-browser-proof-sandbox:sha256-0e7982cbb08c4c223c15e21d`
  once and later runs leasing directly into proof execution
