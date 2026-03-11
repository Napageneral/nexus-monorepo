# Adapter Package Kit

Shared packaging helper for Go-based Nex adapter packages.

This is intentionally separate from the adapter runtime SDK.

- runtime SDK: launched adapter behavior and protocol
- package kit: local release artifact assembly for `kind = "adapter"` packages

## Usage

From an adapter repo root with `adapter.nexus.json`:

```bash
/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/adapter-package-kit/package-release.sh .
```

The helper:

1. reads `adapter.nexus.json`
2. derives the binary name from `command`
3. builds `./bin/<binary>`
4. stages `adapter.nexus.json` and `bin/`
5. writes `./dist/<package-id>-<version>.tar.gz`

If an adapter needs a non-standard build target, set `ADAPTER_BUILD_TARGET`
before calling the helper.
