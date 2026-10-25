# Testing

From this directory, with the Nex workspace toolchain (the app has no dependencies of its own;
`node_modules/vitest` and `node_modules/pg` are local, gitignored links into the Nex pnpm store,
never an install):

```bash
VITEST=/Users/tyler/nexus/home/projects/nexus/nex/node_modules/.pnpm/vitest@4.0.18_@opentelemetry+api@1.9.0_@types+node@25.2.2_@vitest+browser-playwright@4._10f8b3feff3e5449e85c9de8cb421e05/node_modules/vitest
mkdir -p node_modules && ln -sfn "$VITEST" node_modules/vitest
ln -sfn /Users/tyler/nexus/home/projects/nexus/nex/node_modules/.pnpm/pg@8.22.0/node_modules/pg node_modules/pg

# unit tests (store suites skip without a database)
node node_modules/vitest/vitest.mjs run

# everything, on a throwaway PostgreSQL 17 (any scratch cluster; trust auth on 127.0.0.1)
SEQUENCES_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:<port>/<db> node node_modules/vitest/vitest.mjs run
```

The store suites (`lib/import.test.ts`, `lib/engine.test.ts`, `lib/store.test.ts`, the method
suite) build one schema per fixture the migrator's way (`test/pg-store.ts`, the finance pattern)
and pin every session to `sequences_app`, so grants are tested for real.

## Replay on the real October data (T1.5)

`python3 -I scripts/sequences_import.py --dir <track dir> --all` (moonsleep-v1, no push) writes the
hashes-only bundle; then:

```bash
SEQUENCES_REPLAY_BUNDLE=<bundle path> node node_modules/vitest/vitest.mjs run lib/draw/replay.test.ts
```

It prints each drawing's V1-V10 statuses (never a hash) and must pass every drawing; the Python
oracle `scripts/sequences_replay.py` must agree.

## Verifier against nex origin/main (T1.1)

```bash
node <nex pnpm>/jiti@2.6.1/node_modules/jiti/lib/jiti-cli.mjs test/verify-nex.mts <nex src dir> "$PWD" postgres://postgres@127.0.0.1:<port>/<db>
```

`<nex src dir>` holds manifest.ts, method-loader.ts, store-migrations.ts, store.ts and
precompile-app-handler.ts from nex origin/main. With production role shapes (migrator → owner,
runtime → app) it checks: manifest 0 errors, all 16 methods load, no bare value import anywhere
the release runs, the migrator applies once and re-applies nothing, the R-1 migrator verify, the
install/upgrade hooks keep `enabled`, methods and the tick through the pinned store, the app role's
denials, drift and missing migrations block the gate, and the bundled handler runs with no
node_modules. Exit 0 only if every check passes.

## Production validation ladder

See docs/validation/README.md (build manual §4 T1-T3).
