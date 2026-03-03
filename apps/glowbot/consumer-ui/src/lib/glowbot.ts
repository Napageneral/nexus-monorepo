/**
 * Re-export shared GlowBot types and constants for use in UI components.
 * Single import point: `import { GLOWBOT_METHODS, type GlowbotOverviewResponse } from "@/lib/glowbot"`
 */
export {
  GLOWBOT_METHODS,
  type GlowbotPeriod,
  type GlowbotModelingWindow,
  type GlowbotOverviewParams,
  type GlowbotOverviewResponse,
  type GlowbotFunnelParams,
  type GlowbotFunnelResponse,
  type GlowbotModelingParams,
  type GlowbotModelingResponse,
  type GlowbotAgentsResponse,
  type GlowbotAgentsRecommendationsParams,
  type GlowbotAgentsRecommendationsResponse,
  type GlowbotIntegrationsResponse,
  type GlowbotIntegrationsConnectOauthStartParams,
  type GlowbotIntegrationsConnectOauthStartResponse,
  type GlowbotIntegrationsConnectApikeyParams,
  type GlowbotIntegrationsConnectApikeyResponse,
  type GlowbotIntegrationsConnectUploadParams,
  type GlowbotIntegrationsConnectUploadResponse,
  type GlowbotIntegrationsTestParams,
  type GlowbotIntegrationsTestResponse,
  type GlowbotIntegrationsDisconnectParams,
  type GlowbotIntegrationsDisconnectResponse,
  type GlowbotPipelineStatusResponse,
  type GlowbotPipelineTriggerResponse,
} from "@glowbot/shared/types";
