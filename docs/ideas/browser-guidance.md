# Browser Tooling Guidance

This note captures the current understanding of browser tooling in Nexus and
what guidance we should give to agents.

## Current Tools

### `agent-browser` (headless CLI)
- Standalone deterministic automation tool.
- Good for repeatable, scripted flows (CI-friendly).
- No gateway dependency.

### `nexus browser` (gateway-managed Chrome)
- Controls a dedicated Chrome/Chromium instance via the gateway.
- Supports tabs, profiles, snapshots, screenshots, and interactive actions.
- Best for persistent sessions, shared state, and debugging.

## Proposed Agent Guidance (short form)
- Use `agent-browser` for fast, deterministic, one-off automation tasks.
- Use `nexus browser` when you need a persistent session, multi-step stateful
  flows, or manual inspection/debugging.

## Follow-up Work
- Add a skill/guidance doc explaining when and why to use each tool.
- Decide whether both should be exposed by default or gated by profile.
