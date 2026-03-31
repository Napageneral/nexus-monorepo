# Attribution Intelligence Testing

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/apps/attribution-intelligence/app
pnpm dlx vitest run pipeline/processor.test.ts
nexus package validate .
cd /Users/tyler/nexus/home/projects/nexus/nex
./node_modules/.bin/tsx scripts/e2e/attribution-app-cleanroom-live.ts
./node_modules/.bin/tsx scripts/e2e/attribution-click-to-outcome-cleanroom-live.ts
```
