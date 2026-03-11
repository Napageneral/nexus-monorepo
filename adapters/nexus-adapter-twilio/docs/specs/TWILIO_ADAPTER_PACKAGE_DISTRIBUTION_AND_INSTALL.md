# Twilio Adapter Package Distribution And Install

## Customer Experience

The Twilio adapter should be installable as one shared Nex adapter package.

The target experience is:

1. the runtime installs `nexus-adapter-twilio` through the operator package path
2. the runtime validates `adapter.nexus.json` and `adapter.info`
3. package health reflects runtime registration
4. runtime restart rehydrates the active Twilio package without reinstall
5. Twilio connections continue to bind to the same installed shared adapter

## Contract Authority

- [/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md](/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md)
- [/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-package-distribution-and-install.md](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-package-distribution-and-install.md)
- [ADAPTER_SPEC_TWILIO.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-twilio/docs/specs/ADAPTER_SPEC_TWILIO.md)

## Target Package Shape

```text
nexus-adapter-twilio/
  adapter.nexus.json
  bin/
    twilio-adapter
  docs/
  scripts/
    package-release.sh
```

## Package Identity

- `kind = "adapter"`
- `package_id = "nexus-adapter-twilio"`
- `version = "0.1.0"`
- `platform = "twilio"`

## Validation Bar

The package/install slice is complete when:

1. the repo emits `dist/nexus-adapter-twilio-0.1.0.tar.gz`
2. Nex installs that tarball through `POST /api/operator/packages/install`
3. package health reports `healthy == true`
4. runtime restart rehydrates the installed package
5. the installed package still answers `adapter.info`
