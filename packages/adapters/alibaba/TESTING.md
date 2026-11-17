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

The cleanroom proof must show that a fresh package build:

- consumes only matching, complete, hash-bound sanitized projections
- opens each governed projection once and parses the exact bytes it verified
- preserves exact sanitized provider JSON plus its SHA-256 in opaque payload
- keeps capture-level snapshot identifiers and whole-export digests in mutable
  Nex provenance metadata, never in the immutable provider payload
- preserves one stable versioned record identity when the same provider message
  appears in a later browser capture
- emits source-linked attachment text and verifies attachment digests
- rejects incomplete, tampered, symlinked, or out-of-bound evidence
- exposes no remote mutation method
- honors exact historical `since`/`to` bounds
- replays overlapping observations without changing canonical record identity
