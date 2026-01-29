## CHUNK-21: Root Config

### Summary
Upstream rebrands the root package to Legacy, expands exports and file packaging, switches scripts from bun/biome to node+tsx+oxfmt, and updates dependencies. Vitest config adds new aliasing and test settings, and `biome.json` is removed. For Nexus, we should take upstream tooling and dependency updates but preserve Nexus identity and naming.

### Key Changes
- `package.json`: name/bin changed to legacy, new `exports`, expanded `files`, many script updates, dependency bumps, optional `node-llama-cpp`, new pnpm overrides.
- `vitest.config.ts`: adds plugin-sdk alias, timeouts/pool config, include/exclude adjustments, channel path rename.
- `biome.json` removed in favor of `oxfmt`/`oxlint`.
- Dist app naming switched to Legacy in tests.

### Nexus Conflicts
- Package identity (name, bin, repo, homepage) must remain Nexus.
- Scripts and configs reference Legacy/Legacyis and `dist/Legacy.app`.
- Alias should be `nexus/plugin-sdk`, not `legacy/plugin-sdk`.
- Upstream removed patched dependencies that Nexus may still rely on.

### Recommendation
**ADAPT**

### Adaptation Notes
- Keep upstream tooling shift (node/tsx, oxfmt/oxlint) but rebrand scripts and paths to Nexus.
- Restore Nexus package metadata and any publish config required.
- Adjust vitest alias and `dist/Nexus.app` excludes.
- Re-add patched dependencies if still needed.

### Questions for Tyler
- Do you want me to trace upstream rationale for dropping bun/biome (commit notes or PR)?
