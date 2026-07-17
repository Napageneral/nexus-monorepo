# Testing

The required proof sequence is:

```bash
npm install
npm test
npm run lint
npm run build
nexus package validate .
./scripts/cleanroom-proof.sh
```

The cleanroom proof must show that a fresh package build emits a sanitized inbound record with source-linked attachment text, rejects incomplete snapshots, exposes no remote mutation method, and replays overlapping observations without changing the canonical external record ID.
