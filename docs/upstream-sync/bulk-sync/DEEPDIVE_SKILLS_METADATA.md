# Skills Metadata + Hub/Manifest Deep Dive

## Nexus reference behavior
- Full metadata parsing in `src/agents/skills.ts` via `metadata.nexus.*`:
  - `type` (guide/tool/connector)
  - `provides` (capability ids)
  - `requires.credentials`
  - `hubSlug`, `hub`, `version` (hub integration)
- Manifest + hub operations in `src/commands/skills-manifest.ts`
- Hub CLI in `src/cli/skills-hub-cli.ts`
- Docs in `docs/skills.md`

## Upstream (legacy)
- `src/agents/skills.ts` removed and replaced with minimal behavior.
- `src/commands/skills-manifest.ts` removed entirely.
- Metadata namespace is `metadata.legacy.*` with a reduced field set.
- Docs remove Nexus-specific metadata fields.

## Consequences if upstream-only
- Skill classification breaks (`type`)
- Capability mapping breaks (`provides`)
- Credential gating breaks (`requires.credentials`)
- Hub integration + manifest tracking breaks

## Best-of-Both Compatibility Plan
1. Keep Nexus metadata parsing and hub/manifest tooling.
2. Add compatibility for `metadata.legacy.*` when present:
   - Prefer `metadata.nexus.*` if both exist
3. Preserve `type`, `provides`, `requires.credentials`, `hubSlug/hub`, `version`.
4. Update docs to clarify supported fields and namespaces.

## Decisions (current)
- **Keep Nexus metadata + hub/manifest tooling.**
- **Accept `metadata.legacy.*` for portability, but prefer `metadata.nexus.*`.**
