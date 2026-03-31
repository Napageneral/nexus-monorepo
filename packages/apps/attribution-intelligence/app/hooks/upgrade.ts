import fs from "node:fs";
import type { NexAppHookContext } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { openAttributionDb } from "../storage/store.js";
import { ensureAttributionRuntimeWork } from "./runtime-work.js";

export default async function onUpgrade(ctx: NexAppHookContext): Promise<void> {
  fs.mkdirSync(ctx.app.dataDir, { recursive: true });
  const db = openAttributionDb(ctx.app.dataDir);
  db.close();
  await ensureAttributionRuntimeWork({
    runtime: ctx.nex,
    appId: ctx.app.id,
    dataDir: ctx.app.dataDir,
  });
  console.log("[attribution] upgrade complete");
}
