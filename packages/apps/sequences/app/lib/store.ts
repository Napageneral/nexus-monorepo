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
