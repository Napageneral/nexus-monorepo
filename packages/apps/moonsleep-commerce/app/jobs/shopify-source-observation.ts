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

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RuntimeRow)
    : {};
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

function sourceJobConfig(ctx: ShopifySourceJobContext): {
  family: string;
  connectionId: string;
} {
  const family = asString(ctx.input.family) || asString(ctx.job.config.family);
  const connectionId =
    asString(ctx.input.connection_id) || asString(ctx.job.config.connection_id);
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
  const capture = unwrap(
    await ctx.nex.shopify.source.capture({
      connection_id: connectionId,
      family,
    }),
  );
  const captureId = requireString(capture, "capture_id");
  if (!CAPTURE_ID_RE.test(captureId) || requireString(capture, "family") !== family) {
    throw new Error("Shopify source capture returned an invalid receipt");
  }
  const records = asArray(capture.records);
  let inserted = 0;
  let replayed = 0;
  try {
    const ingestRecords: Array<{ routing: RuntimeRow; payload: RuntimeRow }> = [];
    for (const record of records) {
      if (asString(record.operation) !== "record.ingest") {
        throw new Error("Shopify source capture returned an unsupported operation");
      }
      const { routing, payload } = recordIngestParams(record);
      if (Object.keys(routing).length === 0 || Object.keys(payload).length === 0) {
        throw new Error("Shopify source capture returned an incomplete record envelope");
      }
      ingestRecords.push({ routing, payload });
    }
    if (ingestRecords.length > 0) {
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
    return {
      ok: true,
      family,
      connection_id: connectionId,
      capture_id: captureId,
      records: records.length,
      inserted,
      replayed,
      complete: commit.complete === true,
      cursor_iso: asString(commit.cursor_iso) || null,
      page_cursor_present: Boolean(asString(commit.page_cursor)),
      provider_write_authority: false,
    };
  } catch (error) {
    await abortCapture({ ctx, family, connectionId, captureId });
    throw error;
  }
}
