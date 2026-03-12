import type { JobScriptContext } from "../../../../../nex/src/nex/control-plane/server-work.js";

type MetricExtractJobInput = {
  clinicEntityId?: string;
  event?: RecordIngestedEventInput;
};

type RecordIngestedEventInput = {
  id?: string;
  type?: string;
  properties?: Record<string, unknown>;
  created_at?: number | string;
};

type MetricElementCandidate = {
  connectionId: string;
  adapterId: string;
  metricName: string;
  metricValue: number;
  date: string;
  content: string;
  asOf: number;
  sourceEventId: string | null;
  clinicId: string;
  metadataKey: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
};

type RecordRow = {
  id?: unknown;
  record_id?: unknown;
  content?: unknown;
  timestamp?: unknown;
  received_at?: unknown;
  platform?: unknown;
  receiver_id?: unknown;
  metadata?: unknown;
};

const RESERVED_METADATA_KEYS = new Set([
  "adapter_id",
  "metric_name",
  "metric_value",
  "date",
  "clinic_id",
  "metadata_key",
  "connection_id",
  "connection_profile_id",
  "auth_method_id",
  "connection_scope",
  "source_app_id",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseTimestamp(value: unknown, fallbackDate: string): number {
  const numeric = asNumber(value);
  if (numeric !== null) {
    return numeric;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  const fallback = Date.parse(`${fallbackDate}T12:00:00.000Z`);
  return Number.isFinite(fallback) ? fallback : Date.now();
}

function parseSourceEventId(record: RecordRow): string | null {
  return asString(record.record_id) || asString(record.id) || null;
}

function deriveMetadataKey(rawMetadata: Record<string, unknown>): string {
  const explicit = asString(rawMetadata.metadata_key);
  if (explicit) {
    return explicit;
  }

  const parts = Object.keys(rawMetadata)
    .filter((key) => !RESERVED_METADATA_KEYS.has(key))
    .sort()
    .flatMap((key) => {
      const value = rawMetadata[key];
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed ? [`${key}:${trimmed}`] : [];
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return [`${key}:${value}`];
      }
      if (typeof value === "boolean") {
        return [`${key}:${value}`];
      }
      return [];
    });

  return parts.join("|");
}

function parseInput(input: Record<string, unknown>): MetricExtractJobInput {
  const rawEvent = input.event !== undefined ? asRecord(input.event) : null;
  return {
    clinicEntityId: asString(input.clinicEntityId) || undefined,
    event:
      rawEvent && Object.keys(rawEvent).length > 0
        ? (rawEvent as RecordIngestedEventInput)
        : undefined,
  };
}

function parseRecordMetadata(value: unknown): Record<string, unknown> {
  if (typeof value === "string" && value.trim()) {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return asRecord(value);
}

function toMetricCandidate(params: { record: RecordRow; clinicEntityId?: string }): MetricElementCandidate | null {
  const rawMetadata = parseRecordMetadata(params.record.metadata);
  const connectionId = asString(rawMetadata.connection_id) || asString(params.record.receiver_id);
  const adapterId = asString(rawMetadata.adapter_id) || asString(params.record.platform);
  const metricName = asString(rawMetadata.metric_name);
  const metricValue = asNumber(rawMetadata.metric_value);
  const date = asString(rawMetadata.date);

  if (!connectionId || !adapterId || !metricName || metricValue === null || !date) {
    return null;
  }

  const clinicId = asString(rawMetadata.clinic_id);
  const metadataKey = deriveMetadataKey(rawMetadata);
  const metadata: Record<string, unknown> = {
    ...rawMetadata,
    connection_id: connectionId,
    adapter_id: adapterId,
    metric_name: metricName,
    metric_value: metricValue,
    date,
    metadata_key: metadataKey,
  };
  if (clinicId) {
    metadata.clinic_id = clinicId;
  }

  return {
    connectionId,
    adapterId,
    metricName,
    metricValue,
    date,
    content:
      asString(params.record.content) ||
      `${metricName}: ${metricValue} on ${date} from ${adapterId}`,
    asOf: parseTimestamp(params.record.timestamp ?? params.record.received_at, date),
    sourceEventId: parseSourceEventId(params.record),
    clinicId,
    metadataKey,
    entityId: asString(params.clinicEntityId) || asString(rawMetadata.clinic_entity_id) || null,
    metadata,
  };
}

async function findExistingMetricElement(
  runtime: JobScriptContext["runtime"],
  candidate: MetricElementCandidate,
): Promise<Record<string, unknown> | null> {
  const metadataFilter: Record<string, unknown> = {
    connection_id: candidate.connectionId,
    metric_name: candidate.metricName,
    date: candidate.date,
    metadata_key: candidate.metadataKey,
  };
  if (candidate.clinicId) {
    metadataFilter.clinic_id = candidate.clinicId;
  }

  const result = asRecord(
    await runtime.callMethod("memory.elements.list", {
      type: "metric",
      metadataFilter,
      limit: 5,
    }),
  );
  const elements = Array.isArray(result.elements)
    ? result.elements.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    : [];
  return (elements[0] as Record<string, unknown> | undefined) ?? null;
}

async function loadCanonicalRecord(
  runtime: JobScriptContext["runtime"],
  event: RecordIngestedEventInput,
): Promise<RecordRow | null> {
  if (asString(event.type) !== "record.ingested") {
    return null;
  }
  const properties = asRecord(event.properties);
  const recordId = asString(properties.record_id);
  if (!recordId) {
    return null;
  }
  const result = asRecord(await runtime.callMethod("records.get", { id: recordId }));
  return asRecord(result.record);
}

export async function handler(ctx: JobScriptContext): Promise<Record<string, unknown>> {
  const input = parseInput(ctx.input);
  if (!input.event) {
    return {
      created: 0,
      updated: 0,
      skipped: 0,
      rejected: 0,
      processed: 0,
    };
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let rejected = 0;
  const record = await loadCanonicalRecord(ctx.runtime, input.event);
  const candidate = record
    ? toMetricCandidate({
        record,
        clinicEntityId: input.clinicEntityId,
      })
    : null;

  if (!candidate) {
    rejected += 1;
  } else {
    const existing = await findExistingMetricElement(ctx.runtime, candidate);
    if (!existing) {
      await ctx.runtime.callMethod("memory.elements.create", {
        type: "metric",
        content: candidate.content,
        entityId: candidate.entityId,
        asOf: candidate.asOf,
        sourceEventId: candidate.sourceEventId,
        metadata: candidate.metadata,
      });
      created += 1;
    } else {
      const existingMetadata = parseRecordMetadata(existing.metadata);
      const existingValue = asNumber(existingMetadata.metric_value);
      if (existingValue !== null && existingValue === candidate.metricValue) {
        skipped += 1;
      } else {
        await ctx.runtime.callMethod("memory.elements.update", {
          id: asString(existing.id),
          content: candidate.content,
          asOf: candidate.asOf,
          sourceEventId: candidate.sourceEventId,
          metadata: candidate.metadata,
        });
        updated += 1;
      }
    }
  }

  return {
    created,
    updated,
    skipped,
    rejected,
    processed: 1,
  };
}

export default handler;
