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
  type PsqlInvocation,
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
  writeFileSync(postgresUrlFile, "postgresql://secret@localhost/nex\n", { mode: 0o600 });
  chmodSync(requestPath, 0o600);
  chmodSync(postgresUrlFile, 0o600);
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
    shadowMemoryPath,
    receiptPath,
    request,
    pgRow,
  };
}

test("executes one read-only snapshot into a fresh isolated memory DB and sealed receipt", async () => {
  const input = fixture();
  let invocation: PsqlInvocation | null = null;
  const receipt = await executePartnerShadowAdapter({
    requestPath: input.requestPath,
    postgresUrlFile: input.postgresUrlFile,
    postgresSchema: "nex_core",
    shadowMemoryPath: input.shadowMemoryPath,
    receiptPath: input.receiptPath,
    expectedOwnerUid: input.uid,
    psqlRunner(value) {
      invocation = value;
      return {
        status: 0,
        stdout: `${JSON.stringify(input.pgRow)}\n`,
        stderr: "",
      };
    },
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
  assert.ok(invocation);
  assert.equal(invocation!.command, "psql");
  assert.doesNotMatch(invocation!.args.join(" "), /secret|postgresql:/);
  assert.equal(invocation!.env.PGDATABASE, "postgresql://secret@localhost/nex");
  assert.match(invocation!.input, /REPEATABLE READ READ ONLY/);
  assert.match(invocation!.input, /"nex_core"\."record_revisions"/);
  assert.match(invocation!.input, /'revision-one'/);
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
      shadowMemoryPath: input.shadowMemoryPath,
      receiptPath: input.receiptPath,
      expectedOwnerUid: input.uid,
      psqlRunner: () => ({ status: 0, stdout: "", stderr: "" }),
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
      shadowMemoryPath: input.shadowMemoryPath,
      receiptPath: input.receiptPath,
      expectedOwnerUid: input.uid,
      psqlRunner: () => ({ status: 0, stdout: "", stderr: "" }),
    }),
    /exact mode 600/,
  );
  chmodSync(input.requestPath, 0o600);
  assert.throws(
    () => buildReadOnlyRevisionQuery("nex_core;DROP", ["revision-one"]),
    /schema is invalid/,
  );
  assert.throws(
    () => buildReadOnlyRevisionQuery("nex_core", ["revision'one"]),
    /safe exact revision id/,
  );
  await assert.rejects(
    executePartnerShadowAdapter({
      requestPath: input.requestPath,
      postgresUrlFile: input.postgresUrlFile,
      postgresSchema: "nex_core",
      shadowMemoryPath: input.shadowMemoryPath,
      receiptPath: input.receiptPath,
      expectedOwnerUid: input.uid,
      psqlRunner: () => ({ status: 0, stdout: "", stderr: "" }),
    }),
    /does not exactly cover/,
  );
});

test("cleans isolated files after tuple or authority failure and never leaks DSN to argv", async () => {
  const input = fixture();
  const unsafe = {
    ...input.pgRow,
    authority_declaration_json: JSON.stringify({
      provider_write_authority: true,
      source_mutation_authority: false,
      financial_mutation_authority: false,
    }),
  };
  let captured: PsqlInvocation | null = null;
  await assert.rejects(
    executePartnerShadowAdapter({
      requestPath: input.requestPath,
      postgresUrlFile: input.postgresUrlFile,
      postgresSchema: "nex_core",
      shadowMemoryPath: input.shadowMemoryPath,
      receiptPath: input.receiptPath,
      expectedOwnerUid: input.uid,
      psqlRunner(value) {
        captured = value;
        return { status: 0, stdout: `${JSON.stringify(unsafe)}\n`, stderr: "" };
      },
    }),
    /provider_write_authority must remain false/,
  );
  assert.equal(exists(input.shadowMemoryPath), false);
  assert.equal(exists(input.receiptPath), false);
  assert.ok(captured);
  assert.doesNotMatch(captured!.args.join(" "), /postgresql:|secret/);
});

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
