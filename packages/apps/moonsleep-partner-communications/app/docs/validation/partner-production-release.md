# Partner Desk dormant production upgrade

This source slice seals the `0.3.2` production-shaped Partner Desk package without
activating source ingestion, model work, live backfill, canonical promotion,
provider writes, drafts, sends, payments, or other domain writes.

## Canonical seams

- Build and validate the package through `nexus package validate` and
  `nexus package release`.
- Stage the exact hash-bound archive into a new runtime-owned release
  directory.
- Upgrade the extracted app through `POST /api/apps/upgrade` with `appId`,
  `targetVersion`, and `packageRef`.
- Read the package through `moonsleep-partner-desk.healthcheck`.
- Retain the installed `0.3.1` release and roll back through
  `POST /api/apps/upgrade` using its exact package directory.

The deleted predecessor full-PostgreSQL Alibaba installer is not part of this
release and must not be restored.

## Expected installed state

The app registry reports version `0.3.2` active because the lifecycle upgrade
completed. Domain processing remains dormant:

- one Partner-owned job is inactive;
- two Partner-owned subscriptions are disabled;
- five fact profiles and three observation profiles are registered;
- three package-owned set profiles are declared;
- canonical promotion remains disabled;
- no records, revisions, identities, facts, observations, sealed sets,
  projections, runs, queue rows, adapter instances, or provider calls are
  created.

Profile registrations are immutable definitions. The upgrade replays them
idempotently with zero registry delta. Rollback restores the retained dormant
`0.3.1` app, one inactive job, and two disabled subscriptions.

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
3. the exact dormant-upgrade input bound to the manifest, archive digest, and
   retained `0.3.1` rollback.

Postflight validation is read-only:

```bash
npm run verify:production-postflight -- \
  --input /path/to/readback.json \
  --out /path/to/receipt.json
```

The verifier rejects provider calls, enabled subscriptions, evidence-state
writes, queue work, adapter instances, promotion, or any authority expansion.
