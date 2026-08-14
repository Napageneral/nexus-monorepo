# Testing

Run:

```bash
npm test
npm run lint
npm run build
nexus package validate .
```

The cleanroom proof must show the package emits a valid `adapter.info` contract and that setup rejects credentials, extra fields, an unsafe custody reference, and any missing explicit read-only confirmation.
