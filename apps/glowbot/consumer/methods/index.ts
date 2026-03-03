import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { handle as overviewHandler } from "./overview.js";
import { handle as funnelHandler } from "./funnel.js";
import { handle as modelingHandler } from "./modeling.js";
import { handle as agentsHandler } from "./agents.js";
import { handle as agentsRecommendationsHandler } from "./agents-recommendations.js";
import { handle as integrationsHandler } from "./integrations.js";
import { handle as integrationsConnectOauthStartHandler } from "./integrations-connect-oauth-start.js";
import { handle as integrationsConnectApikeyHandler } from "./integrations-connect-apikey.js";
import { handle as integrationsConnectUploadHandler } from "./integrations-connect-upload.js";
import { handle as integrationsTestHandler } from "./integrations-test.js";
import { handle as integrationsDisconnectHandler } from "./integrations-disconnect.js";
import { handle as pipelineStatusHandler } from "./pipeline-status.js";
import { handle as pipelineTriggerHandler } from "./pipeline-trigger.js";

export const handlers: Record<string, NexAppMethodHandler> = {
  "glowbot.overview": overviewHandler,
  "glowbot.funnel": funnelHandler,
  "glowbot.modeling": modelingHandler,
  "glowbot.agents": agentsHandler,
  "glowbot.agents.recommendations": agentsRecommendationsHandler,
  "glowbot.integrations": integrationsHandler,
  "glowbot.integrations.connect.oauth.start": integrationsConnectOauthStartHandler,
  "glowbot.integrations.connect.apikey": integrationsConnectApikeyHandler,
  "glowbot.integrations.connect.upload": integrationsConnectUploadHandler,
  "glowbot.integrations.test": integrationsTestHandler,
  "glowbot.integrations.disconnect": integrationsDisconnectHandler,
  "glowbot.pipeline.status": pipelineStatusHandler,
  "glowbot.pipeline.trigger": pipelineTriggerHandler,
};
