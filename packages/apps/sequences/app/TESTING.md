# Testing

Unit tests (from this directory, with the Nex workspace toolchain):

```bash
/Users/tyler/nexus/home/projects/nexus/nex/node_modules/.bin/vitest run
```

Validate and release the package:

```bash
nexus package validate .
nexus package release .
```

Before an install, against a throwaway PostgreSQL 17: provision `sequences_owner` and
`sequences_app`, run `node dist/postgres-app-store-migrate.js --package-dir <release root>`, then
install. The install must report the schedule disabled, `sequences.health` must return `ticks: 0`,
and one triggered tick must make it return `ticks: 1`.
