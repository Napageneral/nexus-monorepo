## CHUNK-00: Config & Schema

### Summary
Upstream heavily refactors config loading, schema, and types, adds multi-agent support and runtime overrides, and introduces new defaults and validation layers. Plan is upstream-first: keep upstream behavior unless it breaks Nexus-specific work (branding, ODU, nexus-cloud).

### Key Changes
- New config utilities: `config-paths.ts` for safe dot-path handling and `runtime-overrides.ts` for live config overrides.
- Config loader now resolves `$include`, performs `${VAR}` env substitution, writes backup rotations, stamps `meta.lastTouched*`, and warns on miskeys.
- Multi-agent support (`agents.list`, bindings) with duplicate `agentDir` validation and updated model defaults under `agents.defaults`.
- New defaults for context pruning + compaction, revised message defaults (no automatic `ackReaction`).
- Channel config enhancements: per-account capabilities, native command/skills toggles keyed by channel IDs.
- Session store caching with TTL env var; cache utilities for mtime/TTL.
- Schema/UI regrouping and merging of plugin + channel schemas; many new/expanded zod schema files.

### Nexus Conflicts
- Environment variables and paths now default to `LEGACY_*` and `~/.legacy` / `legacy.json`.
- Schema/type naming switches to `Legacy*` and `LegacySchema`, which conflicts with Nexus naming.
- Legacy migration/aliasing is removed upstream; only re-add if current Nexus configs fail.
- Strict schema validation risks rejecting `nexus.*` extensions or Nexus-only sections (ODU, nexus-cloud).
- Several defaults and UI hints include `legacy` strings (message prefixes, control UI base path).

### Recommendation
**ADAPT**

### Adaptation Notes
- Replace all `LEGACY_*` env vars and defaults with `NEXUS_*` equivalents (`NEXUS_STATE_DIR`, `NEXUS_CONFIG_PATH`, `~/nexus/state/nexus.json`, etc.).
- Preserve Nexus naming: `NexusSchema`, `NexusConfig`, and UI/help text should use “Nexus”.
- Only reintroduce migrations/aliasing if current Nexus configs fail validation.
- Ensure zod schemas allow Nexus-only config keys (ODU, nexus-cloud), or extend schemas to include them.
- Default to upstream behavior unless it breaks Nexus-specific work.

### Questions for Tyler
- Should top-level provider keys (`telegram`, `whatsapp`, etc.) still be accepted, or enforce `channels.*` only?
- Are we OK dropping default `ackReaction` behavior, or should Nexus keep the emoji default?

