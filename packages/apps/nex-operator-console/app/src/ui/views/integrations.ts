import { html, nothing } from "lit";
import type { AdapterAuthField, AdapterConnectionEntry } from "../controllers/integrations.ts";

export type IntegrationsProps = {
  connected: boolean;
  loading: boolean;
  busyAdapter: string | null;
  busyAction: string | null;
  error: string | null;
  message: string | null;
  adapters: AdapterConnectionEntry[];
  selectedAdapter: string;
  sessionId: string;
  payloadText: string;
  pendingFields: AdapterAuthField[];
  instructions: string | null;
  onRefresh: () => void;
  onSelectAdapter: (adapter: string) => void;
  onPayloadChange: (payloadText: string) => void;
  onOAuthStart: (adapter: string) => void;
  onCustomStart: (adapter: string) => void;
  onCustomSubmit: (adapter: string) => void;
  onCustomStatus: (adapter: string) => void;
  onCustomCancel: (adapter: string) => void;
  onTest: (adapter: string) => void;
  onDisconnect: (adapter: string) => void;
};

type AdapterAuthMethodType = "oauth2" | "api_key" | "file_upload" | "custom_flow";

// ─── Helpers ────────────────────────────────────────────────────────────

function statusClass(status: AdapterConnectionEntry["status"]): string {
  if (status === "connected") {
    return "ok";
  }
  if (status === "disconnected") {
    return "";
  }
  return "danger";
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

export function renderIntegrations(props: IntegrationsProps) {
  const selected = props.adapters.find((entry) => entry.adapter === props.selectedAdapter) ?? null;

  return html`
    <!-- Adapter selector grid -->
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">Select Adapter</div>
          <div class="card-sub">Choose an adapter to configure credentials and connections.</div>
        </div>
        <button class="btn btn--sm" ?disabled=${props.loading || !props.connected} @click=${props.onRefresh}>
          ${props.loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      ${
        !props.connected
          ? html`
              <div class="callout danger" style="margin-top: 12px">Runtime is disconnected.</div>
            `
          : nothing
      }
      ${props.error ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>` : nothing}
      ${props.message ? html`<div class="callout" style="margin-top: 12px;">${props.message}</div>` : nothing}

      ${
        props.adapters.length === 0
          ? html`
              <div class="muted" style="margin-top: 14px">No adapters registered in this runtime.</div>
            `
          : html`
              <div class="connect-adapter-grid" style="margin-top: 14px;">
                ${props.adapters.map((entry) => {
                  const isSelected = props.selectedAdapter === entry.adapter;
                  const rowMethods = authMethodTypes(entry);
                  const borderClass =
                    entry.status === "connected"
                      ? "adapter-card--connected"
                      : entry.status === "error" || entry.status === "expired"
                        ? "adapter-card--error"
                        : "adapter-card--disconnected";
                  return html`
                    <div
                      class="card connect-adapter-card ${borderClass} ${isSelected ? "connect-adapter-card--selected" : ""}"
                      @click=${() => props.onSelectAdapter(entry.adapter)}
                    >
                      <div class="row" style="justify-content: space-between; align-items: center;">
                        <div class="connect-adapter-card__name">${entry.name}</div>
                        <span class="pill pill--sm ${statusClass(entry.status)}">${entry.status}</span>
                      </div>
                      <div class="connect-adapter-card__meta">
                        <span class="mono">${entry.adapter}</span>
                        ${entry.account ? html`<span class="muted">· ${entry.account}</span>` : nothing}
                      </div>
                      <div class="chip-row" style="margin-top: 6px;">
                        ${Array.from(rowMethods).map((type) => html`<span class="chip">${methodChipLabel(type)}</span>`)}
                      </div>
                      ${entry.error ? html`<div class="muted" style="margin-top: 6px; font-size: 12px; color: var(--danger);">${entry.error}</div>` : nothing}
                    </div>
                  `;
                })}
              </div>
            `
      }
    </section>

    <!-- Selected adapter actions -->
    ${selected ? renderSelectedAdapter(props, selected) : nothing}
  `;
}

// ─── Selected adapter detail ────────────────────────────────────────────

function renderSelectedAdapter(props: IntegrationsProps, selected: AdapterConnectionEntry) {
  const methods = authMethodTypes(selected);
  const hasOAuth = methods.has("oauth2");
  const hasCustomFlow = methods.has("custom_flow");
  const isBusy = props.busyAdapter === selected.adapter;
  const currentBusyLabel = isBusy ? busyLabel(props.busyAction ?? "") : null;

  return html`
    <section class="card" style="margin-top: 12px;">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <div class="card-title">${selected.name}</div>
          <div class="card-sub mono">${selected.adapter}</div>
        </div>
        ${currentBusyLabel ? html`<span class="pill">${currentBusyLabel}</span>` : nothing}
      </div>

      <!-- Setup guide (prominent) -->
      ${
        selected.auth?.setupGuide
          ? html`
              <div class="callout" style="margin-top: 12px;">
                ${selected.auth.setupGuide}
              </div>
            `
          : nothing
      }

      <!-- Instructions from setup flow -->
      ${
        props.instructions
          ? html`<div class="callout" style="margin-top: 12px; border-color: var(--accent);">${props.instructions}</div>`
          : nothing
      }

      <!-- Pending fields -->
      ${
        props.pendingFields.length > 0
          ? html`
              <div style="margin-top: 12px;">
                <div class="card-title" style="font-size: 13px;">Required Fields</div>
                <div class="connect-fields-list" style="margin-top: 8px;">
                  ${props.pendingFields.map((field) => renderPendingField(field))}
                </div>
              </div>
            `
          : nothing
      }

      <!-- Primary actions -->
      <div class="connect-actions" style="margin-top: 14px;">
        <div class="connect-actions__primary">
          ${
            hasOAuth
              ? html`
                  <button class="btn primary" ?disabled=${isBusy} @click=${() => props.onOAuthStart(selected.adapter)}>
                    Start OAuth
                  </button>
                `
              : nothing
          }
          ${
            hasCustomFlow
              ? html`
                  <button class="btn primary" ?disabled=${isBusy} @click=${() => props.onCustomStart(selected.adapter)}>
                    Start Setup
                  </button>
                  ${
                    props.sessionId
                      ? html`
                          <button class="btn" ?disabled=${isBusy} @click=${() => props.onCustomSubmit(selected.adapter)}>
                            Submit
                          </button>
                          <button class="btn" ?disabled=${isBusy} @click=${() => props.onCustomStatus(selected.adapter)}>
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
          <button class="btn btn--sm" ?disabled=${isBusy} @click=${() => props.onTest(selected.adapter)}>
            Test
          </button>
          ${
            hasCustomFlow && props.sessionId
              ? html`
                  <button class="btn btn--sm danger" ?disabled=${isBusy} @click=${() => props.onCustomCancel(selected.adapter)}>
                    Cancel Setup
                  </button>
                `
              : nothing
          }
          <button class="btn btn--sm danger" ?disabled=${isBusy} @click=${() => props.onDisconnect(selected.adapter)}>
            Disconnect
          </button>
        </div>
      </div>

      <!-- Advanced: Session ID + JSON payload (collapsed by default) -->
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
