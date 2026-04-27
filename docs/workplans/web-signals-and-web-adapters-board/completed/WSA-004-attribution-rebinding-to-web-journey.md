# WSA-004 - Attribution Rebinding To Web Journey

## Outcome

Completed as a hard cut in the `attribution` app from the old hybrid middle
funnel to `web-journey` plus `web_installation_id`.

## Validation

- `pnpm dlx vitest run pipeline/processor.test.ts storage/store.test.ts`
- `nexus package validate .`
