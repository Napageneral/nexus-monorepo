import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { handle as overviewHandler } from "./overview.js";
import { handle as funnelHandler } from "./funnel.js";
import { handle as modelingHandler } from "./modeling.js";
import { handle as agentsHandler } from "./agents.js";
import { handle as agentsRecommendationsHandler } from "./agents-recommendations.js";
import { handle as clinicProfileGetHandler } from "./clinic-profile-get.js";
import { handle as clinicProfileUpdateHandler } from "./clinic-profile-update.js";
import { handle as integrationsHandler } from "./integrations.js";
import { handle as integrationsConnectOauthStartHandler } from "./integrations-connect-oauth-start.js";
import { handle as integrationsConnectApikeyHandler } from "./integrations-connect-apikey.js";
import { handle as integrationsConnectUploadHandler } from "./integrations-connect-upload.js";
import { handle as integrationsTestHandler } from "./integrations-test.js";
import { handle as integrationsBackfillHandler } from "./integrations-backfill.js";
import { handle as integrationsDisconnectHandler } from "./integrations-disconnect.js";
import { handle as pipelineStatusHandler } from "./pipeline-status.js";
import { handle as pipelineTriggerHandler } from "./pipeline-trigger.js";
import { handle as productFlagsListHandler } from "./product-flags-list.js";

export const handlers: Record<string, NexAppMethodHandler> = {
  "glowbot.overview": overviewHandler,
  "glowbot.funnel": funnelHandler,
  "glowbot.modeling": modelingHandler,
  "glowbot.agents": agentsHandler,
  "glowbot.agents.recommendations": agentsRecommendationsHandler,
  "glowbot.clinicProfile.get": clinicProfileGetHandler,
  "glowbot.clinicProfile.update": clinicProfileUpdateHandler,
  "glowbot.integrations": integrationsHandler,
  "glowbot.integrations.connect.oauth.start": integrationsConnectOauthStartHandler,
  "glowbot.integrations.connect.apikey": integrationsConnectApikeyHandler,
  "glowbot.integrations.connect.upload": integrationsConnectUploadHandler,
  "glowbot.integrations.test": integrationsTestHandler,
  "glowbot.integrations.backfill": integrationsBackfillHandler,
  "glowbot.integrations.disconnect": integrationsDisconnectHandler,
  "glowbot.productFlags.list": productFlagsListHandler,
  "glowbot.pipeline.status": pipelineStatusHandler,
  "glowbot.pipeline.trigger": pipelineTriggerHandler,
};
