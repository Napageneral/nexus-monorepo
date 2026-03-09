import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";
import { ensureGlowbotPipelineResources } from "../pipeline/registry.js";

export default async function onInstall(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot] Installing app version ${ctx.app.version}...`);

  const resources = await ensureGlowbotPipelineResources({
    runtime: ctx.nex.runtime,
    appId: ctx.app.id,
  });

  try {
    ctx.nex.audit.log("glowbot.install", {
      version: ctx.app.version,
      appId: ctx.app.id,
      metricExtractJobId: resources.jobs.metricExtract.id,
      dagId: resources.dag.id,
      cronId: resources.cron.id,
    });
  } catch {
    console.log("[GlowBot] Audit log not available");
  }

  console.log("[GlowBot] Installation complete");
}
