import { finishConsoleLatency, startConsoleLatency } from "../latency-metrics.ts";

export type AdapterConnectionStatus = "connected" | "disconnected" | "error" | "expired";
export type AdapterConnectionAuthMethod =
  | "oauth2"
  | "api_key"
  | "file_upload"
  | "custom_flow"
  | null;

export type AdapterCatalogEntry = {
  adapter: string;
  name: string;
  description?: string | null;
  service?: string | null;
  icon?: string | null;
  auth?: AdapterAuthManifest;
  published?: boolean;
  publishedVersion?: string | null;
  registered?: boolean;
  registeredVersion?: string | null;
};

export type AdapterAuthFieldOption = {
  label: string;
  value: string;
};

export type AdapterAuthField = {
  name: string;
  label: string;
  type: "secret" | "text" | "select";
  required: boolean;
  placeholder?: string;
  options?: AdapterAuthFieldOption[];
};

export type AdapterAuthMethod =
  | {
      id: string;
      type: "oauth2";
      label: string;
      icon: string;
      service: string;
      scopes: string[];
    }
  | {
      id: string;
      type: "api_key";
      label: string;
      icon: string;
      service: string;
      fields: AdapterAuthField[];
    }
  | {
      id: string;
      type: "file_upload";
      label: string;
      icon: string;
      accept: string[];
      templateUrl?: string;
      maxSize?: number;
    }
  | {
      id: string;
      type: "custom_flow";
      label: string;
      icon: string;
      service: string;
      fields?: AdapterAuthField[];
    };

export type AdapterAuthManifest = {
  methods: AdapterAuthMethod[];
  setupGuide?: string;
};

export type AdapterConnectionIdentity = {
  id: string;
  displayName: string | null;
  credentialRef: string | null;
  status: string | null;
};

export type AdapterConnectionEntry = {
  connectionId: string;
  adapter: string;
  name: string;
  service?: string | null;
  authMethodId?: string | null;
  status: AdapterConnectionStatus;
  authMethod: AdapterConnectionAuthMethod;
  auth?: AdapterAuthManifest;
  account: string | null;
  lastSync: number | null;
  error: string | null;
  connections?: AdapterConnectionIdentity[];
  metadata?: Record<string, unknown>;
};

type AdapterConnectionsListResult = {
  connections?: AdapterConnectionEntry[];
};

type AdapterConnectionsResult = {
  connections?: Array<{
    id?: unknown;
    connectionId?: unknown;
    display_name?: unknown;
    credential_ref?: unknown;
    status?: unknown;
  }>;
};

type AdapterConnectionsOAuthStartResult = {
  redirectUrl: string;
  state: string;
  expiresAt: number;
};

type AdapterConnectionMutationResult = {
  connectionId: string;
  status: string;
  account?: string;
  service?: string;
};

type AdapterConnectionsUploadResult = {
  status: string;
  preview?: {
    rows?: number;
  };
};

export type AdapterConnectionsCustomResult = {
  status: "pending" | "requires_input" | "completed" | "failed" | "cancelled";
  sessionId?: string;
  account?: string;
  service?: string;
  message?: string;
  instructions?: string;
  fields?: AdapterAuthField[];
  secretFieldsPresent?: boolean;
  metadata?: Record<string, unknown>;
};

type AdapterConnectionsTestResult = {
  ok: boolean;
  latency: number;
  account?: string;
  error?: string | null;
};

type AdapterConnectionsDisconnectResult = {
  status: string;
  account?: string;
  service?: string;
};

type AdapterConnectionsBackfillResult = {
  status: "queued" | "running";
  connectionId: string;
  account?: string;
  service?: string;
  since: string;
  job_definition_id?: string;
  job_run_id?: string;
  queue_entry_id?: string;
  existing_run?: boolean;
};

type AdapterConnectionsLivesyncResult = {
  connectionId: string;
  enabled: boolean;
  status?: string;
  account?: string;
  service?: string;
};

export type IntegrationsState = {
  client: {
    request<T = unknown>(method: string, params?: unknown): Promise<T>;
  } | null;
  connected: boolean;
  integrationsLoading: boolean;
  integrationsCatalogLoading: boolean;
  integrationsBusyAdapter: string | null;
  integrationsBusyAction: string | null;
  integrationsError: string | null;
  integrationsCatalogError: string | null;
  integrationsMessage: string | null;
  integrationsLoaded: boolean;
  integrationsAdapters: AdapterConnectionEntry[];
  integrationsCatalog: AdapterCatalogEntry[];
  integrationsSelectedConnectionKey: string;
  integrationsSelectedAuthMethodId: string;
  integrationsSessionId: string;
  integrationsPayloadText: string;
  integrationsPendingFields: AdapterAuthField[];
  integrationsInstructions: string | null;
};

function trimOrEmpty(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: string | null | undefined): string {
  return trimOrEmpty(value).toLowerCase();
}

const CATALOG_SELECTION_PREFIX = "catalog::";

function parsePayload(payloadText: string): Record<string, unknown> | undefined {
  const trimmed = payloadText.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Payload must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function normalizeAdapterConnections(
  payload: AdapterConnectionsResult | undefined,
): AdapterConnectionIdentity[] {
  if (!Array.isArray(payload?.connections)) {
    return [];
  }
  return payload.connections
    .map((entry) => {
      const id =
        typeof entry?.connectionId === "string" && entry.connectionId.trim()
          ? entry.connectionId.trim()
          : typeof entry?.id === "string"
            ? entry.id.trim()
            : "";
      if (!id) {
        return null;
      }
      return {
        id,
        displayName:
          typeof entry?.display_name === "string" && entry.display_name.trim()
            ? entry.display_name.trim()
            : null,
        credentialRef:
          typeof entry?.credential_ref === "string" && entry.credential_ref.trim()
            ? entry.credential_ref.trim()
            : null,
        status:
          typeof entry?.status === "string" && entry.status.trim() ? entry.status.trim() : null,
      } satisfies AdapterConnectionIdentity;
    })
    .filter((entry): entry is AdapterConnectionIdentity => Boolean(entry))
    .toSorted((a, b) => a.id.localeCompare(b.id));
}

type AdapterCatalogMethodShape = {
  id?: unknown;
  type?: unknown;
  label?: unknown;
  icon?: unknown;
  service?: unknown;
  scopes?: unknown;
  fields?: unknown;
  accept?: unknown;
  templateUrl?: unknown;
  maxSize?: unknown;
};

type AdapterCatalogListResult = {
  adapters?: unknown;
  catalog?: unknown;
  items?: unknown;
  connections?: unknown;
};

function normalizeCatalogMethod(method: AdapterCatalogMethodShape): AdapterAuthMethod | null {
  const id = trimOrEmpty(typeof method?.id === "string" ? method.id : null);
  const type = trimOrEmpty(typeof method?.type === "string" ? method.type : null);
  const label = trimOrEmpty(typeof method?.label === "string" ? method.label : null);
  const icon = trimOrEmpty(typeof method?.icon === "string" ? method.icon : null);
  const service = trimOrEmpty(typeof method?.service === "string" ? method.service : null);
  if (!id || !label) {
    return null;
  }
  if (type === "oauth2") {
    return {
      id,
      type: "oauth2",
      label,
      icon: icon || "oauth",
      service,
      scopes: Array.isArray(method?.scopes)
        ? method.scopes.filter((scope): scope is string => typeof scope === "string")
        : [],
    };
  }
  if (type === "api_key") {
    return {
      id,
      type: "api_key",
      label,
      icon: icon || "plug",
      service,
      fields: Array.isArray(method?.fields)
        ? method.fields.filter((field): field is AdapterAuthField =>
            Boolean(field && typeof field === "object"),
          )
        : [],
    };
  }
  if (type === "file_upload") {
    return {
      id,
      type: "file_upload",
      label,
      icon: icon || "upload",
      accept: Array.isArray(method?.accept)
        ? method.accept.filter((item): item is string => typeof item === "string")
        : [],
      templateUrl: typeof method?.templateUrl === "string" ? method.templateUrl : undefined,
      maxSize: typeof method?.maxSize === "number" ? method.maxSize : undefined,
    };
  }
  if (type === "custom_flow") {
    return {
      id,
      type: "custom_flow",
      label,
      icon: icon || "plug",
      service,
      fields: Array.isArray(method?.fields)
        ? method.fields.filter((field): field is AdapterAuthField =>
            Boolean(field && typeof field === "object"),
          )
        : undefined,
    };
  }
  return null;
}

function normalizeCatalogMethods(entry: Record<string, unknown>): AdapterAuthManifest | undefined {
  const setupDescriptor =
    entry.setup_descriptor && typeof entry.setup_descriptor === "object"
      ? (entry.setup_descriptor as Record<string, unknown>)
      : null;
  const descriptorAuth =
    setupDescriptor?.auth && typeof setupDescriptor.auth === "object"
      ? (setupDescriptor.auth as Record<string, unknown>)
      : null;
  const rawAuth =
    entry.auth && typeof entry.auth === "object" ? (entry.auth as Record<string, unknown>) : null;
  const rawMethods = Array.isArray(entry.methods)
    ? entry.methods
    : Array.isArray(entry.auth_methods)
      ? entry.auth_methods
      : Array.isArray(rawAuth?.methods)
        ? rawAuth.methods
        : Array.isArray(descriptorAuth?.methods)
          ? descriptorAuth.methods
          : [];
  const methods = rawMethods
    .map((method) =>
      method && typeof method === "object"
        ? normalizeCatalogMethod(method as AdapterCatalogMethodShape)
        : null,
    )
    .filter((method): method is AdapterAuthMethod => Boolean(method));
  const setupGuide =
    typeof entry.setupGuide === "string"
      ? entry.setupGuide
      : typeof entry.setup_guide === "string"
        ? entry.setup_guide
        : typeof rawAuth?.setupGuide === "string"
          ? rawAuth.setupGuide
          : typeof rawAuth?.setup_guide === "string"
            ? rawAuth.setup_guide
            : typeof descriptorAuth?.setupGuide === "string"
              ? descriptorAuth.setupGuide
              : typeof descriptorAuth?.setup_guide === "string"
                ? descriptorAuth.setup_guide
                : undefined;
  return methods.length > 0 || setupGuide
    ? { methods, ...(setupGuide ? { setupGuide } : {}) }
    : undefined;
}

function normalizeAdapterCatalogEntry(entry: unknown): AdapterCatalogEntry | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const raw = entry as Record<string, unknown>;
  const adapter = normalizeKey(
    typeof raw.adapter === "string"
      ? raw.adapter
      : typeof raw.adapter_id === "string"
        ? raw.adapter_id
        : typeof raw.id === "string"
          ? raw.id
          : typeof raw.service === "string"
            ? raw.service
            : null,
  );
  const name = trimOrEmpty(
    typeof raw.name === "string"
      ? raw.name
      : typeof raw.display_name === "string"
        ? raw.display_name
        : typeof raw.displayName === "string"
          ? raw.displayName
          : adapter,
  );
  if (!adapter || !name) {
    return null;
  }
  const service = trimOrEmpty(
    typeof raw.service === "string"
      ? raw.service
      : typeof raw.service_name === "string"
        ? raw.service_name
        : typeof raw.platform === "string"
          ? raw.platform
          : null,
  );
  const description = trimOrEmpty(
    typeof raw.description === "string"
      ? raw.description
      : typeof raw.summary === "string"
        ? raw.summary
        : null,
  );
  const icon = trimOrEmpty(typeof raw.icon === "string" ? raw.icon : null);
  const auth = normalizeCatalogMethods(raw);
  const published = raw.published === true || typeof raw.publishedReleaseId === "string";
  const publishedVersion = trimOrEmpty(
    typeof raw.publishedVersion === "string"
      ? raw.publishedVersion
      : typeof raw.latest_version === "string"
        ? raw.latest_version
        : published && typeof raw.version === "string"
          ? raw.version
          : null,
  );
  const registered = raw.registered === true;
  const registeredVersion = trimOrEmpty(
    typeof raw.registeredVersion === "string"
      ? raw.registeredVersion
      : registered && typeof raw.version === "string"
        ? raw.version
        : null,
  );
  return {
    adapter,
    name,
    description: description || null,
    service: service || null,
    icon: icon || null,
    published,
    publishedVersion: publishedVersion || null,
    registered,
    registeredVersion: registeredVersion || null,
    ...(auth ? { auth } : {}),
  };
}

function authMethodCount(manifest: AdapterAuthManifest | undefined): number {
  return Array.isArray(manifest?.methods) ? manifest.methods.length : 0;
}

function catalogEntryScore(entry: AdapterCatalogEntry): number {
  let score = 0;
  const methods = authMethodCount(entry.auth);
  if (methods > 0 || entry.auth?.setupGuide) {
    score += 100;
  }
  if (entry.published) {
    score += 50;
  }
  if (entry.registered) {
    score += 25;
  }
  return score + methods;
}

function mergeAuthManifest(
  left: AdapterAuthManifest | undefined,
  right: AdapterAuthManifest | undefined,
): AdapterAuthManifest | undefined {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  const preferredMethods =
    authMethodCount(right) > authMethodCount(left) ? right.methods : left.methods;
  const setupGuide = left.setupGuide || right.setupGuide;
  return {
    methods: preferredMethods,
    ...(setupGuide ? { setupGuide } : {}),
  };
}

function mergeCatalogEntries(
  left: AdapterCatalogEntry,
  right: AdapterCatalogEntry,
): AdapterCatalogEntry {
  const primary = catalogEntryScore(right) > catalogEntryScore(left) ? right : left;
  const secondary = primary === right ? left : right;
  const auth = mergeAuthManifest(primary.auth, secondary.auth);
  return {
    adapter: primary.adapter || secondary.adapter,
    name: primary.name || secondary.name,
    description: primary.description || secondary.description || null,
    service: primary.service || secondary.service || null,
    icon: primary.icon || secondary.icon || null,
    published: Boolean(left.published || right.published),
    publishedVersion: left.publishedVersion || right.publishedVersion || null,
    registered: Boolean(left.registered || right.registered),
    registeredVersion: left.registeredVersion || right.registeredVersion || null,
    ...(auth ? { auth } : {}),
  };
}

function normalizeAdapterCatalog(
  payload: AdapterCatalogListResult | undefined,
): AdapterCatalogEntry[] {
  const rawEntries = Array.isArray(payload?.adapters)
    ? payload.adapters
    : Array.isArray(payload?.catalog)
      ? payload.catalog
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.connections)
          ? payload.connections
          : [];
  const entries = rawEntries
    .map((entry) => normalizeAdapterCatalogEntry(entry))
    .filter((entry): entry is AdapterCatalogEntry => Boolean(entry));
  const merged = new Map<string, AdapterCatalogEntry>();
  for (const entry of entries) {
    const key = normalizeKey(entry.adapter);
    const existing = merged.get(key);
    merged.set(key, existing ? mergeCatalogEntries(existing, entry) : entry);
  }
  return [...merged.values()].toSorted((left, right) => {
    const publishedRank = Number(right.published === true) - Number(left.published === true);
    if (publishedRank !== 0) {
      return publishedRank;
    }
    const registeredRank = Number(right.registered === true) - Number(left.registered === true);
    if (registeredRank !== 0) {
      return registeredRank;
    }
    return left.name.localeCompare(right.name);
  });
}

function mergeAdapterConnections(
  entry: AdapterConnectionEntry,
  discovered: AdapterConnectionIdentity[],
): AdapterConnectionIdentity[] {
  const merged = new Map<string, AdapterConnectionIdentity>();
  for (const connection of discovered) {
    merged.set(connection.id, connection);
  }
  const active = trimOrEmpty(entry.account);
  const metadataRef =
    typeof entry.metadata?.credential_ref === "string" && entry.metadata.credential_ref.trim()
      ? entry.metadata.credential_ref.trim()
      : null;
  if (active) {
    const previous = merged.get(active);
    merged.set(active, {
      id: active,
      displayName: previous?.displayName ?? null,
      credentialRef: previous?.credentialRef ?? metadataRef,
      status: previous?.status ?? entry.status,
    });
  }
  return [...merged.values()].toSorted((a, b) => a.id.localeCompare(b.id));
}

function catalogSelectionKey(adapter: string): string {
  return `${CATALOG_SELECTION_PREFIX}${normalizeKey(adapter)}`;
}

function connectionSelectionKey(entry: AdapterConnectionEntry): string {
  const connectionId = trimOrEmpty(entry.connectionId);
  if (connectionId) {
    return connectionId;
  }
  const account = trimOrEmpty(entry.account);
  if (account) {
    return `${trimOrEmpty(entry.adapter)}::${account}`;
  }
  return `${trimOrEmpty(entry.adapter)}::disconnected`;
}

function sortConnections(entries: AdapterConnectionEntry[]): AdapterConnectionEntry[] {
  const rank = (status: AdapterConnectionStatus): number => {
    if (status === "connected") {
      return 0;
    }
    if (status === "error") {
      return 1;
    }
    if (status === "expired") {
      return 2;
    }
    return 3;
  };
  return [...entries].sort((left, right) => {
    const statusRank = rank(left.status) - rank(right.status);
    if (statusRank !== 0) {
      return statusRank;
    }
    const serviceCompare = trimOrEmpty(left.service ?? left.adapter).localeCompare(
      trimOrEmpty(right.service ?? right.adapter),
    );
    if (serviceCompare !== 0) {
      return serviceCompare;
    }
    const adapterCompare = trimOrEmpty(left.adapter).localeCompare(trimOrEmpty(right.adapter));
    if (adapterCompare !== 0) {
      return adapterCompare;
    }
    const accountCompare = trimOrEmpty(left.account).localeCompare(trimOrEmpty(right.account));
    if (accountCompare !== 0) {
      return accountCompare;
    }
    return trimOrEmpty(left.connectionId).localeCompare(trimOrEmpty(right.connectionId));
  });
}

function selectedConnectionEntry(state: IntegrationsState): AdapterConnectionEntry | null {
  const selected = trimOrEmpty(state.integrationsSelectedConnectionKey);
  if (!selected || selected.startsWith(CATALOG_SELECTION_PREFIX)) {
    return null;
  }
  return (
    state.integrationsAdapters.find((entry) => connectionSelectionKey(entry) === selected) ?? null
  );
}

function selectedCatalogEntry(state: IntegrationsState): AdapterCatalogEntry | null {
  const selected = trimOrEmpty(state.integrationsSelectedConnectionKey);
  const adapter = selected.startsWith(CATALOG_SELECTION_PREFIX)
    ? normalizeKey(selected.slice(CATALOG_SELECTION_PREFIX.length))
    : "";
  if (!adapter) {
    return null;
  }
  return state.integrationsCatalog.find((entry) => normalizeKey(entry.adapter) === adapter) ?? null;
}

function selectedConnectionId(state: IntegrationsState): string {
  return trimOrEmpty(selectedConnectionEntry(state)?.connectionId);
}

function availableAuthMethods(
  entry: AdapterConnectionEntry | null,
  catalogEntry: AdapterCatalogEntry | null,
): AdapterAuthMethod[] {
  if (Array.isArray(entry?.auth?.methods) && entry.auth.methods.length > 0) {
    return entry.auth.methods;
  }
  return Array.isArray(catalogEntry?.auth?.methods) ? catalogEntry.auth.methods : [];
}

function selectDefaultAuthMethodId(
  entry: AdapterConnectionEntry | null,
  catalogEntry: AdapterCatalogEntry | null,
): string {
  const methods = availableAuthMethods(entry, catalogEntry);
  if (methods.length === 0) {
    return "";
  }
  const active = trimOrEmpty(entry?.authMethodId);
  if (active && methods.some((method) => method.id === active)) {
    return active;
  }
  return trimOrEmpty(methods[0]?.id);
}

function catalogSelectionRequiresAuthMethodChoice(
  entry: AdapterConnectionEntry | null,
  catalogEntry: AdapterCatalogEntry | null,
): boolean {
  return !entry && availableAuthMethods(entry, catalogEntry).length > 1;
}

function selectedAuthMethod(state: IntegrationsState): AdapterAuthMethod | null {
  const connection = selectedConnectionEntry(state);
  const catalog = selectedCatalogEntry(state);
  const methods = availableAuthMethods(connection, catalog);
  if (methods.length === 0) {
    return null;
  }
  const selectedId = trimOrEmpty(state.integrationsSelectedAuthMethodId);
  if (selectedId) {
    const explicit = methods.find((method) => method.id === selectedId);
    if (explicit) {
      return explicit;
    }
  }
  if (catalogSelectionRequiresAuthMethodChoice(connection, catalog)) {
    return null;
  }
  const activeId = selectDefaultAuthMethodId(connection, catalog);
  return methods.find((method) => method.id === activeId) ?? methods[0] ?? null;
}

function selectedAdapter(state: IntegrationsState): string {
  const connection = selectedConnectionEntry(state);
  if (connection) {
    return trimOrEmpty(connection.adapter);
  }
  return trimOrEmpty(selectedCatalogEntry(state)?.adapter);
}

function selectedAuthMethodId(state: IntegrationsState): string {
  return trimOrEmpty(selectedAuthMethod(state)?.id);
}

function syncSelectedAuthMethod(state: IntegrationsState): void {
  const connection = selectedConnectionEntry(state);
  const catalog = selectedCatalogEntry(state);
  state.integrationsSelectedAuthMethodId = catalogSelectionRequiresAuthMethodChoice(
    connection,
    catalog,
  )
    ? ""
    : selectDefaultAuthMethodId(connection, catalog);
}

function syncSelectedConnection(state: IntegrationsState): void {
  const selected = selectedConnectionEntry(state);
  if (!selected) {
    const catalog = selectedCatalogEntry(state);
    if (catalog) {
      state.integrationsSelectedConnectionKey = catalogSelectionKey(catalog.adapter);
    } else {
      const first = state.integrationsAdapters[0];
      if (first) {
        state.integrationsSelectedConnectionKey = connectionSelectionKey(first);
      } else {
        const firstCatalog = state.integrationsCatalog[0];
        state.integrationsSelectedConnectionKey = firstCatalog
          ? catalogSelectionKey(firstCatalog.adapter)
          : "";
      }
    }
  }
  syncSelectedAuthMethod(state);
}

function setBusy(state: IntegrationsState, adapter: string, action: string): void {
  state.integrationsBusyAdapter = adapter;
  state.integrationsBusyAction = action;
}

function clearBusy(state: IntegrationsState): void {
  state.integrationsBusyAdapter = null;
  state.integrationsBusyAction = null;
}

const DEFAULT_BACKFILL_SINCE = "2001-01-01T00:00:00Z";
const LIVESYNC_ENABLE_METHOD = "adapters.connections.livesync.enable";
const LIVESYNC_DISABLE_METHOD = "adapters.connections.livesync.disable";

function hasAuthMethod(
  entry: AdapterConnectionEntry | null,
  type: AdapterAuthMethod["type"],
): boolean {
  const methods = entry?.auth?.methods;
  if (!Array.isArray(methods)) {
    return false;
  }
  return methods.some((method) => method?.type === type);
}

function applyCustomFlowResult(
  state: IntegrationsState,
  adapter: string,
  result: AdapterConnectionsCustomResult,
): void {
  const messageParts: string[] = [];
  messageParts.push(`${adapter}: ${result.status}`);
  if (result.message) {
    messageParts.push(result.message);
  }
  if (result.instructions) {
    messageParts.push(result.instructions);
  }
  state.integrationsMessage = messageParts.join(" - ");
  state.integrationsSessionId = trimOrEmpty(result.sessionId) || state.integrationsSessionId;
  state.integrationsPendingFields = Array.isArray(result.fields) ? result.fields : [];
  state.integrationsInstructions = trimOrEmpty(result.instructions) || null;

  if (result.status === "completed" || result.status === "cancelled") {
    state.integrationsSessionId = "";
    state.integrationsPendingFields = [];
    state.integrationsInstructions = null;
  }
}

function consumeCallbackSignal(state: IntegrationsState): void {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  const connected = trimOrEmpty(url.searchParams.get("connected"));
  const error = trimOrEmpty(url.searchParams.get("error"));
  if (!connected && !error) {
    return;
  }
  if (connected) {
    state.integrationsMessage = `OAuth connected for adapter: ${connected}`;
  } else if (error) {
    state.integrationsError = `OAuth callback error: ${error}`;
  }
  url.searchParams.delete("connected");
  url.searchParams.delete("error");
  window.history.replaceState({}, "", url.toString());
}

function resolveBackfillSince(entry: AdapterConnectionEntry | null): string {
  const metadata = entry?.metadata as Record<string, any> | undefined;
  const sync = metadata?.sync as Record<string, any> | undefined;
  const config = metadata?.config as Record<string, any> | undefined;
  const backfillSince =
    typeof metadata?.backfill_since === "string" && metadata.backfill_since.trim()
      ? metadata.backfill_since.trim()
      : typeof sync?.backfill_since === "string" && sync.backfill_since.trim()
        ? sync.backfill_since.trim()
        : typeof config?.backfill_since === "string" && config.backfill_since.trim()
          ? config.backfill_since.trim()
          : "";
  return backfillSince || DEFAULT_BACKFILL_SINCE;
}

export function resolveLivesyncEnabled(entry: AdapterConnectionEntry | null): boolean {
  const metadata = entry?.metadata as Record<string, any> | undefined;
  const sync = metadata?.sync as Record<string, any> | undefined;
  const monitor = metadata?.monitor as Record<string, any> | undefined;
  const candidates = [
    metadata?.livesync_enabled,
    metadata?.livesyncEnabled,
    metadata?.liveSyncEnabled,
    sync?.enabled,
    sync?.live,
    monitor?.started,
    monitor?.running,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "boolean") {
      return candidate;
    }
  }
  return entry?.status === "connected";
}

export function adapterSupportsOAuth(entry: AdapterConnectionEntry | null): boolean {
  return hasAuthMethod(entry, "oauth2");
}

export function adapterSupportsApiKey(entry: AdapterConnectionEntry | null): boolean {
  return hasAuthMethod(entry, "api_key");
}

export function adapterSupportsCustomFlow(entry: AdapterConnectionEntry | null): boolean {
  return hasAuthMethod(entry, "custom_flow");
}

export function setIntegrationsSelectedConnectionKey(
  state: IntegrationsState,
  connectionKey: string,
): void {
  state.integrationsSelectedConnectionKey = trimOrEmpty(connectionKey);
  syncSelectedAuthMethod(state);
  state.integrationsError = null;
  state.integrationsMessage = null;
}

export function setIntegrationsSelectedAuthMethodId(
  state: IntegrationsState,
  authMethodId: string,
): void {
  state.integrationsSelectedAuthMethodId = trimOrEmpty(authMethodId);
  state.integrationsError = null;
  state.integrationsMessage = null;
}

export function setIntegrationsPayloadText(state: IntegrationsState, payloadText: string): void {
  state.integrationsPayloadText = payloadText;
}

export function beginAddIntegrationConnector(state: IntegrationsState): void {
  state.integrationsError = null;
  state.integrationsMessage = null;
}

export function selectIntegrationCatalogAdapter(state: IntegrationsState, adapter: string): void {
  const target = normalizeKey(adapter);
  if (!target) {
    state.integrationsError = "Choose a connector first.";
    return;
  }

  const preferred =
    state.integrationsCatalog.find((entry) => normalizeKey(entry.adapter) === target) ?? null;

  if (!preferred) {
    state.integrationsError = `No connector catalog entry is available yet for ${adapter}.`;
    state.integrationsMessage = null;
    return;
  }

  state.integrationsSelectedConnectionKey = catalogSelectionKey(preferred.adapter);
  syncSelectedAuthMethod(state);
  state.integrationsPayloadText = "{}";
  state.integrationsSessionId = "";
  state.integrationsPendingFields = [];
  state.integrationsInstructions = null;
  state.integrationsError = null;
  state.integrationsMessage = `Starting setup for a new ${preferred.name || preferred.adapter} connection. Existing connections stay unchanged.`;
}

function parseApiKeyPayload(payloadText: string): {
  fields: Record<string, string>;
  config?: Record<string, unknown>;
} {
  const payload = parsePayload(payloadText);
  if (!payload) {
    return { fields: {} };
  }
  const explicitFields = payload.fields;
  const rawFields =
    explicitFields && typeof explicitFields === "object" && !Array.isArray(explicitFields)
      ? (explicitFields as Record<string, unknown>)
      : payload;
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawFields)) {
    if (key === "fields" || key === "config") {
      continue;
    }
    if (value == null) {
      continue;
    }
    fields[key] = String(value);
  }
  const config =
    payload.config && typeof payload.config === "object" && !Array.isArray(payload.config)
      ? (payload.config as Record<string, unknown>)
      : undefined;
  return Object.keys(config ?? {}).length > 0 ? { fields, config } : { fields };
}

function parseFileUploadPayload(payloadText: string): {
  filePath: string;
  fileName: string;
} {
  const payload = parsePayload(payloadText);
  if (!payload) {
    throw new Error("File upload setup requires filePath.");
  }
  const explicitFields = payload.fields;
  const rawFields =
    explicitFields && typeof explicitFields === "object" && !Array.isArray(explicitFields)
      ? (explicitFields as Record<string, unknown>)
      : payload;
  const filePath = trimOrEmpty(
    typeof rawFields.filePath === "string"
      ? rawFields.filePath
      : typeof rawFields.file_path === "string"
        ? rawFields.file_path
        : null,
  );
  if (!filePath) {
    throw new Error("File upload setup requires filePath.");
  }
  const explicitFileName = trimOrEmpty(
    typeof rawFields.fileName === "string"
      ? rawFields.fileName
      : typeof rawFields.file_name === "string"
        ? rawFields.file_name
        : null,
  );
  const inferredFileName = filePath.split(/[\\/]/u).pop() ?? "";
  return {
    filePath,
    fileName: explicitFileName || inferredFileName || "upload",
  };
}

export async function loadIntegrations(state: IntegrationsState): Promise<void> {
  const totalTimer = startConsoleLatency("integrations.connectors.load.total");
  if (state.integrationsLoading) {
    finishConsoleLatency(totalTimer, "ok", { skipped: true, reason: "already loading" });
    return;
  }
  if (!state.client || !state.connected) {
    state.integrationsLoaded = true;
    state.integrationsError = "Runtime not connected.";
    finishConsoleLatency(totalTimer, "error", { reason: "runtime not connected" });
    return;
  }
  state.integrationsLoading = true;
  state.integrationsCatalogLoading = true;
  state.integrationsError = null;
  state.integrationsCatalogError = null;
  consumeCallbackSignal(state);
  try {
    const client = state.client;
    const requestTimer = startConsoleLatency("integrations.connectors.requests.parallel");
    const [connectionsResult, catalogResult] = await Promise.allSettled([
      client.request<AdapterConnectionsListResult>("adapters.connections.list", {}),
      client.request<AdapterCatalogListResult>("adapters.catalog.list", {}),
    ]);
    finishConsoleLatency(
      requestTimer,
      connectionsResult.status === "fulfilled" || catalogResult.status === "fulfilled"
        ? "ok"
        : "error",
      {
        connections: connectionsResult.status,
        catalog: catalogResult.status,
      },
    );
    const connectionsNormalizeTimer = startConsoleLatency(
      "integrations.connectors.normalize.connections",
    );
    if (connectionsResult.status === "fulfilled") {
      state.integrationsAdapters = sortConnections(
        (Array.isArray(connectionsResult.value.connections)
          ? connectionsResult.value.connections
          : []
        ).map((entry) => ({
          ...entry,
          connections: Array.isArray(entry.connections) ? entry.connections : [],
        })),
      );
      state.integrationsError = null;
    } else {
      state.integrationsError = String(connectionsResult.reason);
    }
    finishConsoleLatency(
      connectionsNormalizeTimer,
      connectionsResult.status === "fulfilled" ? "ok" : "error",
      {
        status: connectionsResult.status,
        count: state.integrationsAdapters.length,
      },
    );
    const catalogNormalizeTimer = startConsoleLatency("integrations.connectors.normalize.catalog");
    if (catalogResult.status === "fulfilled") {
      state.integrationsCatalog = normalizeAdapterCatalog(catalogResult.value);
      state.integrationsCatalogError = null;
    } else {
      state.integrationsCatalogError = String(catalogResult.reason);
    }
    finishConsoleLatency(
      catalogNormalizeTimer,
      catalogResult.status === "fulfilled" ? "ok" : "error",
      {
        status: catalogResult.status,
        count: state.integrationsCatalog.length,
      },
    );
    const selectionTimer = startConsoleLatency("integrations.connectors.sync-selection");
    syncSelectedConnection(state);
    finishConsoleLatency(selectionTimer, "ok", {
      selected: state.integrationsSelectedConnectionKey || null,
    });
  } catch (error) {
    state.integrationsError = String(error);
    finishConsoleLatency(totalTimer, "error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  } finally {
    state.integrationsLoaded = true;
    state.integrationsLoading = false;
    state.integrationsCatalogLoading = false;
  }
  finishConsoleLatency(
    totalTimer,
    state.integrationsError || state.integrationsCatalogError ? "error" : "ok",
    {
      connections: state.integrationsAdapters.length,
      catalog: state.integrationsCatalog.length,
    },
  );
}

export async function startIntegrationOAuth(
  state: IntegrationsState,
  adapter: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  const target = trimOrEmpty(adapter);
  if (!target) {
    state.integrationsError = "Select an adapter first.";
    return;
  }
  const authMethodId = selectedAuthMethodId(state);
  if (!authMethodId) {
    state.integrationsError = "Select an auth method first.";
    return;
  }
  setBusy(state, target, "oauth_start");
  state.integrationsError = null;
  state.integrationsMessage = null;
  try {
    const redirectBaseUrl = `${window.location.origin}`;
    const result = await state.client.request<AdapterConnectionsOAuthStartResult>(
      "adapters.connections.oauth.start",
      {
        adapter: selectedAdapter(state) || target,
        authMethodId,
        redirectBaseUrl,
      },
    );
    if (!trimOrEmpty(result.redirectUrl)) {
      throw new Error("Missing OAuth redirect URL.");
    }
    window.location.href = result.redirectUrl;
  } catch (error) {
    state.integrationsError = String(error);
    clearBusy(state);
  }
}

export async function startIntegrationCustomFlow(
  state: IntegrationsState,
  adapter: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  const target = trimOrEmpty(adapter);
  if (!target) {
    state.integrationsError = "Select an adapter first.";
    return;
  }
  const method = selectedAuthMethod(state);
  if (!method || method.type !== "custom_flow") {
    state.integrationsError = "Select a custom setup auth method first.";
    return;
  }
  setBusy(state, target, "custom_start");
  state.integrationsError = null;
  state.integrationsMessage = null;
  try {
    const payload = parsePayload(state.integrationsPayloadText);
    const result = await state.client.request<AdapterConnectionsCustomResult>(
      "adapters.connections.custom.start",
      {
        adapter: target,
        authMethodId: method.id,
        ...(payload ? { payload } : {}),
      },
    );
    applyCustomFlowResult(state, target, result);
    await loadIntegrations(state);
  } catch (error) {
    state.integrationsError = String(error);
  } finally {
    clearBusy(state);
  }
}

export async function submitIntegrationCustomFlow(
  state: IntegrationsState,
  adapter: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  const target = trimOrEmpty(adapter);
  const sessionId = trimOrEmpty(state.integrationsSessionId);
  if (!target) {
    state.integrationsError = "Select an adapter first.";
    return;
  }
  if (!sessionId) {
    state.integrationsError = "Start setup first to obtain a session ID.";
    return;
  }
  setBusy(state, target, "custom_submit");
  state.integrationsError = null;
  state.integrationsMessage = null;
  try {
    const payload = parsePayload(state.integrationsPayloadText);
    const result = await state.client.request<AdapterConnectionsCustomResult>(
      "adapters.connections.custom.submit",
      {
        adapter: target,
        sessionId,
        ...(payload ? { payload } : {}),
      },
    );
    applyCustomFlowResult(state, target, result);
    await loadIntegrations(state);
  } catch (error) {
    state.integrationsError = String(error);
  } finally {
    clearBusy(state);
  }
}

export async function connectIntegrationAdapter(
  state: IntegrationsState,
  adapter: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  const target = trimOrEmpty(adapter);
  if (!target) {
    state.integrationsError = "Select an adapter first.";
    return;
  }
  const method = selectedAuthMethod(state);
  if (!method || method.type !== "api_key") {
    state.integrationsError = "Select an API key auth method first.";
    return;
  }
  setBusy(state, target, "connect");
  state.integrationsError = null;
  state.integrationsMessage = null;
  try {
    const { fields, config } = parseApiKeyPayload(state.integrationsPayloadText);
    const connectionId = selectedConnectionId(state);
    const selectedAdapterName = selectedAdapter(state) || target;
    const result = connectionId
      ? await state.client.request<AdapterConnectionMutationResult>("adapters.connections.update", {
          connectionId,
          adapter: selectedAdapterName,
          authMethodId: method.id,
          fields,
          ...(config ? { config } : {}),
        })
      : await state.client.request<AdapterConnectionMutationResult>("adapters.connections.create", {
          adapter: selectedAdapterName,
          authMethodId: method.id,
          fields,
          ...(config ? { config } : {}),
        });
    const action = connectionId ? "updated" : "connected";
    state.integrationsMessage = `${target}: ${action}${result.account ? ` for ${result.account}` : ""}.`;
    await loadIntegrations(state);
  } catch (error) {
    state.integrationsError = String(error);
  } finally {
    clearBusy(state);
  }
}

export async function uploadIntegrationAdapter(
  state: IntegrationsState,
  adapter: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  const target = trimOrEmpty(adapter);
  if (!target) {
    state.integrationsError = "Select an adapter first.";
    return;
  }
  const method = selectedAuthMethod(state);
  if (!method || method.type !== "file_upload") {
    state.integrationsError = "Select a file upload auth method first.";
    return;
  }
  setBusy(state, target, "upload");
  state.integrationsError = null;
  state.integrationsMessage = null;
  try {
    const { filePath, fileName } = parseFileUploadPayload(state.integrationsPayloadText);
    const result = await state.client.request<AdapterConnectionsUploadResult>(
      "adapters.connections.upload",
      {
        adapter: selectedAdapter(state) || target,
        authMethodId: method.id,
        filePath,
        fileName,
      },
    );
    const rows = typeof result.preview?.rows === "number" ? ` (${result.preview.rows} rows)` : "";
    state.integrationsMessage = `${target}: upload ${result.status}${rows}.`;
    await loadIntegrations(state);
  } catch (error) {
    state.integrationsError = String(error);
  } finally {
    clearBusy(state);
  }
}

export async function checkIntegrationCustomFlow(
  state: IntegrationsState,
  adapter: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  const target = trimOrEmpty(adapter);
  const sessionId = trimOrEmpty(state.integrationsSessionId);
  if (!target) {
    state.integrationsError = "Select an adapter first.";
    return;
  }
  if (!sessionId) {
    state.integrationsError = "No active setup session.";
    return;
  }
  setBusy(state, target, "custom_status");
  state.integrationsError = null;
  state.integrationsMessage = null;
  try {
    const result = await state.client.request<AdapterConnectionsCustomResult>(
      "adapters.connections.custom.status",
      {
        adapter: target,
        sessionId,
      },
    );
    applyCustomFlowResult(state, target, result);
    await loadIntegrations(state);
  } catch (error) {
    state.integrationsError = String(error);
  } finally {
    clearBusy(state);
  }
}

export async function cancelIntegrationCustomFlow(
  state: IntegrationsState,
  adapter: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  const target = trimOrEmpty(adapter);
  const sessionId = trimOrEmpty(state.integrationsSessionId);
  if (!target) {
    state.integrationsError = "Select an adapter first.";
    return;
  }
  if (!sessionId) {
    state.integrationsError = "No active setup session.";
    return;
  }
  setBusy(state, target, "custom_cancel");
  state.integrationsError = null;
  state.integrationsMessage = null;
  try {
    const result = await state.client.request<AdapterConnectionsCustomResult>(
      "adapters.connections.custom.cancel",
      {
        adapter: target,
        sessionId,
      },
    );
    applyCustomFlowResult(state, target, result);
    await loadIntegrations(state);
  } catch (error) {
    state.integrationsError = String(error);
  } finally {
    clearBusy(state);
  }
}

export async function testIntegrationAdapter(
  state: IntegrationsState,
  adapter: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  const target = trimOrEmpty(adapter);
  const connectionId = selectedConnectionId(state);
  if (!target) {
    state.integrationsError = "Select an adapter first.";
    return;
  }
  if (!connectionId) {
    state.integrationsError = "Select a connection first.";
    return;
  }
  setBusy(state, target, "test");
  state.integrationsError = null;
  state.integrationsMessage = null;
  try {
    const result = await state.client.request<AdapterConnectionsTestResult>(
      "adapters.connections.test",
      {
        connectionId,
      },
    );
    state.integrationsMessage = result.ok
      ? `${target}: connection test passed (${Math.max(0, Math.trunc(result.latency))}ms).`
      : `${target}: connection test failed - ${result.error || "unknown error"}`;
    await loadIntegrations(state);
  } catch (error) {
    state.integrationsError = String(error);
  } finally {
    clearBusy(state);
  }
}

export async function disconnectIntegrationAdapter(
  state: IntegrationsState,
  adapter: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  const target = trimOrEmpty(adapter);
  const connectionId = selectedConnectionId(state);
  if (!target) {
    state.integrationsError = "Select an adapter first.";
    return;
  }
  if (!connectionId) {
    state.integrationsError = "Select a connection first.";
    return;
  }
  setBusy(state, target, "disconnect");
  state.integrationsError = null;
  state.integrationsMessage = null;
  try {
    const result = await state.client.request<AdapterConnectionsDisconnectResult>(
      "adapters.connections.disconnect",
      {
        connectionId,
      },
    );
    state.integrationsSessionId = "";
    state.integrationsPendingFields = [];
    state.integrationsInstructions = null;
    state.integrationsMessage = `${target}: ${result.status}.`;
    await loadIntegrations(state);
  } catch (error) {
    state.integrationsError = String(error);
  } finally {
    clearBusy(state);
  }
}

export async function backfillIntegrationAdapter(
  state: IntegrationsState,
  adapter: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  const target = trimOrEmpty(adapter);
  const connectionId = selectedConnectionId(state);
  if (!target) {
    state.integrationsError = "Select an adapter first.";
    return;
  }
  if (!connectionId) {
    state.integrationsError = "Select a connection first.";
    return;
  }
  setBusy(state, target, "backfill");
  state.integrationsError = null;
  state.integrationsMessage = null;
  try {
    const since = resolveBackfillSince(selectedConnectionEntry(state));
    const result = await state.client.request<AdapterConnectionsBackfillResult>(
      "adapters.connections.backfill",
      {
        connectionId,
        since,
      },
    );
    state.integrationsMessage =
      result.status === "running"
        ? `${target}: backfill already running since ${result.since}.`
        : `${target}: backfill queued since ${result.since}.`;
    await loadIntegrations(state);
  } catch (error) {
    state.integrationsError = String(error);
  } finally {
    clearBusy(state);
  }
}

export async function setIntegrationLivesync(
  state: IntegrationsState,
  adapter: string,
  enabled: boolean,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  const target = trimOrEmpty(adapter);
  const connectionId = selectedConnectionId(state);
  if (!target) {
    state.integrationsError = "Select an adapter first.";
    return;
  }
  if (!connectionId) {
    state.integrationsError = "Select a connection first.";
    return;
  }
  const action = enabled ? "livesync_on" : "livesync_off";
  setBusy(state, target, action);
  state.integrationsError = null;
  state.integrationsMessage = null;
  try {
    // Provisional connection-level livesync toggle names. The runtime surface
    // can land these in parallel without the console falling back to legacy
    // adapter-scoped monitor calls.
    const method = enabled ? LIVESYNC_ENABLE_METHOD : LIVESYNC_DISABLE_METHOD;
    const result = await state.client.request<AdapterConnectionsLivesyncResult>(method, {
      connectionId,
    });
    const nextEnabled = typeof result.enabled === "boolean" ? result.enabled : enabled;
    state.integrationsMessage = `${target}: livesync ${nextEnabled ? "enabled" : "disabled"}.`;
    await loadIntegrations(state);
  } catch (error) {
    state.integrationsError = String(error);
  } finally {
    clearBusy(state);
  }
}
