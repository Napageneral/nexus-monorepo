import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { handle as healthcheckHandler } from "./healthcheck.js";
import { handle as scopesListHandler } from "./scopes-list.js";
import { handle as scopesUpsertHandler } from "./scopes-upsert.js";
import { handle as bindingsListHandler } from "./bindings-list.js";
import { handle as bindingsUpsertHandler } from "./bindings-upsert.js";
import { handle as summaryHandler } from "./summary.js";
import { handle as funnelHandler } from "./funnel.js";
import { handle as adFactsListHandler } from "./ad-facts-list.js";
import { handle as outcomesListHandler } from "./outcomes-list.js";
import { handle as outcomesGetHandler } from "./outcomes-get.js";
import { handle as pipelineStatusHandler } from "./pipeline-status.js";
import { handle as pipelineTriggerHandler } from "./pipeline-trigger.js";

const handlers: Record<string, NexAppMethodHandler> = {
  "attribution.healthcheck": healthcheckHandler,
  "attribution.scopes.list": scopesListHandler,
  "attribution.scopes.upsert": scopesUpsertHandler,
  "attribution.bindings.list": bindingsListHandler,
  "attribution.bindings.upsert": bindingsUpsertHandler,
  "attribution.summary": summaryHandler,
  "attribution.funnel": funnelHandler,
  "attribution.ad-facts.list": adFactsListHandler,
  "attribution.outcomes.list": outcomesListHandler,
  "attribution.outcomes.get": outcomesGetHandler,
  "attribution.pipeline.status": pipelineStatusHandler,
  "attribution.pipeline.trigger": pipelineTriggerHandler,
};

export default handlers;
