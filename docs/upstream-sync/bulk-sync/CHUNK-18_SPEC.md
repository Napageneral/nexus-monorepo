# CHUNK-18 Implementation Spec (Docs)

This spec turns the CHUNK-18 decision into an execution plan.

## Scope
- `docs/` (all content, assets, and config)
- `docs/docs.json`, `docs/_config.yml`, `docs/_layouts/default.html`, `docs/CNAME`
- Docs assets and theme files under `docs/assets/`

## Decisions
- **ADAPT:** take upstream docs restructure and new content.
- Preserve all Nexus docs additions from `bulk-sync-ref`.
- Keep Nexus branding and Nexus domains throughout the docs site.

## Upstream additions to keep
- New docs hierarchy (start/help/install/cli/channels/concepts/providers/platforms/tools/plugins/nodes).
- Redirect map and navigation overhaul in `docs/docs.json`.
- New automation, channel, provider, and platform docs.
- Updated docs theme/layout and added assets.

## Implementation plan
1. **Adopt upstream docs tree**
   - Replace `docs/` content with upstream structure and files.
2. **Re-apply Nexus docs additions**
   - Restore all Nexus-specific pages added on `bulk-sync-ref`.
   - Ensure new files are present in the tree and referenced in navigation.
3. **Branding sweep**
   - Replace `legacy`/`legacy` strings with Nexus equivalents.
   - Update `docs/CNAME`, title strings, footer links, and localStorage keys.
4. **Navigation + redirects**
   - Merge Nexus pages into `docs/docs.json` nav groups.
   - Add redirects for any renamed Nexus pages that moved upstream.
5. **Validation**
   - Ensure the docs build cleanly (Mintlify/Jekyll as applicable).
   - Spot-check top-level nav links and docs links for Nexus domains.

## Acceptance criteria
- Docs build with Nexus branding and correct domains.
- No `legacy` strings remain in docs config or chrome.
- All Nexus-added docs from `bulk-sync-ref` are present and linked.
