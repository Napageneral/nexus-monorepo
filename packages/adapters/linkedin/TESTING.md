# LinkedIn Testing

1. `pnpm test`
2. `pnpm build`
3. `./scripts/package-release.sh`

Green bar:

- archive exists under `dist/`
- archive contains `adapter.nexus.json`
- archive contains `dist/`
- archive contains `node_modules/`

Consumer SDKs are generated centrally from `api/openapi.yaml`; there is no package-local SDK generation step.
