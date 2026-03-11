# Apple Maps Adapter Package Distribution And Install

## Customer Experience

The Apple Maps adapter should be installable as one shared Nex adapter package.

The target experience is:

1. the runtime installs `nexus-adapter-apple-maps` through the operator package path
2. the runtime validates `adapter.nexus.json` and `adapter.info`
3. package health reflects runtime registration
4. runtime restart rehydrates the active Apple Maps package without reinstall
5. Apple Maps manual-first connections continue to bind to the same installed shared adapter

## Contract Authority

- [/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md](/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md)
- [/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-package-distribution-and-install.md](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-package-distribution-and-install.md)
- [ADAPTER_SPEC_APPLE_MAPS.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-apple-maps/docs/specs/ADAPTER_SPEC_APPLE_MAPS.md)

## Target Package Shape

```text
nexus-adapter-apple-maps/
  adapter.nexus.json
  bin/
    apple-maps-adapter
  docs/
  scripts/
    package-release.sh
```

## Package Identity

- `kind = "adapter"`
- `package_id = "nexus-adapter-apple-maps"`
- `version = "0.1.0"`
- `platform = "apple-maps"`

## Validation Bar

The package/install slice is complete when:

1. the repo emits `dist/nexus-adapter-apple-maps-0.1.0.tar.gz`
2. Nex installs that tarball through `POST /api/operator/packages/install`
3. package health reports `healthy == true`
4. runtime restart rehydrates the installed package
5. the installed package still answers `adapter.info`
