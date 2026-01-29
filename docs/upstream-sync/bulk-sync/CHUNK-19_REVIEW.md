## CHUNK-19: Skills

### Summary
Upstream reshapes the skills tree (flattening `skills/tools/*` into `skills/*`), removes several connectors/guides, and adds new skills. For Nexus, we must preserve all skills from the reference branch and keep the tools/connectors/guides taxonomy and metadata, then layer upstream additions into those categories.

### Key Changes
- Skills tree reshuffle: many `skills/tools/*` move to `skills/*`, and some connectors/guides are removed.
- New skills added (examples): `bird`, `bluebubbles`, `canvas`, `legacyhub`, `coding-agent`, `github`, `gog`, `himalaya`, `openai-image-gen`, `session-logs`, `skill-creator`, `voice-call`.
- Multiple connectors and guides removed upstream (brave-search, github, google-oauth, telegram, wacli, filesystem, json-render, nexus-cloud, browser-use-agent-sdk).
- Several skill docs and scripts updated or renamed.

### Nexus Conflicts
- Nexus-specific skills removed upstream (notably `nexus-cloud` and `upstream-sync`).
- Nexus uses explicit categories (tools/connectors/guides) and custom metadata; upstream flattening would break this.
- Nexus skill additions and metadata from `bulk-sync-ref` would be lost if we take upstream wholesale.

### Recommendation
**ADAPT**

### Adaptation Notes
- Preserve all Nexus skills and metadata from `bulk-sync-ref`.
- Keep the Nexus taxonomy (tools/connectors/guides) and re-slot upstream new skills into the right category.
- Retain Nexus-only connectors and guides even if upstream removed them.
- Sweep skill docs for `legacy`/`legacy` branding and update to Nexus.

### Questions for Tyler
- Any upstream-added skills you want to exclude from Nexus?
