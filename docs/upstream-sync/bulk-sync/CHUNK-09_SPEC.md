# CHUNK-09 Implementation Spec (Channel Core)

This spec turns the CHUNK-09 decision into an execution plan.

## Scope
- `src/channels/` (core channel helpers, docking, registry, plugins, onboarding, outbound)
- Channel config helpers and allowlist matching
- Integration touchpoints (commands, auto-reply, gateway status)

## Decisions
- **TAKE_UPSTREAM + Rename** (no compatibility shims)
- Nexus branding for all docs links, CLI hints, and package names
- Plugin catalog npm specs use the Nexus namespace (`@intent-systems/*`)

## Upstream additions to keep
- Channel docking metadata (`dock.ts`) for lightweight shared behavior
- Channel registry (`registry.ts`) with order, aliases, and formatted selection lines
- Allowlist and gating helpers (`allowlist-match`, `command-gating`, `mention-gating`)
- Plugin architecture split into adapters/types/core + config helpers
- Onboarding, pairing, status, and outbound helpers per channel
- Plugin catalog for external channels (Teams, Matrix, BlueBubbles, Zalo)
- `web` channel entrypoint re-exports

## Implementation plan
1. **Adopt upstream channel module layout**
   - Replace `src/channels/*` with upstream versions and keep new files under
     `src/channels/plugins/*`, `dock.ts`, `registry.ts`, and `web/index.ts`.
2. **Branding rename pass**
   - Replace `legacy` references in all channel text, hints, and tests.
   - Update docs URLs to `https://getnexus.sh` and website base to `https://getnexus.sh`.
   - Update CLI examples to `nexus ...` commands.
3. **Plugin catalog namespace update**
   - Convert `@legacy/*` to `@intent-systems/*` in `plugins/catalog.ts`.
   - Keep `localPath` entries (e.g., `extensions/msteams`) as upstream.
4. **Config + allowlist alignment**
   - Keep upstream channel config shape and allowlist matching helpers.
   - Ensure `allowFrom` formatting and normalization rules are preserved in `dock.ts`.
5. **Integration check**
   - Ensure channel registry and docking are used in shared code paths
     (auto-reply, message actions, CLI channels onboarding).
6. **Tests**
   - Update snapshots/fixtures to Nexus branding and new plugin npm specs.

## Acceptance criteria
- Channel registry returns Nexus-branded selection lines with Nexus docs URLs.
- Plugin catalog entries point to Nexus npm namespace.
- No `legacy` references remain in `src/channels` or related tests.
- Channel onboarding/status/outbound flows compile and pass tests.
