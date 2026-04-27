# Testing

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey
node --test --experimental-strip-types src/contract.test.ts sdk/core/index.test.mjs sdk/gtm/index.test.mjs sdk/shopify-bridge/index.test.mjs sdk/wix/index.test.mjs sdk/wix/snippet.test.mjs sdk/wix/profiles/devenir-aesthetics.test.mjs
npx -y --package typescript@5.9.2 tsc -p tsconfig.json --noEmit
npm run build
nexus package validate .
```
