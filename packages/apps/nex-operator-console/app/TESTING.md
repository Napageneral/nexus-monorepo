# Operator Console Testing

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app
pnpm build
node ../../../../nex/dist/entry.js package validate .
./scripts/package-release.sh
```

Frontdoor publish/install validation is tracked in:

- `docs/validation/NEX_OPERATOR_CONSOLE_PACKAGE_VALIDATION_LADDER.md`
