# OCRP-001 Shared Console Real-Adapter Cleanroom Harness

## Goal

Hard-cut the existing Operator Console browser proof lane into a shared
cleanroom harness for real-adapter proof.

## Outcome

Completed.

The shared harness now:

- boots a fresh cleanroom runtime
- keeps whole-session VM recording as the primary artifact
- projects real adapter packages into the cleanroom
- drives the real Console Connectors UI instead of synthetic adapter fixtures
- emits one structured proof bundle with recording, screenshots, and summary
- supports adapter-owned proof specs such as the Slack cleanroom lane

## Notes

The first full proof driven by this harness is
[OCRP-002](/Users/tyler/nexus/home/projects/nexus/docs/workplans/console-real-adapter-cleanroom-proof-board/completed/OCRP-002-slack-console-cleanroom-proof.md),
which validated the stricter completion-and-counts contract in a fresh
cleanroom.
