# Adapter Spec: TikTok Business

This package-local spec tracks the shared `tiktok-business` package.

The canonical umbrella spec is
[tiktok-business-adapter.md](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-business-adapter.md).

Current package state:

- installable package scaffold exists
- real TikTok Business auth is implemented
- provider row mapping is implemented
- backfill and monitor are implemented with replay-safe recent windows

The package must converge to the umbrella spec without introducing
MoonSleep-specific behavior.
