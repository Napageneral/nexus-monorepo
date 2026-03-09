import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";
import { ensureGlowbotPipelineResources } from "../pipeline/registry.js";
import { startGlowbotAdapterSubscriptions } from "../pipeline/subscriptions.js";

export default async function onActivate(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot] Activating app version ${ctx.app.version}...`);

  const resources = await ensureGlowbotPipelineResources({
    runtime: ctx.nex.runtime,
    appId: ctx.app.id,
  });
  startGlowbotAdapterSubscriptions({
    ctx,
    metricExtractJobId: resources.jobs.metricExtract.id,
  });

  try {
    ctx.nex.audit.log("glowbot.activate", {
      version: ctx.app.version,
      appId: ctx.app.id,
      metricExtractJobId: resources.jobs.metricExtract.id,
    });
  } catch {
    console.log("[GlowBot] Audit log not available");
  }

  console.log("[GlowBot] Activation complete");
}
