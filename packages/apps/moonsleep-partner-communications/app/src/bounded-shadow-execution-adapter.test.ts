import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "vitest";
import {
  buildReadOnlyRevisionQuery,
  executePartnerShadowAdapter,
  resolveFreshShadowMemoryPath,
  type PgClientFactory,
  type PgReadClient,
} from "./bounded-shadow-execution-adapter.ts";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "partner-pd10-adapter-"));
  roots.push(root);
  chmodSync(root, 0o700);
  const uid = process.getuid!();
  const requestPath = join(root, "request.json");
  const postgresUrlFile = join(root, "postgres-url");
  const canonicalManifestPath = join(root, "partner-canonical-profiles.v1.json");
  const shadowMemoryPath = join(root, "shadow-memory.db");
  const receiptPath = join(root, "terminal-receipt.json");
  const request = {
    request: {
      cohort_id: "PD-10-OPAQUE-ADAPTER",
      connection_id: "alibaba-connection-opaque",
      source_read_receipt_sha256: digest("source-read"),
      execution_mode: "isolated_shadow_memory",
      members: [
        {
          record_row_id: "record-one",
          revision_id: "revision-one",
          payload_sha256: digest("payload-one"),
          source_logical_record_ref: "source-one",
          source_revision_sha256: digest("source-revision-one"),
          old_projection: {
            coverage_disposition: "informational",
            reviewed_open_loop_ids: [],
            superseded_source_revision_refs: [],
            proposal_conflict_count: 0,
            missing_reason: null,
          },
          candidate_projection: {
            coverage_disposition: "needs_review",
            reviewed_open_loop_ids: [],
            superseded_source_revision_refs: [],
            proposal_conflict_count: 0,
            missing_reason: "review_required",
          },
        },
      ],
    },
  };
  writeFileSync(requestPath, `${JSON.stringify(request)}\n`, { mode: 0o600 });
  writeFileSync(postgresUrlFile, "postgresql://secret@localhost/nex\n", { mode: 0o400 });
  writeFileSync(
    canonicalManifestPath,
    readFileSync(
      "packages/apps/moonsleep-partner-communications/app/contracts/partner-canonical-profiles.v1.json",
    ),
    { mode: 0o400 },
  );
  chmodSync(requestPath, 0o600);
  chmodSync(postgresUrlFile, 0o400);
  chmodSync(canonicalManifestPath, 0o400);
  const pgRow = {
    id: "revision-one",
    record_row_id: "record-one",
    payload_sha256: digest("payload-one"),
    connection_id: "alibaba-connection-opaque",
    platform: "alibaba",
    source_record_type: "alibaba_message",
    source_timestamp: 1_785_000_000_000,
    observed_at: 1_785_000_001_000,
    authority_declaration_json: JSON.stringify({
      provider_read_authority: true,
      provider_write_authority: false,
      source_mutation_authority: false,
      financial_mutation_authority: false,
    }),
  };
  return {
    root,
    uid,
    requestPath,
    postgresUrlFile,
    canonicalManifestPath,
    shadowMemoryPath,
    receiptPath,
    request,
    pgRow,
  };
}

function fakePg(
  revisions: Array<Record<string, unknown>>,
): {
  factory: PgClientFactory;
  trace: {
    connected: boolean;
    ended: boolean;
    dsn: string | null;
    runtimeModuleRoot: string | null;
    queries: Array<{ text: string; values?: unknown[] }>;
  };
} {
  const trace = {
    connected: false,
    ended: false,
    dsn: null as string | null,
    runtimeModuleRoot: null as string | null,
    queries: [] as Array<{ text: string; values?: unknown[] }>,
  };
  return {
    trace,
    factory(dsn, runtimeModuleRoot) {
      trace.dsn = dsn;
      trace.runtimeModuleRoot = runtimeModuleRoot;
      return {
        async connect() {
          trace.connected = true;
        },
        async query(text, values) {
          trace.queries.push({ text, values });
          return text.startsWith("SELECT json_build_object")
            ? { rows: revisions.map((revision) => ({ revision })) }
            : { rows: [] };
        },
        async end() {
          trace.ended = true;
        },
      };
    },
  };
}

test("executes one read-only snapshot into a fresh isolated memory DB and sealed receipt", async () => {
  const input = fixture();
  const pg = fakePg([input.pgRow]);
  const receipt = await executePartnerShadowAdapter({
    requestPath: input.requestPath,
    postgresUrlFile: input.postgresUrlFile,
    postgresSchema: "nex_core",
    canonicalManifestPath: input.canonicalManifestPath,
    shadowMemoryPath: input.shadowMemoryPath,
    receiptPath: input.receiptPath,
    expectedOwnerUid: input.uid,
    runtimeModuleRoot: input.root,
    pgClientFactory: pg.factory,
  });

  assert.equal(receipt.member_count, 1);
  assert.equal(receipt.replay_stable, true);
  assert.equal(receipt.first_pass.facts_created, 1);
  assert.equal(receipt.second_pass.facts_reused, 1);
  assert.equal(receipt.second_pass.outbox_additions, 0);
  assert.equal(receipt.authority.provider_calls, 0);
  assert.equal(receipt.authority.active_projection_writes, 0);
  assert.equal(lstatSync(input.shadowMemoryPath).mode & 0o777, 0o600);
  assert.equal(lstatSync(input.receiptPath).mode & 0o777, 0o400);
  assert.deepEqual(JSON.parse(readFileSync(input.receiptPath, "utf8")), receipt);
  assert.equal(pg.trace.connected, true);
  assert.equal(pg.trace.ended, true);
  assert.equal(pg.trace.dsn, "postgresql://secret@localhost/nex");
  assert.equal(pg.trace.runtimeModuleRoot, input.root);
  assert.deepEqual(
    pg.trace.queries.map((query) => query.text.split("\n")[0]),
    [
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      "SET LOCAL statement_timeout = '15s'",
      "SELECT json_build_object(",
      "COMMIT",
    ],
  );
  const select = pg.trace.queries[2]!;
  assert.match(select.text, /"nex_core"\."record_revisions"/);
  assert.match(select.text, /id = ANY\(\$1::text\[\]\)/);
  assert.deepEqual(select.values, [["revision-one"]]);
  assert.doesNotMatch(
    pg.trace.queries.map((query) => query.text).join("\n"),
    /secret|postgresql:/,
  );
});

test("hard-bans active memory, symlink custody, existing shadow state, and open receipt reuse", async () => {
  const input = fixture();
  assert.throws(
    () =>
      resolveFreshShadowMemoryPath(
        join(input.root, "state", "data", "memory.db"),
        input.uid,
      ),
    /active production memory path is prohibited/,
  );
  writeFileSync(input.shadowMemoryPath, "occupied", { mode: 0o600 });
  assert.throws(
    () => resolveFreshShadowMemoryPath(input.shadowMemoryPath, input.uid),
    /must not already exist/,
  );
  rmSync(input.shadowMemoryPath);
  const realRequest = join(input.root, "real-request.json");
  writeFileSync(realRequest, readFileSync(input.requestPath), { mode: 0o600 });
  rmSync(input.requestPath);
  symlinkSync(realRequest, input.requestPath);
  await assert.rejects(
    executePartnerShadowAdapter({
      requestPath: input.requestPath,
      postgresUrlFile: input.postgresUrlFile,
      postgresSchema: "nex_core",
      canonicalManifestPath: input.canonicalManifestPath,
      shadowMemoryPath: input.shadowMemoryPath,
      receiptPath: input.receiptPath,
      expectedOwnerUid: input.uid,
      runtimeModuleRoot: input.root,
      pgClientFactory: fakePg([]).factory,
    }),
    /regular non-symlink file/,
  );
});

test("rejects custody drift, unsafe schema or revision ids, and incomplete PostgreSQL coverage", async () => {
  const input = fixture();
  chmodSync(input.requestPath, 0o640);
  await assert.rejects(
    executePartnerShadowAdapter({
      requestPath: input.requestPath,
      postgresUrlFile: input.postgresUrlFile,
      postgresSchema: "nex_core",
      canonicalManifestPath: input.canonicalManifestPath,
      shadowMemoryPath: input.shadowMemoryPath,
      receiptPath: input.receiptPath,
      expectedOwnerUid: input.uid,
      runtimeModuleRoot: input.root,
      pgClientFactory: fakePg([]).factory,
    }),
    /exact mode 600/,
  );
  chmodSync(input.requestPath, 0o600);
  assert.throws(
    () => buildReadOnlyRevisionQuery("nex_core;DROP"),
    /schema is invalid/,
  );
  input.request.request.members[0].revision_id = "revision'one";
  writeFileSync(input.requestPath, `${JSON.stringify(input.request)}\n`);
  chmodSync(input.requestPath, 0o600);
  await assert.rejects(
    executePartnerShadowAdapter({
      requestPath: input.requestPath,
      postgresUrlFile: input.postgresUrlFile,
      postgresSchema: "nex_core",
      canonicalManifestPath: input.canonicalManifestPath,
      shadowMemoryPath: input.shadowMemoryPath,
      receiptPath: input.receiptPath,
      expectedOwnerUid: input.uid,
      runtimeModuleRoot: input.root,
      pgClientFactory: fakePg([]).factory,
    }),
    /safe exact revision id/,
  );
  input.request.request.members[0].revision_id = "revision-one";
  writeFileSync(input.requestPath, `${JSON.stringify(input.request)}\n`);
  chmodSync(input.requestPath, 0o600);
  await assert.rejects(
    executePartnerShadowAdapter({
      requestPath: input.requestPath,
      postgresUrlFile: input.postgresUrlFile,
      postgresSchema: "nex_core",
      canonicalManifestPath: input.canonicalManifestPath,
      shadowMemoryPath: input.shadowMemoryPath,
      receiptPath: input.receiptPath,
      expectedOwnerUid: input.uid,
      runtimeModuleRoot: input.root,
      pgClientFactory: fakePg([]).factory,
    }),
    /does not exactly cover/,
  );
});

test("cleans isolated files after tuple or authority failure and never leaks DSN to query text", async () => {
  const input = fixture();
  const unsafe = {
    ...input.pgRow,
    authority_declaration_json: JSON.stringify({
      provider_write_authority: true,
      source_mutation_authority: false,
      financial_mutation_authority: false,
    }),
  };
  const pg = fakePg([unsafe]);
  await assert.rejects(
    executePartnerShadowAdapter({
      requestPath: input.requestPath,
      postgresUrlFile: input.postgresUrlFile,
      postgresSchema: "nex_core",
      canonicalManifestPath: input.canonicalManifestPath,
      shadowMemoryPath: input.shadowMemoryPath,
      receiptPath: input.receiptPath,
      expectedOwnerUid: input.uid,
      runtimeModuleRoot: input.root,
      pgClientFactory: pg.factory,
    }),
    /provider_write_authority must remain false/,
  );
  assert.equal(exists(input.shadowMemoryPath), false);
  assert.equal(exists(input.receiptPath), false);
  assert.equal(pg.trace.ended, true);
  assert.doesNotMatch(
    pg.trace.queries.map((query) => query.text).join("\n"),
    /postgresql:|secret/,
  );
});

test("rolls back and closes the native pg client when the exact read fails", async () => {
  const input = fixture();
  const queries: string[] = [];
  let ended = false;
  const client: PgReadClient = {
    async connect() {},
    async query(text) {
      queries.push(text);
      if (text.startsWith("SELECT json_build_object")) {
        throw new Error("synthetic read failure containing postgresql://secret");
      }
      return { rows: [] };
    },
    async end() {
      ended = true;
    },
  };
  await assert.rejects(
    executePartnerShadowAdapter({
      requestPath: input.requestPath,
      postgresUrlFile: input.postgresUrlFile,
      postgresSchema: "nex_core",
      canonicalManifestPath: input.canonicalManifestPath,
      shadowMemoryPath: input.shadowMemoryPath,
      receiptPath: input.receiptPath,
      expectedOwnerUid: input.uid,
      runtimeModuleRoot: input.root,
      pgClientFactory: () => client,
    }),
    (error: unknown) => {
      assert.equal(
        error instanceof Error ? error.message : "",
        "read-only PostgreSQL revision query failed",
      );
      return true;
    },
  );
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.equal(ended, true);
  assert.equal(exists(input.shadowMemoryPath), false);
  assert.equal(exists(input.receiptPath), false);
});

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
