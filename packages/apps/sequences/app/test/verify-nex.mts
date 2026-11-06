// Verifies the Sequences app against nex origin/main's own manifest validator, method loader,
// app-store migrator, store handle and handler precompile, on a throwaway PostgreSQL 17 with
// PRODUCTION role shapes: the migrator login holds sequences_owner only (the finance provisioning
// pattern), the runtime login holds sequences_app only. Settles build manual §8 R-1.
//
//   node <jiti>/lib/jiti-cli.mjs test/verify-nex.mts <nex src dir> <app dir> <superuser dsn>
//
// <nex src dir> holds manifest.ts, method-loader.ts, store-migrations.ts, store.ts and
// precompile-app-handler.ts from nex origin/main (with node_modules for pg, jiti, rolldown).
// Prints one JSON report; exits 1 if any check failed. The roles and schema are dropped after.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

const [NEXSRC, APP, DSN] = process.argv.slice(2);
if (!NEXSRC || !APP || !DSN) throw new Error("usage: verify-nex.mts <nex src dir> <app dir> <superuser dsn>");
const out: Record<string, unknown> = {};
const failed: Array<{ label: string; detail: unknown }> = [];
const check = (label: string, ok: boolean, detail: unknown) => {
  out[label] = detail;
  if (!ok) failed.push({ label, detail });
};

const { parseManifest, validateManifest } = await import(`${NEXSRC}/manifest.ts`);
const migrations = await import(`${NEXSRC}/store-migrations.ts`);
const storeModule = await import(`${NEXSRC}/store.ts`);
const { loadMethodHandlers } = await import(`${NEXSRC}/method-loader.ts`);
const { precompileAppHandler } = await import(`${NEXSRC}/precompile-app-handler.ts`);

// 1. Manifest validation exactly as the runtime and `nexus package validate` run it.
const manifest = parseManifest(path.join(APP, "app.nexus.json"));
const validation = validateManifest(manifest, APP);
check("manifest_validation", validation.errors.length === 0, { errors: validation.errors, warnings: validation.warnings });

// 2. package-kit required artifacts (packages/package-kit/src/shared.ts:116-144).
const required = ["README.md", "TESTING.md", "docs/specs", "docs/workplans", "docs/validation", "api/openapi.yaml", "api/openapi.lock.json", "scripts/package-release.sh", "SKILL.md"];
const missing = required.filter((rel) => !fs.existsSync(path.join(APP, rel)));
check("missing_artifacts", missing.length === 0, missing);

// 3. Method loader (namespace + declared-method rules): every P1b method loads.
const loaded = await loadMethodHandlers(manifest, APP);
const declared = Object.keys(manifest.methods ?? {}).sort();
const loadedNames = [...loaded.handlers.keys()].sort();
check("loaded_methods", JSON.stringify(loadedNames) === JSON.stringify(declared) && loadedNames.length === 16, loadedNames);

// 4. Zero runtime npm dependencies: no value import of a bare package anywhere the release runs.
const sourceFiles: string[] = [];
const walk = (dir: string) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "test", "dist", "docs"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) sourceFiles.push(full);
  }
};
walk(APP);
const bare: string[] = [];
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)) {
    const spec = match[1]!;
    if (!spec.startsWith(".") && !spec.startsWith("node:")) bare.push(`${path.relative(APP, file)}: ${spec}`);
  }
}
check("bare_value_imports", bare.length === 0, { files_scanned: sourceFiles.length, bare });

// 5. Production role shapes.
const admin = new pg.Pool({ connectionString: DSN, max: 2 });
const dbName = (await admin.query("SELECT current_database() AS d")).rows[0].d as string;
const asUser = (user: string) => {
  const url = new URL(DSN);
  url.username = user;
  url.password = "";
  return url.toString();
};
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const MIGRATOR = "seqv_migrator";
const RUNTIME = "seqv_runtime";
async function dropAll() {
  await admin.query("DROP SCHEMA IF EXISTS sequences CASCADE");
  for (const role of [MIGRATOR, RUNTIME]) {
    if ((await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role])).rowCount) {
      await admin.query(`DROP OWNED BY ${quote(role)}`);
      await admin.query(`DROP ROLE ${quote(role)}`);
    }
  }
}
await dropAll();
for (const role of ["sequences_owner", "sequences_app"]) {
  if (!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role])).rowCount) await admin.query(`CREATE ROLE ${quote(role)} NOLOGIN NOINHERIT`);
}
await admin.query(`GRANT CONNECT, CREATE, TEMPORARY ON DATABASE ${quote(dbName)} TO sequences_owner`);
await admin.query(`GRANT CONNECT ON DATABASE ${quote(dbName)} TO sequences_app`);
await admin.query(`CREATE ROLE ${MIGRATOR} LOGIN NOINHERIT`);
await admin.query(`GRANT sequences_owner TO ${MIGRATOR} WITH ADMIN FALSE, INHERIT TRUE, SET TRUE`);
await admin.query(`CREATE ROLE ${RUNTIME} LOGIN NOINHERIT`);
await admin.query(`GRANT sequences_app TO ${RUNTIME} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`);
const migratorPool = new pg.Pool({ connectionString: asUser(MIGRATOR), max: 2 });
const runtimePool = new pg.Pool({ connectionString: asUser(RUNTIME), max: 4 });
const migrationsDir = path.join(APP, "storage/migrations");
try {
  out.migration_files = migrations.listAppStoreMigrations(migrationsDir).map((f: { filename: string; checksum: string }) => ({ filename: f.filename, sha256: f.checksum }));
  const store = storeModule.createAppStore({ pool: runtimePool, schema: "sequences" });
  const before = await store.verifyMigrations(migrationsDir).catch((error: Error) => ({ error: error.message }));
  out.status_before_migrator = before;

  // 6. The migrator exactly as scripts/postgres-app-store-migrate.ts runs it: apply as the
  //    migrator login, then verify through createAppStore (which pins SET ROLE sequences_app).
  const first = await migrations.applyAppStoreMigrations({ pool: migratorPool, schema: "sequences", migrationsDir });
  let verifyOwnerOnly: unknown;
  try {
    verifyOwnerOnly = { current: (await migrations.verifyAppStoreMigrations(storeModule.createAppStore({ pool: migratorPool, schema: "sequences" }), migrationsDir)).current };
  } catch (error) {
    verifyOwnerOnly = { error: (error as Error).message };
  }
  // §8 R-1's fix: the migrator also holds sequences_app, SET only (it never inherits its rights).
  await admin.query(`GRANT sequences_app TO ${MIGRATOR} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`);
  const freshMigrator = new pg.Pool({ connectionString: asUser(MIGRATOR), max: 2 });
  const verifyWithApp = await migrations.verifyAppStoreMigrations(storeModule.createAppStore({ pool: freshMigrator, schema: "sequences" }), migrationsDir);
  const second = await migrations.applyAppStoreMigrations({ pool: freshMigrator, schema: "sequences", migrationsDir });
  await freshMigrator.end();
  out.r1_migrator_verify = { owner_only: verifyOwnerOnly, with_app_set_only: { current: verifyWithApp.current } };
  check("migrator", first.applied.length === 1 && second.applied.length === 0 && verifyWithApp.current, { first: { created: first.created, applied: first.applied }, second: { applied: second.applied, alreadyApplied: second.alreadyApplied } });
  const after = await store.verifyMigrations(migrationsDir);
  check("status_after_migrator_as_runtime", after.current, { current: after.current, applied: after.applied });

  // 7. Lifecycle through the real store and a recording nex: install = onInstall + onActivate.
  const jobs: Array<Record<string, unknown>> = [];
  const schedules: Array<Record<string, unknown>> = [];
  const nexCalls: string[] = [];
  const nex = {
    jobs: {
      list: async ({ offset }: { offset: number }) => ({ jobs: jobs.slice(offset, offset + 1000) }),
      create: async (p: Record<string, unknown>) => { nexCalls.push(`jobs.create:${String(p.name)}`); const job = { id: `jobdef_${jobs.length + 1}`, default_revision_id: `rev_${jobs.length + 1}`, ...p }; jobs.push(job); return { job }; },
      update: async (p: Record<string, unknown>) => { nexCalls.push(`jobs.update:${String(p.status ?? "fields")}`); Object.assign(jobs.find((j) => j.id === p.id)!, p); return { job: p }; },
    },
    schedules: {
      list: async ({ offset }: { offset: number }) => ({ schedules: schedules.slice(offset, offset + 1000) }),
      create: async (p: Record<string, unknown>) => { nexCalls.push("schedules.create"); const s = { id: `schedule_${schedules.length + 1}`, ...p, enabled: p.enabled ? 1 : 0 }; schedules.push(s); return { schedule: s }; },
      update: async (p: Record<string, unknown>) => { nexCalls.push(`schedules.update:${"enabled" in p ? `enabled=${String(p.enabled)}` : "cadence"}`); Object.assign(schedules.find((s) => s.id === p.id)!, p, "enabled" in p ? { enabled: p.enabled ? 1 : 0 } : {}); return { schedule: p }; },
    },
  };
  const appInfo = { id: "sequences", version: manifest.version, dataDir: os.tmpdir(), packageDir: APP, config: {}, store };
  const hookCtx = { abortSignal: new AbortController().signal, app: appInfo, nex, invoke: async () => { throw new Error("no invoke"); } };
  const hook = async (name: string) => (await import(`${APP}/hooks/${name}.ts`)).default(hookCtx);
  await hook("install");
  await hook("activate");
  const runtimeJobs = (await store.query("SELECT name FROM runtime_jobs ORDER BY name")).rows.map((row: { name: string }) => row.name);
  check("after_install", jobs.length === 6 && schedules.length === 1 && schedules[0]!.enabled === 0 && runtimeJobs.length === 6, {
    jobs: jobs.map((job) => ({ name: job.name, status: job.status, lane_id: job.lane_id, profile: job.execution_profile_revision_id, allowlist: job.runtime_method_allowlist })),
    schedule: { name: schedules[0]?.name, expression: schedules[0]?.expression, enabled: schedules[0]?.enabled },
    runtime_jobs: runtimeJobs,
  });
  schedules[0]!.enabled = 1; // what sequences.runtime.configure apply sets
  nexCalls.length = 0;
  await hook("deactivate");
  await hook("upgrade");
  await hook("activate");
  check("after_upgrade", schedules[0]!.enabled === 1 && jobs.length === 6 && schedules.length === 1 && !nexCalls.some((call) => call.startsWith("schedules.update:enabled")), { nexCalls, schedule_enabled: schedules[0]!.enabled, job_count: jobs.length });

  // 8. Methods, the tick job and a refused requeue, all through the runtime login's pinned store.
  const synthetic = await import(`${APP}/test/synthetic.ts`);
  const fake = await import(`${APP}/test/fake-runtime.ts`);
  const runtime = fake.fakeRuntime();
  const methodCtx = (params: Record<string, unknown>) => ({ params, user: { userId: "entity_moonsleep_ops", email: "", displayName: "", role: "operator", accountId: "" }, app: { ...appInfo, service: () => { throw new Error("no service"); } }, nex: runtime.nexFor("method", false), invoke: hookCtx.invoke });
  const call = (name: string, params: Record<string, unknown> = {}) => loaded.handlers.get(name)!(methodCtx(params));
  const healthBefore = await call("sequences.health");
  const bundle = synthetic.syntheticBundle();
  const preview = await call("sequences.series.import", { bundle, mode: "preview", by: "claude@tyler-mac#verify" });
  const applied = await call("sequences.series.import", { bundle, mode: "apply", preview_token: preview.apply?.token, by: "claude@tyler-mac#verify" });
  const brief = await call("sequences.brief.get", { series: "review-giveaway-2026-10" });
  for (const row of jobs) await store.query("UPDATE runtime_jobs SET job_id = $2 WHERE name = $1", [row.name, runtime.jobs.find((job: { name: string }) => job.name === row.name)!.id]);
  const tick = (await import(`${APP}/jobs/tick.ts`)).default;
  const now = new Date();
  const tickResult = await tick({ job: { id: "jobdef_1", name: "sequences.tick", description: null, config: {} }, app: appInfo, run: { id: "jobrun_verify_1", trigger_source: "schedule", created_at: now.toISOString() }, input: {}, nex: runtime.nexFor("jobrun_verify_1"), abortSignal: new AbortController().signal, log: console, now });
  const step = (await import(`${APP}/jobs/step.ts`)).default;
  const requeued = await step({ job: { id: "jobdef_2", name: "sequences.step", description: null, config: {} }, app: appInfo, run: { id: "jobrun_verify_2", trigger_source: "requeue", created_at: now.toISOString() }, input: {}, nex: runtime.nexFor("jobrun_verify_2"), abortSignal: new AbortController().signal, log: console, now });
  const healthAfter = await call("sequences.health");
  check("method_job", healthBefore.ticks === 0 && preview.exit === 0 && applied.ok === true && brief.ok === true && tickResult.ticks === 1 && requeued.refused === "refuse.trigger_source" && healthAfter.ticks === 1, {
    healthBefore: { ticks: healthBefore.ticks, contract_id: healthBefore.contract_id },
    import: { preview_exit: preview.exit, applied_ok: applied.ok, counts: applied.data?.counts },
    brief: brief.verdict?.text,
    tick: { ticks: tickResult.ticks, series: tickResult.series, system: tickResult.system },
    requeued,
    healthAfter: { ticks: healthAfter.ticks, series: healthAfter.series },
  });

  // 9. Grants: the app role may write what the engine writes, never the append-only rows.
  const denied: Record<string, string> = {};
  for (const sql of ["DELETE FROM health", "INSERT INTO health (id) VALUES ('singleton')", "CREATE TABLE x (id int)", "UPDATE step_events SET actor = 'x'", "DELETE FROM step_events", "UPDATE winners SET source = 'x'", "DELETE FROM winners", "UPDATE definitions SET registered_by = 'x'", "DELETE FROM relays", "UPDATE import_bundles SET applied_by = 'x'"]) {
    try { await store.query(sql); denied[sql] = "ALLOWED"; } catch (error) { denied[sql] = (error as Error).message.slice(0, 80); }
  }
  check("app_role_denials", Object.values(denied).every((value) => value.startsWith("permission denied")), denied);

  // 10. Drift and a new, unapplied migration both block the gate.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "seqv-mig-"));
  fs.writeFileSync(path.join(tmp, "0001_initial.sql"), fs.readFileSync(path.join(migrationsDir, "0001_initial.sql"), "utf8") + "\n-- edited\n");
  const drifted = await store.verifyMigrations(tmp);
  fs.copyFileSync(path.join(migrationsDir, "0001_initial.sql"), path.join(tmp, "0001_initial.sql"));
  fs.writeFileSync(path.join(tmp, "0002_next.sql"), "CREATE TABLE next_table (id TEXT PRIMARY KEY);\n");
  const behind = await store.verifyMigrations(tmp);
  fs.rmSync(tmp, { recursive: true, force: true });
  check("gate", !drifted.current && drifted.drifted.length === 1 && !behind.current && behind.missing.length === 1, { drifted: { current: drifted.current, drifted: drifted.drifted }, behind: { current: behind.current, missing: behind.missing } });

  // 11. Release precompile: the TS handler bundles to dist/nex-handler.mjs, reloads, and runs with
  //     no node_modules beside it (only node: builtins stay external).
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "seqv-stage-"));
  fs.cpSync(APP, stage, { recursive: true, filter: (src) => !src.includes("node_modules") });
  const compiled = await precompileAppHandler({ sourceDir: APP, stageDir: stage, manifest });
  const stagedManifest = JSON.parse(fs.readFileSync(path.join(stage, "app.nexus.json"), "utf8"));
  const bundleText = fs.readFileSync(path.join(stage, "dist/nex-handler.mjs"), "utf8");
  const externals = [...bundleText.matchAll(/^\s*import\s[^;]*?from\s+"([^"]+)"/gm)].map((match) => match[1]!).filter((spec) => !spec.startsWith("node:"));
  const bundled = await import(pathToFileURL(path.join(stage, "dist/nex-handler.mjs")).href);
  const stagedLoaded = await loadMethodHandlers(stagedManifest, stage);
  const stagedHealth = await stagedLoaded.handlers.get("sequences.health")!({ ...methodCtx({}), app: { ...appInfo, packageDir: stage } });
  fs.rmSync(stage, { recursive: true, force: true });
  check("precompile", compiled.compiled === true && externals.length === 0 && Object.keys(bundled.default ?? {}).length === 16 && stagedLoaded.handlers.size === 16 && stagedHealth.contract_id === "sequences_health_v1", {
    compiled,
    staged_handler: stagedManifest.handler,
    bundle_bytes: bundleText.length,
    non_builtin_externals: externals,
    bundle_default_keys: Object.keys(bundled.default ?? {}).length,
    staged_loaded_methods: stagedLoaded.handlers.size,
    staged_health_ticks: stagedHealth.ticks,
  });
} finally {
  await migratorPool.end();
  await runtimePool.end();
  await dropAll();
  await admin.end();
}
out.failed = failed;
console.log(JSON.stringify(out, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
