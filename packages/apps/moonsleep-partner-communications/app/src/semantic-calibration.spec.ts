import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  JobModelService,
  JobStructuredModelRequest,
} from "../../../../../nex/src/api/job-services.ts";
import { initializeDatabase } from "../../../../../nex/src/storage/migrations/initialize.ts";
import { canonicalJsonSha256 } from "../../../../../nex/src/support/data/canonical-json.ts";
import { loadCanonicalPartnerManifest, validateProfilePayload } from "./canonical-prep.js";
import {
  partnerCalibrationStubOutput,
  preparePartnerSemanticCalibrationFirstReviewBatch,
  runPartnerSemanticCalibrationFirstReviewBatch,
} from "./semantic-calibration.js";

const databases: DatabaseSync[] = [];

function openMemoryDb(): DatabaseSync {
  const memoryDb = new DatabaseSync(":memory:");
  initializeDatabase("memory", memoryDb);
  databases.push(memoryDb);
  return memoryDb;
}

function completedModelService() {
  const generateStructured = vi.fn<JobModelService["generateStructured"]>(async (request) => ({
    value: partnerCalibrationStubOutput(request.prompt),
    response_id: `stub:${canonicalJsonSha256({ model: request.model, prompt: request.prompt })}`,
    model: `${request.model}-stubbed`,
    status: "completed",
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      reasoning_tokens: 10,
      total_tokens: 160,
    },
    request_sha256: canonicalJsonSha256(request),
  }));
  return { modelService: { generateStructured } satisfies JobModelService, generateStructured };
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe("MoonSleep Partner first semantic calibration review batch", () => {
  it("prepares 16 varied Gmail and Alibaba subjects as source-bound facts and sealed inputs", () => {
    const memoryDb = openMemoryDb();
    const prepared = preparePartnerSemanticCalibrationFirstReviewBatch({ memoryDb });

    expect(prepared).toMatchObject({
      contract_version: "moonsleep_partner_semantic_calibration_first_review_batch_v1",
      batch_label: "PARTNER-REVIEW-BATCH-001-SYNTHETIC",
      fixture_count: 16,
      fact_count: 63,
      sealed_input_count: 16,
      gmail_fixture_count: 9,
      alibaba_fixture_count: 11,
      cross_channel_fixture_count: 4,
      governing_core_commit: "cabe3d83ed00e4390f2dae654b48f3d70448077e",
      governing_core_tree: "be41db2f1ff099968d3762efc17b54d5fcdaa369",
      source_manifest_sha256: "bee876068500ed1d9b58fed970131a104bc6f190ca39e00f6cc7eeb6cf29fbdc",
      batch_reused: false,
      authority: {
        provider_calls: 0,
        live_data_reads: 0,
        model_calls: 0,
        promotions: 0,
        external_actions: 0,
        provider_write: false,
        identity_merge: false,
        draft_or_send: false,
      },
    });
    expect(prepared.items).toHaveLength(16);
    expect(new Set(prepared.items.map((item) => item.input_set_id))).toHaveLength(16);
    expect(new Set(prepared.items.map((item) => item.input_set_digest))).toHaveLength(16);
    expect(memoryDb.prepare("SELECT COUNT(*) AS count FROM set_seals").get()).toEqual({
      count: 16,
    });

    const providerCoverage = new Set(
      prepared.items.flatMap((item) => item.source_revisions.map((revision) => revision.provider)),
    );
    expect(providerCoverage).toEqual(new Set(["gmail", "alibaba"]));
    for (const item of prepared.items) {
      expect(item.source_revisions.length).toBeGreaterThan(0);
      expect(item.fact_ids.length).toBeGreaterThan(0);
      for (const revision of item.source_revisions) {
        expect(revision.revision_id).toMatch(/^synthetic:partner-revision:[a-f0-9]{64}$/);
        expect(revision.source_revision_sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(revision.payload_sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(revision.fragment_refs.length).toBeGreaterThan(0);
      }
    }

    const replay = preparePartnerSemanticCalibrationFirstReviewBatch({ memoryDb });
    expect(replay.batch_reused).toBe(true);
    expect(replay.receipt_sha256).toBe(prepared.receipt_sha256);
    expect(memoryDb.prepare("SELECT COUNT(*) AS count FROM elements WHERE type = 'fact'").get()).toEqual({
      count: 63,
    });
    expect(memoryDb.prepare("SELECT COUNT(*) AS count FROM set_seals").get()).toEqual({ count: 16 });
  });

  it("runs blind Luna, Terra, and Sol stubs and validates all Partner observation profiles", async () => {
    const memoryDb = openMemoryDb();
    const prepared = preparePartnerSemanticCalibrationFirstReviewBatch({ memoryDb });
    const stub = completedModelService();
    const completed = await runPartnerSemanticCalibrationFirstReviewBatch({
      memoryDb,
      modelService: stub.modelService,
      preparation: prepared,
      executionMode: "synthetic_stub_only",
    });

    expect(stub.generateStructured).toHaveBeenCalledTimes(48);
    expect(completed.review_items).toHaveLength(16);
    expect(completed.receipt).toMatchObject({
      fixture_count: 16,
      sealed_input_count: 16,
      review_ready_count: 16,
      candidate_count: 48,
      candidates_per_item: 3,
      blind_slots: ["A", "B", "C"],
      synthetic_model_invocations: 48,
      live_model_invocations: 0,
      provider_calls: 0,
      live_data_reads: 0,
      observation_candidates: 0,
      promotions: 0,
      decisions: 0,
      projection_outbox: 0,
      external_actions: 0,
    });

    const manifest = loadCanonicalPartnerManifest();
    for (const item of completed.review_items) {
      expect(item).toMatchObject({ ready_for_review: true, candidate_count: 3, decision: null });
      for (const candidate of item.candidates as Array<Record<string, unknown>>) {
        expect(candidate).not.toHaveProperty("model_id");
        expect(candidate).not.toHaveProperty("requested_model_id");
        expect(candidate).not.toHaveProperty("usage");
        expect(candidate).not.toHaveProperty("provider_response_id");
        expect(() =>
          validateProfilePayload(
            manifest,
            String(item.target_profile_id),
            candidate.output as Record<string, unknown>,
          ),
        ).not.toThrow();
      }
    }

    const conflict = completed.review_items.find(
      (item) => item.subject_ref === "PD-CAL-002-CROSS-CHANNEL-CONFLICT",
    );
    expect(conflict).toBeDefined();
    const conflictOutput = (conflict!.candidates as Array<{ output: Record<string, unknown> }>)[0]!
      .output;
    expect(conflictOutput).toMatchObject({
      semantic_lifecycle: "blocked",
      responsible_side: "shared",
      conflicting_fact_dispositions: [{ disposition: "review_required" }],
    });
    const closed = completed.review_items.find(
      (item) => item.subject_ref === "PD-CAL-016-EXPLICIT-CLOSURE",
    );
    expect(closed).toBeDefined();
    const closedOutput = (closed!.candidates as Array<{ output: Record<string, unknown> }>)[0]!
      .output;
    expect(
      (closedOutput.closure_evidence_revisions as string[]).length,
    ).toBeGreaterThan(0);

    const replay = await runPartnerSemanticCalibrationFirstReviewBatch({
      memoryDb,
      modelService: stub.modelService,
      preparation: prepared,
      executionMode: "synthetic_stub_only",
    });
    expect(stub.generateStructured).toHaveBeenCalledTimes(48);
    expect(replay.receipt.receipt_sha256).toBe(completed.receipt.receipt_sha256);
  });

  it("recovers one partial stub failure without duplicating 47 successful candidates", async () => {
    const memoryDb = openMemoryDb();
    const prepared = preparePartnerSemanticCalibrationFirstReviewBatch({ memoryDb });
    let failedOnce = false;
    const generateStructured = vi.fn<JobModelService["generateStructured"]>(
      async (request: JobStructuredModelRequest) => {
        const prompt = JSON.parse(request.prompt) as { fixture_id: string };
        if (
          !failedOnce &&
          prompt.fixture_id === "PD-CAL-007-INSPECTION-BLOCKER" &&
          request.model === "gpt-5.6-terra"
        ) {
          failedOnce = true;
          throw new Error("synthetic transient Partner failure");
        }
        return {
          value: partnerCalibrationStubOutput(request.prompt),
          response_id: `stub:${canonicalJsonSha256({ model: request.model, prompt: request.prompt })}`,
          model: `${request.model}-stubbed`,
          status: "completed",
          usage: { input_tokens: 1, output_tokens: 1, reasoning_tokens: 0, total_tokens: 2 },
          request_sha256: canonicalJsonSha256(request),
        };
      },
    );
    const modelService = { generateStructured } satisfies JobModelService;

    await expect(
      runPartnerSemanticCalibrationFirstReviewBatch({
        memoryDb,
        modelService,
        preparation: prepared,
        executionMode: "synthetic_stub_only",
      }),
    ).rejects.toThrow(/PD-CAL-007-INSPECTION-BLOCKER.*synthetic transient Partner failure/);
    expect(generateStructured).toHaveBeenCalledTimes(48);
    expect(memoryDb.prepare("SELECT COUNT(*) AS count FROM semantic_candidate_executions").get()).toEqual({
      count: 47,
    });

    const recovered = await runPartnerSemanticCalibrationFirstReviewBatch({
      memoryDb,
      modelService,
      preparation: prepared,
      executionMode: "synthetic_stub_only",
    });
    expect(generateStructured).toHaveBeenCalledTimes(49);
    expect(recovered.receipt).toMatchObject({ review_ready_count: 16, candidate_count: 48 });
    expect(memoryDb.prepare("SELECT COUNT(*) AS count FROM semantic_candidate_executions").get()).toEqual({
      count: 48,
    });
  });

  it("fails closed on invalid candidates and creates no review decision, promotion, or action state", async () => {
    const memoryDb = openMemoryDb();
    const prepared = preparePartnerSemanticCalibrationFirstReviewBatch({ memoryDb });
    const generateStructured = vi.fn<JobModelService["generateStructured"]>(async (request) => ({
      value: { invalid_output: request.model },
      response_id: `invalid:${request.model}`,
      model: `${request.model}-stubbed`,
      status: "completed",
      usage: { input_tokens: 1, output_tokens: 1, reasoning_tokens: 0, total_tokens: 2 },
      request_sha256: canonicalJsonSha256(request),
    }));

    await expect(
      runPartnerSemanticCalibrationFirstReviewBatch({
        memoryDb,
        modelService: { generateStructured },
        preparation: prepared,
        executionMode: "synthetic_stub_only",
      }),
    ).rejects.toThrow(/payload failed/);
    expect(generateStructured).toHaveBeenCalledTimes(48);
    expect(
      memoryDb
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM semantic_candidate_executions) AS candidates,
             (SELECT COUNT(*) FROM observation_candidates) AS observation_candidates,
             (SELECT COUNT(*) FROM observation_candidate_promotions) AS promotions,
             (SELECT COUNT(*) FROM semantic_review_decisions) AS decisions,
             (SELECT COUNT(*) FROM projection_outbox) AS projection_outbox`,
        )
        .get(),
    ).toEqual({
      candidates: 0,
      observation_candidates: 0,
      promotions: 0,
      decisions: 0,
      projection_outbox: 0,
    });
    const schemas = memoryDb
      .prepare("SELECT schema_json FROM element_profiles")
      .all() as Array<{ schema_json: string }>;
    expect(schemas).toHaveLength(8);
    expect(schemas.every((row) => !/"kind"\s*:/.test(row.schema_json))).toBe(true);
  });
});
