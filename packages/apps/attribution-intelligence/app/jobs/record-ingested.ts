import type { JobScriptContext } from "../../../../../nex/src/api/server-work.js";
import * as processor from "../pipeline/processor.js";

type RuntimeRow = Record<string, unknown>;

type RecordIngestedEvent = {
  id?: string;
  type?: string;
  properties?: Record<string, unknown>;
  created_at?: number | string;
};

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RuntimeRow) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unwrapPayload(value: unknown): RuntimeRow {
  const record = asRecord(value);
  const payload = asRecord(record.payload);
  return Object.keys(payload).length > 0 ? payload : record;
}

function extractEvent(input: Record<string, unknown>): RecordIngestedEvent {
  const event = asRecord(input.event);
  return Object.keys(event).length > 0 ? (event as RecordIngestedEvent) : {};
}

function extractRecordId(event: RecordIngestedEvent, input: Record<string, unknown>): string {
  const properties = asRecord(event.properties);
  return (
    asString(properties.record_id) ||
    asString(properties.recordId) ||
    asString(input.record_id) ||
    asString(input.recordId)
  );
}

function extractPlatform(event: RecordIngestedEvent, record: RuntimeRow): string {
  const properties = asRecord(event.properties);
  return asString(properties.platform) || asString(record.platform);
}

function resolveProcessor(): (ctx: JobScriptContext, params: RuntimeRow) => Promise<unknown> {
  const moduleExports = processor as Record<string, unknown>;
  const candidates = [
    moduleExports.default,
    moduleExports.handler,
    moduleExports.run,
    moduleExports.processRecordIngested,
    moduleExports.processRecord,
    moduleExports.process,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "function") {
      return candidate as (ctx: JobScriptContext, params: RuntimeRow) => Promise<unknown>;
    }
  }
  throw new Error("attribution processor module must export a callable processor");
}

async function loadRecord(ctx: JobScriptContext, recordId: string): Promise<RuntimeRow> {
  const response = unwrapPayload(await ctx.nex.records.get({ id: recordId }));
  return asRecord(response.record);
}

export default async function attributionRecordIngested(
  ctx: JobScriptContext,
): Promise<Record<string, unknown>> {
  const event = extractEvent(ctx.input);
  if (asString(event.type) && asString(event.type) !== "record.ingested") {
    return { ok: true, skipped: true, reason: "not_record_ingested" };
  }

  const recordId = extractRecordId(event, ctx.input);
  if (!recordId) {
    throw new Error("record.ingested job input is missing record_id");
  }

  const record = await loadRecord(ctx, recordId);
  const platform = extractPlatform(event, record);
  const process = resolveProcessor();
  const result = await process(ctx, {
    event,
    record,
    record_id: recordId,
    platform,
  });

  return {
    ok: true,
    record_id: recordId,
    platform,
    ...(result && typeof result === "object" && !Array.isArray(result) ? (result as RuntimeRow) : {}),
  };
}
