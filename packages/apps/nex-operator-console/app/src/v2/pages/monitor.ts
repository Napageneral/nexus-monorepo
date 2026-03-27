import { html, nothing } from "lit";

export type MonitorPageProps = {
  connected: boolean;
  loading: boolean;
};

export function renderMonitorPage(props: MonitorPageProps) {
  const searchIcon = html`<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
  const chevron = html`<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>`;

  return html`
    <div class="v2-page-header">
      <div class="v2-page-header-row">
        <div>
          <h1 class="v2-page-title">Monitor</h1>
          <p class="v2-page-subtitle">Track and review activity across your APIs and connected apps.</p>
        </div>
      </div>
    </div>

    <div class="v2-filter-bar">
      <div class="v2-search-wrap">
        ${searchIcon}
        <input class="v2-search-input" type="text" placeholder="Search or filter logs..." />
      </div>
      <button class="v2-filter-pill">Platforms ${chevron}</button>
    </div>

    <div class="v2-card" style="padding: 0; overflow: hidden;">
      <table class="v2-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Status</th>
            <th>Environment</th>
            <th>Action</th>
            <th>Platform</th>
            <th>Connection Key</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="6" style="text-align: center; padding: var(--v2-space-8);">
              <span class="v2-muted" style="font-size: var(--v2-text-xs);">
                ${props.connected
                  ? "No API calls recorded yet. Activity will appear here as your agents run."
                  : "Connect to runtime to see activity."}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}
