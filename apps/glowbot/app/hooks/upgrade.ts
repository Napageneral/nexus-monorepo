import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";
import { ensureGlowbotPipelineResources } from "../pipeline/registry.js";
import { stopGlowbotAdapterSubscriptions } from "../pipeline/subscriptions.js";

export default async function onUpgrade(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot] Upgrading app to version ${ctx.app.version}...`);

  stopGlowbotAdapterSubscriptions();
  const resources = await ensureGlowbotPipelineResources({
    runtime: ctx.nex.runtime,
    appId: ctx.app.id,
  });

  try {
    ctx.nex.audit.log("glowbot.upgrade", {
      version: ctx.app.version,
      appId: ctx.app.id,
      metricExtractJobId: resources.jobs.metricExtract.id,
      dagId: resources.dag.id,
      cronId: resources.cron.id,
    });
  } catch {
    console.log("[GlowBot] Audit log not available");
  }

  console.log("[GlowBot] Upgrade complete");
}
