import type { BrowserWebsiteInputTracker, TrackEventInput } from "@nexus-project/website-input-core";

export type WixEditorSurface = "editor" | "studio" | "harmony" | "unknown";
export type WixRecommendedLane =
  | "custom-code-baseline"
  | "gtm-baseline"
  | "velo-bridge"
  | "unsupported";

export interface WixEnvironmentProfile {
  editorSurface: WixEditorSurface;
  hasCustomCode: boolean;
  hasGtm: boolean;
  hasVelo: boolean;
  published: boolean;
  connectedDomain: boolean;
  usesBookings?: boolean;
  usesForms?: boolean;
}

export interface WixCompatibilityResult {
  baselineSupported: boolean;
  bridgeSupported: boolean;
  recommendedLane: WixRecommendedLane;
  blockers: string[];
  notes: string[];
}

export function assessWixCompatibility(
  profile: WixEnvironmentProfile,
): WixCompatibilityResult {
  const blockers: string[] = [];
  const notes: string[] = [];

  if (profile.editorSurface === "harmony") {
    blockers.push("Wix Harmony does not support the required custom code lane.");
  }
  if (!profile.published || !profile.connectedDomain) {
    blockers.push("Wix custom code validation requires a published site on a connected domain.");
  }

  const baselineSupported =
    blockers.length === 0 && (profile.hasCustomCode || profile.hasGtm);
  const bridgeSupported =
    baselineSupported &&
    (!profile.usesBookings && !profile.usesForms
      ? profile.hasCustomCode || profile.hasGtm
      : profile.hasVelo);

  if (profile.usesBookings || profile.usesForms) {
    notes.push("Bookings and native forms often require deeper Wix-specific bridge work.");
  }

  let recommendedLane: WixRecommendedLane = "unsupported";
  if (baselineSupported && bridgeSupported && profile.hasVelo) {
    recommendedLane = "velo-bridge";
  } else if (baselineSupported && profile.hasCustomCode) {
    recommendedLane = "custom-code-baseline";
  } else if (baselineSupported && profile.hasGtm) {
    recommendedLane = "gtm-baseline";
  }

  return {
    baselineSupported,
    bridgeSupported,
    recommendedLane,
    blockers,
    notes,
  };
}

export async function trackWixRouteView(
  tracker: BrowserWebsiteInputTracker,
  input: Omit<TrackEventInput, "event_name"> = {},
): Promise<void> {
  await tracker.trackPageView(input);
}

export async function trackWixFormSubmit(
  tracker: BrowserWebsiteInputTracker,
  input: Omit<TrackEventInput, "event_name">,
): Promise<void> {
  await tracker.track({
    ...input,
    event_name: "form_submit",
    bridge_surface: input.bridge_surface ?? "form",
  });
}

export async function trackWixBookingComplete(
  tracker: BrowserWebsiteInputTracker,
  input: Omit<TrackEventInput, "event_name">,
): Promise<void> {
  await tracker.track({
    ...input,
    event_name: "booking_complete",
    bridge_surface: input.bridge_surface ?? "booking",
  });
}
