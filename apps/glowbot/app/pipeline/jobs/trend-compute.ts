import type { JobScriptContext } from "../../../../../nex/src/nex/control-plane/server-work.js";

export default async function handler(ctx: JobScriptContext): Promise<Record<string, unknown>> {
  ctx.log.info('GlowBot job "trend_compute" is deferred to W5');
  return {
    status: "deferred",
    job: ctx.job.name,
  };
}
