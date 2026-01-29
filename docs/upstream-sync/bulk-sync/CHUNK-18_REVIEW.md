## CHUNK-18: Docs

### Summary
Upstream replaces the docs site with a much larger Mintlify/Jekyll hybrid, adds a deep navigation tree (start/help/install/cli/channels/concepts/providers/platforms/tools), and ships many new pages and assets. For Nexus, we should take the upstream structure and content, but preserve Nexus-specific docs from the reference branch and rebrand all docs config, links, and UI strings.

### Key Changes
- Massive doc reorg with new sections, redirects, and nav groups in `docs/docs.json`.
- New docs content across CLI, channels, concepts, providers, platforms, tools, and automation.
- Jekyll config/layout updates (title, nav, localStorage theme key, header/footer links).
- New assets and theme tweaks.
- CNAME switched to `legacy.com`.

### Nexus Conflicts
- Branding: CNAME, site titles, GitHub links, prompt/footer strings, and localStorage keys are Legacy.
- Nexus-specific docs added on the reference branch (e.g., Nexus Cloud sync docs and other additions) would be lost if we take upstream wholesale.
- Docs URLs should stay on Nexus domains.

### Recommendation
**ADAPT**

### Adaptation Notes
- Keep upstream docs structure, new pages, and redirects.
- Re-apply all Nexus docs added on `bulk-sync-ref` and ensure they are linked in navigation.
- Replace all `legacy`/`legacy` strings with Nexus equivalents and confirm domain targets.
- Preserve Nexus-specific docs around cloud, collab, skills hub, and control-plane features.

### Questions for Tyler
- Confirm the canonical docs domain and CNAME (reference branch uses `nexus.com` while many links point to a legacy docs domain).
