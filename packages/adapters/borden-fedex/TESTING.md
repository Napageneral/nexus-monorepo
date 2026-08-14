# Testing

Run:

```bash
npm test
npm run lint
npm run build
nexus package validate .
```

The cleanroom proof must show the package emits a valid `adapter.info` contract and that setup rejects credentials, extra fields, an unsafe custody reference, and any missing explicit read-only confirmation.

Production package installation uses `scripts/install-runtime-package.sh` inside a separately governed package-install activity. The script accepts an exact committed source revision and artifact digest, uploads only to a loopback Nex runtime, and writes private upload/install receipts.
