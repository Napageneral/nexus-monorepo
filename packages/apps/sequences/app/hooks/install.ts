import { assertStoreReady, requireStore } from "../lib/store.js";
import type { HookContext } from "../lib/types.js";
import { ensureSequencesWork } from "./runtime-work.js";

// Install runs onInstall then onActivate; upgrade runs the old release's onDeactivate, then this
// release's onUpgrade and onActivate. Hooks take no params, so nothing here can be hash-confirmed:
// they keep the tick schedule's `enabled` exactly as they find it.
export default async function onInstall(ctx: HookContext): Promise<void> {
  await assertStoreReady(ctx.app);
  const work = await ensureSequencesWork(ctx.nex, ctx.app.id, requireStore(ctx.app));
  console.log(
    `[sequences] ${ctx.app.version}: jobs=${Object.keys(work.jobIds).length} tick=${work.jobId} schedule=${work.scheduleId} enabled=${work.scheduleEnabled}`,
  );
}
