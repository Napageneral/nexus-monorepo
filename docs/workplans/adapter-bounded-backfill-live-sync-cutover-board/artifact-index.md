---
summary: "Artifact index for bounded backfill and live-sync cutover proof bundles."
title: "Artifact Index"
---

# Artifact Index

## Purpose

Track every retained proof bundle for the adapter bounded backfill and live-sync
cutover.

## Required Fields

Each entry should include:

- ticket
- proof lane
- date
- runtime shape
- package or repo revision
- adapter package artifact and checksum when applicable
- connection id or redacted alias
- bounded `since`
- bounded `to`
- live-sync status before and after proof
- restart status when applicable
- representative record ids
- artifact path
- limitations

## Entries

| Ticket | Lane | Date | Runtime Shape | Artifact Path | Status |
| --- | --- | --- | --- | --- | --- |
| ABBLS-001 / ABBLS-007 | Jira bounded-window smoke | 2026-05-02 | Docker cleanroom | `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-jira-cleanroom/20260502T212725Z` | Passed |
| ABBLS-002 through ABBLS-009 | Adapter package matrix | 2026-05-02 | Docker cleanroom | `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-package-matrix/20260502T214249Z` | Passed, 22 of 22 lanes |
| ABBLS-009 | Eve local watcher | 2026-05-02 | Host-native focused proof | `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-eve-host-native-livewatch/20260502T214436Z` | Passed |
| ABBLS-003 | GOG Gmail bounded backfill and history monitor | 2026-05-02 | Host-native live cleanroom | `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-gmail-live/20260502T214821Z` | Passed |
| ABBLS-003 | GOG Gmail operator-supplied bound attempt | 2026-05-02 | Host-native live cleanroom | `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-gmail-live/20260502T214724Z` | Failed, superseded |
| ABBLS-004 | Slack bounded backfill focused package proof | 2026-05-02 | Host-native focused proof | `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-slack-focused/20260502T215347Z` | Passed |
| ABBLS-004 | Slack live DM read proof | 2026-05-02 | Live provider focused proof | `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-slack-live-dm/20260502T215729Z` | Passed |
| ABBLS-004 | Slack live recent-channel read proof | 2026-05-02 | Live provider focused proof | `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-slack-live-channel-recent/20260502T215713Z` | Passed |
| ABBLS-004 | Slack old-cursor channel traversal | 2026-05-02 | Live provider diagnostic | `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-slack-live-user-token/20260502T215455Z` | Failed, rate limited |
| ABBLS-005 | Attribution adapter package lanes | 2026-05-02 | Docker cleanroom | `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-package-matrix/20260502T214249Z` | Passed |
| ABBLS-006 | Git forge adapter package lanes | 2026-05-02 | Docker cleanroom | `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-package-matrix/20260502T214249Z` | Passed |
| ABBLS-007 | Atlassian and Qase package lanes | 2026-05-02 | Docker cleanroom plus Jira smoke | `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-package-matrix/20260502T214249Z` | Passed |
| ABBLS-008 | Voice/local/manual package lanes | 2026-05-02 | Docker cleanroom | `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-package-matrix/20260502T214249Z` | Passed |
| ABBLS-009 | Healthcare/host-native package lanes | 2026-05-02 | Docker cleanroom plus host-native watcher | `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-package-matrix/20260502T214249Z` | Passed |
| ABBLS-010 | GOG hosted install/restart rehydration | 2026-05-02 | MoonSleep hosted runtime | `/Users/tyler/nexus/state/artifacts/validation/cleanroom/abbls-010-gog-hosted-install-restart/20260502T215941Z/proof/gog-hosted-install-restart-proof.json` | Passed with hosted inventory limitation |
| ABBLS-010 / ABBLS-011 | GOG staged package install and bounded backfill worker path | 2026-05-02 | Local runtime through operator package install | `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-agent-use-local-jobrun-76d01d47.json` | Passed after adding `records.backfill.stage` |
| ABBLS-011 | Agent-use bounded backfill and live-sync proof | 2026-05-02 | Local runtime worker session | `/Users/tyler/nexus/state/artifacts/validation/adapter-bounded-backfill-agent-use-proof/20260502T223429Z` | Passed |
| ABBLS-012 | Final artifact review and closeout | 2026-05-02 | Board closeout | `docs/workplans/adapter-bounded-backfill-live-sync-cutover-board/` | Passed |

## Notes

- The Docker package matrix excludes Eve `internal/livewatch` because that test
  validates local filesystem watcher behavior. The focused host-native proof
  above covers WAL and SHM change detection.
- The superseded GOG Gmail attempt captured the `to` bound before the seed
  message arrived, so the corrected harness now captures its default `to`
  immediately before `records.backfill`.
- Slack broad channel traversal hit provider rate limits with the old default
  cursor. The passed channel proof uses a recent cursor for live smoke.
- Hosted GOG proof verifies package install, runtime health, adapter surface
  persistence, restart archive/restore, and connection-count preservation.
  Hosted public runtime inventory did not expose a stable Gmail connection id
  for the legacy row, so stable connection identity and live Gmail job behavior
  are covered by host-native/local runtime proofs.
- Agent-use proof used child session
  `session:d496471f-317b-4838-8115-457ea5373269`, queued
  `jobrun_9d7feff3-4ddf-4b3e-9012-068335e6140d`, processed 8 Gmail records,
  preserved `monitor_was_paused=false`, and retained a redacted job run.
- Closeout repaired the lived-in local runtime by checkpointing and truncating
  the 70 GB `agents.db-wal`; SQLite integrity check returned `ok`.
