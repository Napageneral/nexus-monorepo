/**
 * GlowBot Shared Types
 *
 * Shared across the clinic app package, clinic UI, and admin app.
 * Single source of truth for GlowBot contracts.
 */

// ---------------------------------------------------------------------------
// Method name constants
// ---------------------------------------------------------------------------

export const GLOWBOT_METHODS = {
  overview: "glowbot.overview",
  funnel: "glowbot.funnel",
  modeling: "glowbot.modeling",
  agents: "glowbot.agents",
  agentsRecommendations: "glowbot.agents.recommendations",
  clinicProfileGet: "glowbot.clinicProfile.get",
  clinicProfileUpdate: "glowbot.clinicProfile.update",
  integrations: "glowbot.integrations",
  integrationsConnectOauthStart: "glowbot.integrations.connect.oauth.start",
  integrationsConnectApikey: "glowbot.integrations.connect.apikey",
  integrationsConnectUpload: "glowbot.integrations.connect.upload",
  integrationsTest: "glowbot.integrations.test",
  integrationsBackfill: "glowbot.integrations.backfill",
  integrationsDisconnect: "glowbot.integrations.disconnect",
  productFlagsList: "glowbot.productFlags.list",
  pipelineStatus: "glowbot.pipeline.status",
  pipelineTrigger: "glowbot.pipeline.trigger",
} as const;

// ---------------------------------------------------------------------------
// Common scalars
// ---------------------------------------------------------------------------

export type GlowbotPeriod = "7d" | "30d" | "90d";
export type GlowbotModelingWindow = "3m" | "6m" | "12m";
export type GlowbotClinicProfileBand = string;

export interface GlowbotClinicProfile {
  clinicId: string;
  specialty: string;
  monthlyAdSpendBand: GlowbotClinicProfileBand;
  patientVolumeBand: GlowbotClinicProfileBand;
  locationCountBand: GlowbotClinicProfileBand;
  source: {
    updatedAtMs: number;
    updatedBy: "clinic_app" | "operator";
    version: number;
  };
}

export interface GlowbotProductFlag {
  key: string;
  value: unknown;
  description?: string;
  updatedAtMs: number;
}

// ---------------------------------------------------------------------------
// glowbot.clinicProfile.*
// ---------------------------------------------------------------------------

export interface GlowbotClinicProfileGetResponse {
  clinicProfile: GlowbotClinicProfile | null;
}

export interface GlowbotClinicProfileUpdateParams {
  specialty: string;
  monthlyAdSpendBand?: GlowbotClinicProfileBand;
  patientVolumeBand?: GlowbotClinicProfileBand;
  locationCountBand?: GlowbotClinicProfileBand;
}

export interface GlowbotClinicProfileUpdateResponse {
  clinicProfile: GlowbotClinicProfile;
}

// ---------------------------------------------------------------------------
// glowbot.overview
// ---------------------------------------------------------------------------

export interface GlowbotOverviewParams {
  period: GlowbotPeriod;
}

export interface GlowbotOverviewResponse {
  heroStat: {
    label: string;
    value: number;
    delta: number;
    deltaPercent: number;
    deltaDirection: "up" | "down" | "flat";
    comparedTo: string;
  };
  topActions: {
    rank: number;
    title: string;
    deltaValue: number;
    deltaUnit: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    category: string;
  }[];
  adapterStatus: {
    adapterId: string;
    name: string;
    connected: boolean;
    lastSync: string | null;
    error: string | null;
  }[];
  pipelineStatus: {
    lastRun: string;
    status: "completed" | "running" | "failed";
    nextRun: string;
  };
}

// ---------------------------------------------------------------------------
// glowbot.funnel
// ---------------------------------------------------------------------------

export interface GlowbotFunnelParams {
  period: GlowbotPeriod;
}

export interface GlowbotFunnelResponse {
  periodStart: string;
  periodEnd: string;
  steps: {
    name: string;
    order: number;
    value: number;
    formattedValue: string;
    conversionRate: number | null;
    peerMedian: number | null;
    deltaVsPeer: number | null;
    sourceBreakdown: Record<string, number>;
    trend: {
      current: number;
      previous: number;
      delta: number;
      deltaPercent: number;
    };
  }[];
  weakestStep: {
    name: string;
    conversionRate: number;
    peerMedian: number;
    gap: number;
    recommendation: string;
  } | null;
}

// ---------------------------------------------------------------------------
// glowbot.modeling
// ---------------------------------------------------------------------------

export interface GlowbotModelingParams {
  model: string;
  window: GlowbotModelingWindow;
}

export interface GlowbotModelingResponse {
  modelName: string;
  series: {
    periodLabel: string;
    periodStart: string;
    yourValue: number;
    peerMedian: number | null;
    peerBandLow: number | null;
    peerBandHigh: number | null;
  }[];
  summary: {
    trend: "improving" | "declining" | "stable";
    correlation: number;
    insight: string;
  };
}

// ---------------------------------------------------------------------------
// glowbot.agents
// ---------------------------------------------------------------------------

export interface GlowbotAgentsResponse {
  agents: {
    category: "demand" | "conversion" | "local" | "benchmark" | "modeling";
    displayName: string;
    status: "active" | "idle" | "error";
    lastRun: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    topRecommendation: {
      title: string;
      deltaValue: number;
      deltaUnit: string;
    } | null;
    recommendationCount: number;
  }[];
  lastPipelineRun: {
    id: string;
    status: string;
    completedAt: string;
    recommendationsGenerated: number;
  };
}

// ---------------------------------------------------------------------------
// glowbot.agents.recommendations
// ---------------------------------------------------------------------------

export interface GlowbotAgentsRecommendationsParams {
  category?: "demand" | "conversion" | "local" | "benchmark" | "modeling";
  limit?: number;
}

export interface GlowbotAgentsRecommendationsResponse {
  recommendations: {
    id: string;
    rank: number;
    title: string;
    deltaValue: number;
    deltaUnit: string;
    description: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    category: string;
    reasoning: string;
    actionData: Record<string, unknown>;
    createdAt: string;
  }[];
}

// ---------------------------------------------------------------------------
// glowbot.integrations
// ---------------------------------------------------------------------------

export interface GlowbotIntegrationsResponse {
  adapters: {
    id: string;
    name: string;
    icon: string;
    category: "advertising" | "emr" | "local";
    status: "connected" | "not_connected" | "expired" | "error";
    backfillDefault?: string;
    connectionProfiles: {
      id: string;
      displayName: string;
      authMethodId: string;
      scope: "app" | "server";
      managedProfileId?: string;
      kind: "oauth2" | "api-key" | "file-upload" | "custom-flow";
      fields?: { name: string; label: string; type: string; required: boolean }[];
    }[];
    connection?: {
      connectionId: string;
      authMethod: string;
      authMethodId?: string;
      scope: "app" | "server";
      connectionProfileId?: string;
      connectedAt: string;
      lastSync: string;
      lastSyncStatus: "success" | "error";
      coverage: number;
      error: string | null;
      metadata: Record<string, string>;
    };
  }[];
}

// ---------------------------------------------------------------------------
// glowbot.integrations.connect.*
// ---------------------------------------------------------------------------

export interface GlowbotIntegrationsConnectOauthStartParams {
  adapterId: string;
  connectionProfileId: string;
}

export interface GlowbotIntegrationsConnectOauthStartResponse {
  redirectUrl: string;
}

export interface GlowbotIntegrationsConnectApikeyParams {
  adapterId: string;
  connectionProfileId: string;
  fields: Record<string, string>;
}

export interface GlowbotIntegrationsConnectApikeyResponse {
  status: "connected" | "error";
  error?: string;
}

export interface GlowbotIntegrationsConnectUploadParams {
  adapterId: string;
  connectionProfileId: string;
  file: string;
  filename: string;
}

export interface GlowbotIntegrationsConnectUploadResponse {
  status: "success" | "error";
  preview?: {
    rowCount: number;
    dateRange: string;
  };
  error?: string;
}

// ---------------------------------------------------------------------------
// glowbot.integrations.test / disconnect
// ---------------------------------------------------------------------------

export interface GlowbotIntegrationsTestParams {
  connectionId: string;
}

export interface GlowbotIntegrationsTestResponse {
  ok: boolean;
  error?: string;
}

export interface GlowbotIntegrationsBackfillParams {
  adapterId: string;
  connectionId: string;
  since?: string;
}

export interface GlowbotIntegrationsBackfillResponse {
  status: "completed";
  since: string;
  recordsProcessed: number;
}

export interface GlowbotIntegrationsDisconnectParams {
  connectionId: string;
}

export interface GlowbotIntegrationsDisconnectResponse {
  status: "disconnected";
}

// ---------------------------------------------------------------------------
// glowbot.productFlags.list
// ---------------------------------------------------------------------------

export interface GlowbotProductFlagsListResponse {
  productFlags: GlowbotProductFlag[];
}

// ---------------------------------------------------------------------------
// glowbot.pipeline.*
// ---------------------------------------------------------------------------

export interface GlowbotPipelineStatusResponse {
  currentRun: {
    id: string;
    status: "running" | "completed" | "failed";
    phase: "phase1" | "phase2" | "idle";
    startedAt: string;
    metricsComputed: number;
  } | null;
  lastCompletedRun: {
    id: string;
    completedAt: string;
    metricsComputed: number;
    recommendationsGenerated: number;
    duration: number;
  };
  nextScheduledRun: string;
  schedule: string;
}

export interface GlowbotPipelineTriggerResponse {
  runId: string;
  status: "started";
}
