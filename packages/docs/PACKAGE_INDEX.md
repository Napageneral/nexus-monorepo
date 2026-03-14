# Package Index

## Layout

- `packages/apps/` - app package families
- `packages/adapters/` - adapter package families
- `packages/adapters/nexus-adapter-sdks/` - shared adapter authoring SDKs and package kit

## Package Shape Status

### Package-shaped adapters

- `apple-maps`
- `callrail`
- `confluence`
- `device-android`
- `device-headless`
- `device-ios`
- `device-macos`
- `discord`
- `git`
- `gog`
- `google`
- `jira`
- `meta-ads`
- `patient-now-emr`
- `qase`
- `slack`
- `telegram`
- `twilio`
- `whatsapp`
- `zenoti-emr`

### Shared tooling, not a package

- `nexus-adapter-sdks`

## Notes

- Some app package repos contain multiple app manifest roots.
- Adapter repos are generally single-package roots.
- Run `packages/scripts/audit-packages.py` to regenerate the live matrix.
