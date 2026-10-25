-- sequences 0001_initial. Applied once by the Nex app-store migrator
-- (scripts/postgres-app-store-migrate.ts) as sequences_owner, inside one transaction, with
-- search_path pinned to the sequences schema, so names are unqualified. The migrator records the
-- file's SHA-256 in sequences.schema_migrations: never edit this file after it is applied; add 0002.
-- Grants to sequences_app mirror the permission-contract capability for this store.

CREATE TABLE health (
  id TEXT PRIMARY KEY CHECK (id = 'singleton'),
  last_tick_at TIMESTAMPTZ,
  last_tick_run_id TEXT,
  ticks BIGINT NOT NULL DEFAULT 0
);

INSERT INTO health (id) VALUES ('singleton');

GRANT SELECT, UPDATE ON health TO sequences_app;
