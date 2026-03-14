# App Family Normalization

## Rule

An app family directory is an organizational container.
The real package units are the manifest roots inside it.

## Required Shape Per App Package Root

Each app package root should contain:
- `app.nexus.json`
- `README.md`
- `TESTING.md`
- `SKILL.md`
- `docs/specs/`
- `docs/workplans/`
- `docs/validation/`
- `scripts/package-release.sh`

And the manifest should include:
- `skill`

## Initial Cutover Targets

First normalize the simplest one-package families:
- `packages/apps/aix/app/`
- `packages/apps/dispatch/app/`

Then normalize the multi-package families:
- `packages/apps/spike/`
- `packages/apps/glowbot/`
