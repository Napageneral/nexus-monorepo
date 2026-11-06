// The slice of the Nex app SDK this package uses, as defined on nex origin/main:
// src/runtime/domains/apps/context.ts (method and hook contexts), src/api/server-work.ts
// (JobScriptContext), src/runtime/domains/apps/store.ts (NexAppStore) and src/storage/work.ts
// (JobAttemptAuthority). Declared locally because the monorepo's pinned nex submodule predates
// ctx.app.store (nex#783, 2026-09-07). Nothing here is a value import: the release bundles only the
// method handler, and hooks and job scripts load from disk, so a runtime dependency would not resolve.

export interface AppStoreQueryResult<R> {
  rows: R[];
  rowCount: number;
  fields: Array<{ name: string; dataTypeID: number }>;
}

export interface AppStoreMigrationStatus {
  schema: string;
  current: boolean;
  applied: number;
  missing: string[];
  drifted: string[];
  unknown: string[];
}

export interface AppStore {
  readonly schema: string;
  readonly inTransaction: boolean;
  query<R = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<AppStoreQueryResult<R>>;
  // Exclusive by default: one schema-wide advisory lock serializes every exclusive transaction.
  transaction<T>(fn: (tx: AppStore) => Promise<T>, options?: { exclusive?: boolean }): Promise<T>;
  verifyMigrations?(migrationsDir: string): Promise<AppStoreMigrationStatus>;
}

// A namespaced proxy: ctx.nex.jobs.list(params) calls the runtime method "jobs.list". Methods and
// hooks get the bare payload back; module-script jobs get { payload } (createJobNexClient).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NexClient = any;

export interface AppInfo {
  id: string;
  version: string;
  dataDir: string;
  packageDir: string;
  store?: AppStore;
}

export interface MethodContext {
  params: Record<string, unknown>;
  // user.email is always "" and userId is the caller's auth entity (an ops token when the ops API
  // calls), so a person's identity travels in params and is never inferred from here.
  user: { userId: string; email: string; displayName: string; role: string; accountId: string };
  app: AppInfo & { config: Record<string, unknown> };
  nex: NexClient;
  invoke: <T = unknown>(method: string, params: Record<string, unknown>) => Promise<T>;
}

export interface HookContext {
  abortSignal: AbortSignal;
  app: AppInfo & { config: Record<string, unknown> };
  nex: NexClient;
  invoke: <T = unknown>(method: string, params: Record<string, unknown>) => Promise<T>;
}

export interface JobAttemptAuthority {
  run_id: string;
  queue_entry_id: string;
  attempt_id: string;
  fencing_token: number;
}

export interface JobContext {
  job: { id: string; name: string; description: string | null; config: Record<string, unknown> };
  app?: AppInfo;
  run: { id: string; trigger_source: string | null; created_at: string };
  execution?: {
    job_revision_id: string;
    execution_profile_revision_id: string | null;
    worker_generation: string;
    authority: JobAttemptAuthority;
    cancellation_grace_ms?: number;
    wall_clock_timeout_ms?: number;
  };
  input: Record<string, unknown>;
  nex: NexClient;
  abortSignal: AbortSignal;
  log: { info(message: string): void; warn(message: string): void; error(message: string): void };
  now: Date;
}
