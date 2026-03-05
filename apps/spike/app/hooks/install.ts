import type { NexAppHookContext } from "../../../nex/src/apps/context.js";
import { join } from "node:path";
import { access } from "node:fs/promises";

export default async function onInstall(ctx: NexAppHookContext): Promise<void> {
  console.log(`[spike] Installing app version ${ctx.app.version}`);

  // Verify engine binary exists
  const enginePath = join(ctx.app.packageDir, "bin", "spike-engine");
  try {
    await access(enginePath);
    console.log("[spike] Engine binary verified");
  } catch (error) {
    console.error("[spike] Engine binary not found at:", enginePath);
    throw new Error("Spike engine binary not found. Installation incomplete.", { cause: error });
  }

  console.log("[spike] Installation complete");
}
