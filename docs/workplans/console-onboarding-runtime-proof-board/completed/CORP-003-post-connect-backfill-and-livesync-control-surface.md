# CORP-003 Post-Connect Backfill And Livesync Control Surface

## Goal

Expose deterministic post-connect controls so the Console can prove runtime-
backed ingestion after an adapter is connected.

## Target Behavior

After a successful connect:

- the connection is persisted
- an initial backfill is queued automatically
- livesync is enabled by default when supported
- the UI still exposes:
  - `Test connection`
  - `Backfill now`
  - `Livesync` on or off
  - `Disconnect`

## Acceptance

- the Console shows post-connect controls for a connected adapter
- `Backfill now` can be invoked deterministically from the UI
- `Livesync` can be toggled without disconnecting the adapter
- the proof lane can rely on this surface to make runtime-backed data visible

