import { describe, expect, it, vi } from "vitest";
import shopifyPaidOrderEffectsJob from "./shopify-paid-order-effects.js";

const INPUT = {
  contract_id: "moonsleep-commerce.shopify-paid-order-effects-input.v1",
  work_root_id: "shopify:orders-paid:webhook-123",
  shopify_order_id: "99001",
  observation_receipt_id: `channelobs_${"1".repeat(32)}`,
  projection_work_id: `channelprojection_${"2".repeat(32)}`,
  source_run_id: "jobrun_source_1",
  projector_run_ids: ["jobrun_projector_1"],
  record_ids: [`record_${"3".repeat(64)}`],
} as const;

function fixture() {
  const perform = vi.fn(async ({ request }: { request: Record<string, unknown> }) => ({
    receipt: {
      action: "reserve",
      effectId: (request.effect as Record<string, unknown>).effectId,
      receiptId: `effectreceipt_${"4".repeat(32)}`,
      readbackSha256: "5".repeat(64),
      resultingEffect: {
        ...(request.effect as Record<string, unknown>),
        revision: 1,
        status: "reserved",
      },
    },
    provider_write_authorized: false,
  }));
  return {
    perform,
    context: {
      input: INPUT,
      run: {
        id: "jobrun_effects_1",
        created_at: "2026-08-29T17:00:00.000Z",
      },
      nex: { jobs: { effects: { perform } } },
    },
  };
}

describe("Shopify paid-order Effects Job", () => {
  it("reserves one deterministic provider Effect per paid-order root without write authority", async () => {
    const test = fixture();

    await expect(shopifyPaidOrderEffectsJob(test.context)).resolves.toEqual({
      contract_id: "moonsleep-commerce.shopify-paid-order-effects-result.v1",
      work_root_id: INPUT.work_root_id,
      shopify_order_id: INPUT.shopify_order_id,
      run_id: "jobrun_effects_1",
      source_run_id: INPUT.source_run_id,
      projector_run_ids: INPUT.projector_run_ids,
      record_ids: INPUT.record_ids,
      effects: expect.arrayContaining([
        expect.objectContaining({ provider: "google_ads", status: "reserved" }),
        expect.objectContaining({ provider: "meta", status: "reserved" }),
        expect.objectContaining({ provider: "pinterest", status: "reserved" }),
        expect.objectContaining({ provider: "tiktok", status: "reserved" }),
      ]),
      provider_write_authority: false,
      provider_write_count: 0,
    });

    expect(test.perform).toHaveBeenCalledTimes(4);
    expect(test.perform.mock.calls.map((call) => call[0].request.action)).toEqual([
      "reserve",
      "reserve",
      "reserve",
      "reserve",
    ]);
    for (const call of test.perform.mock.calls) {
      expect(call[0].request).toMatchObject({
        action: "reserve",
        requestedAt: "2026-08-29T17:00:00.000Z",
        maxDispatches: 1,
        effect: {
          runId: "jobrun_effects_1",
          providerIdempotencySupport: "required",
        },
      });
    }
  });

  it("emits byte-stable Effect reservation requests when the same Run is replayed", async () => {
    const first = fixture();
    const second = fixture();

    await shopifyPaidOrderEffectsJob(first.context);
    await shopifyPaidOrderEffectsJob(second.context);

    expect(second.perform.mock.calls).toEqual(first.perform.mock.calls);
  });

  it("fails closed before reserving Effects when the work-root contract is malformed", async () => {
    const test = fixture();

    await expect(
      shopifyPaidOrderEffectsJob({
        ...test.context,
        input: { ...INPUT, work_root_id: "order-99001" },
      }),
    ).rejects.toThrow("shopify_paid_order_effects_input_invalid");
    expect(test.perform).not.toHaveBeenCalled();
  });

  it("fails closed when reservation readback lacks durable receipt evidence", async () => {
    const test = fixture();
    test.perform.mockImplementationOnce(async ({ request }) => {
      const effectId = (request.effect as Record<string, unknown>).effectId;
      return {
        receipt: {
          action: "reserve",
          effectId,
          resultingEffect: { effectId, status: "reserved" },
        },
        provider_write_authorized: false,
      };
    });

    await expect(shopifyPaidOrderEffectsJob(test.context)).rejects.toThrow(
      "shopify_paid_order_effect_reservation_invalid",
    );
  });
});
