---
name: wwex-speedship
description: Use for the read-only WWEX SpeedShip external source connection and invoice Record registration boundary.
---

# WWEX SpeedShip source

Use this adapter only to register the external read-only source identity and report connection health.

- Provider credentials remain in Nex vault custody.
- Browser capture runs in its separately governed MoonSleep systemd workload.
- One provider invoice revision becomes one immutable Nex Record (`record.ingest`) through a separately authorized, apply-gated publisher in moonsleep-v1.
- The adapter itself has no provider mutation, source registration, Dispatch, Finance, Claims, payment, or accounting authority.
