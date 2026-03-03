/**
 * GlowBot Shared Types
 *
 * Shared across consumer app (method handlers), consumer-ui (RPC client),
 * and admin app. Single source of truth for all GlowBot contracts.
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
  integrations: "glowbot.integrations",
  integrationsConnectOauthStart: "glowbot.integrations.connect.oauth.start",
  integrationsConnectApikey: "glowbot.integrations.connect.apikey",
  integrationsConnectUpload: "glowbot.integrations.connect.upload",
  integrationsTest: "glowbot.integrations.test",
  integrationsDisconnect: "glowbot.integrations.disconnect",
  pipelineStatus: "glowbot.pipeline.status",
  pipelineTrigger: "glowbot.pipeline.trigger",
} as const;

// ---------------------------------------------------------------------------
// Common scalars
// ---------------------------------------------------------------------------

export type GlowbotPeriod = "7d" | "30d" | "90d";
export type GlowbotModelingWindow = "3m" | "6m" | "12m";

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
    authMethods: {
      type: "oauth2" | "api-key" | "file-upload";
      label: string;
      icon: string;
      fields?: { name: string; label: string; type: string; required: boolean }[];
    }[];
    connection?: {
      authMethod: string;
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
}

export interface GlowbotIntegrationsConnectOauthStartResponse {
  redirectUrl: string;
}

export interface GlowbotIntegrationsConnectApikeyParams {
  adapterId: string;
  fields: Record<string, string>;
}

export interface GlowbotIntegrationsConnectApikeyResponse {
  status: "connected" | "error";
  error?: string;
}

export interface GlowbotIntegrationsConnectUploadParams {
  adapterId: string;
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
  adapterId: string;
}

export interface GlowbotIntegrationsTestResponse {
  ok: boolean;
  error?: string;
}

export interface GlowbotIntegrationsDisconnectParams {
  adapterId: string;
}

export interface GlowbotIntegrationsDisconnectResponse {
  status: "disconnected";
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
