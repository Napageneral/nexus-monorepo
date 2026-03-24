import { html, nothing } from "lit";
import type { AclPermissionRequest, AclRequestApproveMode } from "../controllers/acl-requests.ts";
import type { IngressCredential } from "../controllers/ingress-credentials.ts";

export type ApprovalsProps = {
  loading: boolean;
  error: string | null;
  requests: AclPermissionRequest[];
  resolvingId: string | null;
  ingressLoading: boolean;
  ingressError: string | null;
  ingressCredentials: IngressCredential[];
  ingressEntityIdFilter: string;
  ingressCreateEntityId: string;
  ingressCreateRole: string;
  ingressCreateScopes: string;
  ingressCreateLabel: string;
  ingressCreateExpiresAt: string;
  ingressCreating: boolean;
  ingressBusyId: string | null;
  onRefresh: () => void;
  onApprove: (id: string, mode: AclRequestApproveMode) => void;
  onDeny: (id: string) => void;
  onIngressFilterChange: (next: string) => void;
  onIngressCreateEntityIdChange: (next: string) => void;
  onIngressCreateRoleChange: (next: string) => void;
  onIngressCreateScopesChange: (next: string) => void;
  onIngressCreateLabelChange: (next: string) => void;
  onIngressCreateExpiresAtChange: (next: string) => void;
  onIngressRefresh: () => void;
  onIngressCreate: () => void;
  onIngressRotate: (id: string) => void;
  onIngressRevoke: (id: string) => void;
};

function formatWhen(timestampMs: number | null | undefined): string {
  if (!timestampMs || timestampMs <= 0) {
    return "-";
  }
  try {
    return new Date(timestampMs).toLocaleString();
  } catch {
    return String(timestampMs);
  }
}

function formatRemaining(expiresAtMs: number): string {
  const remainingMs = expiresAtMs - Date.now();
  if (!Number.isFinite(remainingMs)) {
    return "-";
  }
  if (remainingMs <= 0) {
    return "expired";
  }
  const totalSeconds = Math.floor(remainingMs / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function renderMeta(label: string, value: string | null | undefined) {
  if (!value) {
    return nothing;
  }
  return html`<div class="muted">${label}: <span class="mono">${value}</span></div>`;
}

function formatScopes(scopes: string[]): string {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return "(none)";
  }
  return scopes.join(", ");
}

export function renderIngressCredentials(props: ApprovalsProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Ingress Credentials</div>
          <div class="card-sub">Issue and rotate ingress API keys mapped to IAM entities.</div>
        </div>
        <button class="btn" ?disabled=${props.ingressLoading} @click=${props.onIngressRefresh}>
          ${props.ingressLoading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      ${
        props.ingressError
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.ingressError}</div>`
          : nothing
      }

      <div class="filters" style="margin-top: 14px;">
        <label class="field" style="min-width: 280px; flex: 1;">
          <span>Filter by entity ID</span>
          <input
            .value=${props.ingressEntityIdFilter}
            placeholder="ent_xxx (optional)"
            @input=${(event: Event) =>
              props.onIngressFilterChange((event.target as HTMLInputElement).value)}
          />
        </label>
        <button class="btn" ?disabled=${props.ingressLoading} @click=${props.onIngressRefresh}>
          Apply filter
        </button>
      </div>

      <div class="filters" style="margin-top: 14px; align-items: flex-end;">
        <label class="field" style="min-width: 260px; flex: 1;">
          <span>Entity ID</span>
          <input
            .value=${props.ingressCreateEntityId}
            placeholder="ent_xxx"
            @input=${(event: Event) =>
              props.onIngressCreateEntityIdChange((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field" style="min-width: 180px;">
          <span>Role</span>
          <input
            .value=${props.ingressCreateRole}
            placeholder="customer"
            @input=${(event: Event) =>
              props.onIngressCreateRoleChange((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field" style="min-width: 260px; flex: 1;">
          <span>Scopes (comma or space separated)</span>
          <input
            .value=${props.ingressCreateScopes}
            placeholder="ingress.chat"
            @input=${(event: Event) =>
              props.onIngressCreateScopesChange((event.target as HTMLInputElement).value)}
          />
        </label>
      </div>

      <div class="filters" style="margin-top: 10px; align-items: flex-end;">
        <label class="field" style="min-width: 260px; flex: 1;">
          <span>Label</span>
          <input
            .value=${props.ingressCreateLabel}
            placeholder="customer-api"
            @input=${(event: Event) =>
              props.onIngressCreateLabelChange((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field" style="min-width: 260px; flex: 1;">
          <span>Expires at (optional)</span>
          <input
            type="datetime-local"
            .value=${props.ingressCreateExpiresAt}
            @input=${(event: Event) =>
              props.onIngressCreateExpiresAtChange((event.target as HTMLInputElement).value)}
          />
        </label>
        <button class="btn primary" ?disabled=${props.ingressCreating} @click=${props.onIngressCreate}>
          ${props.ingressCreating ? "Creating…" : "Create key"}
        </button>
      </div>

      ${
        props.ingressCredentials.length === 0
          ? html`
              <div class="muted" style="margin-top: 14px">No ingress credentials found.</div>
            `
          : html`
              <div class="list" style="margin-top: 14px;">
                ${props.ingressCredentials.map((credential) => {
                  const busy = props.ingressBusyId === credential.id;
                  const title = credential.label?.trim() || credential.id;
                  return html`
                    <div class="list-item">
                      <div class="list-main">
                        <div class="list-title">${title}</div>
                        <div class="list-sub">
                          <span class="mono">${credential.id}</span>
                          <span class="muted">· created ${formatWhen(credential.createdAt)}</span>
                          <span class="muted">· last used ${formatWhen(credential.lastUsedAt)}</span>
                        </div>
                        <div class="stack" style="gap: 4px; margin-top: 10px;">
                          ${renderMeta("Entity", credential.entityId)}
                          ${renderMeta("Role", credential.role)}
                          <div class="muted">
                            Scopes: <span class="mono">${formatScopes(credential.scopes)}</span>
                          </div>
                          <div class="muted">Expires: ${formatWhen(credential.expiresAt)}</div>
                        </div>
                      </div>
                      <div class="list-actions">
                        <button class="btn" ?disabled=${busy} @click=${() => props.onIngressRotate(credential.id)}>
                          Rotate
                        </button>
                        <button
                          class="btn danger"
                          ?disabled=${busy}
                          @click=${() => props.onIngressRevoke(credential.id)}
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  `;
                })}
              </div>
            `
      }
    </section>
  `;
}

export function renderApprovalRequests(props: ApprovalsProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Approvals</div>
          <div class="card-sub">Pending permission requests from tools and automations.</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      ${props.error ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>` : nothing}

      ${
        props.requests.length === 0
          ? html`
              <div class="muted" style="margin-top: 14px">No pending approvals.</div>
            `
          : html`
              <div class="list" style="margin-top: 14px;">
                ${props.requests.map((req) => {
                  const busy = props.resolvingId === req.id;
                  return html`
                    <div class="list-item">
                      <div class="list-main">
                        <div class="list-title">${req.summary ?? req.kind ?? req.id}</div>
                        <div class="list-sub">
                          <span class="mono">${req.id}</span>
                          <span class="muted">· created ${formatWhen(req.createdAtMs)}</span>
                          <span class="muted">· expires in ${formatRemaining(req.expiresAtMs)}</span>
                        </div>
                        <div class="stack" style="gap: 4px; margin-top: 10px;">
                          ${renderMeta("Requester", req.requesterId)}
                          ${renderMeta("Channel", req.requesterChannel)}
                          ${renderMeta("Tool", req.toolName)}
                          ${renderMeta("Session", req.sessionKey)}
                          ${req.reason ? html`<div class="muted">Reason: ${req.reason}</div>` : nothing}
                        </div>
                        ${
                          req.resources.length > 0
                            ? html`<div class="muted" style="margin-top: 10px;">
                                Resources: <span class="mono">${req.resources.join(", ")}</span>
                              </div>`
                            : nothing
                        }
                      </div>

                      <div class="list-actions">
                        <button class="btn primary" ?disabled=${busy} @click=${() => props.onApprove(req.id, "once")}>
                          Approve once
                        </button>
                        <button class="btn" ?disabled=${busy} @click=${() => props.onApprove(req.id, "day")}>
                          24h grant
                        </button>
                        <button class="btn" ?disabled=${busy} @click=${() => props.onApprove(req.id, "forever")}>
                          Standing grant
                        </button>
                        <button class="btn danger" ?disabled=${busy} @click=${() => props.onDeny(req.id)}>
                          Deny
                        </button>
                      </div>
                    </div>
                  `;
                })}
              </div>
            `
      }
    </section>
  `;
}

export function renderApprovals(props: ApprovalsProps) {
  return html`${renderApprovalRequests(props)} ${renderIngressCredentials(props)}`;
}
