import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";
import { stopGlowbotAdapterSubscriptions } from "../pipeline/subscriptions.js";

export default async function onUninstall(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot] Uninstalling app version ${ctx.app.version}...`);

  stopGlowbotAdapterSubscriptions();

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
