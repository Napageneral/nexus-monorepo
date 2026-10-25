# Sequences

First-party Nex app that runs approved, time-anchored email and giveaway sequences on the Nex Jobs
kernel. State lives in the app's PostgreSQL store (`storage.postgres`, schema `sequences`), reached
only through `ctx.app.store`.

Current scope (skeleton):

- `sequences.health` (read)
- job `sequences.tick` with one disabled-first schedule
- migration `0001_initial.sql` (the `health` row)

Release: the app-store migrator applies `storage/migrations` before the package is installed or
upgraded; the runtime refuses to register a release whose schema is missing or behind.
