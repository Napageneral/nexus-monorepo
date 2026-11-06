import path from "node:path";
import type { AppStore, AppStoreMigrationStatus } from "./types.js";

export const MIGRATIONS_RELATIVE_DIR = "storage/migrations";

/** ctx.app.store, or a loud refusal: there is no file or SQLite fallback. */
export function requireStore(app: { store?: AppStore } | undefined): AppStore {
  const store = app?.store;
  if (!store || typeof store.query !== "function" || typeof store.transaction !== "function") {
    throw new Error(
      "sequences store is not provisioned: ctx.app.store is missing (declare storage.postgres and run the app-store migrator)",
    );
  }
  return store;
}

/**
 * Install/upgrade guard. The runtime already refuses to register a release whose schema is absent
 * or behind (store-gate.ts); the hook repeats the check so the lifecycle receipt names the store.
 */
export async function assertStoreReady(app: { packageDir: string; store?: AppStore }): Promise<AppStoreMigrationStatus> {
  const store = requireStore(app);
  if (typeof store.verifyMigrations !== "function") {
    throw new Error("sequences store cannot verify its migration ledger");
  }
  const status = await store.verifyMigrations(path.join(app.packageDir, MIGRATIONS_RELATIVE_DIR));
  if (!status.current) {
    throw new Error(
      `sequences store schema ${status.schema} is not current (applied ${status.applied}; missing ${status.missing.join(", ") || "none"}; drifted ${status.drifted.join(", ") || "none"}; unknown ${status.unknown.join(", ") || "none"})`,
    );
  }
  return status;
}

/**
 * A transaction, NOT exclusive by default: the store's default takes one schema-wide advisory lock
 * that serializes every writer. Only the ledger and drawing writes ask for `exclusive: true`.
 */
export function tx<T>(store: AppStore, fn: (q: AppStore) => Promise<T>, options: { exclusive?: boolean } = {}): Promise<T> {
  return store.transaction(fn, { exclusive: options.exclusive ?? false });
}

export type EventInput = {
  series_id?: string | null;
  step_instance_id?: string | null;
  actor: string;
  event: string;
  detail?: Record<string, unknown>;
};

/** step_events is append-only by grant; every page action and engine decision is one row. */
export async function appendEvent(q: AppStore, input: EventInput): Promise<void> {
  await q.query("INSERT INTO step_events (series_id, step_instance_id, actor, event, detail) VALUES ($1, $2, $3, $4, $5::jsonb)", [
    input.series_id ?? null,
    input.step_instance_id ?? null,
    input.actor,
    input.event,
    JSON.stringify(input.detail ?? {}),
  ]);
}

/** int8 and numeric arrive as text; timestamps as Date. Normalize for JSON. */
export function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function dateOnly(value: unknown): string {
  if (value instanceof Date) {
    // DATE columns come back as local-midnight Dates from node-postgres; read the calendar day.
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  return String(value).slice(0, 10);
}

export function jsonOf<T = Record<string, unknown>>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}
