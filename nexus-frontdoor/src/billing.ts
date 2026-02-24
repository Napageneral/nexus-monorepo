import { createHmac, timingSafeEqual } from "node:crypto";
import type { FrontdoorConfig } from "./types.js";

export type CheckoutSessionResult = {
  provider: "mock" | "stripe";
  checkoutUrl: string;
  sessionId: string;
  expiresAtMs?: number;
};

export type BillingWebhookEvent = {
  provider: "mock" | "stripe";
  eventId: string;
  eventType: string;
  workspaceId?: string;
  payload: Record<string, unknown>;
};

function normalizePlanId(raw: string | undefined): string {
  const planId = (raw || "").trim().toLowerCase();
  if (!planId) {
    return "starter";
  }
  return planId;
}

function toBase64(input: Buffer): string {
  return input.toString("base64");
}

function safeCompareHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function safeCompareBase64(aBase64: string, bBase64: string): boolean {
  const a = Buffer.from(aBase64, "base64");
  const b = Buffer.from(bBase64, "base64");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function hmacSha256(secret: string, payload: string): Buffer {
  return createHmac("sha256", secret).update(payload, "utf8").digest();
}

function parseStripeSignatureHeader(header: string): {
  timestamp?: string;
  v1Signatures: string[];
} {
  const out: { timestamp?: string; v1Signatures: string[] } = {
    v1Signatures: [],
  };
  for (const part of header.split(",")) {
    const [rawKey, rawValue] = part.split("=");
    const key = (rawKey || "").trim();
    const value = (rawValue || "").trim();
    if (!key || !value) {
      continue;
    }
    if (key === "t") {
      out.timestamp = value;
      continue;
    }
    if (key === "v1") {
      out.v1Signatures.push(value);
    }
  }
  return out;
}

function resolveWorkspaceIdFromStripeObject(payload: Record<string, unknown>): string | undefined {
  const dataRaw = payload.data;
  const data = dataRaw && typeof dataRaw === "object" && !Array.isArray(dataRaw) ? dataRaw : null;
  const objectRaw = data && typeof (data as Record<string, unknown>).object === "object"
    ? (data as Record<string, unknown>).object
    : null;
  const object =
    objectRaw && typeof objectRaw === "object" && !Array.isArray(objectRaw)
      ? (objectRaw as Record<string, unknown>)
      : null;
  if (!object) {
    return undefined;
  }
  const metadataRaw = object.metadata;
  const metadata =
    metadataRaw && typeof metadataRaw === "object" && !Array.isArray(metadataRaw)
      ? (metadataRaw as Record<string, unknown>)
      : null;
  const workspaceId = typeof metadata?.workspace_id === "string" ? metadata.workspace_id.trim() : "";
  if (workspaceId) {
    return workspaceId;
  }
  return undefined;
}

export async function createCheckoutSession(params: {
  config: FrontdoorConfig;
  workspaceId: string;
  planId?: string;
  successUrl?: string;
  cancelUrl?: string;
  priceId?: string;
  customerEmail?: string;
}): Promise<CheckoutSessionResult> {
  const provider = params.config.billing.provider;
  if (provider === "none") {
    throw new Error("billing_unconfigured");
  }
  const planId = normalizePlanId(params.planId);
  const successUrl =
    (params.successUrl || "").trim() ||
    params.config.billing.checkoutSuccessUrl ||
    `${params.config.baseUrl.replace(/\/+$/, "")}/billing/success`;
  const cancelUrl =
    (params.cancelUrl || "").trim() ||
    params.config.billing.checkoutCancelUrl ||
    `${params.config.baseUrl.replace(/\/+$/, "")}/billing/cancel`;

  if (provider === "mock") {
    const sessionId = `cs_mock_${Math.random().toString(36).slice(2, 12)}`;
    const checkoutUrl = `${params.config.baseUrl.replace(/\/+$/, "")}/billing/mock-checkout?workspace_id=${encodeURIComponent(
      params.workspaceId,
    )}&plan_id=${encodeURIComponent(planId)}&session_id=${encodeURIComponent(sessionId)}`;
    return {
      provider: "mock",
      checkoutUrl,
      sessionId,
      expiresAtMs: Date.now() + 30 * 60 * 1000,
    };
  }

  const stripeKey = params.config.billing.stripeSecretKey;
  if (!stripeKey) {
    throw new Error("billing_unconfigured");
  }
  const stripeApiBase = params.config.billing.stripeApiBaseUrl.replace(/\/+$/, "");
  const priceId =
    (params.priceId || "").trim() ||
    params.config.billing.stripePriceIdsByPlan.get(planId) ||
    "";
  if (!priceId) {
    throw new Error("missing_price_id_for_plan");
  }
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("success_url", successUrl);
  body.set("cancel_url", cancelUrl);
  body.set("line_items[0][price]", priceId);
  body.set("line_items[0][quantity]", "1");
  body.set("metadata[workspace_id]", params.workspaceId);
  body.set("metadata[plan_id]", planId);
  if (params.customerEmail?.trim()) {
    body.set("customer_email", params.customerEmail.trim());
  }
  const response = await fetch(`${stripeApiBase}/v1/checkout/sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${stripeKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const raw = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    parsed = { raw };
  }
  if (!response.ok) {
    const errorMessage =
      typeof parsed?.error === "object" &&
      parsed.error &&
      typeof (parsed.error as Record<string, unknown>).message === "string"
        ? String((parsed.error as Record<string, unknown>).message)
        : `stripe_checkout_failed_${response.status}`;
    throw new Error(errorMessage);
  }
  const id = typeof parsed.id === "string" ? parsed.id : "";
  const url = typeof parsed.url === "string" ? parsed.url : "";
  if (!id || !url) {
    throw new Error("stripe_checkout_invalid_response");
  }
  const expiresAtMs =
    typeof parsed.expires_at === "number" && Number.isFinite(parsed.expires_at)
      ? Math.floor(parsed.expires_at * 1000)
      : undefined;
  return {
    provider: "stripe",
    checkoutUrl: url,
    sessionId: id,
    expiresAtMs,
  };
}

export function verifyWebhookAndParseEvent(params: {
  config: FrontdoorConfig;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}): BillingWebhookEvent {
  const provider = params.config.billing.provider;
  const secret = params.config.billing.webhookSecret;
  if (!secret) {
    throw new Error("billing_unconfigured");
  }
  if (provider === "none") {
    throw new Error("billing_unconfigured");
  }

  if (provider === "mock") {
    const timestampRaw = Array.isArray(params.headers["x-frontdoor-webhook-timestamp"])
      ? params.headers["x-frontdoor-webhook-timestamp"][0]
      : params.headers["x-frontdoor-webhook-timestamp"];
    const signatureRaw = Array.isArray(params.headers["x-frontdoor-webhook-signature"])
      ? params.headers["x-frontdoor-webhook-signature"][0]
      : params.headers["x-frontdoor-webhook-signature"];
    const timestamp = String(timestampRaw || "").trim();
    const signature = String(signatureRaw || "").trim();
    if (!timestamp || !signature) {
      throw new Error("invalid_webhook_signature");
    }
    const signedPayload = `${timestamp}.${params.rawBody}`;
    const expected = toBase64(hmacSha256(secret, signedPayload));
    if (!safeCompareBase64(expected, signature)) {
      throw new Error("invalid_webhook_signature");
    }
    const parsed = JSON.parse(params.rawBody) as Record<string, unknown>;
    const eventId = typeof parsed.id === "string" ? parsed.id.trim() : "";
    const eventType = typeof parsed.type === "string" ? parsed.type.trim() : "";
    const workspaceId =
      typeof parsed.workspace_id === "string" && parsed.workspace_id.trim()
        ? parsed.workspace_id.trim()
        : undefined;
    if (!eventId || !eventType) {
      throw new Error("invalid_webhook_payload");
    }
    return {
      provider: "mock",
      eventId,
      eventType,
      workspaceId,
      payload: parsed,
    };
  }

  const stripeSignatureHeaderRaw = Array.isArray(params.headers["stripe-signature"])
    ? params.headers["stripe-signature"][0]
    : params.headers["stripe-signature"];
  const stripeSignatureHeader = String(stripeSignatureHeaderRaw || "").trim();
  if (!stripeSignatureHeader) {
    throw new Error("invalid_webhook_signature");
  }
  const parsedHeader = parseStripeSignatureHeader(stripeSignatureHeader);
  if (!parsedHeader.timestamp || parsedHeader.v1Signatures.length === 0) {
    throw new Error("invalid_webhook_signature");
  }
  const signedPayload = `${parsedHeader.timestamp}.${params.rawBody}`;
  const expected = hmacSha256(secret, signedPayload).toString("hex");
  const valid = parsedHeader.v1Signatures.some((candidate) => safeCompareHex(expected, candidate));
  if (!valid) {
    throw new Error("invalid_webhook_signature");
  }
  const parsed = JSON.parse(params.rawBody) as Record<string, unknown>;
  const eventId = typeof parsed.id === "string" ? parsed.id.trim() : "";
  const eventType = typeof parsed.type === "string" ? parsed.type.trim() : "";
  if (!eventId || !eventType) {
    throw new Error("invalid_webhook_payload");
  }
  return {
    provider: "stripe",
    eventId,
    eventType,
    workspaceId: resolveWorkspaceIdFromStripeObject(parsed),
    payload: parsed,
  };
}
