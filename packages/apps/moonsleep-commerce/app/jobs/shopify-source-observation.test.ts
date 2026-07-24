import { describe, expect, it, vi } from "vitest";
import shopifySourceObservationJob from "./shopify-source-observation.js";

function record(id: string) {
  return {
    operation: "record.ingest",
    routing: {
      platform: "shopify",
      connection_id: "shopify-production",
      sender_id: "store",
      receiver_id: "moonsleep",
      container_kind: "commerce",
      container_id: "order",
    },
    payload: {
      external_record_id: id,
      timestamp: 1,
      content: id,
      content_type: "text",
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
  const ctx = {
    job: { config: { family: "orders.delta" } },
    input: { connection_id: "shopify-production" } as Record<string, unknown>,
    nex: {
      shopify: { source: { capture, commit, abort } },
      record: { ingest },
    },
    log: { info: vi.fn(), warn: vi.fn() },
  };
  return { ctx, capture, ingest, commit, abort };
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
});
