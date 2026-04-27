import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asOptionalString, asRecord, asString } from "./_shared.js";
import { upsertBinding, withAttributionDb } from "../storage/store.js";

const VALID_ROLES = new Set(["acquisition", "website", "backend"]);
const VALID_SOURCE_TYPES = new Set(["adapter_connection"]);

export const handle: NexAppMethodHandler = async (ctx) => {
  const role = asString(ctx.params.role, "role");
  const sourceType = asString(ctx.params.source_type, "source_type");
  if (!VALID_ROLES.has(role)) {
    throw new Error("role must be one of acquisition, website, backend");
  }
  if (!VALID_SOURCE_TYPES.has(sourceType)) {
    throw new Error("source_type must be adapter_connection");
  }
  return {
    binding: withAttributionDb(ctx.app.dataDir, (db) =>
      upsertBinding(db, {
        bindingId: asOptionalString(ctx.params.binding_id),
        scopeId: asString(ctx.params.scope_id, "scope_id"),
        role: role as "acquisition" | "website" | "backend",
        sourceType: sourceType as "adapter_connection",
        connectionId: asOptionalString(ctx.params.connection_id),
        platform: asOptionalString(ctx.params.platform),
        label: asOptionalString(ctx.params.label),
        metadata: asRecord(ctx.params.metadata),
      }),
    ),
  };
};
