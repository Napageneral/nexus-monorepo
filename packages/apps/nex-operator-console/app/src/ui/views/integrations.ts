import { html, nothing } from "lit";
import {
  type AdapterCatalogEntry,
  resolveLivesyncEnabled,
  type AdapterAuthField,
  type AdapterAuthManifest,
  type AdapterConnectionEntry,
} from "../controllers/integrations.ts";
import { renderPlatformIcon } from "../../console/components/platform-icons.ts";
import { consoleLatencyEnabled, latestConsoleLatencyEntries } from "../latency-metrics.ts";

export type IntegrationsProps = {
  connected: boolean;
  runtimeConnecting?: boolean;
  loading: boolean;
  busyAdapter: string | null;
  busyAction: string | null;
  error: string | null;
  catalogError: string | null;
  catalogLoading: boolean;
  message: string | null;
  connections: AdapterConnectionEntry[];
  catalogItems: AdapterCatalogEntry[];
  selectedConnectionKey: string;
  selectedAuthMethodId: string;
  sessionId: string;
  payloadText: string;
  pendingFields: AdapterAuthField[];
  instructions: string | null;
  catalogOpen: boolean;
  catalogSearch: string;
  onRefresh: () => void;
  onAddConnector: () => void;
  onCatalogClose: () => void;
  onCatalogSearchChange: (search: string) => void;
  onCatalogSelect: (adapter: string) => void;
  onSelectConnection: (connectionKey: string) => void;
  onSelectAuthMethod: (authMethodId: string) => void;
  onPayloadChange: (payloadText: string) => void;
  onConnect: (adapter: string) => void;
  onOAuthStart: (adapter: string) => void;
  onCustomStart: (adapter: string) => void;
  onCustomSubmit: (adapter: string) => void;
  onCustomStatus: (adapter: string) => void;
  onCustomCancel: (adapter: string) => void;
  onUpload: (adapter: string) => void;
  onTest: (adapter: string) => void;
  onBackfill: (adapter: string) => void;
  onLivesyncToggle: (adapter: string, enabled: boolean) => void;
  onDisconnect: (adapter: string) => void;
};

type AdapterAuthMethodType = "oauth2" | "api_key" | "file_upload" | "custom_flow";
const CATALOG_SELECTION_PREFIX = "catalog::";

function trimOrEmpty(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: string | null | undefined): string {
  return trimOrEmpty(value).toLowerCase();
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

function catalogSelectionKey(adapter: string): string {
  return `${CATALOG_SELECTION_PREFIX}${normalizeKey(adapter)}`;
}

function isCatalogSelectionKey(key: string): boolean {
  return trimOrEmpty(key).startsWith(CATALOG_SELECTION_PREFIX);
}

function selectedCatalogAdapter(key: string): string {
  if (!isCatalogSelectionKey(key)) {
    return "";
  }
  return normalizeKey(key.slice(CATALOG_SELECTION_PREFIX.length));
}

function authMethodTypesFromManifest(
  manifest: AdapterAuthManifest | null | undefined,
): Set<AdapterAuthMethodType> {
  const methods = manifest?.methods;
  if (!Array.isArray(methods)) {
    return new Set();
  }
  const out = new Set<AdapterAuthMethodType>();
  for (const method of methods) {
    if (
      method?.type === "oauth2" ||
      method?.type === "api_key" ||
      method?.type === "file_upload" ||
      method?.type === "custom_flow"
    ) {
      out.add(method.type);
    }
  }
  return out;
}

function authMethodTypes(
  entry: AdapterConnectionEntry | null,
  catalogEntry: AdapterCatalogEntry | null,
): Set<AdapterAuthMethodType> {
  const methods = authMethodTypesFromManifest(entry?.auth);
  if (methods.size > 0) {
    return methods;
  }
  return authMethodTypesFromManifest(catalogEntry?.auth);
}

function methodChipLabel(type: AdapterAuthMethodType): string {
  if (type === "oauth2") {
    return "OAuth";
  }
  if (type === "custom_flow") {
    return "Custom Setup";
  }
  if (type === "api_key") {
    return "API Key";
  }
  return "File Upload";
}

function sortAuthMethodTypes(types: Iterable<AdapterAuthMethodType>): AdapterAuthMethodType[] {
  const order: AdapterAuthMethodType[] = ["oauth2", "api_key", "custom_flow", "file_upload"];
  const present = new Set(types);
  return order.filter((type) => present.has(type));
}

function busyLabel(action: string): string {
  if (action === "oauth_start") {
    return "Starting OAuth…";
  }
  if (action === "connect") {
    return "Connecting…";
  }
  if (action === "upload") {
    return "Uploading…";
  }
  if (action === "custom_start") {
    return "Starting setup…";
  }
  if (action === "custom_submit") {
    return "Submitting…";
  }
  if (action === "custom_status") {
    return "Checking…";
  }
  if (action === "custom_cancel") {
    return "Cancelling…";
  }
  if (action === "test") {
    return "Testing…";
  }
  if (action === "backfill") {
    return "Backfilling…";
  }
  if (action === "livesync_on") {
    return "Enabling livesync…";
  }
  if (action === "livesync_off") {
    return "Disabling livesync…";
  }
  if (action === "disconnect") {
    return "Disconnecting…";
  }
  return "Working…";
}

function renderPendingField(field: AdapterAuthField) {
  const optional = field.required ? "" : " (optional)";
  return html`
    <div class="connect-field">
      <div class="connect-field__name">${field.label}${optional}</div>
      <div class="connect-field__meta">
        <span class="mono">${field.name}</span>
        <span class="muted">· ${field.type}</span>
      </div>
    </div>
  `;
}

function parsePayloadObject(payloadText: string): Record<string, unknown> {
  const trimmed = trimOrEmpty(payloadText);
  if (!trimmed) {
    return {};
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function payloadFieldsFromObject(payload: Record<string, unknown>): Record<string, unknown> {
  const explicitFields = payload.fields;
  const fields =
    explicitFields && typeof explicitFields === "object" && !Array.isArray(explicitFields)
      ? { ...(explicitFields as Record<string, unknown>) }
      : {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "fields" || key === "config") {
      continue;
    }
    if (fields[key] == null && value != null && typeof value !== "object") {
      fields[key] = value;
    }
  }
  return fields;
}

function payloadFieldValue(props: IntegrationsProps, fieldName: string): string {
  const payload = parsePayloadObject(props.payloadText);
  const value = payloadFieldsFromObject(payload)[fieldName];
  return value == null ? "" : String(value);
}

function payloadTextWithFieldValue(
  props: IntegrationsProps,
  fieldName: string,
  value: string,
): string {
  const payload = parsePayloadObject(props.payloadText);
  const fields = payloadFieldsFromObject(payload);
  fields[fieldName] = value;
  return JSON.stringify(
    {
      ...payload,
      fields,
    },
    null,
    2,
  );
}

function renderSetupQuestionField(field: AdapterAuthField, props: IntegrationsProps) {
  const value = payloadFieldValue(props, field.name);
  const optional = field.required ? "Required" : "Optional";
  const update = (nextValue: string) =>
    props.onPayloadChange(payloadTextWithFieldValue(props, field.name, nextValue));

  return html`
    <label class="field connector-setup-field">
      <span>
        ${field.label}
        <span class="connector-setup-field__requirement">${optional}</span>
      </span>
      ${
        field.type === "select"
          ? html`
            <select
              .value=${value}
              @change=${(event: Event) => update((event.target as HTMLSelectElement).value)}
            >
              <option value="">Select ${field.label}</option>
              ${(field.options ?? []).map(
                (option) => html`
                <option value=${option.value}>${option.label}</option>
              `,
              )}
            </select>
          `
          : html`
            <input
              type=${field.type === "secret" ? "password" : "text"}
              autocomplete="off"
              placeholder=${field.placeholder ?? ""}
              .value=${value}
              @input=${(event: InputEvent) => update((event.target as HTMLInputElement).value)}
            />
          `
      }
      <span class="connector-setup-field__meta">${field.name} · ${field.type}</span>
    </label>
  `;
}

function fileUploadFields(): AdapterAuthField[] {
  return [
    {
      name: "filePath",
      label: "Local file path",
      type: "text",
      required: true,
      placeholder: "/Users/tyler/path/to/export.csv",
    },
    {
      name: "fileName",
      label: "File name",
      type: "text",
      required: false,
      placeholder: "Optional; inferred from path when blank",
    },
  ];
}

function isConnectionSuccessMessage(message: string | null): boolean {
  const lower = trimOrEmpty(message).toLowerCase();
  return (
    lower.includes(": connected") ||
    lower.includes(": updated") ||
    lower.includes(": completed") ||
    lower.includes("connected successfully")
  );
}

function displayPlatformName(entry: AdapterConnectionEntry): string {
  const adapter = trimOrEmpty(entry.adapter).toLowerCase();
  if (adapter === "gog") return "Google";
  if (adapter === "eve") return "iMessage";
  if (adapter === "jira") return "Jira";
  if (adapter === "confluence") return "Confluence";
  if (adapter === "github") return "GitHub";
  if (adapter === "bitbucket") return "Bitbucket";
  if (adapter === "slack") return "Slack";
  if (adapter === "discord") return "Discord";
  if (adapter === "linkedin") return "LinkedIn";
  return entry.name || entry.adapter;
}

function displayCatalogName(entry: AdapterCatalogEntry): string {
  const adapter = normalizeKey(entry.adapter);
  if (adapter === "gog") return "Google";
  if (adapter === "eve") return "iMessage";
  if (adapter === "jira") return "Jira";
  if (adapter === "confluence") return "Confluence";
  if (adapter === "github") return "GitHub";
  if (adapter === "bitbucket") return "Bitbucket";
  if (adapter === "slack") return "Slack";
  if (adapter === "discord") return "Discord";
  if (adapter === "linkedin") return "LinkedIn";
  return entry.name || entry.adapter;
}

function iconKey(entry: AdapterConnectionEntry): string {
  const adapter = trimOrEmpty(entry.adapter).toLowerCase();
  if (adapter === "gog") {
    return "google";
  }
  return trimOrEmpty(entry.service) || trimOrEmpty(entry.adapter) || "plug";
}

function catalogIconKey(entry: AdapterCatalogEntry): string {
  const adapter = normalizeKey(entry.adapter);
  if (adapter === "gog") {
    return "google";
  }
  return (
    trimOrEmpty(entry.icon) || trimOrEmpty(entry.service) || trimOrEmpty(entry.adapter) || "plug"
  );
}

function statusBadge(status: AdapterConnectionEntry["status"]) {
  if (status === "connected") {
    return html`
      <span class="console-badge console-badge--success">Connected</span>
    `;
  }
  if (status === "error") {
    return html`
      <span class="console-badge console-badge--danger">Error</span>
    `;
  }
  if (status === "expired") {
    return html`
      <span class="console-badge console-badge--warning">Expired</span>
    `;
  }
  return html`
    <span class="console-badge">Disconnected</span>
  `;
}

function formatLastSync(lastSync: number | null): string {
  if (typeof lastSync !== "number" || !Number.isFinite(lastSync)) {
    return "--";
  }
  const delta = Date.now() - lastSync;
  if (delta < 60_000) return "less than a minute ago";
  if (delta < 3_600_000) {
    const minutes = Math.max(1, Math.floor(delta / 60_000));
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (delta < 86_400_000) {
    const hours = Math.max(1, Math.floor(delta / 3_600_000));
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  return new Date(lastSync).toLocaleString();
}

function primaryAccountLabel(entry: AdapterConnectionEntry): string {
  const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
  const adapterConfig =
    metadata.adapter_config && typeof metadata.adapter_config === "object"
      ? (metadata.adapter_config as Record<string, unknown>)
      : null;
  const preferred = [
    entry.account,
    typeof adapterConfig?.username === "string" ? adapterConfig.username : null,
    typeof metadata.email === "string" ? metadata.email : null,
    typeof metadata.user === "string" ? metadata.user : null,
    entry.connectionId,
  ];
  for (const candidate of preferred) {
    const trimmed = trimOrEmpty(candidate);
    if (trimmed && trimmed !== "default") {
      return trimmed;
    }
  }
  return "Not connected";
}

function primaryCatalogLabel(entry: AdapterCatalogEntry): string {
  return displayCatalogName(entry);
}

function catalogSummary(entry: AdapterCatalogEntry): string {
  const ordered = [...authMethodTypesFromManifest(entry.auth)].map((type) => methodChipLabel(type));
  if (ordered.length > 0) {
    return ordered.join(" · ");
  }
  if (entry.published) {
    return "Published catalog";
  }
  if (entry.registered) {
    return "Installed locally";
  }
  return "Supported in repo";
}

function isConnectableCatalogEntry(entry: AdapterCatalogEntry): boolean {
  return authMethodTypesFromManifest(entry.auth).size > 0 || Boolean(entry.auth?.setupGuide);
}

function catalogMetaSummary(entry: AdapterCatalogEntry): string {
  const notes: string[] = [];
  if (entry.published) {
    notes.push(entry.publishedVersion ? `Published ${entry.publishedVersion}` : "Published");
  }
  if (entry.registered) {
    notes.push(
      entry.registeredVersion ? `Installed ${entry.registeredVersion}` : "Installed locally",
    );
  }
  if (!entry.published && !entry.registered) {
    notes.push("Workspace adapter");
  }
  return notes.join(" · ");
}

function renderCatalogSection(
  title: string,
  items: AdapterCatalogEntry[],
  props: IntegrationsProps,
) {
  if (items.length === 0) {
    return nothing;
  }
  return html`
    <div style="margin-top: 14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
        <div class="console-strong">${title}</div>
        <div class="console-muted" style="font-size: var(--console-text-2xs);">${items.length}</div>
      </div>
      <div class="console-app-catalog-grid">
        ${items.map(
          (item) => html`
          <button
            class="console-app-catalog-item"
            @click=${() => props.onCatalogSelect(item.adapter)}
            title=${item.name}
          >
            <div class="console-platform-icon-circle console-app-catalog-item__icon">
              ${renderPlatformIcon(catalogIconKey(item), 30)}
            </div>
            <div class="console-app-catalog-item__name">${primaryCatalogLabel(item)}</div>
            <div class="console-app-catalog-item__summary">${catalogSummary(item)}</div>
            <div class="console-muted" style="font-size: var(--console-text-2xs);">${catalogMetaSummary(item)}</div>
            ${
              item.description
                ? html`<div class="console-muted" style="font-size: var(--console-text-2xs); line-height:1.4;">${item.description}</div>`
                : nothing
            }
          </button>
        `,
        )}
      </div>
    </div>
  `;
}

function renderAuthMethodPicker(methods: AdapterAuthManifest["methods"], props: IntegrationsProps) {
  return html`
    <div class="connector-setup-section">
      <div class="console-card-title" style="font-size: 13px;">Choose setup method</div>
      <div class="connector-setup-method-grid">
        ${methods.map(
          (method) => html`
          <button
            class="connector-setup-method-card"
            @click=${() => props.onSelectAuthMethod(method.id)}
          >
            <div class="console-platform-icon-circle connector-setup-method-card__icon">
              ${renderPlatformIcon(method.icon || method.type, 22)}
            </div>
            <div>
              <div class="console-strong">${method.label}</div>
              <div class="console-muted">${methodChipLabel(method.type)}</div>
              ${
                method.service
                  ? html`<div class="console-faint" style="font-size: var(--console-text-2xs);">${method.service}</div>`
                  : nothing
              }
            </div>
          </button>
        `,
        )}
      </div>
    </div>
  `;
}

function secondaryAccountLabel(entry: AdapterConnectionEntry): string | null {
  const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
  const notes: string[] = [];
  const connectionId = trimOrEmpty(entry.connectionId);
  const account = trimOrEmpty(entry.account);
  if (connectionId && connectionId !== account) {
    notes.push(connectionId);
  }
  const configuredAccounts =
    typeof metadata.configured_accounts === "number" &&
    Number.isFinite(metadata.configured_accounts)
      ? metadata.configured_accounts
      : null;
  if (configuredAccounts && configuredAccounts > 1) {
    notes.push(`${configuredAccounts} upstream accounts detected`);
  }
  const site = trimOrEmpty(
    typeof metadata.site === "string"
      ? metadata.site
      : typeof metadata.host === "string"
        ? metadata.host
        : null,
  );
  if (site) {
    notes.push(site);
  }
  return notes.length > 0 ? notes.join(" · ") : null;
}

function authMethodSummary(entry: AdapterConnectionEntry): string {
  const types = sortAuthMethodTypes(authMethodTypesFromManifest(entry.auth));
  if (types.length === 0) {
    return "No auth methods";
  }
  return types.map((type) => methodChipLabel(type)).join(" · ");
}

function renderTable(props: IntegrationsProps) {
  if (props.connections.length === 0) {
    return html`
      <div class="console-card" style="padding: var(--console-space-6)">
        <div class="console-muted">No connectors registered in this runtime.</div>
      </div>
    `;
  }

  return html`
    <div class="console-card" style="padding: 0; overflow: hidden;">
      <table class="console-table">
        <thead>
          <tr>
            <th>Platform</th>
            <th>Connection</th>
            <th>Status</th>
            <th>Last Sync</th>
          </tr>
        </thead>
        <tbody>
          ${props.connections.map((entry) => {
            const selected = props.selectedConnectionKey === connectionSelectionKey(entry);
            const secondary = secondaryAccountLabel(entry);
            return html`
              <tr
                class=${selected ? "console-table-row--selected" : ""}
                @click=${() => props.onSelectConnection(connectionSelectionKey(entry))}
                style="cursor: pointer;"
              >
                <td>
                  <div class="console-table-platform">
                    <div class="console-table-platform-icon console-table-platform-icon--asset">${renderPlatformIcon(iconKey(entry), 16)}</div>
                    <div style="display:flex; flex-direction:column; gap:2px;">
                      <span class="console-strong">${displayPlatformName(entry)}</span>
                      <span class="console-muted">${entry.adapter}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div style="display:flex; flex-direction:column; gap:2px;">
                    <span class="console-strong">${primaryAccountLabel(entry)}</span>
                    <span class="console-muted">${secondary ?? authMethodSummary(entry)}</span>
                    ${
                      entry.error
                        ? html`<span style="color: var(--console-danger); font-size: var(--console-text-2xs);">${entry.error}</span>`
                        : nothing
                    }
                  </div>
                </td>
                <td>${statusBadge(entry.status)}</td>
                <td><span class="console-muted">${formatLastSync(entry.lastSync)}</span></td>
              </tr>
            `;
          })}
        </tbody>
      </table>
    </div>
  `;
}

function renderLatencyPanel() {
  if (!consoleLatencyEnabled()) {
    return nothing;
  }
  const entries = latestConsoleLatencyEntries(18).filter(
    (entry) =>
      entry.label.startsWith("app.") ||
      entry.label.startsWith("runtime.websocket") ||
      entry.label.startsWith("runtime.request.adapters.") ||
      entry.label.startsWith("integrations.connectors."),
  );

  return html`
    <section class="console-card" style="margin-bottom: 12px; padding: 12px 14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap: 12px; margin-bottom: 8px;">
        <div>
          <div class="console-card-title" style="font-size: var(--console-text-sm);">Connector Load Timings</div>
          <div class="console-muted" style="font-size: var(--console-text-2xs);">
            Enabled by <code>?perf=1</code>. Full buffer is available at <code>window.__nexusConsoleTimings</code>.
          </div>
        </div>
      </div>
      ${
        entries.length === 0
          ? html`
              <div class="console-muted">No connector timing samples captured yet.</div>
            `
          : html`
            <table class="console-table">
              <thead>
                <tr>
                  <th>Span</th>
                  <th>Duration</th>
                  <th>Outcome</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                ${entries.map(
                  (entry) => html`
                  <tr>
                    <td><span class="console-strong">${entry.label}</span></td>
                    <td>${entry.durationMs.toFixed(1)}ms</td>
                    <td>${entry.outcome}</td>
                    <td><span class="console-muted">${entry.details ? JSON.stringify(entry.details) : "--"}</span></td>
                  </tr>
                `,
                )}
              </tbody>
            </table>
          `
      }
    </section>
  `;
}

function renderCatalogModal(props: IntegrationsProps) {
  if (!props.catalogOpen) {
    return nothing;
  }
  const selectedCatalog = selectedCatalogEntry(props);
  if (selectedCatalog) {
    return renderCatalogSetupModal(props, selectedCatalog);
  }
  const query = trimOrEmpty(props.catalogSearch).toLowerCase();
  const items = props.catalogItems.filter(
    (item) =>
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.adapter.toLowerCase().includes(query),
  );
  const publishedCount = props.catalogItems.filter((item) => item.published).length;
  const connectableCount = props.catalogItems.filter((item) =>
    isConnectableCatalogEntry(item),
  ).length;
  const publishedItems = items.filter((item) => item.published);
  const installedItems = items.filter((item) => !item.published && item.registered);
  const workspaceItems = items.filter((item) => !item.published && !item.registered);

  return html`
    <div class="console-modal-backdrop" @click=${props.onCatalogClose}>
      <div class="console-modal console-modal--catalog" @click=${(event: Event) => event.stopPropagation()}>
        <div class="console-modal-header">
          <div>
            <div class="console-modal-title">Add new app</div>
            <div class="console-modal-subtitle">Choose from the broader adapter catalog to start a fresh connection draft or add another account.</div>
            <div class="console-muted" style="margin-top: 6px;">${props.catalogItems.length} adapters in catalog · ${publishedCount} published · ${connectableCount} connectable now</div>
          </div>
          <button class="console-btn console-btn--ghost" style="padding: 4px;" @click=${props.onCatalogClose}>×</button>
        </div>
        <div class="console-modal-body">
          <div class="console-search-wrap console-search-wrap--modal">
            <input
              class="console-search-input"
              type="text"
              placeholder="Search apps..."
              .value=${props.catalogSearch}
              @input=${(event: InputEvent) =>
                props.onCatalogSearchChange((event.target as HTMLInputElement).value)}
            />
          </div>
          ${
            props.catalogLoading
              ? html`
                  <div class="console-muted" style="text-align: center; padding: 16px 0">
                    Loading connector catalog…
                  </div>
                `
              : nothing
          }
          ${
            props.catalogError
              ? html`<div class="callout danger" style="margin: 12px 0;">${props.catalogError}</div>`
              : nothing
          }
          ${renderCatalogSection("Published catalog", publishedItems, props)}
          ${renderCatalogSection("Installed locally", installedItems, props)}
          ${renderCatalogSection("Workspace adapters", workspaceItems, props)}
          ${
            items.length === 0
              ? html`
                  <div class="console-muted" style="text-align: center; padding: 16px 0">
                    No connectors match that search.
                  </div>
                `
              : nothing
          }
        </div>
      </div>
    </div>
  `;
}

function renderCatalogSetupModal(props: IntegrationsProps, catalog: AdapterCatalogEntry) {
  const selected = selectedConnectionViewEntry(props);
  if (!selected) {
    return renderCatalogModal({ ...props, selectedConnectionKey: "" });
  }
  const methods =
    Array.isArray(selected.auth?.methods) && selected.auth.methods.length > 0
      ? selected.auth.methods
      : Array.isArray(catalog.auth?.methods)
        ? catalog.auth.methods
        : [];
  const needsMethodChoice = methods.length > 1 && !trimOrEmpty(props.selectedAuthMethodId);
  const selectedMethod = needsMethodChoice
    ? null
    : (methods.find((method) => method.id === props.selectedAuthMethodId) ??
      (methods.length === 1 ? methods[0] : null));
  const methodTypes = authMethodTypes(selectedConnectionEntry(props), catalog);
  const hasOAuth = selectedMethod?.type === "oauth2";
  const hasApiKey = selectedMethod?.type === "api_key";
  const hasFileUpload = selectedMethod?.type === "file_upload";
  const hasCustomFlow = selectedMethod?.type === "custom_flow";
  const isBusy = props.busyAdapter === selected.adapter;
  const currentBusyLabel = isBusy ? busyLabel(props.busyAction ?? "") : null;
  const visibleFields =
    props.pendingFields.length > 0
      ? props.pendingFields
      : hasFileUpload
        ? fileUploadFields()
        : selectedMethod?.type === "api_key"
          ? selectedMethod.fields
          : selectedMethod?.type === "custom_flow" && Array.isArray(selectedMethod.fields)
            ? selectedMethod.fields
            : [];
  const showSuccess = isConnectionSuccessMessage(props.message) && !props.error && !isBusy;

  return html`
    <div class="console-modal-backdrop" @click=${props.onCatalogClose}>
      <div class="console-modal console-modal--connector-setup" @click=${(event: Event) => event.stopPropagation()}>
        ${
          showSuccess
            ? html`
              <div class="console-modal-body connector-success-modal">
                <div class="connector-success-modal__icon">
                  <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div class="console-modal-title">Connected successfully!</div>
                <div class="console-modal-subtitle">${props.message ?? "Your integration is ready to use."}</div>
                <button class="console-btn console-btn--primary" style="width: 100%; margin-top: 18px;" @click=${props.onCatalogClose}>
                  Close
                </button>
                <div class="console-faint connector-setup-footer">Secured by nexus</div>
              </div>
            `
            : html`
              <div class="console-modal-header">
                <div>
                  <div class="console-modal-title">Add ${displayCatalogName(catalog)}</div>
                  <div class="console-modal-subtitle">Answer the setup questions to create another connection. Existing connections stay unchanged.</div>
                </div>
                <button class="console-btn console-btn--ghost" style="padding: 4px;" @click=${props.onCatalogClose}>×</button>
              </div>
              <div class="console-modal-body">
                <div class="connector-setup-hero">
                  <div class="console-platform-icon-circle connector-setup-hero__icon">
                    ${renderPlatformIcon(catalogIconKey(catalog), 30)}
                  </div>
                  <div>
                    <div class="console-strong">${displayCatalogName(catalog)}</div>
                    <div class="console-muted">${catalogSummary(catalog)}</div>
                    ${
                      catalogMetaSummary(catalog)
                        ? html`<div class="console-muted" style="font-size: var(--console-text-2xs);">${catalogMetaSummary(catalog)}</div>`
                        : nothing
                    }
                  </div>
                  ${currentBusyLabel ? html`<span class="console-badge">${currentBusyLabel}</span>` : nothing}
                </div>

                ${props.message ? html`<div class="callout" style="margin-top: 12px;">${props.message}</div>` : nothing}
                ${props.error ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>` : nothing}
                ${
                  selected.auth?.setupGuide
                    ? html`<div class="callout" style="margin-top: 12px;">${selected.auth.setupGuide}</div>`
                    : nothing
                }
                ${
                  props.instructions
                    ? html`<div class="callout" style="margin-top: 12px; border-color: var(--accent);">${props.instructions}</div>`
                    : nothing
                }
                ${
                  !isConnectableCatalogEntry(catalog)
                    ? html`<div class="callout" style="margin-top: 12px;">${catalog.name} is in the adapter catalog, but this runtime does not yet advertise a local connection flow for it.</div>`
                    : nothing
                }

                ${
                  needsMethodChoice
                    ? renderAuthMethodPicker(methods, props)
                    : methods.length > 0
                      ? html`
                        <div class="connector-setup-section connector-setup-method-summary">
                          <div>
                            <div class="console-card-title" style="font-size: 13px;">Setup method</div>
                            <div class="console-muted" style="margin-top: 4px;">
                              ${selectedMethod?.label ?? "No method selected"}
                            </div>
                          </div>
                          ${
                            methods.length > 1
                              ? html`
                                <button class="console-btn console-btn--ghost" ?disabled=${isBusy} @click=${() => props.onSelectAuthMethod("")}>
                                  Change
                                </button>
                              `
                              : nothing
                          }
                        </div>
                        <div class="chip-row" style="margin-top: 8px;">
                          ${Array.from(methodTypes).map((type) => html`<span class="chip">${methodChipLabel(type)}</span>`)}
                        </div>
                      `
                      : nothing
                }

                ${
                  needsMethodChoice
                    ? nothing
                    : html`
                      <div class="connector-setup-section">
                        <div class="console-card-title" style="font-size: 13px;">Setup questions</div>
                        ${
                          visibleFields.length > 0
                            ? html`
                              <div class="connector-setup-fields">
                                ${visibleFields.map((field) => renderSetupQuestionField(field, props))}
                              </div>
                            `
                            : html`
                              <div class="console-muted" style="margin-top: 8px;">
                                ${
                                  hasOAuth
                                    ? "No local fields are required. Start OAuth to continue in the provider."
                                    : hasFileUpload
                                      ? "Provide a local file path for the runtime to import."
                                      : hasCustomFlow
                                        ? "Start setup to let the adapter ask for the next required input."
                                        : "No setup questions are advertised for this auth method."
                                }
                              </div>
                            `
                        }
                      </div>
                    `
                }

                <div class="connector-setup-actions">
                  <button class="console-btn console-btn--ghost" ?disabled=${isBusy} @click=${() => props.onSelectConnection("")}>
                    Back to catalog
                  </button>
                  <div style="display:flex; gap: 8px; flex-wrap: wrap;">
                    ${
                      !needsMethodChoice && hasApiKey
                        ? html`
                          <button class="console-btn console-btn--primary" ?disabled=${isBusy} @click=${() => props.onConnect(selected.adapter)}>
                            Connect
                          </button>
                        `
                        : nothing
                    }
                    ${
                      !needsMethodChoice && hasCustomFlow
                        ? html`
                          <button class="console-btn console-btn--primary" ?disabled=${isBusy} @click=${() => props.onCustomStart(selected.adapter)}>
                            Start Setup
                          </button>
                          ${
                            props.sessionId
                              ? html`
                                <button class="console-btn console-btn--secondary" ?disabled=${isBusy} @click=${() => props.onCustomSubmit(selected.adapter)}>
                                  Submit
                                </button>
                                <button class="console-btn console-btn--secondary" ?disabled=${isBusy} @click=${() => props.onCustomStatus(selected.adapter)}>
                                  Check Status
                                </button>
                                <button class="console-btn console-btn--secondary" ?disabled=${isBusy} @click=${() => props.onCustomCancel(selected.adapter)}>
                                  Cancel Setup
                                </button>
                              `
                              : nothing
                          }
                        `
                        : nothing
                    }
                    ${
                      !needsMethodChoice && hasFileUpload
                        ? html`
                          <button class="console-btn console-btn--primary" ?disabled=${isBusy} @click=${() => props.onUpload(selected.adapter)}>
                            Upload File
                          </button>
                        `
                        : nothing
                    }
                    ${
                      !needsMethodChoice && hasOAuth
                        ? html`
                          <button class="console-btn console-btn--primary" ?disabled=${isBusy} @click=${() => props.onOAuthStart(selected.adapter)}>
                            Start OAuth
                          </button>
                        `
                        : nothing
                    }
                  </div>
                </div>

                <details class="connect-advanced connector-setup-advanced">
                  <summary class="connect-advanced__toggle">Advanced</summary>
                  <div class="connect-advanced__content">
                    ${
                      props.sessionId
                        ? html`
                          <label class="field" style="margin-top: 10px;">
                            <span>Setup Session ID</span>
                            <input .value=${props.sessionId} readonly />
                          </label>
                        `
                        : nothing
                    }
                    <label class="field" style="margin-top: 10px;">
                      <span>Setup Payload (JSON)</span>
                      <textarea
                        rows="6"
                        .value=${props.payloadText}
                        @input=${(event: Event) => props.onPayloadChange((event.target as HTMLTextAreaElement).value)}
                      ></textarea>
                    </label>
                  </div>
                </details>
                <div class="console-faint connector-setup-footer">Secured by nexus</div>
              </div>
            `
        }
      </div>
    </div>
  `;
}

function selectedConnectionEntry(props: IntegrationsProps): AdapterConnectionEntry | null {
  const selected = trimOrEmpty(props.selectedConnectionKey);
  if (!selected || isCatalogSelectionKey(selected)) {
    return null;
  }
  return props.connections.find((entry) => connectionSelectionKey(entry) === selected) ?? null;
}

function selectedCatalogEntry(props: IntegrationsProps): AdapterCatalogEntry | null {
  const adapter = selectedCatalogAdapter(props.selectedConnectionKey);
  if (!adapter) {
    return null;
  }
  return props.catalogItems.find((entry) => normalizeKey(entry.adapter) === adapter) ?? null;
}

function selectedConnectionViewEntry(props: IntegrationsProps): AdapterConnectionEntry | null {
  const connection = selectedConnectionEntry(props);
  if (connection) {
    return connection;
  }
  const catalog = selectedCatalogEntry(props);
  if (!catalog) {
    return null;
  }
  return {
    connectionId: "",
    adapter: catalog.adapter,
    name: catalog.name,
    service: catalog.service,
    status: "disconnected",
    authMethod: null,
    authMethodId: null,
    auth: catalog.auth,
    account: null,
    lastSync: null,
    error: null,
  };
}

export function renderIntegrations(props: IntegrationsProps) {
  const selected = selectedConnectionEntry(props);

  return html`
    <div class="console-page-header">
      <div class="console-page-header-row">
        <div>
          <h1 class="console-page-title">Connectors</h1>
          <p class="console-page-subtitle">
            Review every durable connector row, inspect exact connection state, and start fresh setup flows from the catalog.
          </p>
        </div>
        <div style="display:flex; gap: 8px; align-items:center;">
          <button class="console-btn console-btn--primary" ?disabled=${!props.connected} @click=${props.onAddConnector}>
            + Add new app
          </button>
          <button class="console-btn console-btn--secondary" ?disabled=${props.loading || !props.connected} @click=${props.onRefresh}>
            ${props.loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
    </div>

    ${
      !props.connected && props.runtimeConnecting
        ? html`
            <div class="callout" style="margin-bottom: 12px">Connecting to the Nex runtime…</div>
          `
        : !props.connected
          ? html`
              <div class="callout danger" style="margin-bottom: 12px">Runtime is disconnected.</div>
            `
          : nothing
    }
    ${props.error ? html`<div class="callout danger" style="margin-bottom: 12px;">${props.error}</div>` : nothing}
    ${props.message ? html`<div class="callout" style="margin-bottom: 12px;">${props.message}</div>` : nothing}
    ${renderLatencyPanel()}

    ${renderTable(props)}
    ${selected ? renderSelectedConnection(props, selected) : nothing}
    ${renderCatalogModal(props)}
  `;
}

function renderSelectedConnection(props: IntegrationsProps, selected: AdapterConnectionEntry) {
  const catalog = selectedCatalogEntry(props);
  const methods =
    Array.isArray(selected.auth?.methods) && selected.auth.methods.length > 0
      ? selected.auth.methods
      : Array.isArray(catalog?.auth?.methods)
        ? catalog.auth.methods
        : [];
  const selectedMethod =
    methods.find((method) => method.id === props.selectedAuthMethodId) ?? methods[0] ?? null;
  const methodTypes = authMethodTypes(selectedConnectionEntry(props), catalog);
  const hasOAuth = selectedMethod?.type === "oauth2";
  const hasApiKey = selectedMethod?.type === "api_key";
  const hasFileUpload = selectedMethod?.type === "file_upload";
  const hasCustomFlow = selectedMethod?.type === "custom_flow";
  const isBusy = props.busyAdapter === selected.adapter;
  const currentBusyLabel = isBusy ? busyLabel(props.busyAction ?? "") : null;
  const livesyncEnabled = resolveLivesyncEnabled(selected);
  const visibleFields =
    props.pendingFields.length > 0
      ? props.pendingFields
      : hasFileUpload
        ? fileUploadFields()
        : selectedMethod?.type === "api_key"
          ? selectedMethod.fields
          : selectedMethod?.type === "custom_flow" && Array.isArray(selectedMethod.fields)
            ? selectedMethod.fields
            : [];

  return html`
    <section class="console-card" style="margin-top: 12px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 16px;">
        <div>
          <div class="console-card-title">
            ${
              selected.connectionId
                ? displayPlatformName(selected)
                : (catalog?.name ?? selected.name ?? selected.adapter)
            }
          </div>
          <div class="console-card-sub">${primaryAccountLabel(selected)} · ${selected.adapter}</div>
        </div>
        ${currentBusyLabel ? html`<span class="console-badge">${currentBusyLabel}</span>` : nothing}
      </div>

      <div style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 16px;">
        <label class="field">
          <span>Connection ID</span>
          <input .value=${selected.connectionId || "Not yet assigned"} readonly />
        </label>
        <label class="field">
          <span>Livesync</span>
          <input .value=${livesyncEnabled ? "on" : "off"} readonly />
        </label>
      </div>

      ${
        selected.auth?.setupGuide
          ? html`<div class="callout" style="margin-top: 12px;">${selected.auth.setupGuide}</div>`
          : nothing
      }
      ${
        props.instructions
          ? html`<div class="callout" style="margin-top: 12px; border-color: var(--accent);">${props.instructions}</div>`
          : nothing
      }
      ${
        !selected.connectionId
          ? html`<div class="callout" style="margin-top: 12px;">This draft will create a new ${catalog?.name ?? selected.name ?? selected.adapter} connection. Existing connections remain available below.</div>`
          : nothing
      }
      ${
        !selected.connectionId && catalog && !isConnectableCatalogEntry(catalog)
          ? html`<div class="callout" style="margin-top: 12px;">${catalog.name} is in the adapter catalog, but this runtime does not yet advertise a local connection flow for it.</div>`
          : nothing
      }

      ${
        visibleFields.length > 0
          ? html`
            <div style="margin-top: 12px;">
              <div class="console-card-title" style="font-size: 13px;">
                ${props.pendingFields.length > 0 ? "Required Fields" : "Connection Fields"}
              </div>
              <div class="connect-fields-list" style="margin-top: 8px;">
                ${visibleFields.map((field) => renderPendingField(field))}
              </div>
            </div>
          `
          : nothing
      }

      ${
        methods.length > 0
          ? html`
            <label class="field" style="margin-top: 12px;">
              <span>Auth Method</span>
              <select
                .value=${selectedMethod?.id ?? ""}
                @change=${(event: Event) =>
                  props.onSelectAuthMethod((event.target as HTMLSelectElement).value)}
              >
                ${methods.map((method) => html`<option value=${method.id}>${method.label}</option>`)}
              </select>
            </label>
            <div class="chip-row" style="margin-top: 8px;">
              ${Array.from(methodTypes).map((type) => html`<span class="chip">${methodChipLabel(type)}</span>`)}
            </div>
          `
          : nothing
      }

      <div style="display:flex; justify-content:space-between; gap: 12px; margin-top: 16px; flex-wrap: wrap;">
        <div style="display:flex; gap: 8px; flex-wrap: wrap;">
          ${
            hasApiKey
              ? html`
                <button class="console-btn console-btn--primary" ?disabled=${isBusy} @click=${() => props.onConnect(selected.adapter)}>
                  ${selected.connectionId ? "Update Connection" : "Connect"}
                </button>
              `
              : nothing
          }
          ${
            hasCustomFlow
              ? html`
                <button class="console-btn console-btn--primary" ?disabled=${isBusy} @click=${() => props.onCustomStart(selected.adapter)}>
                  Start Setup
                </button>
                ${
                  props.sessionId
                    ? html`
                      <button class="console-btn console-btn--secondary" ?disabled=${isBusy} @click=${() => props.onCustomSubmit(selected.adapter)}>
                        Submit
                      </button>
                      <button class="console-btn console-btn--secondary" ?disabled=${isBusy} @click=${() => props.onCustomStatus(selected.adapter)}>
                        Check Status
                      </button>
                    `
                    : nothing
                }
              `
              : nothing
          }
          ${
            hasFileUpload
              ? html`
                <button class="console-btn console-btn--primary" ?disabled=${isBusy} @click=${() => props.onUpload(selected.adapter)}>
                  Upload File
                </button>
              `
              : nothing
          }
          ${
            hasOAuth
              ? html`
                <button class="console-btn console-btn--primary" ?disabled=${isBusy} @click=${() => props.onOAuthStart(selected.adapter)}>
                  Start OAuth
                </button>
              `
              : nothing
          }
        </div>

        <div style="display:flex; gap: 8px; flex-wrap: wrap;">
          <button class="console-btn console-btn--secondary" ?disabled=${isBusy || !selected.connectionId} @click=${() => props.onTest(selected.adapter)}>
            Test
          </button>
          <button class="console-btn console-btn--secondary" ?disabled=${isBusy || !selected.connectionId} @click=${() => props.onBackfill(selected.adapter)}>
            Backfill
          </button>
          <button
            class="console-btn console-btn--secondary"
            ?disabled=${isBusy || !selected.connectionId}
            @click=${() => props.onLivesyncToggle(selected.adapter, !livesyncEnabled)}
          >
            ${livesyncEnabled ? "Livesync off" : "Livesync on"}
          </button>
          ${
            hasCustomFlow && props.sessionId
              ? html`
                <button class="console-btn console-btn--secondary" ?disabled=${isBusy} @click=${() => props.onCustomCancel(selected.adapter)}>
                  Cancel Setup
                </button>
              `
              : nothing
          }
          <button class="console-btn console-btn--secondary" ?disabled=${isBusy || !selected.connectionId} @click=${() => props.onDisconnect(selected.adapter)}>
            Disconnect
          </button>
        </div>
      </div>

      <details class="connect-advanced" style="margin-top: 14px;">
        <summary class="connect-advanced__toggle">Advanced</summary>
        <div class="connect-advanced__content">
          ${
            props.sessionId
              ? html`
                <div class="form-grid" style="margin-top: 10px;">
                  <label class="field">
                    <span>Setup Session ID</span>
                    <input .value=${props.sessionId} readonly />
                  </label>
                </div>
              `
              : nothing
          }
          <label class="field" style="margin-top: 10px;">
            <span>Setup Payload (JSON)</span>
            <textarea
              rows="6"
              .value=${props.payloadText}
              @input=${(event: Event) => props.onPayloadChange((event.target as HTMLTextAreaElement).value)}
            ></textarea>
          </label>
        </div>
      </details>
    </section>
  `;
}
