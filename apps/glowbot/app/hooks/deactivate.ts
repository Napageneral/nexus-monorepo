import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";
import { setGlowbotMetricExtractScheduleEnabled } from "../pipeline/registry.js";
import { disableGlowbotRuntimeWork } from "../pipeline/runtime-work.js";

export default async function onDeactivate(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot] Deactivating app version ${ctx.app.version}...`);

  await disableGlowbotRuntimeWork({
    runtime: ctx.nex.runtime,
  });
  await setGlowbotMetricExtractScheduleEnabled({
    runtime: ctx.nex.runtime,
    enabled: false,
  });

  try {
    ctx.nex.audit.log("glowbot.deactivate", {
      version: ctx.app.version,
      appId: ctx.app.id,
    });
  } catch {
    console.log("[GlowBot] Audit log not available");
  }

  console.log("[GlowBot] Deactivation complete");
}
