import { html, nothing } from "lit";
import type { TemplateResult } from "lit";
import { icons } from "../../ui/icons.ts";

// ─── Types ──────────────────────────────────────────────────────────

export type IdentitySubTab = "entities" | "contacts" | "channels" | "groups" | "policies" | "merges";

export type IdentityPageProps = {
  subTab: IdentitySubTab;
  onSubTabChange: (sub: IdentitySubTab) => void;
  loading: boolean;
  error: string | null;

  // Entity data
  entities: Array<{
    id: string;
    name?: string;
    contact_count?: number;
    channel_count?: number;
    created_at?: string;
  }>;
  onEntitySelect: (id: string) => void;

  // Contact data
  contacts: Array<{
    id: string;
    contact_name?: string;
    contact_id?: string;
    platform?: string;
    entity_id?: string;
    origin?: string;
  }>;

  // Channel data
  channels: Array<{
    id: string;
    platform?: string;
    connection_id?: string;
    container_name?: string;
    container_id?: string;
    thread_name?: string;
  }>;

  // Group data
  groups: Array<{
    id: string;
    name?: string;
    member_count?: number;
    parent_group_id?: string;
    description?: string;
  }>;

  // Policy data
  policies: Array<{
    id: string;
    name?: string;
    effect?: string;
    priority?: number;
    enabled?: boolean;
    is_builtin?: boolean;
  }>;

  // Merge queue
  mergeCandidates: Array<{
    id: string;
    source_entity_id?: string;
    target_entity_id?: string;
    confidence?: number;
    reason?: string;
  }>;
  mergeBusyId: string | null;
  onResolveMerge: (id: string, status: "approved" | "rejected") => void;

  onRefresh: () => void;
};

// ─── Shared helpers ─────────────────────────────────────────────────

const searchIcon = html`<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;

function truncateId(id: string | undefined, len = 12): string {
  if (!id) return "--";
  return id.length > len ? id.slice(0, len) + "..." : id;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "--";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

// ─── Reusable table renderer ────────────────────────────────────────

function renderV2Table(opts: {
  headers: string[];
  rows: TemplateResult[];
  empty: string;
  loading: boolean;
  error: string | null;
}) {
  if (opts.error) {
    return html`<div class="v2-callout v2-callout--danger">${opts.error}</div>`;
  }
  if (opts.loading) {
    return html`<div class="v2-empty-state" style="padding: var(--v2-space-8);"><p class="v2-muted">Loading\u2026</p></div>`;
  }
  if (opts.rows.length === 0) {
    return html`
      <div class="v2-empty-state" style="padding: var(--v2-space-8); text-align: center;">
        <p class="v2-muted">${opts.empty}</p>
      </div>
    `;
  }
  return html`
    <div class="v2-table-wrap">
      <table class="v2-table">
        <thead><tr>${opts.headers.map((h) => html`<th>${h}</th>`)}</tr></thead>
        <tbody>${opts.rows}</tbody>
      </table>
    </div>
  `;
}

// ─── Sub-tab bar ────────────────────────────────────────────────────

const SUB_TABS: { key: IdentitySubTab; label: string }[] = [
  { key: "entities", label: "Entities" },
  { key: "contacts", label: "Contacts" },
  { key: "channels", label: "Channels" },
  { key: "groups", label: "Groups" },
  { key: "policies", label: "Policies" },
  { key: "merges", label: "Merge Queue" },
];

function renderSubTabs(active: IdentitySubTab, onChange: (sub: IdentitySubTab) => void) {
  return html`
    <div class="v2-detail-tabs">
      ${SUB_TABS.map(
        (t) => html`
          <button
            class="v2-detail-tab ${active === t.key ? "v2-detail-tab--active" : ""}"
            @click=${() => onChange(t.key)}
          >${t.label}</button>
        `,
      )}
    </div>
  `;
}

// ─── Section header ─────────────────────────────────────────────────

function renderSectionHeader(title: string, subtitle: string, props: IdentityPageProps) {
  return html`
    <div class="v2-page-header">
      <div class="v2-page-header-row">
        <div>
          <h1 class="v2-page-title">${title}</h1>
          <p class="v2-page-subtitle">${subtitle}</p>
        </div>
        <button class="v2-btn v2-btn--secondary" @click=${props.onRefresh}>
          Refresh
        </button>
      </div>
    </div>
  `;
}

// ─── Search bar ─────────────────────────────────────────────────────

function renderSearchBar(placeholder: string) {
  return html`
    <div class="v2-filter-bar">
      <div class="v2-search-wrap">
        ${searchIcon}
        <input class="v2-search-input" type="text" placeholder="${placeholder}" />
      </div>
    </div>
  `;
}

// ─── Entities sub-tab ───────────────────────────────────────────────

function renderEntitiesTab(props: IdentityPageProps) {
  const rows = props.entities.map(
    (e) => html`
      <tr @click=${() => props.onEntitySelect(e.id)} style="cursor: pointer;">
        <td><span class="v2-mono">${truncateId(e.id)}</span></td>
        <td><span class="v2-strong">${e.name || html`<span class="v2-faint">--</span>`}</span></td>
        <td>${e.contact_count ?? 0}</td>
        <td>${e.channel_count ?? 0}</td>
        <td><span class="v2-muted">${formatDate(e.created_at)}</span></td>
      </tr>
    `,
  );

  return html`
    ${renderSectionHeader("Entities", "Canonical identity graph \u2014 contacts, channels, and linking evidence", props)}
    ${renderSearchBar("Search entities by name or ID...")}
    <div class="v2-card" style="padding: 0; overflow: hidden;">
      ${renderV2Table({
        headers: ["Entity ID", "Name", "Contacts", "Channels", "Created"],
        rows,
        empty: "No entities found. Connect adapters to start building the identity graph.",
        loading: props.loading,
        error: props.error,
      })}
    </div>
  `;
}

// ─── Contacts sub-tab ───────────────────────────────────────────────

function platformBadge(platform: string | undefined) {
  if (!platform) return html`<span class="v2-faint">--</span>`;
  const colors: Record<string, string> = {
    telegram: "#0088cc",
    slack: "#4A154B",
    discord: "#5865F2",
    whatsapp: "#25D366",
    email: "#EA4335",
    sms: "#34A853",
  };
  const bg = colors[platform.toLowerCase()] ?? "var(--v2-surface-2)";
  return html`<span class="v2-badge" style="background: ${bg}; color: #fff;">${platform}</span>`;
}

function renderContactsTab(props: IdentityPageProps) {
  const rows = props.contacts.map(
    (c) => html`
      <tr>
        <td><span class="v2-strong">${c.contact_name || c.contact_id || html`<span class="v2-faint">--</span>`}</span></td>
        <td>${platformBadge(c.platform)}</td>
        <td><span class="v2-mono">${truncateId(c.entity_id)}</span></td>
        <td><span class="v2-muted">${c.origin || html`<span class="v2-faint">--</span>`}</span></td>
      </tr>
    `,
  );

  return html`
    ${renderSectionHeader("Contacts", "Resolved contacts across adapters and origins", props)}
    ${renderSearchBar("Search contacts...")}
    <div class="v2-card" style="padding: 0; overflow: hidden;">
      ${renderV2Table({
        headers: ["Name", "Platform", "Entity", "Origin"],
        rows,
        empty: "No contacts resolved yet.",
        loading: props.loading,
        error: props.error,
      })}
    </div>
  `;
}

// ─── Channels sub-tab ───────────────────────────────────────────────

function renderChannelsTab(props: IdentityPageProps) {
  const rows = props.channels.map(
    (ch) => html`
      <tr>
        <td><span class="v2-mono">${truncateId(ch.id)}</span></td>
        <td>${platformBadge(ch.platform)}</td>
        <td><span class="v2-muted">${truncateId(ch.connection_id)}</span></td>
        <td>${ch.container_name || truncateId(ch.container_id)}</td>
        <td>${ch.thread_name || html`<span class="v2-faint">--</span>`}</td>
      </tr>
    `,
  );

  return html`
    ${renderSectionHeader("Channels", "Canonical channel directory and addressability", props)}
    ${renderSearchBar("Search channels...")}
    <div class="v2-card" style="padding: 0; overflow: hidden;">
      ${renderV2Table({
        headers: ["Channel ID", "Platform", "Connection", "Container", "Thread"],
        rows,
        empty: "No channels found.",
        loading: props.loading,
        error: props.error,
      })}
    </div>
  `;
}

// ─── Groups sub-tab ─────────────────────────────────────────────────

function renderGroupsTab(props: IdentityPageProps) {
  const rows = props.groups.map(
    (g) => html`
      <tr>
        <td><span class="v2-strong">${g.name || html`<span class="v2-faint">Unnamed</span>`}</span></td>
        <td>${g.member_count ?? 0}</td>
        <td><span class="v2-mono">${g.parent_group_id ? truncateId(g.parent_group_id) : html`<span class="v2-faint">--</span>`}</span></td>
        <td><span class="v2-muted">${g.description || html`<span class="v2-faint">--</span>`}</span></td>
      </tr>
    `,
  );

  return html`
    ${renderSectionHeader("Groups", "Operator-managed group structure and membership", props)}
    ${renderSearchBar("Search groups...")}
    <div class="v2-card" style="padding: 0; overflow: hidden;">
      ${renderV2Table({
        headers: ["Name", "Members", "Parent", "Description"],
        rows,
        empty: "No groups configured.",
        loading: props.loading,
        error: props.error,
      })}
    </div>
  `;
}

// ─── Policies sub-tab ───────────────────────────────────────────────

function effectBadge(effect: string | undefined) {
  if (!effect) return html`<span class="v2-faint">--</span>`;
  const lower = effect.toLowerCase();
  if (lower === "allow") return html`<span class="v2-badge v2-badge--success">allow</span>`;
  if (lower === "deny") return html`<span class="v2-badge v2-badge--danger">deny</span>`;
  return html`<span class="v2-badge v2-badge--neutral">${effect}</span>`;
}

function enabledDot(enabled: boolean | undefined) {
  const color = enabled ? "var(--v2-green, #22c55e)" : "var(--v2-text-faint, #555)";
  return html`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span>`;
}

function renderPoliciesTab(props: IdentityPageProps) {
  const rows = props.policies.map(
    (p) => html`
      <tr>
        <td><span class="v2-strong">${p.name || html`<span class="v2-faint">Unnamed</span>`}</span></td>
        <td>${effectBadge(p.effect)}</td>
        <td>${p.priority ?? html`<span class="v2-faint">--</span>`}</td>
        <td>${enabledDot(p.enabled)}</td>
        <td>${p.is_builtin ? html`<span class="v2-badge v2-badge--neutral">built-in</span>` : html`<span class="v2-faint">custom</span>`}</td>
      </tr>
    `,
  );

  return html`
    ${renderSectionHeader("Policies", "Active grants, effects, and runtime policy ordering", props)}
    ${renderSearchBar("Search policies...")}
    <div class="v2-card" style="padding: 0; overflow: hidden;">
      ${renderV2Table({
        headers: ["Name", "Effect", "Priority", "Enabled", "Built-in"],
        rows,
        empty: "No policies found.",
        loading: props.loading,
        error: props.error,
      })}
    </div>
  `;
}

// ─── Merge Queue sub-tab ────────────────────────────────────────────

function confidenceBadge(confidence: number | undefined) {
  if (confidence == null) return html`<span class="v2-faint">--</span>`;
  const pct = Math.round(confidence * 100);
  let cls = "v2-badge--danger";
  if (pct >= 90) cls = "v2-badge--success";
  else if (pct >= 70) cls = "v2-badge--warning";
  return html`<span class="v2-badge ${cls}">${pct}%</span>`;
}

function renderMergeCard(
  candidate: IdentityPageProps["mergeCandidates"][number],
  busyId: string | null,
  onResolve: IdentityPageProps["onResolveMerge"],
) {
  const isBusy = busyId === candidate.id;
  return html`
    <div class="v2-card" style="border: 1px solid var(--v2-border, rgba(255,255,255,0.08)); margin-bottom: var(--v2-space-3);">
      <div class="v2-row-between" style="margin-bottom: var(--v2-space-3);">
        <div class="v2-row" style="gap: var(--v2-space-3); flex-wrap: wrap;">
          <span class="v2-mono">${truncateId(candidate.source_entity_id, 16)}</span>
          <span style="color: var(--v2-text-muted);">\u2192</span>
          <span class="v2-mono">${truncateId(candidate.target_entity_id, 16)}</span>
        </div>
        ${confidenceBadge(candidate.confidence)}
      </div>
      ${candidate.reason
        ? html`<p class="v2-muted" style="font-size: var(--v2-text-xs); margin-bottom: var(--v2-space-3);">${candidate.reason}</p>`
        : nothing}
      <div class="v2-row" style="gap: var(--v2-space-2);">
        <button
          class="v2-btn v2-btn--primary v2-btn--sm"
          ?disabled=${isBusy}
          @click=${() => onResolve(candidate.id, "approved")}
        >${isBusy ? "Processing\u2026" : "Approve"}</button>
        <button
          class="v2-btn v2-btn--secondary v2-btn--sm"
          ?disabled=${isBusy}
          @click=${() => onResolve(candidate.id, "rejected")}
        >Reject</button>
      </div>
    </div>
  `;
}

function renderMergeQueueTab(props: IdentityPageProps) {
  if (props.error) {
    return html`
      ${renderSectionHeader("Merge Queue", "Pending identity merges for operator review", props)}
      <div class="v2-callout v2-callout--danger">${props.error}</div>
    `;
  }

  if (props.loading) {
    return html`
      ${renderSectionHeader("Merge Queue", "Pending identity merges for operator review", props)}
      <div class="v2-empty-state" style="padding: var(--v2-space-8);"><p class="v2-muted">Loading\u2026</p></div>
    `;
  }

  if (props.mergeCandidates.length === 0) {
    return html`
      ${renderSectionHeader("Merge Queue", "Pending identity merges for operator review", props)}
      <div class="v2-empty-state" style="padding: var(--v2-space-8); text-align: center;">
        <p class="v2-muted">No pending merge candidates. Identity resolution is clean.</p>
      </div>
    `;
  }

  return html`
    ${renderSectionHeader("Merge Queue", "Pending identity merges for operator review", props)}
    <div style="display: flex; flex-direction: column;">
      ${props.mergeCandidates.map((c) => renderMergeCard(c, props.mergeBusyId, props.onResolveMerge))}
    </div>
  `;
}

// ─── Main render ────────────────────────────────────────────────────

export function renderIdentityPage(props: IdentityPageProps) {
  return html`
    ${renderSubTabs(props.subTab, props.onSubTabChange)}
    <div style="padding: var(--v2-space-4) 0;">
      ${props.subTab === "entities" ? renderEntitiesTab(props) : nothing}
      ${props.subTab === "contacts" ? renderContactsTab(props) : nothing}
      ${props.subTab === "channels" ? renderChannelsTab(props) : nothing}
      ${props.subTab === "groups" ? renderGroupsTab(props) : nothing}
      ${props.subTab === "policies" ? renderPoliciesTab(props) : nothing}
      ${props.subTab === "merges" ? renderMergeQueueTab(props) : nothing}
    </div>
  `;
}
