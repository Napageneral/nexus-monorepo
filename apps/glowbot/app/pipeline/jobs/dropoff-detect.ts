import type { JobScriptContext } from "../../../../../nex/src/nex/control-plane/server-work.js";

export default async function handler(ctx: JobScriptContext): Promise<Record<string, unknown>> {
  ctx.log.info('GlowBot job "dropoff_detect" is deferred to W5');
  return {
    status: "deferred",
    job: ctx.job.name,
  };
}
