# Partner Desk dormant production release

This source slice seals the first production-shaped Partner Desk package without
activating source ingestion, model work, live backfill, canonical promotion,
provider writes, drafts, sends, payments, or other domain writes.

## Canonical seams

- Build and validate the package through `nexus package validate` and
  `nexus package release`.
- Stage the exact hash-bound archive into a new runtime-owned release
  directory.
- Install the extracted app through `POST /api/apps/install` with only
  `appId` and `packageRef`.
- Read the package through `moonsleep-partner-desk.healthcheck`.
- Roll back a failed first dormant install through `POST /api/apps/uninstall`.

The deleted predecessor full-PostgreSQL Alibaba installer is not part of this
release and must not be restored.

## Expected installed state

The app registry reports version `0.3.1` active because lifecycle installation
completed. Domain processing remains dormant:

- one Partner-owned job is inactive;
- two Partner-owned subscriptions are disabled;
- five fact profiles and three observation profiles are registered;
- three package-owned set profiles are declared;
- canonical promotion remains disabled;
- no records, revisions, identities, facts, observations, sealed sets,
  projections, runs, queue rows, adapter instances, or provider calls are
  created.

Profile registrations are immutable definitions. A first-install rollback may
leave the eight exact profile registrations while removing the app, owned job,
and owned subscriptions. This is declared residue, not hidden live activation.

## Source-only proof

Run:

```bash
npm test
npm run test:canonical-prep
npm run build:production-release
```

The final command requires a clean committed source tree and the exact governed
Nex submodule. It writes three ignored mode-0600 artifacts under `dist/`:

1. the package archive;
2. its canonical immutable release manifest;
3. the exact dormant-install input bound to the manifest and archive digest.

Postflight validation is read-only:

```bash
npm run verify:production-postflight -- \
  --input /path/to/readback.json \
  --out /path/to/receipt.json
```

The verifier rejects provider calls, enabled subscriptions, evidence-state
writes, queue work, adapter instances, promotion, or any authority expansion.
