import type { TrackEventInput } from "@nexus-project/website-input-core";

export interface ShopifyAttribute {
  key: string;
  value: string;
}

export interface ShopifyBridgeContext {
  sessionId: string;
  handoffId: string;
  browserId?: string | null;
  checkoutToken?: string;
  checkoutKey?: string;
  checkoutId?: string;
  cartToken?: string;
  formId?: string;
  bookingId?: string;
  leadExternalId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  ttclid?: string;
  ttp?: string;
  msclkid?: string;
}

function appendAttribute(
  output: ShopifyAttribute[],
  key: string,
  value: string | null | undefined,
): void {
  if (!value) {
    return;
  }
  output.push({ key, value });
}

export function buildShopifyBridgeAttributes(
  context: ShopifyBridgeContext,
): ShopifyAttribute[] {
  const output: ShopifyAttribute[] = [];
  appendAttribute(output, "ms_session_id", context.sessionId);
  appendAttribute(output, "ms_handoff_id", context.handoffId);
  appendAttribute(output, "ms_browser_id", context.browserId ?? undefined);
  appendAttribute(output, "ms_checkout_token", context.checkoutToken);
  appendAttribute(output, "ms_checkout_key", context.checkoutKey);
  appendAttribute(output, "ms_checkout_id", context.checkoutId);
  appendAttribute(output, "ms_cart_token", context.cartToken);
  appendAttribute(output, "ms_form_id", context.formId);
  appendAttribute(output, "ms_booking_id", context.bookingId);
  appendAttribute(output, "ms_lead_external_id", context.leadExternalId);
  appendAttribute(output, "ms_utm_source", context.utmSource);
  appendAttribute(output, "ms_utm_medium", context.utmMedium);
  appendAttribute(output, "ms_utm_campaign", context.utmCampaign);
  appendAttribute(output, "ms_utm_content", context.utmContent);
  appendAttribute(output, "ms_utm_term", context.utmTerm);
  appendAttribute(output, "ms_fbclid", context.fbclid);
  appendAttribute(output, "ms_fbc", context.fbc);
  appendAttribute(output, "ms_fbp", context.fbp);
  appendAttribute(output, "ms_gclid", context.gclid);
  appendAttribute(output, "ms_gbraid", context.gbraid);
  appendAttribute(output, "ms_wbraid", context.wbraid);
  appendAttribute(output, "ms_ttclid", context.ttclid);
  appendAttribute(output, "ms_ttp", context.ttp);
  appendAttribute(output, "ms_msclkid", context.msclkid);
  return output;
}

export function parseShopifyCheckoutIdentifiers(
  checkoutUrl?: string,
): { checkout_token?: string; checkout_key?: string } {
  if (!checkoutUrl) {
    return {};
  }
  try {
    const url = new URL(checkoutUrl);
    return {
      checkout_token: url.pathname.match(/\/cart\/c\/([^/?]+)/)?.[1],
      checkout_key: url.searchParams.get("key") ?? undefined,
    };
  } catch {
    return {};
  }
}

export function buildShopifyCheckoutTrackInput(
  input: Omit<TrackEventInput, "event_name">,
): TrackEventInput {
  return {
    ...input,
    event_name: "checkout_created",
    bridge_surface: input.bridge_surface ?? "checkout",
  };
}
