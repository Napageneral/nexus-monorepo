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

The production canary must prove Marketing and Transactional health, a bounded
campaign list, replay-stable external record ids, no raw recipient address in
Nex, and no method whose action or authority can send or mutate customer data.
