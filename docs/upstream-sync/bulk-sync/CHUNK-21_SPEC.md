# CHUNK-21 Implementation Spec (Root Config)

This spec turns the CHUNK-21 decision into an execution plan.

## Scope
- `package.json`
- `vitest.config.ts`
- `biome.json` (removal)
- `tsconfig.json` (if impacted by upstream)

## Decisions
- **ADAPT:** take upstream dependency/tooling updates but keep Nexus identity.
- Accept the switch from bun/biome to node+tsx+oxfmt.
- Preserve Nexus package metadata, app naming, and any required patches.

## Upstream additions to keep
- `exports` for plugin-sdk.
- Expanded `files` packaging list.
- Script updates for build/test/formatting and new tooling helpers.
- Dependency upgrades and new pnpm overrides.
- Updated vitest settings (timeouts, pools, include/exclude).

## Implementation plan
1. **Merge upstream `package.json`**
   - Bring in new scripts, deps, overrides, and exports.
2. **Restore Nexus identity**
   - Keep `name`, `bin`, `homepage`, `repository`, and publish config for Nexus.
   - Rename CLI scripts to `nexus` equivalents.
3. **Branding sweep**
   - Replace `legacy`/`Legacyis` in scripts and file paths (e.g., `dist/Nexus.app`).
4. **Alias and test config**
   - Update `vitest.config.ts` alias to `nexus/plugin-sdk`.
   - Keep Nexus-specific excludes and channel paths.
5. **Patch handling**
   - Re-add `patchedDependencies` if still required by Nexus.
6. **Cleanup**
   - Remove `biome.json` and rely on `oxfmt`/`oxlint`.

## Acceptance criteria
- `pnpm install`, `pnpm build`, and `pnpm test` run with Nexus naming.
- Package metadata and CLI entrypoints remain Nexus-branded.
- No `legacy` naming remains in root config or test paths.
