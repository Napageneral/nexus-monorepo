import type { JobScriptContext } from "../../../../../nex/src/api/server-work.js";
import { replayBoundRecords } from "../pipeline/processor.js";
import { finishPipelineRun, startPipelineRun, withAttributionDb } from "../storage/store.js";

type RuntimeRow = Record<string, unknown>;

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RuntimeRow) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
}

function ensureDataDir(ctx: JobScriptContext): string {
  const dataDir = asString(asRecord(ctx.job.config).data_dir);
  if (!dataDir) {
    throw new Error("attribution pipeline replay job missing data_dir config");
  }
  return dataDir;
}

export default async function attributionPipelineReplay(
  ctx: JobScriptContext,
): Promise<Record<string, unknown>> {
  const input = asRecord(ctx.input);
  const dataDir = ensureDataDir(ctx);
  const scopeId = asString(input.scope_id) || null;
  const limitPerPlatform = asOptionalNumber(input.limit_per_platform);
  const runId = asString(input.pipeline_run_id);

  const run =
    runId
      ? { runId, scopeId }
      : withAttributionDb(dataDir, (db) =>
          startPipelineRun(db, {
            scopeId,
            trigger: "manual",
          }),
        );

  try {
    const result = await replayBoundRecords({
      runtime: ctx.nex,
      dataDir,
      scopeId,
      limitPerPlatform,
    });
    const finished = withAttributionDb(dataDir, (db) =>
      finishPipelineRun(db, {
        runId: run.runId,
        status: asOptionalNumber(result.processed) || asOptionalNumber(result.records_seen)
          ? "completed"
          : "completed_empty",
        stats: result,
      }),
    );
    return {
      run: finished,
      result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    withAttributionDb(dataDir, (db) =>
      finishPipelineRun(db, {
        runId: run.runId,
        status: "failed",
        errorMessage: message,
      }),
    );
    throw error;
  }
}
