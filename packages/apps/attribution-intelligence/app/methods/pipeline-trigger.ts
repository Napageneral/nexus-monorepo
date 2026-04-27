import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asOptionalNumber, asOptionalString } from "./_shared.js";
import { finishPipelineRun, readPipelineStatus, startPipelineRun, withAttributionDb } from "../storage/store.js";
import { ensureAttributionManualReplayJob } from "../hooks/runtime-work.js";

type RuntimeRow = Record<string, unknown>;

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RuntimeRow) : {};
}

function unwrapPayload(value: unknown): RuntimeRow {
  const record = asRecord(value);
  const payload = asRecord(record.payload);
  return Object.keys(payload).length > 0 ? payload : record;
}

export const handle: NexAppMethodHandler = async (ctx) => {
  const scopeId = asOptionalString(ctx.params.scope_id);
  const latestRun = withAttributionDb(ctx.app.dataDir, (db) => readPipelineStatus(db, scopeId).latest_run);
  if (
    latestRun &&
    typeof latestRun === "object" &&
    !Array.isArray(latestRun) &&
    asRecord(latestRun).status === "running"
  ) {
    return {
      status: "already_running",
      run: asRecord(latestRun),
    };
  }
  const run = withAttributionDb(ctx.app.dataDir, (db) =>
    startPipelineRun(db, {
      scopeId,
      trigger: "manual",
    }),
  );
  try {
    const job = await ensureAttributionManualReplayJob({
      runtime: ctx.nex,
      appId: ctx.app.id,
      dataDir: ctx.app.dataDir,
    });
    const invokeResult = unwrapPayload(
      await ctx.nex.jobs.invoke({
        job_id: job.id,
        trigger_source: "manual",
        input: {
          pipeline_run_id: run.runId,
          ...(scopeId ? { scope_id: scopeId } : {}),
          ...(asOptionalNumber(ctx.params.limit_per_platform) != null
            ? { limit_per_platform: asOptionalNumber(ctx.params.limit_per_platform) }
            : {}),
        },
      }),
    );
    return {
      run,
      job_run: asRecord(invokeResult.run),
      queue_entry: asRecord(invokeResult.queue_entry),
      status: "started",
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
