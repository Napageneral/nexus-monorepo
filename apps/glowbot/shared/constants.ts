/**
 * GlowBot Shared Constants
 *
 * Adapter IDs, categories, and other constants shared across packages.
 */

export const GLOWBOT_ADAPTER_IDS = {
  google: "google",
  metaAds: "meta-ads",
  patientNowEmr: "patient-now-emr",
  zenotiEmr: "zenoti-emr",
  callrail: "callrail",
  twilio: "twilio",
  appleMaps: "apple-maps",
} as const;

export type GlowbotAdapterId = (typeof GLOWBOT_ADAPTER_IDS)[keyof typeof GLOWBOT_ADAPTER_IDS];

export const ADAPTER_CATEGORIES: Record<string, "advertising" | "emr" | "local"> = {
  google: "advertising",
  "meta-ads": "advertising",
  "apple-maps": "local",
  callrail: "local",
  twilio: "local",
  "patient-now-emr": "emr",
  "zenoti-emr": "emr",
};

export const ADAPTER_DISPLAY_NAMES: Record<string, string> = {
  google: "Google",
  "meta-ads": "Meta Ads",
  "apple-maps": "Apple Maps",
  callrail: "CallRail",
  twilio: "Twilio",
  "patient-now-emr": "PatientNow EMR",
  "zenoti-emr": "Zenoti EMR",
};
