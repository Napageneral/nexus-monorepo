import { describe, expect, it, vi } from "vitest";
import shopifySourceObservationJob from "./shopify-source-observation.js";

function record(id: string) {
  return {
    operation: "record.ingest",
    routing: {
      platform: "shopify",
      connection_id: "shopify-production",
      provider_account_ref: "moonsleepco.myshopify.com",
      sender_id: "store",
      receiver_id: "moonsleep",
      container_kind: "group",
      container_id: "order",
    },
    payload: {
      external_record_id: id,
      timestamp: 1,
      content: id,
      content_type: "text",
      source_record_type: "shopify.order",
      provider_version_ref: null,
      payload: { provider_object_sha256: `provider-${id}` },
      metadata: { snapshot_fingerprint_sha256: `snapshot-${id}` },
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
  const ingest = vi.fn(async () => {
    const call = ingest.mock.calls.length;
    if (params.failAt === call) throw new Error("synthetic ingest failure");
    return {
      payload: {
        status:
          params.statusAt && call === 1
            ? params.statusAt
            : params.skippedAt === call
              ? "skipped"
              : "completed",
        inserted: params.replayAt !== call,
        replayed: params.replayAt === call,
      },
    };
  });
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
  const scan = vi.fn(async (params: Record<string, unknown>) => {
    const providerRecordId = String(params.provider_record_id_prefix);
    return {
      payload: {
        records: [
          {
            platform: "shopify",
            connection_id: "shopify-production",
            provider_account_ref: "moonsleepco.myshopify.com",
            source_record_type: "shopify.order",
            provider_record_id: providerRecordId,
            payload: {
              source_metadata: {
                payload_metadata: {
                  snapshot_fingerprint_sha256: `snapshot-${providerRecordId}`,
                },
                provider_payload: {
                  provider_object_sha256: `provider-${providerRecordId}`,
                },
              },
            },
          },
        ],
      },
    };
  });
  const ctx = {
    job: { config: { family: "orders.delta" } },
    input: { connection_id: "shopify-production" } as Record<string, unknown>,
    nex: {
      shopify: { source: { capture, commit, abort } },
      record: { ingest },
      records: { scan },
    },
    log: { info: vi.fn(), warn: vi.fn() },
  };
  return { ctx, capture, ingest, commit, abort, scan };
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
    expect(test.ingest).toHaveBeenCalledTimes(2);
    expect(test.ingest).toHaveBeenNthCalledWith(1, {
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
        payload: { provider_object_sha256: "provider-record-1" },
        metadata: {
          snapshot_fingerprint_sha256: "snapshot-record-1",
          source_record_type: "shopify.order",
          provider_version_ref: null,
        },
      },
    });
    expect(test.commit).toHaveBeenCalledTimes(1);
    expect(test.abort).not.toHaveBeenCalled();
    expect(test.ingest.mock.invocationCallOrder[1]).toBeLessThan(
      test.commit.mock.invocationCallOrder[0]!,
    );
  });

  it("paces captured records in bounded write batches before committing the cursor", async () => {
    vi.useFakeTimers();
    try {
      const test = fixture({ recordCount: 26 });
      const result = shopifySourceObservationJob(test.ctx);
      await vi.advanceTimersByTimeAsync(0);
      expect(test.ingest).toHaveBeenCalledTimes(25);
      expect(test.commit).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2_500);
      await expect(result).resolves.toMatchObject({
        records: 26,
        inserted: 26,
        replayed: 0,
      });
      expect(test.ingest).toHaveBeenCalledTimes(26);
      expect(test.commit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts without advancing the cursor for an unexpected ingest status", async () => {
    const test = fixture({ statusAt: "denied" });
    await expect(shopifySourceObservationJob(test.ctx)).rejects.toThrow(
      "Shopify record ingest returned denied",
    );
    expect(test.commit).not.toHaveBeenCalled();
    expect(test.abort).toHaveBeenCalledWith({
      connection_id: "shopify-production",
      family: "orders.delta",
      capture_id: "0123456789abcdef0123456789abcdef",
    });
  });

  it("commits a durably inserted page when an unrelated downstream subscriber fails", async () => {
    const test = fixture();
    test.ingest.mockReset().mockResolvedValue({
      payload: { status: "failed", result: { status: "failed" } },
    });
    await expect(shopifySourceObservationJob(test.ctx)).resolves.toMatchObject({
      records: 2,
      inserted: 2,
      replayed: 0,
    });
    expect(test.ingest).toHaveBeenCalledTimes(2);
    expect(test.scan).toHaveBeenCalledTimes(2);
    expect(test.scan).toHaveBeenNthCalledWith(1, {
      platform: "shopify",
      connection_id: "shopify-production",
      provider_account_ref: "moonsleepco.myshopify.com",
      source_record_type: "shopify.order",
      provider_record_id_prefix: "record-1",
      limit: 100,
    });
    expect(test.commit).toHaveBeenCalledTimes(1);
    expect(test.abort).not.toHaveBeenCalled();
    expect(test.ctx.log.warn).toHaveBeenCalledWith(
      "Shopify record was durable even though a downstream event subscriber failed",
    );
  });

  it("fails closed when a failed aggregate has no exact durable Record", async () => {
    const test = fixture();
    test.ingest.mockReset().mockResolvedValue({
      payload: { status: "failed", result: { status: "failed" } },
    });
    test.scan.mockResolvedValue({ payload: { records: [] } });
    await expect(shopifySourceObservationJob(test.ctx)).rejects.toThrow(
      "Shopify record ingest returned failed",
    );
    expect(test.ingest).toHaveBeenCalledTimes(1);
    expect(test.commit).not.toHaveBeenCalled();
    expect(test.abort).toHaveBeenCalledTimes(1);
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
    expect(test.commit).not.toHaveBeenCalled();
    expect(test.abort).toHaveBeenCalledTimes(1);
  });
});
