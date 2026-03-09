import fs from "node:fs";
import path from "node:path";
import type { GlowbotIntegrationsResponse } from "../../shared/types.js";

type IntegrationAdapter = GlowbotIntegrationsResponse["adapters"][number];
type IntegrationConnectionProfile = IntegrationAdapter["connectionProfiles"][number];

type ManifestConnectionProfile = {
  id: string;
  displayName: string;
  authMethodId: string;
  scope: "app" | "server";
  managedProfileId?: string;
};

type ManifestAdapter = {
  id: string;
  name: string;
  description?: string;
  backfillDefault?: string;
  connectionProfiles: ManifestConnectionProfile[];
};

type RuntimeAuthMethodType = "oauth2" | "api-key" | "file-upload" | "custom-flow";

type RuntimeConnectionEntry = {
  connectionId?: string;
  adapter?: string;
  name?: string;
  status: string;
  authMethodId?: string | null;
  authMethod?: string | null;
  scope?: "app" | "server" | null;
  appId?: string | null;
  auth?: Record<string, unknown>;
  account?: string | null;
  lastSync?: number | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
};

const manifestAdapterCache = new Map<string, ManifestAdapter[]>();

const FALLBACK_PROFILE_FIELDS: Record<string, IntegrationConnectionProfile["fields"]> = {
  google_places_api_key: [
    { name: "place_id", label: "Google Place ID", type: "text", required: true },
  ],
  meta_access_token: [
    { name: "access_token", label: "Access Token", type: "password", required: true },
  ],
  patient_now_api_key: [
    { name: "apiKey", label: "API Key", type: "password", required: true },
    { name: "practiceId", label: "Practice ID", type: "text", required: true },
  ],
  zenoti_api_key: [
    { name: "apiKey", label: "API Key", type: "password", required: true },
  ],
  callrail_api_token: [
    { name: "api_token", label: "API Token", type: "password", required: true },
    { name: "account_id", label: "Account ID", type: "text", required: true },
  ],
  twilio_account_credentials: [
    { name: "account_sid", label: "Account SID", type: "text", required: true },
    { name: "auth_token", label: "Auth Token", type: "password", required: true },
  ],
};

// ---------------------------------------------------------------------------
// Adapter category mapping
// ---------------------------------------------------------------------------

export function integrationCategoryForAdapter(adapterId: string): IntegrationAdapter["category"] {
  if (adapterId === "google" || adapterId === "meta-ads") {
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
): RuntimeAuthMethodType | null {
  if (type === "oauth2" || type === "oauth") {
    return "oauth2";
  }
  if (type === "api_key" || type === "apikey") {
    return "api-key";
  }
  if (type === "file_upload" || type === "upload") {
    return "file-upload";
  }
  if (type === "custom_flow" || type === "custom-flow") {
    return "custom-flow";
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

export function loadManifestAdapters(packageDir: string): ManifestAdapter[] {
  const cached = manifestAdapterCache.get(packageDir);
  if (cached) {
    return cached;
  }

  const manifestPath = path.join(packageDir, "app.nexus.json");
  const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const adaptersRaw = Array.isArray(raw.adapters) ? raw.adapters : [];
  const adapters = adaptersRaw
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => {
      const profilesRaw = Array.isArray(entry.connectionProfiles) ? entry.connectionProfiles : [];
      const connectionProfiles = profilesRaw
        .map((profile) => asRecord(profile))
        .filter((profile): profile is Record<string, unknown> => Boolean(profile))
        .map((profile) => ({
          id: asNonEmptyString(profile.id) ?? "unknown-profile",
          displayName:
            asNonEmptyString(profile.displayName) ??
            asNonEmptyString(profile.id) ??
            "Unnamed profile",
          authMethodId: asNonEmptyString(profile.authMethodId) ?? "unknown_auth_method",
          scope: profile.scope === "server" ? "server" : "app",
          managedProfileId: asNonEmptyString(profile.managedProfileId) ?? undefined,
        }));

      return {
        id: asNonEmptyString(entry.id) ?? "unknown-adapter",
        name:
          asNonEmptyString(entry.displayName) ??
          asNonEmptyString(entry.name) ??
          asNonEmptyString(entry.id) ??
          "Unknown adapter",
        description: asNonEmptyString(entry.description) ?? undefined,
        backfillDefault:
          asNonEmptyString(asRecord(entry.syncSchedule)?.backfillDefault) ?? undefined,
        connectionProfiles,
      } satisfies ManifestAdapter;
    });

  manifestAdapterCache.set(packageDir, adapters);
  return adapters;
}

export function mapAdapterEntry(params: {
  manifestAdapter: ManifestAdapter;
  runtimeEntries?: RuntimeConnectionEntry[] | undefined;
}): IntegrationAdapter {
  const runtimeEntry = selectRuntimeEntryForManifestAdapter({
    manifestAdapter: params.manifestAdapter,
    runtimeEntries: params.runtimeEntries ?? [],
  });
  const status = mapRuntimeStatusToGlowbot(runtimeEntry?.status ?? "disconnected");
  const metadata = toStringMetadata(runtimeEntry?.metadata);
  const coverage = Math.max(0, Math.min(100, asNumber(runtimeEntry?.metadata?.coverage) ?? 0));
  const lastSyncIso =
    typeof runtimeEntry?.lastSync === "number" && Number.isFinite(runtimeEntry.lastSync)
      ? new Date(runtimeEntry.lastSync).toISOString()
      : null;
  const connectedAt = asNonEmptyString(runtimeEntry?.metadata?.connectedAt) ?? lastSyncIso ?? new Date().toISOString();
  const connectionProfiles = mapConnectionProfiles({
    manifestAdapter: params.manifestAdapter,
    runtimeEntry,
  });
  const selectedConnectionProfileId =
    status === "not_connected"
      ? undefined
      : pickProfileIdForConnectedMethod(
          connectionProfiles,
          runtimeEntry?.authMethod,
          runtimeEntry?.authMethodId,
          runtimeEntry?.scope,
        );

  return {
    id: params.manifestAdapter.id,
    name: params.manifestAdapter.name,
    icon: params.manifestAdapter.id,
    category: integrationCategoryForAdapter(params.manifestAdapter.id),
    status,
    ...(params.manifestAdapter.backfillDefault
      ? { backfillDefault: params.manifestAdapter.backfillDefault }
      : {}),
    connectionProfiles,
    connection:
      status === "not_connected"
        ? undefined
        : {
            connectionId: asNonEmptyString(runtimeEntry?.connectionId) ?? "unknown-connection",
            authMethod: mapRuntimeAuthMethod(runtimeEntry?.authMethod) ?? "unknown",
            authMethodId: asNonEmptyString(runtimeEntry?.authMethodId) ?? undefined,
            scope: runtimeEntry?.scope === "server" ? "server" : "app",
            connectionProfileId: selectedConnectionProfileId,
            connectedAt,
            lastSync: lastSyncIso ?? connectedAt,
            lastSyncStatus: status === "error" ? "error" : "success",
            coverage,
            error: runtimeEntry?.error ?? null,
            metadata,
          },
  };
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function resolveBackfillSince(params: {
  packageDir: string;
  adapterId: string;
  since?: string;
  now?: Date;
}): string {
  const explicitSince = asNonEmptyString(params.since);
  if (explicitSince) {
    return explicitSince;
  }

  const manifestAdapter = loadManifestAdapters(params.packageDir).find(
    (adapter) => adapter.id === params.adapterId,
  );
  if (!manifestAdapter) {
    throw new Error(`Unknown adapter '${params.adapterId}'`);
  }

  const backfillDefault = asNonEmptyString(manifestAdapter.backfillDefault);
  if (!backfillDefault || backfillDefault === "none") {
    throw new Error(`Adapter '${params.adapterId}' does not declare a backfill default`);
  }

  const relativeMatch = /^(\d+)d$/i.exec(backfillDefault);
  if (relativeMatch) {
    const days = Number(relativeMatch[1]);
    if (!Number.isFinite(days) || days <= 0) {
      throw new Error(`Invalid backfill default '${backfillDefault}' for adapter '${params.adapterId}'`);
    }
    const now = params.now ?? new Date();
    const since = new Date(now.getTime());
    since.setUTCDate(since.getUTCDate() - days);
    return formatDateOnly(since);
  }

  return backfillDefault;
}

function mapConnectionProfiles(params: {
  manifestAdapter: ManifestAdapter;
  runtimeEntry?: RuntimeConnectionEntry | undefined;
}): IntegrationConnectionProfile[] {
  return params.manifestAdapter.connectionProfiles.map((profile) => {
    const kind = connectionProfileKind(profile.authMethodId);
    return {
      id: profile.id,
      displayName: profile.displayName,
      authMethodId: profile.authMethodId,
      scope: profile.scope,
      ...(profile.managedProfileId ? { managedProfileId: profile.managedProfileId } : {}),
      kind,
      ...(kind === "api-key" || kind === "custom-flow"
        ? { fields: resolveProfileFields(profile.authMethodId, params.runtimeEntry?.auth, kind) }
        : {}),
    };
  });
}

function selectRuntimeEntryForManifestAdapter(params: {
  manifestAdapter: ManifestAdapter;
  runtimeEntries: RuntimeConnectionEntry[];
}): RuntimeConnectionEntry | undefined {
  const sorted = [...params.runtimeEntries].sort((left, right) => {
    const leftSync = asNumber(left.lastSync) ?? 0;
    const rightSync = asNumber(right.lastSync) ?? 0;
    if (rightSync !== leftSync) {
      return rightSync - leftSync;
    }
    const leftId = asNonEmptyString(left.connectionId) ?? "";
    const rightId = asNonEmptyString(right.connectionId) ?? "";
    return rightId.localeCompare(leftId);
  });

  for (const profile of params.manifestAdapter.connectionProfiles) {
    const match = sorted.find(
      (entry) =>
        asNonEmptyString(entry.authMethodId) === profile.authMethodId &&
        (entry.scope === "server" ? "server" : "app") === profile.scope,
    );
    if (match) {
      return match;
    }
  }

  return undefined;
}

function resolveProfileFields(
  authMethodId: string,
  auth: Record<string, unknown> | undefined,
  kind: RuntimeAuthMethodType,
): IntegrationConnectionProfile["fields"] {
  const runtimeFields = mapRuntimeFields(auth, kind);
  if (runtimeFields.length > 0) {
    return runtimeFields;
  }
  return FALLBACK_PROFILE_FIELDS[authMethodId] ?? [];
}

function mapRuntimeFields(
  auth: Record<string, unknown> | undefined,
  kind: RuntimeAuthMethodType,
): IntegrationConnectionProfile["fields"] {
  const rawMethods = Array.isArray(auth?.methods) ? auth.methods : [];
  for (const raw of rawMethods) {
    const method = asRecord(raw);
    if (!method) {
      continue;
    }
    if (mapRuntimeAuthMethod(asNonEmptyString(method.type)) !== kind) {
      continue;
    }
    const rawFields = Array.isArray(method.fields) ? method.fields : [];
    return rawFields
      .map((field) => asRecord(field))
      .filter((field): field is Record<string, unknown> => Boolean(field))
      .map((field) => ({
        name: asNonEmptyString(field.name) ?? "value",
        label: asNonEmptyString(field.label) ?? "Value",
        type: asNonEmptyString(field.type) ?? "text",
        required: Boolean(field.required),
      }));
  }
  return [];
}

function connectionProfileKind(authMethodId: string): RuntimeAuthMethodType {
  if (authMethodId === "csv_upload") {
    return "file-upload";
  }
  if (
    authMethodId === "google_places_api_key" ||
    authMethodId === "meta_access_token" ||
    authMethodId === "patient_now_api_key" ||
    authMethodId === "zenoti_api_key" ||
    authMethodId === "callrail_api_token" ||
    authMethodId === "twilio_account_credentials"
  ) {
    return "api-key";
  }
  if (
    authMethodId === "google_oauth_managed" ||
    authMethodId === "meta_oauth_managed" ||
    authMethodId === "zenoti_oauth_managed" ||
    authMethodId === "callrail_oauth_user"
  ) {
    return "oauth2";
  }
  return "custom-flow";
}

function pickProfileIdForConnectedMethod(
  profiles: IntegrationConnectionProfile[],
  authMethod: string | null | undefined,
  authMethodId?: string | null,
  scope?: "app" | "server" | null,
): string | undefined {
  const stableMethodId = asNonEmptyString(authMethodId);
  if (stableMethodId) {
    const stableMatch = profiles.find(
      (profile) =>
        profile.authMethodId === stableMethodId &&
        profile.scope === (scope === "server" ? "server" : "app"),
    );
    if (stableMatch) {
      return stableMatch.id;
    }
  }
  const kind = mapRuntimeAuthMethod(authMethod);
  if (!kind) {
    return undefined;
  }
  return profiles.find((profile) => profile.kind === kind)?.id;
}

export function getConnectMethodKind(
  packageDir: string,
  adapterId: string,
  connectionProfileId: string,
): RuntimeAuthMethodType {
  const manifestAdapter = loadManifestAdapters(packageDir).find((adapter) => adapter.id === adapterId);
  const profile = manifestAdapter?.connectionProfiles.find((entry) => entry.id === connectionProfileId);
  if (!profile) {
    throw new Error(`Unknown connection profile '${connectionProfileId}' for adapter '${adapterId}'`);
  }
  return connectionProfileKind(profile.authMethodId);
}

export function resetManifestAdapterCacheForTests(): void {
  manifestAdapterCache.clear();
}
