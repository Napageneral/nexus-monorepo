# GlowBot Package Publish And Deploy Rehearsal Validation

> Focused validation ladder for GlowBot package artifacts and hosted deploy
> rehearsal.

**Status:** ACTIVE
**Last Updated:** 2026-03-12

## Validation State

Completed locally:

- A1-A7
- dependency install ordering proof for `glowbot-admin -> glowbot-hub`

Still pending:

- H1-H8 on real hosted servers
- G1-G3 on deployed control-plane and clinic installs

## Artifact Checks

| # | Checkpoint | Pass Criteria |
|---|---|---|
| A1 | `glowbot` tarball exists | release artifact emitted from package-release tooling |
| A2 | `glowbot-admin` tarball exists | release artifact emitted from package-release tooling |
| A3 | `glowbot-hub` tarball exists | release artifact emitted from package-release tooling |
| A4 | `glowbot` contents are correct | tarball contains `app.nexus.json` and required runtime dirs only |
| A5 | `glowbot-admin` contents are correct | tarball contains `app.nexus.json` and required runtime dirs only |
| A6 | `glowbot-hub` contents are correct | tarball contains `app.nexus.json`, `bin/`, and `src/` |
| A7 | manifests parse cleanly | all three manifests validate after extraction |

## Hosted Install Checks

| # | Checkpoint | Pass Criteria |
|---|---|---|
| H1 | clinic-style server exists | real hosted server selected for clinic app install |
| H2 | control-plane server exists | real hosted server selected for control-plane install |
| H3 | `glowbot` installs on clinic server | package state becomes active/healthy |
| H4 | `glowbot-admin` installs on control-plane server | package state becomes active/healthy |
| H5 | `glowbot-hub` is installed as dependency | control-plane server shows active/healthy hub package |
| H6 | clinic server does not install hub | package inventory does not imply per-clinic hub install |
| H7 | admin visibility is operator-only | control-plane surface matches operator-only intent |
| H8 | hub is non-browser-launchable | package exists and is healthy but not exposed as app UI |

## Gateway Checks

| # | Checkpoint | Pass Criteria |
|---|---|---|
| G1 | control-plane route is real | frontdoor resolves the installed GlowBot control-plane route |
| G2 | clinic app can call control plane | `productControlPlane.call` succeeds from deployed clinic app |
| G3 | no direct hub URL is required | clinic app uses hosted gateway only |

## Completion

The rehearsal passes only when A1-A7, H1-H8, and G1-G3 all pass.
