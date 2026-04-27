import fs from "node:fs";
import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";
import { openWebSignalsDb } from "../methods/store.js";

export default async function onInstall(ctx: NexAppHookContext): Promise<void> {
  fs.mkdirSync(ctx.app.dataDir, { recursive: true });
  const db = openWebSignalsDb(ctx.app.dataDir);
  db.close();
  console.log(`[web-signals] installed ${ctx.app.id} v${ctx.app.version} at ${ctx.app.dataDir}`);
}
