import { describe, expect, it, vi } from "vitest";
import shopifySourceObservationJob from "./shopify-source-observation.js";

function record(id: string, containerId = "order", sourceRecordType = "shopify.order") {
  return {
    operation: "record.ingest",
    routing: {
      platform: "shopify",
      connection_id: "shopify-production",
      provider_account_ref: "moonsleepco.myshopify.com",
      sender_id: "store",
      receiver_id: "moonsleep",
      container_kind: "group",
      container_id: containerId,
    },
    payload: {
      external_record_id: id,
      timestamp: 1,
      content: id,
      content_type: "text",
      source_record_type: sourceRecordType,
      provider_version_ref: null,
    },
  };
}

function fixture(
  params: {
    failAt?: number;
    replayAt?: number;
    skippedAt?: number;
    statusAt?: string;
    recordCount?: number;
  } = {},
) {
  const capture = vi.fn(async () => ({
    payload: {
      version: 1,
      family: "orders.delta",
      capture_id: "0123456789abcdef0123456789abcdef",
      records: Array.from(
        { length: params.recordCount ?? 2 },
        (_value, index) => record(`record-${index + 1}`),
      ),
      complete: true,
    },
  }));
  const ingestMany = vi.fn(async ({ records }: { records: unknown[] }) => {
    if (params.failAt) throw new Error("synthetic ingest failure");
    if (params.statusAt) {
      return { payload: { records: records.length, inserted: 0, replayed: 0 } };
    }
    const replayed = params.replayAt || params.skippedAt ? 1 : 0;
    return {
      payload: {
        records: records.length,
        inserted: records.length - replayed,
        replayed,
      },
    };
  });
  const ingest = vi.fn(async () => ({
    payload: { status: "completed", inserted: true, replayed: false },
  }));
  const commit = vi.fn(async () => ({
    payload: {
      version: 1,
      family: "orders.delta",
      capture_id: "0123456789abcdef0123456789abcdef",
      cursor_iso: "2026-07-22T12:00:00Z",
      complete: true,
    },
  }));
  const abort = vi.fn(async () => ({ payload: { aborted: true } }));
  const ctx = {
    job: { config: { family: "orders.delta" } },
    input: { connection_id: "shopify-production" } as Record<string, unknown>,
    nex: {
      shopify: { source: { capture, commit, abort } },
      record: { ingest, ingest_many: ingestMany },
    },
    log: { info: vi.fn(), warn: vi.fn() },
  };
  return { ctx, capture, ingest, ingestMany, commit, abort };
}

describe("Shopify source observation job", () => {
  it("ingests the full page before advancing the family cursor", async () => {
    const test = fixture({ skippedAt: 2 });
    await expect(shopifySourceObservationJob(test.ctx)).resolves.toMatchObject({
      ok: true,
      family: "orders.delta",
      records: 2,
      inserted: 1,
      replayed: 1,
      complete: true,
      provider_write_authority: false,
    });
    expect(test.capture).toHaveBeenCalledWith({
      connection_id: "shopify-production",
      family: "orders.delta",
    });
    expect(test.ingestMany).toHaveBeenCalledTimes(1);
    expect(test.ingestMany).toHaveBeenCalledWith({
      records: [
        {
          routing: {
            platform: "shopify",
            connection_id: "shopify-production",
            sender_id: "store",
            receiver_id: "moonsleep",
            container_kind: "group",
            container_id: "order",
            metadata: { provider_account_ref: "moonsleepco.myshopify.com" },
          },
          payload: {
            external_record_id: "record-1",
            timestamp: 1,
            content: "record-1",
            content_type: "text",
            metadata: {
              source_record_type: "shopify.order",
              provider_version_ref: null,
            },
          },
        },
        expect.any(Object),
      ],
    });
    expect(test.commit).toHaveBeenCalledTimes(1);
    expect(test.abort).not.toHaveBeenCalled();
    expect(test.ingestMany.mock.invocationCallOrder[0]).toBeLessThan(
      test.commit.mock.invocationCallOrder[0]!,
    );
  });

  it("passes an immutable observation into capture and returns a terminal digest", async () => {
    const test = fixture({ recordCount: 2 });
    const observation = {
      projection_work_id: `channelprojection_${"1".repeat(32)}`,
      observation_receipt_id: `channelobs_${"2".repeat(32)}`,
      projection_target: "nex",
      source_system: "shopify",
      source_account_ref: "moonsleep",
      source_stream: "orders/updated",
      external_receipt_id: "receipt-1",
      semantic_revision_id: "orders/updated:1:revision-1",
      raw_body_sha256: "3".repeat(64),
      verification_issuer: "shopify-hmac-sha256",
      verification_receipt_sha256: "4".repeat(64),
      observation_sha256: "5".repeat(64),
      immutable_facts_sha256: "6".repeat(64),
      immutable_facts: { id: 1 },
    };
    test.ctx.input.observation = observation;
    test.capture.mockResolvedValueOnce({
      payload: {
        version: 1,
        family: "orders.delta",
        capture_id: "0123456789abcdef0123456789abcdef",
        records: [record("order:1", "order"), record("line_item:1:1", "line_item")],
        complete: true,
      },
    });

    const result = await shopifySourceObservationJob(test.ctx);

    expect(test.capture).toHaveBeenCalledWith({
      connection_id: "shopify-production",
      family: "orders.delta",
      observation,
    });
    expect(result).toMatchObject({
      ok: true,
      status: "completed",
      records: 2,
      inserted: 2,
      replayed: 0,
      family_counts: { line_item: 1, order: 1 },
      projection_work_id: observation.projection_work_id,
      observation_receipt_id: observation.observation_receipt_id,
    });
    expect(result.result_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reports an exact all-Record replay as replay with a stable terminal digest", async () => {
    const test = fixture({ recordCount: 2 });
    test.ingestMany.mockResolvedValue({
      payload: { records: 2, inserted: 0, replayed: 2 },
    });

    const first = await shopifySourceObservationJob(test.ctx);
    const second = await shopifySourceObservationJob(test.ctx);

    expect(first).toMatchObject({ status: "replay", inserted: 0, replayed: 2 });
    expect(second.result_sha256).toBe(first.result_sha256);
  });

  it("does not add fixed sleeps between captured records", async () => {
    const test = fixture({ recordCount: 324 });
    await expect(shopifySourceObservationJob(test.ctx)).resolves.toMatchObject({
      records: 324,
      inserted: 324,
      replayed: 0,
    });
    expect(test.ingestMany).toHaveBeenCalledTimes(1);
    expect(test.commit).toHaveBeenCalledTimes(1);
  });

  it("aborts without advancing the cursor for an unexpected ingest status", async () => {
    const test = fixture({ statusAt: "denied" });
    await expect(shopifySourceObservationJob(test.ctx)).rejects.toThrow(
      "Shopify Record batch ingest returned invalid counts",
    );
    expect(test.commit).not.toHaveBeenCalled();
    expect(test.abort).toHaveBeenCalledWith({
      connection_id: "shopify-production",
      family: "orders.delta",
      capture_id: "0123456789abcdef0123456789abcdef",
    });
  });

  it("releases the exact capture and leaves the cursor uncommitted after ingest failure", async () => {
    const test = fixture({ failAt: 2 });
    await expect(shopifySourceObservationJob(test.ctx)).rejects.toThrow(
      "synthetic ingest failure",
    );
    expect(test.commit).not.toHaveBeenCalled();
    expect(test.abort).toHaveBeenCalledWith({
      connection_id: "shopify-production",
      family: "orders.delta",
      capture_id: "0123456789abcdef0123456789abcdef",
    });
  });

  it("rejects a family not owned by the installed source catalog before any provider call", async () => {
    const test = fixture();
    test.ctx.input = { connection_id: "shopify-production", family: "themes.delta" };
    await expect(shopifySourceObservationJob(test.ctx)).rejects.toThrow(
      "unsupported family",
    );
    expect(test.capture).not.toHaveBeenCalled();
  });

  it("fails closed when canonical custody disagrees with compatibility metadata", async () => {
    const test = fixture({ recordCount: 1 });
    const captured = record("record-1");
    (captured.payload as Record<string, unknown>).metadata = {
      source_record_type: "shopify.customer",
    };
    test.capture.mockResolvedValueOnce({
      payload: {
        version: 1,
        family: "orders.delta",
        capture_id: "0123456789abcdef0123456789abcdef",
        records: [captured],
        complete: true,
      },
    });

    await expect(shopifySourceObservationJob(test.ctx)).rejects.toThrow(
      "source_record_type custody disagrees",
    );
    expect(test.ingest).not.toHaveBeenCalled();
    expect(test.ingestMany).not.toHaveBeenCalled();
    expect(test.commit).not.toHaveBeenCalled();
    expect(test.abort).toHaveBeenCalledTimes(1);
  });

  it("uses channel-neutral batch ingest for changing inventory records", async () => {
    const test = fixture({ recordCount: 0 });
    test.capture.mockResolvedValueOnce({
      payload: {
        version: 1,
        family: "inventory.reconcile",
        capture_id: "0123456789abcdef0123456789abcdef",
        records: [
          record("inventory-level:1", "inventory_level", "shopify.inventory"),
          record("inventory-level:2", "inventory_level", "shopify.inventory"),
        ],
        complete: true,
      },
    });
    test.ctx.job.config.family = "inventory.reconcile";

    await expect(shopifySourceObservationJob(test.ctx)).resolves.toMatchObject({
      ok: true,
      family: "inventory.reconcile",
      records: 2,
      inserted: 2,
      replayed: 0,
    });
    expect(test.ingest).not.toHaveBeenCalled();
    expect(test.ingestMany).toHaveBeenCalledTimes(1);
    expect(test.ingestMany).toHaveBeenCalledWith({
      records: expect.arrayContaining([
        expect.objectContaining({
          routing: expect.objectContaining({
            platform: "shopify",
            connection_id: "shopify-production",
            container_id: "inventory_level",
          }),
          payload: expect.objectContaining({
            metadata: expect.objectContaining({ source_record_type: "shopify.inventory" }),
          }),
        }),
      ]),
    });
    expect(test.commit).toHaveBeenCalledTimes(1);
  });
});
