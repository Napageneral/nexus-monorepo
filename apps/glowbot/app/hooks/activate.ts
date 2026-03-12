import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";
import { ensureGlowbotPipelineResources } from "../pipeline/registry.js";
import { ensureGlowbotRuntimeWork } from "../pipeline/runtime-work.js";

export default async function onActivate(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot] Activating app version ${ctx.app.version}...`);

  const resources = await ensureGlowbotPipelineResources({
    runtime: ctx.nex.runtime,
    appId: ctx.app.id,
    scheduleEnabled: true,
  });
  const runtimeWork = await ensureGlowbotRuntimeWork({
    runtime: ctx.nex.runtime,
    metricExtractJobDefinitionId: resources.jobs.metricExtract.id,
  });

  try {
    ctx.nex.audit.log("glowbot.activate", {
      version: ctx.app.version,
      appId: ctx.app.id,
      metricExtractJobId: resources.jobs.metricExtract.id,
      scheduleId: resources.schedule.id,
      subscriptionIds: runtimeWork.subscriptionIds,
    });
  } catch {
    console.log("[GlowBot] Audit log not available");
  }

  console.log("[GlowBot] Activation complete");
}
