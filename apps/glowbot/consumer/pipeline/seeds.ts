import type { MetricDailyRow } from "./types.js";

export const SEED_METRICS: MetricDailyRow[] = [
  // Previous period (2026-01)
  { date: "2026-01-05", adapterId: "google-ads", metricName: "ad_spend", metricValue: 2500 },
  { date: "2026-01-06", adapterId: "meta-ads", metricName: "ad_spend", metricValue: 1200 },
  {
    date: "2026-01-05",
    adapterId: "google-ads",
    metricName: "ad_impressions",
    metricValue: 50000,
  },
  {
    date: "2026-01-06",
    adapterId: "meta-ads",
    metricName: "ad_impressions",
    metricValue: 27000,
  },
  {
    date: "2026-01-10",
    adapterId: "google-business-profile",
    metricName: "listing_views_search",
    metricValue: 4800,
  },
  {
    date: "2026-01-10",
    adapterId: "google-business-profile",
    metricName: "listing_views_maps",
    metricValue: 2500,
  },
  { date: "2026-01-05", adapterId: "google-ads", metricName: "ad_clicks", metricValue: 3600 },
  { date: "2026-01-06", adapterId: "meta-ads", metricName: "ad_clicks", metricValue: 1850 },
  {
    date: "2026-01-10",
    adapterId: "google-business-profile",
    metricName: "listing_clicks_website",
    metricValue: 420,
  },
  {
    date: "2026-01-10",
    adapterId: "google-business-profile",
    metricName: "listing_clicks_directions",
    metricValue: 290,
  },
  {
    date: "2026-01-10",
    adapterId: "google-business-profile",
    metricName: "listing_clicks_phone",
    metricValue: 260,
  },
  {
    date: "2026-01-12",
    adapterId: "patient-now-emr",
    metricName: "appointments_booked",
    metricValue: 140,
  },
  {
    date: "2026-01-13",
    adapterId: "zenoti-emr",
    metricName: "appointments_booked",
    metricValue: 30,
  },
  {
    date: "2026-01-12",
    adapterId: "patient-now-emr",
    metricName: "appointments_completed",
    metricValue: 110,
  },
  {
    date: "2026-01-13",
    adapterId: "zenoti-emr",
    metricName: "appointments_completed",
    metricValue: 20,
  },
  { date: "2026-01-15", adapterId: "patient-now-emr", metricName: "revenue", metricValue: 38000 },
  { date: "2026-01-15", adapterId: "zenoti-emr", metricName: "revenue", metricValue: 7000 },

  // Current period (2026-02)
  { date: "2026-02-05", adapterId: "google-ads", metricName: "ad_spend", metricValue: 3200 },
  { date: "2026-02-06", adapterId: "meta-ads", metricName: "ad_spend", metricValue: 1500 },
  {
    date: "2026-02-05",
    adapterId: "google-ads",
    metricName: "ad_impressions",
    metricValue: 61000,
  },
  {
    date: "2026-02-06",
    adapterId: "meta-ads",
    metricName: "ad_impressions",
    metricValue: 34000,
  },
  {
    date: "2026-02-10",
    adapterId: "google-business-profile",
    metricName: "listing_views_search",
    metricValue: 6200,
  },
  {
    date: "2026-02-10",
    adapterId: "google-business-profile",
    metricName: "listing_views_maps",
    metricValue: 3200,
  },
  { date: "2026-02-05", adapterId: "google-ads", metricName: "ad_clicks", metricValue: 4700 },
  { date: "2026-02-06", adapterId: "meta-ads", metricName: "ad_clicks", metricValue: 2300 },
  {
    date: "2026-02-10",
    adapterId: "google-business-profile",
    metricName: "listing_clicks_website",
    metricValue: 560,
  },
  {
    date: "2026-02-10",
    adapterId: "google-business-profile",
    metricName: "listing_clicks_directions",
    metricValue: 360,
  },
  {
    date: "2026-02-10",
    adapterId: "google-business-profile",
    metricName: "listing_clicks_phone",
    metricValue: 310,
  },
  {
    date: "2026-02-12",
    adapterId: "patient-now-emr",
    metricName: "appointments_booked",
    metricValue: 180,
  },
  {
    date: "2026-02-13",
    adapterId: "zenoti-emr",
    metricName: "appointments_booked",
    metricValue: 40,
  },
  {
    date: "2026-02-12",
    adapterId: "patient-now-emr",
    metricName: "appointments_completed",
    metricValue: 150,
  },
  {
    date: "2026-02-13",
    adapterId: "zenoti-emr",
    metricName: "appointments_completed",
    metricValue: 25,
  },
  { date: "2026-02-15", adapterId: "patient-now-emr", metricName: "revenue", metricValue: 52000 },
  { date: "2026-02-15", adapterId: "zenoti-emr", metricName: "revenue", metricValue: 9000 },

  // Last 7-day slice
  { date: "2026-02-23", adapterId: "google-ads", metricName: "ad_spend", metricValue: 800 },
  { date: "2026-02-24", adapterId: "meta-ads", metricName: "ad_spend", metricValue: 420 },
  {
    date: "2026-02-23",
    adapterId: "patient-now-emr",
    metricName: "appointments_completed",
    metricValue: 45,
  },
];

export const SEED_PEER_MEDIANS: Record<string, number> = {
  impressions: 20.5,
  clicks: 0.092,
  page_views: 0.75,
  page_actions: 0.5,
  bookings: 0.032,
  consults: 0.78,
  purchases: 320,
};

export const SEED_RECOMMENDATIONS = [
  {
    id: "rec-demand-1",
    rank: 1,
    title: "Increase Meta Ad Spend by 15%",
    deltaValue: 12,
    deltaUnit: "new patients per month",
    description:
      "Meta campaigns are under-invested relative to peer clinics with similar conversion quality.",
    confidence: "HIGH" as const,
    category: "demand",
    reasoning: "Consistent positive ROAS in the last two periods.",
    actionData: { channel: "meta-ads", budgetDeltaPercent: 15 },
    createdAt: "2026-02-25T18:00:00.000Z",
  },
  {
    id: "rec-conversion-1",
    rank: 2,
    title: "Reduce No-Show Rate to 12%",
    deltaValue: 10,
    deltaUnit: "new patients per month",
    description: "No-show rates remain above peer benchmark at the consult step.",
    confidence: "HIGH" as const,
    category: "conversion",
    reasoning: "Gap persists for 3 consecutive windows.",
    actionData: { initiative: "appointment-reminders" },
    createdAt: "2026-02-25T18:02:00.000Z",
  },
  {
    id: "rec-local-1",
    rank: 3,
    title: "Increase Review Collection by 40%",
    deltaValue: 8,
    deltaUnit: "new patients per month",
    description: "Review velocity is correlated with inbound listing clicks and calls.",
    confidence: "MEDIUM" as const,
    category: "local",
    reasoning: "Correlation is stable, but sample size is moderate.",
    actionData: { channel: "google-maps", reviewGoalDeltaPercent: 40 },
    createdAt: "2026-02-25T18:05:00.000Z",
  },
  {
    id: "rec-benchmark-1",
    rank: 4,
    title: "Improve Consult-to-Booking Rate to Peer Median",
    deltaValue: 6,
    deltaUnit: "new patients per month",
    description: "Your consult conversion trails peer median for your clinic profile.",
    confidence: "MEDIUM" as const,
    category: "benchmark",
    reasoning: "Conversion shortfall exceeds 10% against peer median.",
    actionData: { targetMetric: "consults" },
    createdAt: "2026-02-25T18:06:00.000Z",
  },
  {
    id: "rec-modeling-1",
    rank: 5,
    title: "Shift Budget Toward High-Intent Campaigns",
    deltaValue: 4,
    deltaUnit: "new patients per month",
    description: "Modeled output indicates stronger conversion efficiency in intent-heavy segments.",
    confidence: "MEDIUM" as const,
    category: "modeling",
    reasoning: "Model fit is moderate with improving trend.",
    actionData: { model: "ad_spend_to_consults" },
    createdAt: "2026-02-25T18:10:00.000Z",
  },
];

export const SEED_MODELING_SERIES: Record<
  string,
  Array<{
    periodLabel: string;
    periodStart: string;
    yourValue: number;
    peerMedian: number | null;
    peerBandLow: number | null;
    peerBandHigh: number | null;
  }>
> = {
  ad_spend_to_consults: [
    {
      periodLabel: "Sep",
      periodStart: "2025-09-01",
      yourValue: 0.031,
      peerMedian: 0.028,
      peerBandLow: 0.021,
      peerBandHigh: 0.036,
    },
    {
      periodLabel: "Oct",
      periodStart: "2025-10-01",
      yourValue: 0.032,
      peerMedian: 0.029,
      peerBandLow: 0.022,
      peerBandHigh: 0.036,
    },
    {
      periodLabel: "Nov",
      periodStart: "2025-11-01",
      yourValue: 0.034,
      peerMedian: 0.03,
      peerBandLow: 0.022,
      peerBandHigh: 0.037,
    },
    {
      periodLabel: "Dec",
      periodStart: "2025-12-01",
      yourValue: 0.033,
      peerMedian: 0.03,
      peerBandLow: 0.023,
      peerBandHigh: 0.038,
    },
    {
      periodLabel: "Jan",
      periodStart: "2026-01-01",
      yourValue: 0.035,
      peerMedian: 0.031,
      peerBandLow: 0.024,
      peerBandHigh: 0.039,
    },
    {
      periodLabel: "Feb",
      periodStart: "2026-02-01",
      yourValue: 0.037,
      peerMedian: 0.032,
      peerBandLow: 0.025,
      peerBandHigh: 0.039,
    },
  ],
  review_velocity: [
    {
      periodLabel: "Sep",
      periodStart: "2025-09-01",
      yourValue: 21,
      peerMedian: 18,
      peerBandLow: 14,
      peerBandHigh: 23,
    },
    {
      periodLabel: "Oct",
      periodStart: "2025-10-01",
      yourValue: 22,
      peerMedian: 18,
      peerBandLow: 14,
      peerBandHigh: 24,
    },
    {
      periodLabel: "Nov",
      periodStart: "2025-11-01",
      yourValue: 24,
      peerMedian: 19,
      peerBandLow: 15,
      peerBandHigh: 24,
    },
    {
      periodLabel: "Dec",
      periodStart: "2025-12-01",
      yourValue: 23,
      peerMedian: 19,
      peerBandLow: 15,
      peerBandHigh: 25,
    },
    {
      periodLabel: "Jan",
      periodStart: "2026-01-01",
      yourValue: 25,
      peerMedian: 20,
      peerBandLow: 15,
      peerBandHigh: 25,
    },
    {
      periodLabel: "Feb",
      periodStart: "2026-02-01",
      yourValue: 27,
      peerMedian: 21,
      peerBandLow: 16,
      peerBandHigh: 26,
    },
  ],
  noshow_rate: [
    {
      periodLabel: "Sep",
      periodStart: "2025-09-01",
      yourValue: 0.16,
      peerMedian: 0.12,
      peerBandLow: 0.09,
      peerBandHigh: 0.15,
    },
    {
      periodLabel: "Oct",
      periodStart: "2025-10-01",
      yourValue: 0.158,
      peerMedian: 0.121,
      peerBandLow: 0.09,
      peerBandHigh: 0.151,
    },
    {
      periodLabel: "Nov",
      periodStart: "2025-11-01",
      yourValue: 0.152,
      peerMedian: 0.12,
      peerBandLow: 0.09,
      peerBandHigh: 0.15,
    },
    {
      periodLabel: "Dec",
      periodStart: "2025-12-01",
      yourValue: 0.149,
      peerMedian: 0.119,
      peerBandLow: 0.089,
      peerBandHigh: 0.149,
    },
    {
      periodLabel: "Jan",
      periodStart: "2026-01-01",
      yourValue: 0.145,
      peerMedian: 0.118,
      peerBandLow: 0.088,
      peerBandHigh: 0.148,
    },
    {
      periodLabel: "Feb",
      periodStart: "2026-02-01",
      yourValue: 0.141,
      peerMedian: 0.117,
      peerBandLow: 0.087,
      peerBandHigh: 0.147,
    },
  ],
};

export const SEED_INTEGRATIONS = [
  {
    id: "google-ads",
    name: "Google Ads",
    icon: "google-ads",
    category: "advertising" as const,
    status: "connected" as const,
    authMethods: [{ type: "oauth2" as const, label: "Google OAuth", icon: "oauth" }],
    connection: {
      authMethod: "oauth2",
      connectedAt: "2026-01-18T10:00:00.000Z",
      lastSync: "2026-02-25T16:20:00.000Z",
      lastSyncStatus: "success" as const,
      coverage: 94,
      error: null,
      metadata: { accountName: "Glow Aesthetics Ads", accountId: "ga-123" },
    },
  },
  {
    id: "meta-ads",
    name: "Meta Ads",
    icon: "meta-ads",
    category: "advertising" as const,
    status: "connected" as const,
    authMethods: [{ type: "oauth2" as const, label: "Meta OAuth", icon: "oauth" }],
    connection: {
      authMethod: "oauth2",
      connectedAt: "2026-01-20T09:00:00.000Z",
      lastSync: "2026-02-25T15:45:00.000Z",
      lastSyncStatus: "success" as const,
      coverage: 89,
      error: null,
      metadata: { accountName: "Glow Meta", accountId: "meta-441" },
    },
  },
  {
    id: "patient-now-emr",
    name: "Patient Now",
    icon: "patient-now",
    category: "emr" as const,
    status: "connected" as const,
    authMethods: [
      {
        type: "api-key" as const,
        label: "API Key",
        icon: "key",
        fields: [{ name: "api_key", label: "API Key", type: "password", required: true }],
      },
      { type: "file-upload" as const, label: "CSV Upload", icon: "upload" },
    ],
    connection: {
      authMethod: "api-key",
      connectedAt: "2026-01-12T12:00:00.000Z",
      lastSync: "2026-02-25T17:00:00.000Z",
      lastSyncStatus: "success" as const,
      coverage: 82,
      error: null,
      metadata: { accountName: "Clinic EMR" },
    },
  },
  {
    id: "zenoti-emr",
    name: "Zenoti",
    icon: "zenoti",
    category: "emr" as const,
    status: "not_connected" as const,
    authMethods: [
      {
        type: "api-key" as const,
        label: "API Key",
        icon: "key",
        fields: [{ name: "api_key", label: "API Key", type: "password", required: true }],
      },
      { type: "file-upload" as const, label: "CSV Upload", icon: "upload" },
    ],
  },
  {
    id: "google-business-profile",
    name: "Google Maps",
    icon: "google-maps",
    category: "local" as const,
    status: "connected" as const,
    authMethods: [
      { type: "oauth2" as const, label: "Google OAuth", icon: "oauth" },
      { type: "file-upload" as const, label: "CSV Upload", icon: "upload" },
    ],
    connection: {
      authMethod: "oauth2",
      connectedAt: "2026-01-10T09:00:00.000Z",
      lastSync: "2026-02-25T13:30:00.000Z",
      lastSyncStatus: "success" as const,
      coverage: 100,
      error: null,
      metadata: { listingName: "Glow Aesthetics" },
    },
  },
];

export const SEED_PIPELINE_STATE = {
  currentRun: null as null | {
    id: string;
    status: "running" | "completed" | "failed";
    phase: "phase1" | "phase2" | "idle";
    startedAt: string;
    metricsComputed: number;
  },
  lastCompletedRun: {
    id: "run-2026-02-25T18:00",
    completedAt: "2026-02-25T18:08:00.000Z",
    metricsComputed: 146,
    recommendationsGenerated: 5,
    duration: 480,
  },
  schedule: "every 6 hours",
  nextScheduledRun: "2026-02-26T00:00:00.000Z",
};
