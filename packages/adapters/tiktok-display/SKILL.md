---
name: tiktok-display
description: Use the TikTok Display adapter for shared TikTok profile and video-library access through canonical Nex connections.
---

# Nexus TikTok Display Adapter

Use the shared TikTok Display adapter when Nex should own TikTok profile and
video-library access through a durable shared connection.

## Main Surfaces

- `adapter.info`
- `adapter.connections.list`
- `adapter.health`
- `tiktok-display.user.info.get`
- `tiktok-display.video.list`

Profile sync, video sync, backfill, monitor, and the first-wave public method
surface are implemented in this package. Use the package manifest and
cleanroom proof for the authoritative contract state.
