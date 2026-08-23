import { createHash } from "node:crypto";

type RuntimeRow = Record<string, unknown>;

type ShopifySourceJobContext = {
  job: {
    config: RuntimeRow;
  };
  input: RuntimeRow;
  nex: Record<string, any>;
  log: {
    info(message: string): void;
    warn(message: string): void;
  };
};

const SOURCE_FAMILIES = new Set([
  "orders.delta",
  "customers.delta",
  "inventory.hot",
  "inventory.reconcile",
  "fulfillment.delta",
  "discounts.delta",
  "finance.transactions",
  "disputes.delta",
  "products.delta",
  "catalog.delta",
  "marketing.delta",
  "payouts.delta",
]);
const CAPTURE_ID_RE = /^[0-9a-f]{32}$/;
const RECORD_ID_RE = /^record_[0-9a-f]{64}$/;
const BATCH_SOURCE_RECORD_TYPES = new Set([
  "shopify.customer",
  "shopify.inventory",
  "shopify.order",
  "shopify.line_item",
]);

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RuntimeRow) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value: unknown): RuntimeRow[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is RuntimeRow =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
}

function unwrap(value: unknown): RuntimeRow {
  const row = asRecord(value);
  if (row.ok === false) {
    throw new Error(asString(asRecord(row.error).message) || "Nex operation failed");
  }
  const payload = asRecord(row.payload);
  return Object.keys(payload).length > 0 ? payload : row;
}

function requireString(row: RuntimeRow, field: string): string {
  const value = asString(row[field]);
  if (!value) {
    throw new Error(`Shopify source job requires ${field}`);
  }
  return value;
}

function requireBatchRecordIds(value: unknown, expected: number): string[] {
  if (!Array.isArray(value) || value.length !== expected) {
    throw new Error("Shopify Record batch ingest returned incomplete Record ids");
  }
  const ids = value.map((entry) => asString(entry));
  if (ids.some((id) => !RECORD_ID_RE.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error("Shopify Record batch ingest returned invalid Record ids");
  }
  return ids;
}

function exactMetadataField(params: {
  metadata: RuntimeRow;
  field: "provider_account_ref" | "source_record_type" | "provider_version_ref";
  value: unknown;
}): void {
  if (params.value === undefined) {
    return;
  }
  const current = params.metadata[params.field];
  if (current !== undefined && JSON.stringify(current) !== JSON.stringify(params.value)) {
    throw new Error(`Shopify Record ${params.field} custody disagrees with metadata`);
  }
  params.metadata[params.field] = params.value;
}

function recordIngestParams(record: RuntimeRow): { routing: RuntimeRow; payload: RuntimeRow } {
  const routing = { ...asRecord(record.routing) };
  const payload = { ...asRecord(record.payload) };
  const routingMetadata = { ...asRecord(routing.metadata) };
  const payloadMetadata = { ...asRecord(payload.metadata) };

  exactMetadataField({
    metadata: routingMetadata,
    field: "provider_account_ref",
    value: routing.provider_account_ref,
  });
  exactMetadataField({
    metadata: payloadMetadata,
    field: "source_record_type",
    value: payload.source_record_type,
  });
  exactMetadataField({
    metadata: payloadMetadata,
    field: "provider_version_ref",
    value: payload.provider_version_ref,
  });
  delete routing.provider_account_ref;
  delete payload.source_record_type;
  delete payload.provider_version_ref;
  if (Object.keys(routingMetadata).length > 0) {
    routing.metadata = routingMetadata;
  }
  if (Object.keys(payloadMetadata).length > 0) {
    payload.metadata = payloadMetadata;
  }
  return { routing, payload };
}

function canUseShopifySourceBatch(
  records: Array<{ routing: RuntimeRow; payload: RuntimeRow }>,
): boolean {
  let sharedRoute = "";
  return records.every(({ routing, payload }, index) => {
    const sourceRecordType = asString(asRecord(payload.metadata).source_record_type);
    const route = JSON.stringify({
      adapter: routing.adapter ?? null,
      platform: routing.platform ?? null,
      connection_id: routing.connection_id ?? null,
      sender_id: routing.sender_id ?? null,
      receiver_id: routing.receiver_id ?? null,
      space_id: routing.space_id ?? null,
    });
    if (index === 0) sharedRoute = route;
    return BATCH_SOURCE_RECORD_TYPES.has(sourceRecordType) && route === sharedRoute;
  });
}

function sourceJobConfig(ctx: ShopifySourceJobContext): {
  family: string;
  connectionId: string;
} {
  const family = asString(ctx.input.family) || asString(ctx.job.config.family);
  const connectionId = asString(ctx.input.connection_id) || asString(ctx.job.config.connection_id);
  if (!SOURCE_FAMILIES.has(family)) {
    throw new Error("Shopify source job received an unsupported family");
  }
  if (!connectionId) {
    throw new Error("Shopify source job requires connection_id");
  }
  return { family, connectionId };
}

async function abortCapture(params: {
  ctx: ShopifySourceJobContext;
  family: string;
  connectionId: string;
  captureId: string;
}): Promise<void> {
  try {
    await params.ctx.nex.shopify.source.abort({
      connection_id: params.connectionId,
      family: params.family,
      capture_id: params.captureId,
    });
  } catch (error) {
    params.ctx.log.warn(
      `Shopify source capture abort failed after ingest error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export default async function shopifySourceObservationJob(
  ctx: ShopifySourceJobContext,
): Promise<RuntimeRow> {
  const { family, connectionId } = sourceJobConfig(ctx);
  const observation = asRecord(ctx.input.observation);
  const capture = unwrap(
    await ctx.nex.shopify.source.capture({
      connection_id: connectionId,
      family,
      ...(Object.keys(observation).length > 0 ? { observation } : {}),
    }),
  );
  const captureId = requireString(capture, "capture_id");
  if (!CAPTURE_ID_RE.test(captureId) || requireString(capture, "family") !== family) {
    throw new Error("Shopify source capture returned an invalid receipt");
  }
  const records = asArray(capture.records);
  let inserted = 0;
  let replayed = 0;
  let recordIds: string[] = [];
  try {
    const ingestRecords: Array<{ routing: RuntimeRow; payload: RuntimeRow }> = [];
    const familyCounts: RuntimeRow = {};
    for (const record of records) {
      if (asString(record.operation) !== "record.ingest") {
        throw new Error("Shopify source capture returned an unsupported operation");
      }
      const { routing, payload } = recordIngestParams(record);
      if (Object.keys(routing).length === 0 || Object.keys(payload).length === 0) {
        throw new Error("Shopify source capture returned an incomplete record envelope");
      }
      const metadata = asRecord(payload.metadata);
      const sourceRecordType = asString(metadata.source_record_type);
      const recordFamily = asString(metadata.family) || asString(routing.container_id);
      if (!recordFamily) {
        throw new Error("Shopify source capture returned a Record without a family");
      }
      familyCounts[recordFamily] = Number(familyCounts[recordFamily] || 0) + 1;
      ingestRecords.push({ routing, payload });
    }
    if (ingestRecords.length > 0 && canUseShopifySourceBatch(ingestRecords)) {
      const result = unwrap(await ctx.nex.record.ingest_many({ records: ingestRecords }));
      inserted = Number(result.inserted);
      replayed = Number(result.replayed);
      if (
        !Number.isSafeInteger(inserted) ||
        inserted < 0 ||
        !Number.isSafeInteger(replayed) ||
        replayed < 0 ||
        inserted + replayed !== ingestRecords.length
      ) {
        throw new Error("Shopify Record batch ingest returned invalid counts");
      }
      recordIds = requireBatchRecordIds(result.record_ids, ingestRecords.length);
    } else {
      for (const record of ingestRecords) {
        const result = unwrap(await ctx.nex.record.ingest(record));
        const status = asString(result.status) || asString(asRecord(result.result).status);
        if (status && status !== "completed" && status !== "skipped") {
          throw new Error(`Shopify Record ingest returned ${status}`);
        }
        if (status === "skipped" || result.inserted === false || result.replayed === true) {
          replayed += 1;
        } else {
          inserted += 1;
        }
      }
    }
    const commit = unwrap(
      await ctx.nex.shopify.source.commit({
        connection_id: connectionId,
        family,
        capture_id: captureId,
      }),
    );
    if (requireString(commit, "capture_id") !== captureId) {
      throw new Error("Shopify source commit returned a different capture id");
    }
    ctx.log.info(
      `Shopify source ${family} committed ${records.length} records (${inserted} inserted, ${replayed} replayed)`,
    );
    const sortedFamilyCounts = Object.fromEntries(
      Object.entries(familyCounts).sort(([left], [right]) => left.localeCompare(right)),
    );
    const terminal = {
      ok: true,
      status: records.length > 0 && inserted === 0 ? "replay" : "completed",
      family,
      connection_id: connectionId,
      capture_id: captureId,
      records: records.length,
      family_counts: sortedFamilyCounts,
      ...(recordIds.length > 0 ? { record_ids: recordIds } : {}),
      inserted,
      replayed,
      complete: commit.complete === true,
      cursor_iso: asString(commit.cursor_iso) || null,
      page_cursor_present: Boolean(asString(commit.page_cursor)),
      ...(Object.keys(observation).length > 0
        ? {
            projection_work_id: asString(observation.projection_work_id),
            observation_receipt_id: asString(observation.observation_receipt_id),
          }
        : {}),
      provider_write_authority: false,
    };
    return {
      ...terminal,
      result_sha256: createHash("sha256").update(JSON.stringify(terminal), "utf8").digest("hex"),
    };
  } catch (error) {
    await abortCapture({ ctx, family, connectionId, captureId });
    throw error;
  }
}
