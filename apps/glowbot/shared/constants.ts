/**
 * GlowBot Shared Constants
 *
 * Adapter IDs, categories, and other constants shared across packages.
 */

export const GLOWBOT_ADAPTER_IDS = {
  googleAds: "google-ads",
  googleBusinessProfile: "google-business-profile",
  metaAds: "meta-ads",
  patientNowEmr: "patient-now-emr",
  zenotiEmr: "zenoti-emr",
  appleMaps: "apple-maps",
} as const;

export type GlowbotAdapterId = (typeof GLOWBOT_ADAPTER_IDS)[keyof typeof GLOWBOT_ADAPTER_IDS];

export const ADAPTER_CATEGORIES: Record<string, "advertising" | "emr" | "local"> = {
  "google-ads": "advertising",
  "meta-ads": "advertising",
  "google-business-profile": "local",
  "apple-maps": "local",
  "patient-now-emr": "emr",
  "zenoti-emr": "emr",
};

export const ADAPTER_DISPLAY_NAMES: Record<string, string> = {
  "google-ads": "Google Ads",
  "meta-ads": "Meta Ads",
  "google-business-profile": "Google Business Profile",
  "apple-maps": "Apple Maps",
  "patient-now-emr": "PatientNow EMR",
  "zenoti-emr": "Zenoti EMR",
};

export const GLOWBOT_DB_FILENAME = "glowbot.db";
