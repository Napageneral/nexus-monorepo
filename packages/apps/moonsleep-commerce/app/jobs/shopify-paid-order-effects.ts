import { createHash } from "node:crypto";

type RuntimeRow = Record<string, unknown>;

const INPUT_KEYS = [
  "contract_id",
  "observation_receipt_id",
  "projection_work_id",
  "projector_run_ids",
  "record_ids",
  "shopify_order_id",
  "source_run_id",
  "work_root_id",
] as const;
const PROVIDERS = ["google_ads", "meta", "pinterest", "tiktok"] as const;
const WORK_ROOT_ID_RE = /^shopify:orders-paid:\S{1,512}$/;
const OBSERVATION_RECEIPT_ID_RE = /^channelobs_[0-9a-f]{32}$/;
const PROJECTION_WORK_ID_RE = /^channelprojection_[0-9a-f]{32}$/;
const RECORD_ID_RE = /^record_[0-9a-f]{64}$/;

type PaidOrderEffectsInput = Readonly<{
  contract_id: "moonsleep-commerce.shopify-paid-order-effects-input.v1";
  work_root_id: string;
  shopify_order_id: string;
  observation_receipt_id: string;
  projection_work_id: string;
  source_run_id: string;
  projector_run_ids: readonly string[];
  record_ids: readonly string[];
}>;

type PaidOrderEffectsContext = Readonly<{
  input: unknown;
  run: Readonly<{ id: string; created_at: string }>;
  nex: {
    jobs: {
      effects: {
        perform(params: { request: RuntimeRow }): Promise<unknown>;
      };
    };
  };
}>;

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RuntimeRow) : {};
}

function unwrapPayload(value: unknown): RuntimeRow {
  const row = asRecord(value);
  if (row.ok === false) {
    const error = asRecord(row.error);
    throw new Error(exactString(error.message) || "shopify_paid_order_effect_reservation_failed");
  }
  const payload = asRecord(row.payload);
  return Object.keys(payload).length > 0 ? payload : row;
}

function exactString(value: unknown, maximum = 512): string {
  return typeof value === "string" && value === value.trim() && value.length <= maximum
    ? value
    : "";
}

function exactUniqueStrings(value: unknown, pattern: RegExp, maximum: number): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) return null;
  const strings = value.map((entry) => exactString(entry));
  if (strings.some((entry) => !pattern.test(entry)) || new Set(strings).size !== strings.length) {
    return null;
  }
  return strings.toSorted();
}

function parseInput(value: unknown): PaidOrderEffectsInput {
  const input = asRecord(value);
  const keys = Object.keys(input).toSorted();
  const projectorRunIds = exactUniqueStrings(input.projector_run_ids, /^jobrun_\S+$/, 100);
  const recordIds = exactUniqueStrings(input.record_ids, RECORD_ID_RE, 1_000);
  const workRootId = exactString(input.work_root_id, 533);
  const shopifyOrderId = exactString(input.shopify_order_id, 64);
  if (
    keys.join(",") !== [...INPUT_KEYS].toSorted().join(",") ||
    input.contract_id !== "moonsleep-commerce.shopify-paid-order-effects-input.v1" ||
    !WORK_ROOT_ID_RE.test(workRootId) ||
    !/^[1-9][0-9]{0,63}$/.test(shopifyOrderId) ||
    !OBSERVATION_RECEIPT_ID_RE.test(exactString(input.observation_receipt_id, 43)) ||
    !PROJECTION_WORK_ID_RE.test(exactString(input.projection_work_id, 50)) ||
    !/^jobrun_\S+$/.test(exactString(input.source_run_id)) ||
    projectorRunIds === null ||
    recordIds === null
  ) {
    throw new Error("shopify_paid_order_effects_input_invalid");
  }
  return {
    contract_id: input.contract_id,
    work_root_id: workRootId,
    shopify_order_id: shopifyOrderId,
    observation_receipt_id: input.observation_receipt_id as string,
    projection_work_id: input.projection_work_id as string,
    source_run_id: input.source_run_id as string,
    projector_run_ids: projectorRunIds,
    record_ids: recordIds,
  };
}

function stableJsonValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as RuntimeRow)
        .filter((entry) => entry[1] !== undefined)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJsonValue(entry)]),
    );
  }
  throw new Error("shopify_paid_order_effects_input_invalid");
}

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableJsonValue(value)), "utf8")
    .digest("hex");
}

function terminalReceipt(value: unknown, expectedEffectId: string): RuntimeRow {
  const result = asRecord(value);
  const receipt = asRecord(result.receipt);
  const effect = asRecord(receipt.resultingEffect);
  if (
    result.provider_write_authorized !== false ||
    receipt.action !== "reserve" ||
    receipt.effectId !== expectedEffectId ||
    !/^effectreceipt_[0-9a-f]{32}$/.test(exactString(receipt.receiptId, 46)) ||
    !/^[0-9a-f]{64}$/.test(exactString(receipt.readbackSha256, 64)) ||
    effect.effectId !== expectedEffectId ||
    effect.status !== "reserved"
  ) {
    throw new Error("shopify_paid_order_effect_reservation_invalid");
  }
  return receipt;
}

export default async function shopifyPaidOrderEffectsJob(
  context: PaidOrderEffectsContext,
): Promise<RuntimeRow> {
  const input = parseInput(context.input);
  const runId = exactString(context.run?.id);
  const requestedAt = exactString(context.run?.created_at, 64);
  if (!/^jobrun_\S+$/.test(runId) || Number.isNaN(Date.parse(requestedAt))) {
    throw new Error("shopify_paid_order_effects_run_invalid");
  }
  const rootDigest = sha256(input.work_root_id).slice(0, 32);
  const effects: RuntimeRow[] = [];
  for (const provider of PROVIDERS) {
    const effectId = `effect_shopify_paid_${sha256({ provider, runId }).slice(0, 32)}`;
    const effectKey = `shopify-paid-order:${rootDigest}:${provider}`;
    const requestDigestSha256 = sha256({
      contract_id: "moonsleep-commerce.shopify-paid-order-provider-intent.v1",
      provider,
      shopify_order_id: input.shopify_order_id,
      work_root_id: input.work_root_id,
      source_run_id: input.source_run_id,
      projector_run_ids: input.projector_run_ids,
      record_ids: input.record_ids,
    });
    const receipt = terminalReceipt(
      unwrapPayload(
        await context.nex.jobs.effects.perform({
          request: {
            action: "reserve",
            transitionId: `shopify-paid-order:${rootDigest}:${provider}:reserve`,
            transitionIdempotencyKey: `shopify-paid-order:${rootDigest}:${provider}:reserve`,
            requestedAt,
            effect: {
              effectId,
              runId,
              effectKey,
              requestDigestSha256,
              providerId: provider,
              providerIdempotencyKey: `shopify-paid-order:${input.shopify_order_id}:${provider}`,
              providerIdempotencySupport: "required",
            },
            maxDispatches: 1,
          },
        }),
      ),
      effectId,
    );
    effects.push({
      provider,
      effect_id: effectId,
      effect_key: effectKey,
      request_digest_sha256: requestDigestSha256,
      receipt_id: exactString(receipt.receiptId, 46),
      receipt_sha256: exactString(receipt.readbackSha256, 64),
      status: "reserved",
    });
  }
  return {
    contract_id: "moonsleep-commerce.shopify-paid-order-effects-result.v1",
    work_root_id: input.work_root_id,
    shopify_order_id: input.shopify_order_id,
    run_id: runId,
    source_run_id: input.source_run_id,
    projector_run_ids: input.projector_run_ids,
    record_ids: input.record_ids,
    effects,
    provider_write_authority: false,
    provider_write_count: 0,
  };
}
