# Validation

Run:

```bash
pnpm install --ignore-scripts
pnpm lint
pnpm test
pnpm build
```

The contract test must continue to prove that all provider methods declare
`action: read` and `mutates_remote: false`, with no send or mutation method.
