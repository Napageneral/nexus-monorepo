# Testing

Run the focused contract suite:

```bash
npm test
```

The production-shaped Linux/AMD64 PostgreSQL proof is run through
`scripts/test-full-postgres-alibaba-cleanroom.sh` after packaging the app and
Alibaba adapter against an exact Nex release image.

The focused suite also creates the exact 7,986-record production corpus shape
in memory, commits one 50-record proposal batch, and proves:

- the inbox returns stable bounded pages;
- 50 records are proposed and 7,936 remain visible as unreviewed;
- the final page contains exactly 36 records;
- replay creates no second proposal record;
- overlapping batches surface as proposal conflicts;
- missing coverage and attempted reviewed model output fail before ingest.
