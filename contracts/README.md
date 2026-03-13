# API Contracts

This directory contains the canonical generated machine-readable API artifacts
for the Nexus platform.

The storage and ownership model for these artifacts is defined in:

- [/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/OPENAPI_CONTRACT_ARTIFACT_MODEL.md](/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/OPENAPI_CONTRACT_ARTIFACT_MODEL.md)

## Layout

```text
contracts/
  frontdoor/
    openapi.yaml
    openapi.lock.json
  nex/
    openapi.yaml
    openapi.lock.json
  apps/
    <appId>/
      openapi.yaml
      openapi.lock.json
  adapters/
    <adapterId>/
      openapi.yaml
      openapi.lock.json
```

## Current First-Wave Artifacts

1. `frontdoor/openapi.yaml`
2. `apps/aix/openapi.yaml`

## Generation

These artifacts are generated, not hand-maintained.

Use:

```bash
cd /Users/tyler/nexus/home/projects/nexus/nex
pnpm contracts:generate
```

Or generate a subset:

```bash
cd /Users/tyler/nexus/home/projects/nexus/nex
pnpm contracts:generate:frontdoor
pnpm contracts:generate:aix
```
