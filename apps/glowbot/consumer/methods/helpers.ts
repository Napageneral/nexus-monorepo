/**
 * Shared helper functions for method handlers.
 *
 * Includes adapter mapping functions ported from the original project's
 * src/lib/glowbot/methods.ts bridge layer, adapted for direct use with
 * ctx.nex.adapters SDK.
 */

import type { GlowbotIntegrationsResponse } from "../../shared/types.js";

type IntegrationAdapter = GlowbotIntegrationsResponse["adapters"][number];

// ---------------------------------------------------------------------------
// Adapter category mapping
// ---------------------------------------------------------------------------

export function integrationCategoryForAdapter(adapterId: string): IntegrationAdapter["category"] {
  if (adapterId === "google-ads" || adapterId === "meta-ads") {
    return "advertising";
  }
  if (adapterId.endsWith("-emr") || adapterId.includes("patient-now") || adapterId.includes("zenoti")) {
    return "emr";
  }
  return "local";
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

export function mapRuntimeStatusToGlowbot(
  status: string,
): IntegrationAdapter["status"] {
  if (status === "connected") {
    return "connected";
  }
  if (status === "disconnected") {
    return "not_connected";
  }
  if (status === "expired") {
    return "expired";
  }
  return "error";
}

// ---------------------------------------------------------------------------
// Auth method mapping
// ---------------------------------------------------------------------------

export function mapRuntimeAuthMethod(
  type: string | null | undefined,
): IntegrationAdapter["authMethods"][number]["type"] | null {
  if (type === "oauth2" || type === "oauth") {
    return "oauth2";
  }
  if (type === "api_key" || type === "apikey") {
    return "api-key";
  }
  if (type === "file_upload" || type === "upload") {
    return "file-upload";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

export function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function toStringMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!metadata) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || typeof value === "undefined") {
      continue;
    }
    out[key] = typeof value === "string" ? value : String(value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Full adapter entry mapping
// ---------------------------------------------------------------------------

export function mapAdapterEntry(entry: {
  adapter: string;
  name: string;
  status: string;
  authMethod?: string | null;
  auth?: Record<string, unknown>;
  lastSync?: number | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
}): IntegrationAdapter {
  const authMethods = mapAuthMethodsFromEntry(entry);
  const status = mapRuntimeStatusToGlowbot(entry.status);
  const metadata = toStringMetadata(entry.metadata);
  const coverage = Math.max(0, Math.min(100, asNumber(entry.metadata?.coverage) ?? 0));
  const lastSyncIso =
    typeof entry.lastSync === "number" && Number.isFinite(entry.lastSync)
      ? new Date(entry.lastSync).toISOString()
      : null;
  const connectedAt = asNonEmptyString(entry.metadata?.connectedAt) ?? lastSyncIso ?? new Date().toISOString();

  return {
    id: entry.adapter,
    name: entry.name,
    icon: entry.adapter,
    category: integrationCategoryForAdapter(entry.adapter),
    status,
    authMethods,
    connection:
      status === "not_connected"
        ? undefined
        : {
            authMethod: mapRuntimeAuthMethod(entry.authMethod) ?? "unknown",
            connectedAt,
            lastSync: lastSyncIso ?? connectedAt,
            lastSyncStatus: status === "error" ? "error" : "success",
            coverage,
            error: entry.error ?? null,
            metadata,
          },
  };
}

function mapAuthMethodsFromEntry(entry: {
  authMethod?: string | null;
  auth?: Record<string, unknown>;
}): IntegrationAdapter["authMethods"] {
  const manifest = entry.auth;
  const rawMethods = Array.isArray(manifest?.methods) ? manifest.methods : [];
  const mapped: IntegrationAdapter["authMethods"] = [];

  for (const raw of rawMethods) {
    const method = asRecord(raw);
    if (!method) {
      continue;
    }
    const mappedType = mapRuntimeAuthMethod(asNonEmptyString(method.type));
    if (!mappedType) {
      continue;
    }

    const mappedMethod: IntegrationAdapter["authMethods"][number] = {
      type: mappedType,
      label: asNonEmptyString(method.label) ?? mappedType,
      icon: asNonEmptyString(method.icon) ?? mappedType,
    };

    if (mappedType === "api-key") {
      const rawFields = Array.isArray(method.fields) ? method.fields : [];
      const fields = rawFields
        .map((field) => asRecord(field))
        .filter((field): field is Record<string, unknown> => Boolean(field))
        .map((field) => ({
          name: asNonEmptyString(field.name) ?? "value",
          label: asNonEmptyString(field.label) ?? "Value",
          type: asNonEmptyString(field.type) ?? "text",
          required: Boolean(field.required),
        }));
      if (fields.length > 0) {
        mappedMethod.fields = fields;
      }
    }

    mapped.push(mappedMethod);
  }

  if (mapped.length === 0) {
    const fallback = mapRuntimeAuthMethod(entry.authMethod);
    if (fallback) {
      mapped.push({
        type: fallback,
        label: fallback,
        icon: fallback,
      });
    }
  }

  return mapped;
}
