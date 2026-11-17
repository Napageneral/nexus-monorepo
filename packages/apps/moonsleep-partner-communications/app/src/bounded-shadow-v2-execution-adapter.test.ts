import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "vitest";
import {
  buildV2IdentityQuery,
  buildV2RevisionQuery,
  executePartnerShadowV2Adapter,
  resolveV2ShadowMemoryPath,
  type PartnerShadowV2PgFactory,
} from "./bounded-shadow-v2-execution-adapter.ts";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "partner-shadow-v2-"));
  roots.push(root);
  chmodSync(root, 0o700);
  const uid = process.getuid!();
  const requestPath = join(root, "request.json");
  const postgresUrlFile = join(root, "postgres-url");
  const canonicalManifestPath = join(root, "partner-profiles.json");
  const shadowMemoryPath = join(root, "shadow-memory.db");
  const receiptPath = join(root, "terminal-receipt.json");
  const request = {
    request: {
      cohort_id: "PD-11-OPAQUE-ADAPTER",
      connection_id: "partner-connection-opaque",
      source_read_receipt_sha256: digest("source-read"),
      current_projection_read_receipt_sha256: digest("projection-read"),
      execution_mode: "isolated_shadow_memory",
      members: [
        {
          record_row_id: "record-one",
          revision_id: "revision-one",
          payload_sha256: digest("payload-one"),
          source_logical_record_ref: "source-one",
          source_revision_sha256: digest("source-revision-one"),
          identity_receipt_id: "identity-receipt-one",
          identity_contract_version: "nex-ingress-identity-v1",
          identity_result_digest: digest("identity-result-one"),
          identity_party_ordinal: 0,
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
  writeFileSync(postgresUrlFile, "postgresql://secret@localhost/nex\n", {
    mode: 0o400,
  });
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
  const revision = {
    id: "revision-one",
    record_row_id: "record-one",
    payload_sha256: digest("payload-one"),
    connection_id: "partner-connection-opaque",
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
  const identityReceipt = {
    id: "identity-receipt-one",
    source_revision_id: "revision-one",
    connection_id: "partner-connection-opaque",
    identity_contract_version: "nex-ingress-identity-v1",
    identity_result_digest: digest("identity-result-one"),
    status: "applied",
    parties: [
      {
        party_ordinal: 0,
        contact_observation_id: "contact-observation-one",
        observed_entity_id: "entity-observed-one",
        canonical_entity_id_at_commit: "entity-surewal-reviewed",
      },
    ],
  };
  return {
    root,
    uid,
    requestPath,
    postgresUrlFile,
    canonicalManifestPath,
    shadowMemoryPath,
    receiptPath,
    revision,
    identityReceipt,
  };
}

function fakePg(
  revision: Record<string, unknown>,
  identityReceipts: Array<Record<string, unknown>>,
): {
  factory: PartnerShadowV2PgFactory;
  queries: Array<{ text: string; values?: unknown[] }>;
} {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  return {
    queries,
    factory() {
      return {
        async connect() {},
        async query(text, values) {
          queries.push({ text, values });
          if (text.includes('"record_revisions"')) {
            return { rows: [{ revision }] };
          }
          if (text.includes('"ingress_identity_receipts"')) {
            return {
              rows: identityReceipts.map((identity_receipt) => ({
                identity_receipt,
              })),
            };
          }
          return { rows: [] };
        },
        async end() {},
      };
    },
  };
}

test("executes and replays one exact read-only PostgreSQL snapshot into isolated shadow state", async () => {
  const input = fixture();
  const pg = fakePg(input.revision, [input.identityReceipt]);
  const first = await executePartnerShadowV2Adapter({
    requestPath: input.requestPath,
    postgresUrlFile: input.postgresUrlFile,
    postgresSchema: "nex_core",
    canonicalManifestPath: input.canonicalManifestPath,
    shadowMemoryPath: input.shadowMemoryPath,
    receiptPath: input.receiptPath,
    expectedOwnerUid: input.uid,
    runtimeModuleRoot: input.root,
    resume: false,
    pgClientFactory: pg.factory,
  });
  assert.equal(first.completed_count, 1);
  assert.equal(first.dead_letter_count, 0);
  assert.equal(first.review_required_count, 1);
  assert.equal(lstatSync(input.shadowMemoryPath).mode & 0o777, 0o600);
  assert.equal(lstatSync(input.receiptPath).mode & 0o777, 0o400);
  assert.deepEqual(JSON.parse(readFileSync(input.receiptPath, "utf8")), first);
  assert.deepEqual(
    pg.queries.map((query) => query.text.split("\n")[0]),
    [
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      "SET LOCAL statement_timeout = '15s'",
      "SELECT json_build_object(",
      "SELECT json_build_object(",
      "COMMIT",
    ],
  );
  assert.doesNotMatch(
    pg.queries.map((query) => query.text).join("\n"),
    /postgresql:|secret/,
  );

  const replayPath = join(input.root, "terminal-receipt-replay.json");
  const replay = await executePartnerShadowV2Adapter({
    requestPath: input.requestPath,
    postgresUrlFile: input.postgresUrlFile,
    postgresSchema: "nex_core",
    canonicalManifestPath: input.canonicalManifestPath,
    shadowMemoryPath: input.shadowMemoryPath,
    receiptPath: replayPath,
    expectedOwnerUid: input.uid,
    runtimeModuleRoot: input.root,
    resume: true,
    pgClientFactory: fakePg(input.revision, [input.identityReceipt]).factory,
  });
  assert.deepEqual(replay, first);
});

test("dead-letters a missing identity receipt and preserves zero authority", async () => {
  const input = fixture();
  const result = await executePartnerShadowV2Adapter({
    requestPath: input.requestPath,
    postgresUrlFile: input.postgresUrlFile,
    postgresSchema: "nex_core",
    canonicalManifestPath: input.canonicalManifestPath,
    shadowMemoryPath: input.shadowMemoryPath,
    receiptPath: input.receiptPath,
    expectedOwnerUid: input.uid,
    runtimeModuleRoot: input.root,
    resume: false,
    pgClientFactory: fakePg(input.revision, []).factory,
  });
  assert.equal(result.completed_count, 0);
  assert.equal(result.dead_letter_count, 1);
  assert.equal(result.authority.provider_calls, 0);
  assert.equal(result.authority.model_calls, 0);
  assert.equal(result.authority.active_projection_writes, 0);
});

test("fails closed on active-memory paths, unsafe schemas, and missing resume state", () => {
  const input = fixture();
  assert.throws(
    () =>
      resolveV2ShadowMemoryPath(
        join(input.root, "state", "data", "memory.db"),
        input.uid,
        false,
      ),
    /active production memory path is prohibited/,
  );
  assert.throws(
    () =>
      resolveV2ShadowMemoryPath(
        input.shadowMemoryPath,
        input.uid,
        true,
      ),
    /resume requires an existing/,
  );
  assert.throws(
    () => buildV2RevisionQuery("nex_core;DROP"),
    /schema is invalid/,
  );
  assert.throws(
    () => buildV2IdentityQuery("nex_core;DROP"),
    /schema is invalid/,
  );
});
