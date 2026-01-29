## CHUNK-04 Spec: Auto-Reply Upstream-First

### Goal
Adopt upstream auto-reply system wholesale with minimal Nexus-only exceptions. Keep upstream config shape and channel conventions unless a Nexus feature requires a shim.

### Scope
- `src/auto-reply/` (reply pipeline, commands, directives, queueing, streaming)
- Touchpoints: `src/config/`, `src/channels/`, `src/agents/`, `src/sessions/`

### Upstream Features to Keep
- Modular reply pipeline (`reply/*` + `get-reply.ts`)
- Command registry + args/menus (`commands-registry.*`)
- Directive handling split (parse/apply/persist + fast lane)
- Block streaming pipeline + coalescing (`block-reply-*`, `block-streaming.ts`)
- Agent runner enhancements (memory flush, response usage footer, reply-to threading)
- Inbound dedupe/debounce/history helpers

### Minimal Nexus Exceptions (only if required)
- **Commands:** Add Nexus-only slash commands/aliases if they exist and are still required.
- **Audio:** Reintroduce transcription only if Nexus still depends on auto-reply audio ingestion.
- **Branding:** Update any user-facing strings if upstream introduces non-Nexus labels here.

### Implementation Plan
- Adopt upstream auto-reply module layout without rewriting config shape.
- Use upstream channel dock + account ID resolution (align Nexus channel registry to it).
- Only extend `commands-registry.data.ts` if Nexus has extra slash commands to keep.
- Restore transcription only if required by Nexus features.

### Validation
- Run auto-reply tests targeting new modules.
- Validate `status`/`help`/`command` flows for inline directives and queue behavior.
- Verify block streaming + coalescing in multi-channel scenarios.
