import type { HookContext } from "../lib/types.js";
import { retireSequencesWork } from "./runtime-work.js";

export default async function onUninstall(ctx: HookContext): Promise<void> {
  await retireSequencesWork(ctx.nex);
}
