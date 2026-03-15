# Adapter Package Kit

Shared packaging helper for Nex adapter packages.

This is intentionally separate from the adapter runtime SDK.

- runtime SDK: launched adapter behavior and protocol
- package kit: local release artifact assembly for `kind = "adapter"` packages

## Place In The Flow

This package kit should be updated after canonical spec changes and alongside
shared SDK updates, before changes are propagated into individual adapter packages.

Canonical references:

- [Package Author Experience](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-author-experience.md)
- [Hosted Package Ownership and Validation Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/hosted-package-ownership-and-validation-model.md)
- [Adapter Package Distribution and Install](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-package-distribution-and-install.md)

## Usage

From an adapter repo root with `adapter.nexus.json`:

```bash
/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/adapter-package-kit/package-release.sh .
```

The helper:

1. reads `adapter.nexus.json`
2. derives the launch name from `command`
3. packages either:
   - Go adapters via `go build`, or
   - Node adapters via `pnpm build`
4. stages `adapter.nexus.json`, package payload, and any present `hooks/` or `assets/`
5. writes `./dist/<package-id>-<version>.tar.gz`

## Go Adapters

Default runtime:

```bash
/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/adapter-package-kit/package-release.sh .
```

If an adapter needs a non-standard build target, set `ADAPTER_BUILD_TARGET`
before calling the helper.

## Node Adapters

For TS/Node adapters:

```bash
ADAPTER_PACKAGE_RUNTIME=node \
/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/adapter-package-kit/package-release.sh .
```

The helper will:

1. run `pnpm build`
2. infer the entrypoint from `package.json`
3. generate a `bin/<command>` launcher that executes `node dist/...`
4. stage `dist/`, `package.json`, and `node_modules/`

For node adapters, `node_modules/` must already exist locally.
