## CHUNK-20: Scripts/CI

### Summary
Upstream expands CI (install-check, secrets scan, Windows/macOS checks), upgrades Node/pnpm tooling, and adds many new scripts for formatting, auth, debug, and e2e flows. At the same time, it removes cloud-binary and installer scripts/workflows. For Nexus, we should take the upstream improvements but keep cloud binary and installer tooling.

### Key Changes
- CI overhaul: new install-check, secrets scan, Windows checks; runner change to `blacksmith-*`; Node 22 pinning; corepack pnpm pin.
- New scripts: `format-staged`, `copy-hook-metadata`, `sync-plugin-versions`, `run-node`, `watch-node`, `debug-claude-usage`, `auth-monitor`, updated e2e Docker flows.
- Removal of cloud-binary scripts (`build-cloud-binary.ts`, `fetch-cloud-binaries.ts`) and workflow (`.github/workflows/cloud-binaries.yml`).
- Removal of install scripts (`install.sh`, `install-cli.sh`) and some release helpers.

### Nexus Conflicts
- Cloud binary build and installer flows must be preserved.
- Branding in CI/scripts (legacy strings, app names, env vars).
- Runner choice (`blacksmith-*`) may not match Nexus infra.

### Recommendation
**ADAPT**

### Adaptation Notes
- Merge upstream CI improvements but re-add cloud-binary and installer workflows/scripts.
- Keep Nexus release/install flows if still required for distribution.
- Rename `legacy`/`Legacyis` references to Nexus.
- Validate new scripts against Nexus repo paths and domains.

### Questions for Tyler
- Do you want to keep `blacksmith-*` runners or stay on standard GitHub-hosted runners?
