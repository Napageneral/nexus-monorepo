import type { HookContext } from "../lib/types.js";
import { pauseSequencesWork } from "./runtime-work.js";

export default async function onDeactivate(ctx: HookContext): Promise<void> {
  await pauseSequencesWork(ctx.nex);
}
