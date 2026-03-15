# LinkedIn Adapter Validation

## Local Contract

1. `pnpm test`
2. `pnpm build`
3. `./scripts/package-release.sh`

Green bar:

- `adapter.info` prints a LinkedIn OAuth auth manifest
- declared methods include the LinkedIn read/write surface
- packaged archive exists under `dist/`
- packaged archive contains `adapter.nexus.json`
- packaged archive contains `dist/`
- packaged archive contains `node_modules/`

## Focused Behavior

1. organization resolution prefers explicit payload/target input before config
2. numeric organization ids normalize to organization URNs
3. text-only send shapes a LinkedIn text post request
4. image send shapes initialize-upload, upload, and create-post requests
5. health fails cleanly when the token is missing or invalid
6. read methods preserve raw provider payloads and canonical ids
