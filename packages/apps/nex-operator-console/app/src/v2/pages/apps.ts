import { html, nothing } from "lit";
import type { AdapterConnectionEntry } from "../../ui/controllers/integrations.ts";
import { icons } from "../../ui/icons.ts";
import { renderPlatformIcon } from "../components/platform-icons.ts";

export type AppsPageProps = {
  loading: boolean;
  loaded: boolean;
  error: string | null;
  adapters: AdapterConnectionEntry[];
  onRefresh: () => void;
  onSelectAdapter: (adapter: string) => void;
  onOAuthStart: (adapter: string) => void;
};

// ─── Platform icon grid for first-run ────────────────────────────────
// Reference image 01: 3x4 grid of circular platform icons
// We render colored circles with initials as placeholders for real platform logos

const PLATFORM_NAMES = [
  "Gmail", "Google Calendar", "Notion", "Google Drive",
  "Slack", "GitHub", "Jira", "Stripe",
  "Salesforce", "HubSpot", "Asana", "Google Maps",
];

function renderPlatformGridIcon(name: string) {
  return html`
    <button class="v2-platform-icon" title="${name}" style="cursor: pointer;">
      <div class="v2-platform-icon-circle" style="background: rgba(255,255,255,0.95); border: 1px solid rgba(0,0,0,0.06);">
        ${renderPlatformIcon(name, 28)}
      </div>
    </button>
  `;
}

// ─── Platform picker (first-run, no apps connected) ──────────────────
// Reference image 01: "Hey Tyler Brandt, connect a platform"
function renderPlatformPicker() {
  return html`
    <div class="v2-platform-picker">
      <h1 class="v2-platform-picker-title">Hey Tyler Brandt, connect a platform</h1>
      <p class="v2-platform-picker-subtitle">Pick a platform to give your AI agents superpowers.</p>
      <div class="v2-platform-grid">
        ${PLATFORM_NAMES.map(renderPlatformGridIcon)}
      </div>
      <p class="v2-platform-picker-footer">
        Don't see yours? <a href="#" class="v2-gold-text">Browse all connectors &rarr;</a>
      </p>
    </div>
  `;
}

function renderConnectorsLoading() {
  return html`
    <div class="v2-page-header">
      <div class="v2-page-header-row">
        <div>
          <h1 class="v2-page-title">Connectors</h1>
          <p class="v2-page-subtitle">Loading your connected platforms from the runtime.</p>
        </div>
      </div>
    </div>

    <div class="v2-card" style="padding: var(--v2-space-6);">
      <div class="v2-muted">Loading connectors…</div>
    </div>
  `;
}

function renderConnectorsError(error: string, props: AppsPageProps) {
  return html`
    <div class="v2-page-header">
      <div class="v2-page-header-row">
        <div>
          <h1 class="v2-page-title">Connectors</h1>
          <p class="v2-page-subtitle">The runtime did not return connector inventory successfully.</p>
        </div>
        <button class="v2-btn v2-btn--secondary" @click=${props.onRefresh}>Retry</button>
      </div>
    </div>

    <div class="v2-card" style="padding: var(--v2-space-6); border-color: rgba(220, 38, 38, 0.2);">
      <div class="v2-strong" style="margin-bottom: var(--v2-space-2);">Could not load connectors</div>
      <div class="v2-muted">${error}</div>
    </div>
  `;
}

// ─── Status badge ────────────────────────────────────────────────────
function statusBadge(status: string) {
  if (status === "connected") return html`<span class="v2-badge v2-badge--success">Active</span>`;
  if (status === "error") return html`<span class="v2-badge v2-badge--danger">Error</span>`;
  return html`<span class="v2-badge v2-badge--neutral">Disconnected</span>`;
}

function formatLastUsed(lastSync: number | null | undefined): string {
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
    const hours = Math.floor(delta / 3_600_000);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  return new Date(lastSync).toLocaleString();
}

// ─── Connected table ─────────────────────────────────────────────────
function renderConnectedTable(adapters: AdapterConnectionEntry[], props: AppsPageProps) {
  const connected = adapters.filter((a) => a.status === "connected");
  const disconnected = adapters.filter((a) => a.status !== "connected");
  const all = [...connected, ...disconnected];
  if (all.length === 0) return nothing;

  return html`
    <div class="v2-card" style="padding: 0; overflow: hidden;">
      <table class="v2-table">
        <thead>
          <tr>
            <th>Platform</th>
            <th>Online</th>
            <th>Tags</th>
            <th>Last used</th>
          </tr>
        </thead>
        <tbody>
          ${all.map((adapter) => html`
            <tr @click=${() => props.onSelectAdapter(adapter.adapter)} style="cursor: pointer;">
              <td>
                <div class="v2-table-platform">
                  <div class="v2-table-platform-icon">${icons.plug}</div>
                  <span class="v2-strong">${adapter.name || adapter.adapter}</span>
                </div>
              </td>
              <td>${statusBadge(adapter.status)}</td>
              <td><span class="v2-faint">--</span></td>
              <td><span class="v2-muted">${formatLastUsed(adapter.lastSync)}</span></td>
            </tr>
          `)}
        </tbody>
      </table>
    </div>
  `;
}

// ─── Get started cards ───────────────────────────────────────────────
function renderGetStarted() {
  return html`
    <div class="v2-get-started-section">
      <div class="v2-get-started-label">Get started</div>
      <div class="v2-get-started">
        <div class="v2-get-started-card">
          <div class="v2-get-started-card-title">Connect your agent</div>
          <div class="v2-get-started-card-desc">Hook up the CLI or give an agent access in 250+ integrations.</div>
          <div class="v2-get-started-card-link">Get started &rarr;</div>
        </div>
        <div class="v2-get-started-card">
          <div class="v2-get-started-card-title">Create an agent</div>
          <div class="v2-get-started-card-desc">Create AI agents that automate tasks across your connected platforms.</div>
          <div class="v2-get-started-card-link">Try it &rarr;</div>
        </div>
        <div class="v2-get-started-card">
          <div class="v2-get-started-card-title">Browse the catalog</div>
          <div class="v2-get-started-card-desc">Connect 250+ platform integrations built by the community.</div>
          <div class="v2-get-started-card-link">Browse &rarr;</div>
        </div>
      </div>
    </div>
  `;
}

// ─── Main render ─────────────────────────────────────────────────────
export function renderAppsPage(props: AppsPageProps) {
  const hasAdapters = props.adapters.length > 0;
  const searchIcon = html`<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
  const chevron = html`<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>`;

  if ((props.loading || !props.loaded) && !hasAdapters && !props.error) {
    return renderConnectorsLoading();
  }

  if (props.error && !hasAdapters) {
    return renderConnectorsError(props.error, props);
  }

  // No apps connected → show the platform picker only when the runtime has
  // successfully reported an empty inventory.
  if (props.loaded && !hasAdapters) {
    return renderPlatformPicker();
  }

  // Has apps → show connected list (reference image 04)
  return html`
    <div class="v2-page-header">
      <div class="v2-page-header-row">
        <div>
          <h1 class="v2-page-title">Connectors</h1>
          <p class="v2-page-subtitle">Link external platforms to your agents. Connect them here, then use them via the CLI or API.</p>
        </div>
        <button class="v2-btn v2-btn--primary" @click=${props.onRefresh}>+ Add new app</button>
      </div>
    </div>

    <div class="v2-filter-bar">
      <div class="v2-search-wrap">
        ${searchIcon}
        <input class="v2-search-input" type="text" placeholder="Search by connection / platform..." />
      </div>
      <button class="v2-filter-pill">Tags ${chevron}</button>
      <button class="v2-filter-pill">Platforms ${chevron}</button>
    </div>

    ${props.error
      ? html`
          <div class="v2-card" style="padding: var(--v2-space-4); margin-bottom: var(--v2-space-4); border-color: rgba(220, 38, 38, 0.2);">
            <div class="v2-strong" style="margin-bottom: var(--v2-space-1);">Connector refresh partially failed</div>
            <div class="v2-muted">${props.error}</div>
          </div>
        `
      : nothing}

    ${renderConnectedTable(props.adapters, props)}
    ${renderGetStarted()}
  `;
}
