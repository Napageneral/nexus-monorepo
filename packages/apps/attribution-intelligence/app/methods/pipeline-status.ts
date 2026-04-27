import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asOptionalString } from "./_shared.js";
import { readPipelineStatus, withAttributionDb } from "../storage/store.js";

function trimLatestRun(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const run = { ...(value as Record<string, unknown>) };
  const stats =
    run.stats && typeof run.stats === "object" && !Array.isArray(run.stats)
      ? { ...(run.stats as Record<string, unknown>) }
      : null;
  const details = Array.isArray(stats?.details) ? stats.details : [];
  if (stats && details.length > 0) {
    delete stats.details;
    stats.detail_count = details.length;
    stats.detail_preview = details.slice(0, 5);
    run.stats = stats;
  }
  return run;
}

export const handle: NexAppMethodHandler = async (ctx) => {
  const pipeline = withAttributionDb(ctx.app.dataDir, (db) =>
    readPipelineStatus(db, asOptionalString(ctx.params.scope_id)),
  ) as Record<string, unknown>;
  return {
    pipeline: {
      ...pipeline,
      latest_run: trimLatestRun(pipeline.latest_run),
    },
  };
};
