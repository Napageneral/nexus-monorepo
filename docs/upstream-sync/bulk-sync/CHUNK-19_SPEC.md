# CHUNK-19 Implementation Spec (Skills)

This spec turns the CHUNK-19 decision into an execution plan.

## Scope
- `skills/` tree (all skill definitions and references)
- Skill metadata inside `SKILL.md` files
- Any category or index files that define tools/connectors/guides

## Decisions
- **ADAPT:** preserve Nexus skills and taxonomy from `bulk-sync-ref`.
- Keep the Nexus categories: **tools**, **connectors**, **guides**.
- Import upstream new skills and map them into the Nexus categories.

## Upstream additions to keep
- New skills: `bird`, `bluebubbles`, `canvas`, `legacyhub`, `coding-agent`, `github`, `gog`, `himalaya`, `openai-image-gen`, `session-logs`, `skill-creator`, `voice-call`.
- Updated skill docs and scripts (e.g., image generation, formatting helpers).
- Connector updates (discord/slack reorg, minor doc tweaks).

## Implementation plan
1. **Start from upstream skills tree**
   - Pull in all new skills and updates from upstream.
2. **Restore Nexus skills and metadata**
   - Re-add all skills present in `bulk-sync-ref`, including `nexus-cloud` and `upstream-sync`.
3. **Re-apply Nexus taxonomy**
   - Keep directory splits: `skills/tools/`, `skills/connectors/`, `skills/guides/`.
   - Move upstream-added skills into the correct category folder.
4. **Metadata preservation**
   - Keep Nexus-specific metadata fields and category tags.
5. **Branding sweep**
   - Replace `legacy`/`legacy` strings with Nexus equivalents.
6. **Validation**
   - Ensure skill discovery/scan logic can still find all categories and new additions.

## Acceptance criteria
- All Nexus skills from `bulk-sync-ref` exist with original metadata.
- Tools/connectors/guides categories are preserved and populated correctly.
- Upstream new skills are present and categorized.
- No `legacy` branding remains in skills content.
