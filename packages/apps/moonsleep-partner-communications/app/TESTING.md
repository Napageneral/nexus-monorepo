# Testing

Run the focused contract suite:

```bash
npm test
```

Run the dependency-free canonical preparation cleanroom:

```bash
./scripts/test-canonical-prep-cleanroom.sh
```

The canonical preparation cleanroom copies only the Partner package contracts,
fixtures, scripts, and TypeScript source into a private temporary directory.
It runs the complete Node contract suite, prepares the sanitized Surewal
cross-channel migration plan twice, requires byte-identical plans and receipts,
and verifies that provider write, identity merge, external-domain write, and
draft-or-send authority all remain false. It does not call Nex, a provider, a
database, or production.

Prepare one reviewable shadow migration plan directly:

```bash
node --experimental-strip-types scripts/prepare-canonical-migration.mjs \
  --manifest contracts/partner-canonical-profiles.v1.json \
  --fixture fixtures/canonical/surewal-cross-channel-golden.v1.json \
  --out /tmp/partner-canonical-plan.json
```

The command creates a source-only candidate plan. It does not register
profiles, create Nex elements, advance observation heads, publish projections,
or grant authority. Those operations remain blocked until the shared Wave 1
core contract is published and consumed.

The production-shaped Linux/AMD64 PostgreSQL proof is run through
`scripts/test-canonical-surewal-postgres-cleanroom.sh` after packaging the app
against an exact Nex release image. The canonical runner uses the governed app
installation API and keeps provider reads, adapter installation, live data,
promotion, and production outside the synthetic proof.

Build the immutable source-bound dormant production package after committing
and verifying a clean worktree:

```bash
npm run build:production-release
```

This emits the hash-bound archive, release manifest, and dormant-install input
under ignored `dist/`. It performs no install or production action. Validate a
later runtime readback with:

```bash
npm run verify:production-postflight -- \
  --input /path/to/readback.json \
  --out /path/to/receipt.json
```

The focused suite also creates the exact 7,986-record production corpus shape
in memory, commits one 50-record proposal batch, and proves:

- the inbox returns stable bounded pages;
- 50 records are proposed and 7,936 remain visible as unreviewed;
- the final page contains exactly 36 records;
- replay creates no second proposal record;
- overlapping batches surface as proposal conflicts;
- missing coverage and attempted reviewed model output fail before ingest.
