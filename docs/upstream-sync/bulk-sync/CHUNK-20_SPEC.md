# CHUNK-20 Implementation Spec (Scripts and CI)

This spec turns the CHUNK-20 decision into an execution plan.

## Scope
- `.github/workflows/` (CI workflows)
- `scripts/` (build, release, install, e2e, tooling scripts)
- Installer and cloud-binary workflows/scripts

## Decisions
- **ADAPT:** take upstream CI and script improvements.
- Preserve cloud-binary and installer tooling from `bulk-sync-ref`.
- Keep Nexus branding throughout scripts and workflows.

## Upstream additions to keep
- CI jobs: install-check, secrets scan, Windows checks, macOS test checks.
- Updated pnpm setup (corepack pin), Node 22 usage, submodule retry logic.
- New scripts: `format-staged`, `copy-hook-metadata`, `sync-plugin-versions`, `run-node`, `watch-node`,
  `debug-claude-usage`, `auth-monitor`, expanded e2e Docker scripts.

## Implementation plan
1. **Merge upstream workflows**
   - Bring in new CI jobs and step changes.
2. **Restore Nexus workflows**
   - Re-add cloud-binary workflow and any install/release workflows removed upstream.
3. **Restore Nexus scripts**
   - Re-add `build-cloud-binary.ts`, `fetch-cloud-binaries.ts`, `install.sh`, `install-cli.sh`,
     and any other Nexus distribution scripts.
4. **Branding sweep**
   - Replace `legacy`/`Legacyis` references with Nexus equivalents.
5. **Runner choice**
   - Decide whether to keep `blacksmith-*` runners or switch back to GitHub-hosted.
6. **Validation**
   - Ensure CI matrix can run with Nexus scripts and that install steps still work.

## Acceptance criteria
- CI runs with Nexus branding and required jobs.
- Cloud-binary and installer workflows/scripts are present and referenced.
- No `legacy` naming remains in workflows or script output.
