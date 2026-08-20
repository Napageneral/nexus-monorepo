type RuntimeRow = Record<string, unknown>;

export type ShopifyRecordFamily = "customer" | "order" | "line_item";
export type ShopifyRecordSourceContract =
  | "canonical"
  | "legacy_current_prefix"
  | "legacy_double_prefix";

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RuntimeRow) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function assertShopifyRecordFamily(
  recordValue: unknown,
  family: ShopifyRecordFamily,
  options: { allowLegacyText?: boolean } = {},
): ShopifyRecordSourceContract {
  const record = asRecord(recordValue);
  if (asString(record.platform) !== "shopify") {
    throw new Error("Shopify projector only accepts Shopify records");
  }
  const metadata = asRecord(record.metadata);
  if (asString(metadata.family) !== family) {
    throw new Error(`Shopify projector expected ${family} record`);
  }
  if (asString(record.source_record_type) === `shopify.${family}`) {
    return "canonical";
  }
  if (asString(record.source_record_type) !== "text" || options.allowLegacyText !== true) {
    throw new Error(`Shopify projector expected shopify.${family} Records`);
  }

  const connectionId = asString(metadata.connection_id);
  const shopDomain = asString(record.source_space_id);
  const providerAccountRef = asString(record.provider_account_ref);
  const providerRecordId = asString(record.provider_record_id);
  if (!connectionId || !shopDomain || !providerAccountRef || !providerRecordId) {
    throw new Error("Legacy Shopify Record is missing exact provider-family custody");
  }
  const currentPrefix = `shopify:${connectionId}:${family}:`;
  if (providerAccountRef === connectionId && providerRecordId.startsWith(currentPrefix)) {
    return "legacy_current_prefix";
  }
  const doublePrefix = `shopify:shopify:${connectionId}:${family}:`;
  if (providerAccountRef === shopDomain && providerRecordId.startsWith(doublePrefix)) {
    return "legacy_double_prefix";
  }
  throw new Error("Legacy Shopify Record does not match an exact provider-family contract");
}
