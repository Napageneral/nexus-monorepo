# PatientNow EMR Adapter Package Distribution And Install

## Customer Experience

The PatientNow EMR adapter should be installable as one shared Nex adapter
package.

The target experience is:

1. the runtime installs `nexus-adapter-patient-now-emr` through the operator package path
2. the runtime validates `adapter.nexus.json` and `adapter.info`
3. package health reflects runtime registration
4. runtime restart rehydrates the active PatientNow EMR adapter without reinstall
5. PatientNow EMR connections continue to bind to the same installed shared adapter

## Contract Authority

- [/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md](/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md)
- [/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-package-distribution-and-install.md](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-package-distribution-and-install.md)
- [ADAPTER_SPEC_PATIENT_NOW_EMR.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-patient-now-emr/docs/specs/ADAPTER_SPEC_PATIENT_NOW_EMR.md)

## Target Package Shape

```text
nexus-adapter-patient-now-emr/
  adapter.nexus.json
  bin/
    patient-now-emr-adapter
  docs/
  scripts/
    package-release.sh
```

## Package Identity

- `kind = "adapter"`
- `package_id = "nexus-adapter-patient-now-emr"`
- `version = "0.1.0"`
- `platform = "patient-now-emr"`

## Validation Bar

The package/install slice is complete when:

1. the repo emits `dist/nexus-adapter-patient-now-emr-0.1.0.tar.gz`
2. Nex installs that tarball through `POST /api/operator/packages/install`
3. package health reports `healthy == true`
4. runtime restart rehydrates the installed package
5. the installed package still answers `adapter.info`
