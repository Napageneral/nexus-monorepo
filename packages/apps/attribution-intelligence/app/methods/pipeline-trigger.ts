import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asOptionalNumber, asOptionalString } from "./_shared.js";
import { finishPipelineRun, startPipelineRun, withAttributionDb } from "../storage/store.js";
import { replayBoundRecords } from "../pipeline/processor.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const scopeId = asOptionalString(ctx.params.scope_id);
  const run = withAttributionDb(ctx.app.dataDir, (db) =>
    startPipelineRun(db, {
      scopeId,
      trigger: "manual",
    }),
  );
  try {
    const result = await replayBoundRecords({
      runtime: ctx.nex,
      dataDir: ctx.app.dataDir,
      scopeId,
      limitPerPlatform: asOptionalNumber(ctx.params.limit_per_platform),
    });
    const finished = withAttributionDb(ctx.app.dataDir, (db) =>
      finishPipelineRun(db, {
        runId: run.runId,
        status: asOptionalNumber(result.processed) || asOptionalNumber(result.records_seen) ? "completed" : "completed_empty",
        stats: result,
      }),
    );
    return {
      run: finished,
      result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = withAttributionDb(ctx.app.dataDir, (db) =>
      finishPipelineRun(db, {
        runId: run.runId,
        status: "failed",
        errorMessage: message,
      }),
    );
    return {
      run: failed,
      error: message,
    };
  }
};
