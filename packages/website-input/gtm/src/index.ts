import type {
  BrowserWebsiteInputTracker,
  TrackEventInput,
} from "@nexus-project/website-input-core";

export type GtmDataLayerEvent = Record<string, unknown> & {
  event?: string;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function mapGtmEvent(entry: GtmDataLayerEvent): TrackEventInput | null {
  const event = asString(entry.event);
  switch (event) {
    case "page_view":
      return { event_name: "page_view" };
    case "view_item":
      return {
        event_name: "product_view",
        target_type: "product",
        target_id: asString(entry.item_id),
        target_label: asString(entry.item_name),
        product_id: asString(entry.item_id),
      };
    case "add_to_cart":
      return {
        event_name: "cart_add",
        target_type: "product",
        product_id: asString(entry.item_id),
        quantity: asNumber(entry.quantity),
      };
    case "begin_checkout":
      return {
        event_name: "checkout_start",
        bridge_surface: "checkout",
      };
    case "generate_lead":
      return {
        event_name: "form_submit",
        bridge_surface: "lead",
        form_id: asString(entry.form_id),
      };
    case "cta_click":
      return {
        event_name: "cta_click",
        surface_id: asString(entry.surface_id),
        surface_label: asString(entry.surface_label),
        surface_category: asString(entry.surface_category),
        target_type: asString(entry.target_type),
        target_id: asString(entry.target_id),
        target_label: asString(entry.target_label),
      };
    default:
      return null;
  }
}

export async function consumeGtmEvent(
  tracker: BrowserWebsiteInputTracker,
  entry: GtmDataLayerEvent,
): Promise<void> {
  const mapped = mapGtmEvent(entry);
  if (!mapped) {
    return;
  }
  await tracker.track(mapped);
}
