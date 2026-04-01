# EAP-005 Thread Mutation Parity

## Goal

Add provider-native thread mutations so Eve can create, rename, and change
participants in iMessage threads when the local edge supports it.

## Execution Class

private-API-required

## Blocker

This ticket is blocked until a dedicated private-API parity host is available.

The Messages AppleScript surface exposes chats and participants as read-only
objects for Eve's purposes, so thread mutation parity is not part of the active
AppleScript lane.

## Scope

- thread create
- thread rename
- participant add
- participant remove
- durable observation of resulting membership or thread changes

## Acceptance

- thread create works end to end
- rename and participant mutation work end to end
- observed thread or membership changes reconcile through Eve ingest
- capability truth remains accurate per edge

## Validation

- real group-thread proof
- canonical membership or thread-change record proof
- `git diff --check`
