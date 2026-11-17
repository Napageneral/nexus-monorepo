import { describe, expect, it, vi } from "vitest";
import shopifyPaidOrderEffectsJob from "./shopify-paid-order-effects.js";

const INPUT = {
  contract_id: "moonsleep-commerce.shopify-paid-order-effects-input.v1",
  work_root_id: `shopify:accepted-order-receipt:acceptance_${"a".repeat(32)}`,
  shopify_order_id: "99001",
  accepted_order_receipt_id: `acceptance_${"a".repeat(32)}`,
  accepted_order_revision_id: "99001:2026-08-22T20:00:00Z",
  accepted_order_revision_sha256: "b".repeat(64),
  observation_receipt_id: `channelobs_${"1".repeat(32)}`,
  projection_work_id: `channelprojection_${"2".repeat(32)}`,
  source_run_id: "jobrun_source_1",
  projector_run_ids: ["jobrun_projector_1"],
  record_ids: [`record_${"3".repeat(64)}`],
} as const;

function fixture() {
  const callMethod = vi.fn(
    async (method: string, { request }: { request: Record<string, unknown> }) => ({
      ok: true,
      payload: {
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
      },
    }),
  );
  return {
    callMethod,
    context: {
      input: INPUT,
      run: {
        id: "jobrun_effects_1",
        trigger_source: "shopify.orders_paid",
        created_at: "2026-08-29T17:00:00.000Z",
      },
      runtime: { callMethod },
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
      accepted_order_receipt_id: INPUT.accepted_order_receipt_id,
      accepted_order_revision_id: INPUT.accepted_order_revision_id,
      accepted_order_revision_sha256: INPUT.accepted_order_revision_sha256,
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

    expect(test.callMethod).toHaveBeenCalledTimes(4);
    expect(test.callMethod.mock.calls.map((call) => call[0])).toEqual([
      "jobs.effects.perform",
      "jobs.effects.perform",
      "jobs.effects.perform",
      "jobs.effects.perform",
    ]);
    expect(test.callMethod.mock.calls.map((call) => call[1].request.action)).toEqual([
      "reserve",
      "reserve",
      "reserve",
      "reserve",
    ]);
    for (const call of test.callMethod.mock.calls) {
      expect(call[1].request).toMatchObject({
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

    expect(second.callMethod.mock.calls).toEqual(first.callMethod.mock.calls);
  });

  it("revision-fences a later accepted Order amendment", async () => {
    const first = fixture();
    const later = fixture();

    await shopifyPaidOrderEffectsJob(first.context);
    await shopifyPaidOrderEffectsJob({
      ...later.context,
      input: {
        ...INPUT,
        accepted_order_receipt_id: `acceptance_${"c".repeat(32)}`,
        accepted_order_revision_id: "99001:2026-08-22T21:00:00Z",
        accepted_order_revision_sha256: "d".repeat(64),
        work_root_id: `shopify:accepted-order-receipt:acceptance_${"c".repeat(32)}`,
      },
    });

    const firstEffect = first.callMethod.mock.calls[0][1].request.effect as Record<string, unknown>;
    const laterEffect = later.callMethod.mock.calls[0][1].request.effect as Record<string, unknown>;
    expect(laterEffect.requestDigestSha256).not.toBe(firstEffect.requestDigestSha256);
  });

  it("fails closed before reserving Effects when the work-root contract is malformed", async () => {
    const test = fixture();

    await expect(
      shopifyPaidOrderEffectsJob({
        ...test.context,
        input: { ...INPUT, work_root_id: "order-99001" },
      }),
    ).rejects.toThrow("shopify_paid_order_effects_input_invalid");
    expect(test.callMethod).not.toHaveBeenCalled();
  });

  it("fails closed when reservation readback lacks durable receipt evidence", async () => {
    const test = fixture();
    test.callMethod.mockImplementationOnce(async (_method, { request }) => {
      const effectId = (request.effect as Record<string, unknown>).effectId;
      return {
        ok: true,
        payload: {
          receipt: {
            action: "reserve",
            effectId,
            resultingEffect: { effectId, status: "reserved" },
          },
          provider_write_authorized: false,
        },
      };
    });

    await expect(shopifyPaidOrderEffectsJob(test.context)).rejects.toThrow(
      "shopify_paid_order_effect_reservation_invalid",
    );
  });
});
