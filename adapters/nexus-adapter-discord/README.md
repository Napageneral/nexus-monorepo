# Nexus Discord Adapter

This package is the shared Discord adapter for Nex.

## Validate

```bash
pnpm test
pnpm build
```

## Package

```bash
./scripts/package-release.sh
```

## Consumer SDK

Generated consumer SDK:

- `sdk/nexus-adapter-discord-sdk-ts/`

Regenerate it with:

```bash
pnpm run sdk:generate
pnpm run sdk:build
```
