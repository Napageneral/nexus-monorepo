import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";
import { removeGlowbotPipelineResources } from "../pipeline/registry.js";
import { removeGlowbotRuntimeWork } from "../pipeline/runtime-work.js";

export default async function onUninstall(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot] Uninstalling app version ${ctx.app.version}...`);

  await removeGlowbotRuntimeWork({
    runtime: ctx.nex.runtime,
  });
  await removeGlowbotPipelineResources({
    runtime: ctx.nex.runtime,
  });

  try {
    ctx.nex.audit.log("glowbot.uninstall", {
      version: ctx.app.version,
      appId: ctx.app.id,
    });
  } catch {
    console.log("[GlowBot] Audit log not available");
  }

  console.log("[GlowBot] Uninstall complete");
}
