/**
 * Test-only PostgreSQL store for the sequences suite (the finance app's test/pg-store.mjs pattern).
 *
 * `SEQUENCES_TEST_DATABASE_URL` names a throwaway PostgreSQL 17. Each fixture creates one schema,
 * applies storage/migrations the way the Nex app-store migrator does (owner role, search_path
 * pinned, a ledger row per file) and hands back a store with the shape of ctx.app.store: sessions
 * pinned with SET ROLE sequences_app, reset on release, exclusive transactions through one
 * transaction-scoped advisory lock. The production roles are created once; schemas are dropped
 * when the file's tests finish. Without the variable, store suites skip (describe.runIf).
 */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { AppStore } from "../lib/types.js";

const OWNER_ROLE = "sequences_owner";
const APP_ROLE = "sequences_app";
export const MIGRATIONS_DIR = fileURLToPath(new URL("../storage/migrations/", import.meta.url));
export const DATABASE_URL = process.env.SEQUENCES_TEST_DATABASE_URL?.trim() ?? "";
export const HAS_DATABASE = DATABASE_URL.length > 0;
if (!HAS_DATABASE && !process.env.SEQUENCES_QUIET_SKIP) {
  console.warn("SEQUENCES_TEST_DATABASE_URL is unset: the store suites are SKIPPED (set it to a throwaway PostgreSQL 17)");
}

let pool: pg.Pool | null = null;
let rolesReady: Promise<void> | null = null;
const schemas = new Set<string>();

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

function getPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: DATABASE_URL, max: 8 });
  return pool;
}

async function ensureRoles(): Promise<void> {
  rolesReady ??= (async () => {
    const client = await getPool().connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext('sequences_test_roles'))");
      const login = (await client.query("SELECT current_user AS u, current_database() AS d")).rows[0] as { u: string; d: string };
      for (const role of [OWNER_ROLE, APP_ROLE]) {
        if ((await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role])).rowCount === 0) {
          await client.query(`CREATE ROLE ${quote(role)} NOLOGIN NOINHERIT`);
        }
        const member = await client.query(
          "SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid JOIN pg_roles u ON u.oid = m.member WHERE r.rolname = $1 AND u.rolname = $2",
          [role, login.u],
        );
        if (member.rowCount === 0) await client.query(`GRANT ${quote(role)} TO ${quote(login.u)}`);
      }
      const owned = (await client.query("SELECT has_database_privilege($1, $2, 'CREATE') AS ok", [OWNER_ROLE, login.d])).rows[0] as { ok: boolean };
      if (!owned.ok) {
        await client.query(`GRANT CONNECT, CREATE, TEMPORARY ON DATABASE ${quote(login.d)} TO ${quote(OWNER_ROLE)}`);
        await client.query(`GRANT CONNECT ON DATABASE ${quote(login.d)} TO ${quote(APP_ROLE)}`);
      }
      await client.query("SELECT pg_advisory_unlock(hashtext('sequences_test_roles'))");
    } finally {
      client.release();
    }
  })();
  await rolesReady;
}

export function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort()
    .map((filename) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
      return { filename, version: Number(filename.slice(0, 4)), name: filename.slice(5, -4), sql, checksum: createHash("sha256").update(sql).digest("hex") };
    });
}

export async function migrateSchema(schema: string): Promise<void> {
  await ensureRoles();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${quote(OWNER_ROLE)}`);
    await client.query(`CREATE SCHEMA ${quote(schema)}`);
    await client.query(`GRANT USAGE ON SCHEMA ${quote(schema)} TO ${quote(APP_ROLE)}`);
    await client.query(`CREATE TABLE ${quote(schema)}.schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await client.query(`GRANT SELECT ON ${quote(schema)}.schema_migrations TO ${quote(APP_ROLE)}`);
    await client.query("COMMIT");
    for (const migration of listMigrations()) {
      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE ${quote(OWNER_ROLE)}`);
      await client.query(`SET LOCAL search_path = ${quote(schema)}, pg_catalog`);
      await client.query(migration.sql);
      await client.query(`INSERT INTO ${quote(schema)}.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)`, [migration.version, migration.name, migration.checksum]);
      await client.query("COMMIT");
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** The shape of ctx.app.store (Nex src/runtime/domains/apps/store.ts), over the test pool. */
export function createAppStore(schema: string): AppStore {
  const pin = `SET ROLE ${quote(APP_ROLE)}; SET search_path = ${quote(schema)}, pg_catalog; SET statement_timeout = 30000; SET lock_timeout = 5000`;
  const reset = "RESET ROLE; RESET search_path; RESET statement_timeout; RESET lock_timeout";
  async function lease() {
    const client = await getPool().connect();
    try {
      await client.query(pin);
    } catch (error) {
      client.release(true);
      throw error;
    }
    return {
      client,
      release: (destroy = false) => {
        if (destroy) return client.release(true);
        client.query(reset).then(() => client.release(), () => client.release(true));
      },
    };
  }
  const shape = (result: pg.QueryResult) => ({
    rows: result.rows,
    rowCount: result.rowCount ?? 0,
    fields: result.fields.map((field) => ({ name: field.name, dataTypeID: field.dataTypeID })),
  });
  function bind(client: pg.PoolClient): AppStore {
    const bound: AppStore = {
      schema,
      inTransaction: true,
      query: async (text, values = []) => shape(await client.query(text, [...values])) as never,
      transaction: (fn) => fn(bound),
    };
    return bound;
  }
  return {
    schema,
    inTransaction: false,
    async query(text, values = []) {
      const session = await lease();
      try {
        const result = shape(await session.client.query(text, [...values]));
        session.release();
        return result as never;
      } catch (error) {
        session.release(true);
        throw error;
      }
    },
    async transaction(fn, options) {
      const session = await lease();
      const { client } = session;
      let began = false;
      try {
        await client.query("BEGIN");
        began = true;
        if (options?.exclusive !== false) await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [schema]);
        const result = await fn(bind(client));
        await client.query("COMMIT");
        session.release();
        return result;
      } catch (error) {
        if (began) await client.query("ROLLBACK").then(() => session.release(), () => session.release(true));
        else session.release(true);
        throw error;
      }
    },
  };
}

export async function fixture(label = "seqt"): Promise<{ schema: string; store: AppStore; app: { id: string; version: string; dataDir: string; packageDir: string; config: Record<string, unknown>; store: AppStore } }> {
  const schema = `${label}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  await migrateSchema(schema);
  schemas.add(schema);
  const store = createAppStore(schema);
  const packageDir = fileURLToPath(new URL("..", import.meta.url));
  return { schema, store, app: { id: "sequences", version: "0.1.0", dataDir: "/nonexistent", packageDir, config: {}, store } };
}

/** Superuser access for assertions the app role is denied. */
export async function adminQuery(text: string, values: unknown[] = []) {
  return getPool().query(text, values);
}

export async function cleanup(): Promise<void> {
  if (!pool) return;
  for (const schema of schemas) await pool.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`).catch(() => {});
  schemas.clear();
  await pool.end();
  pool = null;
  rolesReady = null;
}
