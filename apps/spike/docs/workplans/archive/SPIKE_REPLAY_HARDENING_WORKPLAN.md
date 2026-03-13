# Spike Replay Hardening Workplan

**Status:** ACTIVE
**Last Updated:** 2026-03-12

## Purpose

Close the remaining replay gaps after private clone auth and PR head commit
durability:

1. recover older PR records from existing commit records when possible
2. make repeated snapshot rebuild requests idempotent

## Phase 1: PR record fallback

1. Add a replay helper that resolves a PR build target from:
   - `head_commit_sha`
   - else matching git commit records for `remote_url + source_branch`
2. Prefer the latest matching commit at or before the PR record timestamp.
3. Keep the hard rule that `target_branch` is never used as replay fallback.

## Phase 2: Build idempotency

1. Teach code-intel build to recognize an already-ready snapshot for the same
   identity.
2. Return the existing ready snapshot instead of rebuilding.
3. Ensure repeated replay does not insert duplicate `code_files` rows.

## Phase 3: Focused validation

1. Extend the reconcile job test suite for commit-record fallback.
2. Add a code-intel service test for repeated build of the same snapshot.
