# Package Enforcement

## Customer Experience

Package compliance should be automatic and binary.

A package either:
1. is package-shaped
2. validates cleanly
3. releases cleanly

or it is not production-ready.

## Discovery Rule

The package unit is the manifest root.

- apps: directory containing `app.nexus.json`
- adapters: directory containing `adapter.nexus.json`

Family/container directories are not package units unless they also own a manifest.

## Enforcement Rule

All package validation should run against discovered manifest roots, not guessed family roots.

Required checks:
1. `package validate`
2. package release wrapper succeeds
3. contract publication succeeds where applicable
4. central SDK generation succeeds where applicable

## App Families

App family repos may contain multiple app package roots.

Examples:
- `packages/apps/spike/app/`
- `packages/apps/spike/admin/`
- `packages/apps/glowbot/app/`
- `packages/apps/glowbot/admin/`
- `packages/apps/glowbot/hub/`

CI and local audit must target those manifest roots directly.
