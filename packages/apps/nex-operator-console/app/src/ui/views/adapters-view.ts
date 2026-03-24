import { html, nothing, type TemplateResult } from "lit";
import type { InstalledApp, InstalledAppMethod } from "../controllers/apps.ts";
import type { IngressCredential } from "../controllers/ingress-credentials.ts";
import type {
  AdapterAccountEntry,
  AdapterAuthField,
  AdapterConnectionEntry,
} from "../controllers/integrations.ts";
import type { IntegrationsProps } from "./integrations.ts";
import { icons, type IconName } from "../icons.ts";

export type AdaptersSubTab = "overview" | "connect";

type AdapterCredentialRow = {
  adapter: string;
  accountId: string;
  accountLabel: string;
  credentialRef: string | null;
  authType: string;
  status: string | null;
};

export type AdaptersViewProps = {
  subTab: AdaptersSubTab;
  onSubTabChange: (sub: AdaptersSubTab) => void;
  integrationsProps: IntegrationsProps;
  credentialsLoading: boolean;
  credentialsError: string | null;
  ingressCredentials: IngressCredential[];
  appsLoading: boolean;
  appsError: string | null;
  installedApps: InstalledApp[];
  selectedAppId: string;
  appMethodsLoading: boolean;
  appMethodsError: string | null;
  appMethods: InstalledAppMethod[];
  onSelectApp: (id: string) => void;
};

type AdapterAuthMethodType = "oauth2" | "api_key" | "file_upload" | "custom_flow";

// ─── Helpers ────────────────────────────────────────────────────────────

function relativeTime(ts: number | null): string {
  if (!ts || !Number.isFinite(ts)) {
    return "never";
  }
  const diff = Date.now() - ts;
  if (diff < 0) {
    return "just now";
  }
  if (diff < 60_000) {
    return "just now";
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m ago`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)}h ago`;
  }
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function adapterStatusBorder(status: string | null): string {
  if (status === "connected") {
    return "adapter-card--connected";
  }
  if (status === "error" || status === "expired") {
    return "adapter-card--error";
  }
  return "adapter-card--disconnected";
}

function statusPillClass(status: string | null): string {
  if (status === "connected") {
    return "ok";
  }
  if (status === "error" || status === "expired") {
    return "danger";
  }
  return "";
}

/** True account count — excludes bare "default" placeholders with no displayName. */
function meaningfulAccountCount(entry: AdapterConnectionEntry): number {
  const accounts = entry.accounts ?? [];
  if (accounts.length === 0) {
    const active = (entry.account ?? "").trim();
    return active && active !== "default" ? 1 : 0;
  }
  // If only one account and it's "default" with no displayName, count as 0
  if (accounts.length === 1 && accounts[0].id === "default" && !accounts[0].displayName) {
    return 0;
  }
  return accounts.length;
}

function authTypeBadges(entry: AdapterConnectionEntry): string[] {
  const methods = Array.isArray(entry.auth?.methods) ? entry.auth.methods : [];
  const badges: string[] = [];
  for (const method of methods) {
    if (method.type === "oauth2") {
      badges.push("OAuth");
    } else if (method.type === "api_key") {
      badges.push("API Key");
    } else if (method.type === "file_upload") {
      badges.push("File Upload");
    } else if (method.type === "custom_flow") {
      badges.push("Custom");
    }
  }
  if (badges.length === 0 && entry.authMethod) {
    badges.push(entry.authMethod.replaceAll("_", " "));
  }
  return badges;
}

function authMethodTypes(entry: AdapterConnectionEntry | null): Set<AdapterAuthMethodType> {
  const methods = entry?.auth?.methods;
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

function resolveAdapterIcon(adapterId: string): IconName {
  const id = adapterId.trim().toLowerCase();
  if (id.includes("whatsapp")) {
    return "messageSquare";
  }
  if (id.includes("telegram")) {
    return "radio";
  }
  if (id.includes("discord")) {
    return "messageSquare";
  }
  if (id.includes("slack")) {
    return "messageSquare";
  }
  if (id.includes("imessage")) {
    return "smartphone";
  }
  if (id.includes("google") || id.includes("gmail") || id.includes("gog")) {
    return "globe";
  }
  if (id.includes("github")) {
    return "folder";
  }
  if (id.includes("nostr")) {
    return "radio";
  }
  if (id.includes("eve")) {
    return "bot";
  }
  return "plug";
}

/** Display label for an account — prefers displayName, falls back to id, hides bare "default". */
function accountLabel(account: AdapterAccountEntry): string {
  if (account.displayName) {
    return account.displayName;
  }
  if (account.id === "default") {
    return "";
  }
  return account.id;
}

/** Secondary line for account — shows id when displayName is different from id. */
function accountSecondary(account: AdapterAccountEntry): string | null {
  if (!account.displayName) {
    return null;
  }
  if (account.displayName === account.id) {
    return null;
  }
  if (account.id === "default") {
    return null;
  }
  return account.id;
}

/** Returns meaningful accounts — filters out bare "default" placeholders. */
function meaningfulAccounts(entry: AdapterConnectionEntry): AdapterAccountEntry[] {
  const accounts = entry.accounts ?? [];
  return accounts.filter((a) => a.displayName || a.id !== "default");
}

function credentialTypePill(authType: string): TemplateResult {
  const normalized = authType.toLowerCase().trim();
  let cls = "";
  let label = authType;
  if (normalized.includes("oauth")) {
    cls = "credential-type--oauth";
    label = "OAuth";
  } else if (normalized.includes("bot_token") || normalized.includes("bot token")) {
    cls = "credential-type--token";
    label = "Bot Token";
  } else if (normalized.includes("api_key") || normalized.includes("api key")) {
    cls = "credential-type--apikey";
    label = "API Key";
  } else if (normalized.includes("custom") || normalized.includes("session")) {
    cls = "credential-type--custom";
    label = "Custom";
  } else if (normalized === "file_upload") {
    cls = "credential-type--custom";
    label = "File";
  } else if (normalized === "unknown" || !normalized) {
    cls = "";
    label = "Configured";
  }
  return html`<span class="credential-type ${cls}">${label}</span>`;
}

function credentialStatusDot(status: string | null): TemplateResult {
  const s = (status ?? "").toLowerCase();
  let cls = "credential-status--unknown";
  if (s === "ready" || s === "connected" || s === "active") {
    cls = "credential-status--ok";
  } else if (s === "expired" || s === "error") {
    cls = "credential-status--error";
  }
  return html`<span class="credential-status ${cls}"><span class="credential-status__dot"></span>${status ?? "n/a"}</span>`;
}

function busyLabel(action: string): string {
  if (action === "oauth_start") {
    return "Starting OAuth…";
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

// ─── Main render ────────────────────────────────────────────────────────

export function renderAdaptersView(props: AdaptersViewProps): TemplateResult {
  const adapters = props.integrationsProps.adapters;
  const connected = adapters.filter((entry) => entry.status === "connected");
  const adapterCredentials = collectAdapterCredentials(adapters);
  const ip = props.integrationsProps;
  const selected = adapters.find((e) => e.adapter === ip.selectedAdapter) ?? null;

  return html`
    <div class="adapters-view">
      <!-- Summary bar -->
      <section class="card">
        <div class="row" style="justify-content: space-between; align-items: center;">
          <div class="row" style="gap: 10px; flex-wrap: wrap; align-items: center;">
            <span class="pill">${adapters.length} adapters</span>
            <span class="pill ok">${connected.length} connected</span>
            <span class="pill">${adapterCredentials.length} credentials</span>
          </div>
          <button
            class="btn btn--sm"
            ?disabled=${ip.loading || props.credentialsLoading}
            @click=${ip.onRefresh}
          >
            ${ip.loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        ${
          !ip.connected
            ? html`
                <div class="callout danger" style="margin-top: 12px">Runtime is disconnected.</div>
              `
            : nothing
        }
        ${ip.error ? html`<div class="callout danger" style="margin-top: 12px;">${ip.error}</div>` : nothing}
        ${ip.message ? html`<div class="callout" style="margin-top: 12px;">${ip.message}</div>` : nothing}
      </section>

      <!-- Adapter cards grid -->
      ${
        adapters.length === 0
          ? html`
              <section class="card" style="margin-top: 12px">
                <div class="muted">No adapters discovered yet.</div>
              </section>
            `
          : html`
              <section class="adapters-grid" style="margin-top: 12px;">
                ${adapters.map((entry) => renderAdapterCard(entry, ip, selected))}
              </section>
            `
      }

      <!-- Selected adapter detail panel -->
      ${selected ? renderSelectedAdapterPanel(ip, selected) : nothing}

      <!-- Credential Inventory -->
      ${renderCredentialInventory(props, adapterCredentials)}

      <!-- Installed apps -->
      ${renderInstalledApps(props)}
    </div>
  `;
}

// ─── Adapter Card ───────────────────────────────────────────────────────

function renderAdapterCard(
  entry: AdapterConnectionEntry,
  ip: IntegrationsProps,
  selected: AdapterConnectionEntry | null,
): TemplateResult {
  const icon = resolveAdapterIcon(entry.adapter);
  const accounts = meaningfulAccounts(entry);
  const count = meaningfulAccountCount(entry);
  const badges = authTypeBadges(entry);
  const borderClass = adapterStatusBorder(entry.status);
  const pillClass = statusPillClass(entry.status);
  const isSelected = selected?.adapter === entry.adapter;

  return html`
    <div
      class="card adapter-card ${borderClass} ${isSelected ? "adapter-card--active" : ""}"
      @click=${() => ip.onSelectAdapter(entry.adapter)}
    >
      <div class="adapter-card__header">
        <div class="adapter-card__icon">${icons[icon]}</div>
        <div class="adapter-card__info">
          <div class="adapter-card__name">${entry.name}</div>
          <div class="adapter-card__meta">
            <span class="mono">${entry.adapter}</span>
            ${
              count > 0
                ? html`
                    <span class="adapter-card__sep"></span>
                    <span>${count} ${count === 1 ? "account" : "accounts"}</span>
                  `
                : nothing
            }
            <span class="adapter-card__sep"></span>
            <span>${relativeTime(entry.lastSync)}</span>
          </div>
        </div>
        <span class="pill pill--sm ${pillClass}">${entry.status}</span>
      </div>
      ${
        badges.length > 0
          ? html`
              <div class="adapter-card__badges">
                ${badges.map((badge) => html`<span class="chip">${badge}</span>`)}
              </div>
            `
          : nothing
      }
      ${
        accounts.length > 0
          ? html`
              <div class="adapter-card__accounts">
                ${accounts.slice(0, 3).map((account) => {
                  const label = accountLabel(account);
                  const secondary = accountSecondary(account);
                  if (!label) {
                    return nothing;
                  }
                  return html`
                    <div class="adapter-card__account">
                      <div class="adapter-card__account-info">
                        <span class="mono">${label}</span>
                        ${secondary ? html`<span class="adapter-card__account-id muted">${secondary}</span>` : nothing}
                      </div>
                      <span class="adapter-card__account-status">${account.status ?? ""}</span>
                    </div>
                  `;
                })}
                ${
                  accounts.length > 3
                    ? html`<div class="muted" style="font-size: 12px;">+${accounts.length - 3} more</div>`
                    : nothing
                }
              </div>
            `
          : nothing
      }
      ${
        entry.error
          ? html`<div class="callout danger" style="margin-top: 8px; padding: 8px 10px; font-size: 12px;">${entry.error}</div>`
          : nothing
      }
    </div>
  `;
}

// ─── Selected Adapter Detail Panel ──────────────────────────────────────

function renderSelectedAdapterPanel(
  ip: IntegrationsProps,
  selected: AdapterConnectionEntry,
): TemplateResult {
  const methods = authMethodTypes(selected);
  const hasOAuth = methods.has("oauth2");
  const hasCustomFlow = methods.has("custom_flow");
  const isBusy = ip.busyAdapter === selected.adapter;
  const currentBusyLabel = isBusy ? busyLabel(ip.busyAction ?? "") : null;

  return html`
    <section class="card" style="margin-top: 12px;">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <div class="card-title">${selected.name}</div>
          <div class="card-sub mono">${selected.adapter}</div>
        </div>
        ${currentBusyLabel ? html`<span class="pill">${currentBusyLabel}</span>` : nothing}
      </div>

      <!-- Setup guide -->
      ${
        selected.auth?.setupGuide
          ? html`<div class="callout" style="margin-top: 12px;">${selected.auth.setupGuide}</div>`
          : nothing
      }

      <!-- Instructions from setup flow -->
      ${
        ip.instructions
          ? html`<div class="callout" style="margin-top: 12px; border-color: var(--accent);">${ip.instructions}</div>`
          : nothing
      }

      <!-- Pending fields -->
      ${
        ip.pendingFields.length > 0
          ? html`
              <div style="margin-top: 12px;">
                <div class="card-title" style="font-size: 13px;">Required Fields</div>
                <div class="connect-fields-list" style="margin-top: 8px;">
                  ${ip.pendingFields.map((field) => renderPendingField(field))}
                </div>
              </div>
            `
          : nothing
      }

      <!-- Actions -->
      <div class="connect-actions" style="margin-top: 14px;">
        <div class="connect-actions__primary">
          ${
            hasOAuth
              ? html`
                  <button class="btn primary" ?disabled=${isBusy} @click=${() => ip.onOAuthStart(selected.adapter)}>
                    Start OAuth
                  </button>
                `
              : nothing
          }
          ${
            hasCustomFlow
              ? html`
                  <button class="btn primary" ?disabled=${isBusy} @click=${() => ip.onCustomStart(selected.adapter)}>
                    Start Setup
                  </button>
                  ${
                    ip.sessionId
                      ? html`
                          <button class="btn" ?disabled=${isBusy} @click=${() => ip.onCustomSubmit(selected.adapter)}>
                            Submit
                          </button>
                          <button class="btn" ?disabled=${isBusy} @click=${() => ip.onCustomStatus(selected.adapter)}>
                            Check Status
                          </button>
                        `
                      : nothing
                  }
                `
              : nothing
          }
        </div>
        <div class="connect-actions__secondary">
          <button class="btn btn--sm" ?disabled=${isBusy} @click=${() => ip.onTest(selected.adapter)}>
            Test
          </button>
          ${
            hasCustomFlow && ip.sessionId
              ? html`
                  <button class="btn btn--sm danger" ?disabled=${isBusy} @click=${() => ip.onCustomCancel(selected.adapter)}>
                    Cancel Setup
                  </button>
                `
              : nothing
          }
          <button class="btn btn--sm danger" ?disabled=${isBusy} @click=${() => ip.onDisconnect(selected.adapter)}>
            Disconnect
          </button>
        </div>
      </div>

      <!-- Advanced: Session ID + JSON payload -->
      <details class="connect-advanced" style="margin-top: 14px;">
        <summary class="connect-advanced__toggle">Advanced</summary>
        <div class="connect-advanced__content">
          ${
            ip.sessionId
              ? html`
                  <div class="form-grid" style="margin-top: 10px;">
                    <label class="field">
                      <span>Setup Session ID</span>
                      <input .value=${ip.sessionId} readonly />
                    </label>
                  </div>
                `
              : nothing
          }
          <label class="field" style="margin-top: 10px;">
            <span>Setup Payload (JSON)</span>
            <textarea
              rows="6"
              .value=${ip.payloadText}
              @input=${(event: Event) => ip.onPayloadChange((event.target as HTMLTextAreaElement).value)}
            ></textarea>
          </label>
        </div>
      </details>
    </section>
  `;
}

// ─── Credential Inventory ───────────────────────────────────────────────

function renderCredentialInventory(
  props: AdaptersViewProps,
  adapterCredentials: AdapterCredentialRow[],
): TemplateResult {
  return html`
    <section class="card" style="margin-top: 12px;">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">Credential Inventory</div>
          <div class="card-sub">Adapter credentials and ingress tokens known to the runtime.</div>
        </div>
      </div>

      ${
        props.credentialsError
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.credentialsError}</div>`
          : nothing
      }

      <!-- Adapter credentials table -->
      <div style="margin-top: 14px;">
        <div class="card-title" style="font-size: 13px;">Adapter Credentials</div>
        ${
          adapterCredentials.length === 0
            ? html`
                <div class="muted" style="margin-top: 8px">No adapter credential references found.</div>
              `
            : html`
                <div class="credential-table-wrap" style="margin-top: 8px;">
                  <table class="credential-table">
                    <thead>
                      <tr>
                        <th class="credential-table__col--adapter">Adapter</th>
                        <th class="credential-table__col--account">Account</th>
                        <th class="credential-table__col--ref">Credential</th>
                        <th class="credential-table__col--type">Type</th>
                        <th class="credential-table__col--status">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${adapterCredentials.map(
                        (row) => html`
                          <tr>
                            <td class="mono">${row.adapter}</td>
                            <td>
                              <span class="mono">${row.accountLabel}</span>
                              ${
                                row.accountId !== row.accountLabel && row.accountId !== "default"
                                  ? html`<span class="credential-table__account-id muted">${row.accountId}</span>`
                                  : nothing
                              }
                            </td>
                            <td class="mono">${row.credentialRef ?? "—"}</td>
                            <td>${credentialTypePill(row.authType)}</td>
                            <td>${credentialStatusDot(row.status)}</td>
                          </tr>
                        `,
                      )}
                    </tbody>
                  </table>
                </div>
              `
        }
      </div>

      <!-- Ingress tokens table -->
      <div style="margin-top: 14px;">
        <div class="card-title" style="font-size: 13px;">Ingress Tokens</div>
        ${
          props.ingressCredentials.length === 0
            ? html`
                <div class="muted" style="margin-top: 8px">No ingress tokens found.</div>
              `
            : html`
                <div class="credential-table-wrap" style="margin-top: 8px;">
                  <table class="credential-table">
                    <thead>
                      <tr>
                        <th>Entity</th>
                        <th>Role</th>
                        <th>Scopes</th>
                        <th class="credential-table__col--status">Last Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${props.ingressCredentials.map(
                        (credential) => html`
                          <tr>
                            <td class="mono">${credential.entityId}</td>
                            <td>${credential.role}</td>
                            <td class="mono">${credential.scopes.join(", ") || "n/a"}</td>
                            <td>${relativeTime(credential.lastUsedAt)}</td>
                          </tr>
                        `,
                      )}
                    </tbody>
                  </table>
                </div>
              `
        }
      </div>
    </section>
  `;
}

// ─── Data collection ────────────────────────────────────────────────────

function collectAdapterCredentials(
  adapters: IntegrationsProps["adapters"],
): AdapterCredentialRow[] {
  const rows: AdapterCredentialRow[] = [];
  for (const adapter of adapters) {
    const authType = resolveAuthType(adapter);
    const accounts = adapter.accounts ?? [];
    if (accounts.length > 0) {
      for (const account of accounts) {
        // Skip bare "default" accounts with no displayName and no credential
        if (account.id === "default" && !account.displayName && !account.credentialRef) {
          continue;
        }
        const label = account.displayName || (account.id === "default" ? adapter.name : account.id);
        rows.push({
          adapter: adapter.adapter,
          accountId: account.id,
          accountLabel: label,
          credentialRef: account.credentialRef,
          authType,
          status: account.status ?? adapter.status,
        });
      }
      continue;
    }
    const active = (adapter.account ?? "").trim();
    if (!active || active === "default") {
      continue;
    }
    const credentialRef =
      typeof adapter.metadata?.credential_ref === "string" && adapter.metadata.credential_ref.trim()
        ? adapter.metadata.credential_ref.trim()
        : null;
    rows.push({
      adapter: adapter.adapter,
      accountId: active,
      accountLabel: active,
      credentialRef,
      authType,
      status: adapter.status,
    });
  }
  const deduped = new Map<string, AdapterCredentialRow>();
  for (const row of rows) {
    const key = `${row.adapter}::${row.accountId}::${row.credentialRef ?? ""}`;
    deduped.set(key, row);
  }
  return [...deduped.values()].toSorted((a, b) =>
    a.adapter === b.adapter
      ? a.accountLabel.localeCompare(b.accountLabel)
      : a.adapter.localeCompare(b.adapter),
  );
}

function resolveAuthType(adapter: IntegrationsProps["adapters"][number]): string {
  const methods = Array.isArray(adapter.auth?.methods) ? adapter.auth.methods : [];
  if (methods.length > 0) {
    const first = methods[0];
    if (first.type === "oauth2") {
      return "oauth2";
    }
    if (first.type === "api_key") {
      return "api_key";
    }
    if (first.type === "file_upload") {
      return "file_upload";
    }
    if (first.type === "custom_flow") {
      return "custom_flow";
    }
  }
  return adapter.authMethod ?? "unknown";
}

function renderInstalledApps(props: AdaptersViewProps): TemplateResult {
  return html`
    <section class="card" style="margin-top: 12px;">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <div class="card-title">Installed Apps</div>
          <div class="card-sub">
            Apps extend Nex behavior and expose manifest-defined methods on top of integrations.
          </div>
        </div>
        <span class="pill">${props.installedApps.length} apps</span>
      </div>

      ${props.appsError ? html`<div class="callout danger" style="margin-top: 12px;">${props.appsError}</div>` : nothing}

      ${
        props.appsLoading
          ? html`
              <div class="directory-loading" style="margin-top: 12px">
                <span class="spinner"></span> Loading apps…
              </div>
            `
          : props.installedApps.length === 0
            ? html`
                <div class="muted" style="margin-top: 12px">No installed apps found.</div>
              `
            : html`
                <div class="grid grid-cols-2" style="margin-top: 14px; gap: 12px;">
                  <div class="stack" style="gap: 8px;">
                    ${props.installedApps.map(
                      (app) => html`
                      <button
                        class="card"
                        style="text-align: left; ${props.selectedAppId === app.id ? "border-color: var(--accent);" : ""}"
                        @click=${() => props.onSelectApp(app.id)}
                      >
                        <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
                          <div>
                            <div class="card-title" style="margin: 0;">${app.display_name || app.id}</div>
                            <div class="card-sub mono">${app.id}</div>
                            ${app.description ? html`<div class="muted" style="margin-top: 8px;">${app.description}</div>` : nothing}
                          </div>
                          <span class="pill ${app.status === "installed" ? "ok" : ""}">${app.status || "unknown"}</span>
                        </div>
                        <div class="mono muted" style="margin-top: 8px;">
                          Version ${app.version || "n/a"}
                        </div>
                      </button>
                    `,
                    )}
                  </div>
                  <div class="card" style="border-style: solid;">
                    <div class="card-title">App Methods</div>
                    <div class="card-sub">
                      Manifest-defined callable methods for the selected app.
                    </div>
                    ${
                      props.appMethodsError
                        ? html`<div class="callout danger" style="margin-top: 12px;">${props.appMethodsError}</div>`
                        : props.appMethodsLoading
                          ? html`
                              <div class="directory-loading" style="margin-top: 12px">
                                <span class="spinner"></span> Loading methods…
                              </div>
                            `
                          : props.selectedAppId
                            ? props.appMethods.length === 0
                              ? html`
                                  <div class="muted" style="margin-top: 12px">No manifest methods declared for this app.</div>
                                `
                              : html`
                                  <div class="table" style="margin-top: 12px;">
                                    <table>
                                      <thead>
                                        <tr>
                                          <th>Method</th>
                                          <th>Action</th>
                                          <th>Service</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        ${props.appMethods.map(
                                          (method) => html`
                                          <tr>
                                            <td>
                                              <div>${method.name}</div>
                                              ${method.description ? html`<div class="muted">${method.description}</div>` : nothing}
                                            </td>
                                            <td><span class="pill pill--sm">${method.action || "read"}</span></td>
                                            <td class="mono">${method.service || "—"}</td>
                                          </tr>
                                        `,
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                `
                            : html`
                                <div class="muted" style="margin-top: 12px">Select an app to inspect its methods.</div>
                              `
                    }
                  </div>
                </div>
              `
      }
    </section>
  `;
}
