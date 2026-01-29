## CHUNK-04: Auto-Reply System

### Summary
Upstream splits the reply pipeline into many modules, adds a command registry/args layer, refactors directive handling and queueing, and overhauls streaming (block coalescing) and agent-runner behavior. The result is a more modular reply engine with new capabilities (reply-to handling, memory flush, usage footers, inbound dedupe/debounce).

### Key Changes
- `reply.ts` now only re-exports; main flow moved to `reply/get-reply.ts` with many new submodules.
- New command registry (`commands-registry.*`) plus args parsing/menus; command detection/authorization updated.
- Inline directives split into parse/apply/persist modules with a directive-only fast lane; expanded model picker/reasoning directives tests.
- Streaming pipeline redesigned: per-channel chunk limits, per-account coalescing settings, and `block-reply-pipeline`/`block-reply-coalescer`.
- `agent-runner` refactor adds memory flush flow, response-usage footer, CLI session IDs, reply-to threading, typing-mode support.
- New inbound helpers: debounce, dedupe, sender meta, context/history, media notes; more tests.
- Queue system modularized (`queue/`); commands handling split into `commands-*` modules.

### Nexus Conflicts
- Config shape moves to `cfg.agents.defaults.*` and `LegacyConfig` types; Nexus currently uses `cfg.agent` and `NexusConfig`.
- Block streaming now depends on channel dock + account id normalization; must align with Nexus channel IDs and any custom dock entries.
- Command registry introduces enable flags (`cfg.commands.*`) and alias normalization that may collide with Nexus custom commands/aliases.
- Response-usage footers/reasoning directives can affect Nexus reply formatting expectations (UI + logging).
- `transcription.ts` removed; verify audio transcript behavior still exists elsewhere for Nexus.

### Recommendation
ADAPT

### Adaptation Notes
- Map `LegacyConfig` → `NexusConfig` and reconcile `cfg.agents.defaults` with existing `cfg.agent` fields.
- Keep new block streaming + coalescing logic but ensure Nexus channel docks and account IDs are supported.
- Update command registry data to preserve Nexus-specific commands/aliases and any command gating defaults.
- Confirm reply formatting policies (reasoning tags, usage footer, reply-to threading) match Nexus UX.
- Restore or relocate audio transcription if Nexus relies on it.

### Questions for Tyler
- Do we want response-usage footers enabled by default in Nexus replies?
- Should command registry become the single source of truth for Nexus command aliases?
- Is audio transcription expected to remain in auto-reply, or should it be handled upstream in ingestion?
