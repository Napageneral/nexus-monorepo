export type AdapterConnectionStatus = "connected" | "disconnected" | "error" | "expired";
export type AdapterConnectionAuthMethod =
  | "oauth2"
  | "api_key"
  | "file_upload"
  | "custom_flow"
  | null;

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
      type: "oauth2";
      label: string;
      icon: string;
      service: string;
      scopes: string[];
    }
  | {
      type: "api_key";
      label: string;
      icon: string;
      service: string;
      fields: AdapterAuthField[];
    }
  | {
      type: "file_upload";
      label: string;
      icon: string;
      accept: string[];
      templateUrl?: string;
      maxSize?: number;
    }
  | {
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
  adapter: string;
  name: string;
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
  adapters: AdapterConnectionEntry[];
};

type AdapterConnectionsResult = {
  connections?: Array<{
    id?: unknown;
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

export type IntegrationsState = {
  client: {
    request<T = unknown>(method: string, params?: unknown): Promise<T>;
  } | null;
  connected: boolean;
  integrationsLoading: boolean;
  integrationsBusyAdapter: string | null;
  integrationsBusyAction: string | null;
  integrationsError: string | null;
  integrationsMessage: string | null;
  integrationsAdapters: AdapterConnectionEntry[];
  integrationsSelectedAdapter: string;
  integrationsSessionId: string;
  integrationsPayloadText: string;
  integrationsPendingFields: AdapterAuthField[];
  integrationsInstructions: string | null;
};

function trimOrEmpty(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

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
      const id = typeof entry?.id === "string" ? entry.id.trim() : "";
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

function selectedAdapterEntry(state: IntegrationsState): AdapterConnectionEntry | null {
  const selected = trimOrEmpty(state.integrationsSelectedAdapter);
  if (!selected) {
    return null;
  }
  return state.integrationsAdapters.find((entry) => entry.adapter === selected) ?? null;
}

function syncSelectedAdapter(state: IntegrationsState): void {
  const selected = selectedAdapterEntry(state);
  if (selected) {
    return;
  }
  const first = state.integrationsAdapters[0]?.adapter ?? "";
  state.integrationsSelectedAdapter = first;
}

function setBusy(state: IntegrationsState, adapter: string, action: string): void {
  state.integrationsBusyAdapter = adapter;
  state.integrationsBusyAction = action;
}

function clearBusy(state: IntegrationsState): void {
  state.integrationsBusyAdapter = null;
  state.integrationsBusyAction = null;
}

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

export function adapterSupportsOAuth(entry: AdapterConnectionEntry | null): boolean {
  return hasAuthMethod(entry, "oauth2");
}

export function adapterSupportsCustomFlow(entry: AdapterConnectionEntry | null): boolean {
  return hasAuthMethod(entry, "custom_flow");
}

export function setIntegrationsSelectedAdapter(state: IntegrationsState, adapter: string): void {
  state.integrationsSelectedAdapter = trimOrEmpty(adapter);
  state.integrationsError = null;
  state.integrationsMessage = null;
}

export function setIntegrationsPayloadText(state: IntegrationsState, payloadText: string): void {
  state.integrationsPayloadText = payloadText;
}

export async function loadIntegrations(state: IntegrationsState): Promise<void> {
  if (!state.client || !state.connected || state.integrationsLoading) {
    return;
  }
  state.integrationsLoading = true;
  state.integrationsError = null;
  consumeCallbackSignal(state);
  try {
    const client = state.client;
    const result = await client.request<AdapterConnectionsListResult>(
      "adapter.connections.list",
      {},
    );
    const baseEntries = Array.isArray(result.adapters) ? result.adapters : [];
    state.integrationsAdapters = await Promise.all(
      baseEntries.map(async (entry) => {
        try {
          const connectionPayload = await client.request<AdapterConnectionsResult>(
            "adapter.connections.list",
            { adapter: entry.adapter },
          );
          return {
            ...entry,
            connections: mergeAdapterConnections(
              entry,
              normalizeAdapterConnections(connectionPayload),
            ),
          } satisfies AdapterConnectionEntry;
        } catch {
          return {
            ...entry,
            connections: mergeAdapterConnections(entry, []),
          } satisfies AdapterConnectionEntry;
        }
      }),
    );
    syncSelectedAdapter(state);
  } catch (error) {
    state.integrationsError = String(error);
  } finally {
    state.integrationsLoading = false;
  }
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
  setBusy(state, target, "oauth_start");
  state.integrationsError = null;
  state.integrationsMessage = null;
  try {
    const redirectBaseUrl = `${window.location.origin}`;
    const result = await state.client.request<AdapterConnectionsOAuthStartResult>(
      "adapter.connections.oauth.start",
      {
        adapter: target,
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
  setBusy(state, target, "custom_start");
  state.integrationsError = null;
  state.integrationsMessage = null;
  try {
    const payload = parsePayload(state.integrationsPayloadText);
    const result = await state.client.request<AdapterConnectionsCustomResult>(
      "adapter.connections.custom.start",
      {
        adapter: target,
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
      "adapter.connections.custom.submit",
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
      "adapter.connections.custom.status",
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
      "adapter.connections.custom.cancel",
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
  if (!target) {
    state.integrationsError = "Select an adapter first.";
    return;
  }
  setBusy(state, target, "test");
  state.integrationsError = null;
  state.integrationsMessage = null;
  try {
    const result = await state.client.request<AdapterConnectionsTestResult>(
      "adapter.connections.test",
      {
        adapter: target,
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
  if (!target) {
    state.integrationsError = "Select an adapter first.";
    return;
  }
  setBusy(state, target, "disconnect");
  state.integrationsError = null;
  state.integrationsMessage = null;
  try {
    const result = await state.client.request<AdapterConnectionsDisconnectResult>(
      "adapter.connections.disconnect",
      {
        adapter: target,
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
