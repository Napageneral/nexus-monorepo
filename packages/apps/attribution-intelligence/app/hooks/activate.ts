import type { NexAppHookContext } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { ensureAttributionRuntimeWork } from "./runtime-work.js";

export default async function onActivate(ctx: NexAppHookContext): Promise<void> {
  const result = await ensureAttributionRuntimeWork({
    runtime: ctx.nex,
    appId: ctx.app.id,
    dataDir: ctx.app.dataDir,
  });
  console.log(
    `[attribution] activate complete (${result.recordIngestedJobDefinitionId}, ${result.manualReplayJobDefinitionId}, ${result.subscriptionIds.length} subscriptions)`,
  );
}
