import { html, nothing } from "lit";
import type { TemplateResult } from "lit";

export type IdentitySubTab = "entities" | "contacts" | "channels" | "groups" | "policies" | "merges";

export type IdentityPageProps = {
  subTab: IdentitySubTab;
  onSubTabChange: (sub: IdentitySubTab) => void;
  loading: boolean;
  error: string | null;

  entities: Array<{
    id: string;
    name?: string;
    type?: string;
    origin?: string;
    is_user?: boolean;
    is_agent?: boolean;
    created_at?: number;
    updated_at?: number;
  }>;
  selectedEntityId: string | null;
  selectedEntity: {
    id: string;
    name?: string;
    type?: string;
    origin?: string;
    is_user?: boolean;
    is_agent?: boolean;
    created_at?: number;
    updated_at?: number;
  } | null;
  selectedEntityContacts: Array<{
    id: string;
    contact_name?: string;
    contact_id?: string;
    platform?: string;
    observed_entity_id?: string;
    canonical_entity_id?: string;
    origin?: string;
  }>;
  entityDetailLoading: boolean;
  onEntitySelect: (id: string) => void;
  onEntityClear: () => void;

  contacts: Array<{
    id: string;
    contact_name?: string;
    contact_id?: string;
    platform?: string;
    observed_entity_id?: string;
    canonical_entity_id?: string;
    origin?: string;
  }>;

  channels: Array<{
    id: string;
    platform?: string;
    connection_id?: string;
    space_name?: string;
    container_name?: string;
    container_id?: string;
    container_kind?: string;
    thread_id?: string;
    thread_name?: string;
  }>;

  groups: Array<{
    id: string;
    name?: string;
    member_count?: number;
    parent_group_id?: string;
    description?: string;
    created_at?: number;
    updated_at?: number;
  }>;
  selectedGroupId: string | null;
  selectedGroup: {
    id: string;
    name?: string;
    member_count?: number;
    parent_group_id?: string;
    description?: string;
    created_at?: number;
    updated_at?: number;
  } | null;
  groupMembers: Array<{
    id: string;
    entity_id?: string;
    entity_name?: string;
    entity_type?: string;
    role?: string;
    created_at?: number;
  }>;
  groupDetailLoading: boolean;
  onGroupSelect: (id: string) => void;
  onGroupClear: () => void;

  policies: Array<{
    id: string;
    name?: string;
    effect?: string;
    priority?: number;
    enabled?: boolean;
    is_builtin?: boolean;
  }>;

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

const searchIcon = html`<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;

function truncateId(id: string | undefined, len = 12): string {
  if (!id) return "--";
  return id.length > len ? `${id.slice(0, len)}...` : id;
}

function formatDate(value: number | string | undefined): string {
  if (value == null) return "--";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(value);
  }
}

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
    return html`<div class="v2-empty-state" style="padding: var(--v2-space-8);"><p class="v2-muted">Loading...</p></div>`;
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
        <thead><tr>${opts.headers.map((header) => html`<th>${header}</th>`)}</tr></thead>
        <tbody>${opts.rows}</tbody>
      </table>
    </div>
  `;
}

const SUB_TABS: Array<{ key: IdentitySubTab; label: string }> = [
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
        (tab) => html`
          <button
            class="v2-detail-tab ${active === tab.key ? "v2-detail-tab--active" : ""}"
            @click=${() => onChange(tab.key)}
          >${tab.label}</button>
        `,
      )}
    </div>
  `;
}

function renderSectionHeader(title: string, subtitle: string, props: IdentityPageProps) {
  return html`
    <div class="v2-page-header">
      <div class="v2-page-header-row">
        <div>
          <h1 class="v2-page-title">${title}</h1>
          <p class="v2-page-subtitle">${subtitle}</p>
        </div>
        <button class="v2-btn v2-btn--secondary" @click=${props.onRefresh}>Refresh</button>
      </div>
    </div>
  `;
}

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

function platformBadge(platform: string | undefined) {
  if (!platform) return html`<span class="v2-faint">--</span>`;
  const normalized = platform.toLowerCase();
  const styles: Record<string, { background: string; color: string; border: string }> = {
    telegram: { background: "#E0F2FE", color: "#075985", border: "#7DD3FC" },
    slack: { background: "#F3E8FF", color: "#6B21A8", border: "#D8B4FE" },
    discord: { background: "#E0E7FF", color: "#3730A3", border: "#A5B4FC" },
    whatsapp: { background: "#DCFCE7", color: "#166534", border: "#86EFAC" },
    email: { background: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" },
    sms: { background: "#DCFCE7", color: "#166534", border: "#86EFAC" },
    phone: { background: "#FEF3C7", color: "#92400E", border: "#FCD34D" },
    imessage: { background: "#DBEAFE", color: "#1D4ED8", border: "#93C5FD" },
    device: { background: "#E5E7EB", color: "#374151", border: "#D1D5DB" },
    "website-input": { background: "#EDE9FE", color: "#6D28D9", border: "#C4B5FD" },
  };
  const style = styles[normalized] ?? {
    background: "var(--v2-surface-2)",
    color: "var(--v2-text)",
    border: "var(--v2-border)",
  };
  return html`
    <span
      class="v2-badge"
      style="background:${style.background}; color:${style.color}; border: 1px solid ${style.border};"
    >${platform}</span>
  `;
}

function renderContactRows(
  contacts: IdentityPageProps["contacts"] | IdentityPageProps["selectedEntityContacts"],
) {
  return contacts.map(
    (contact) => html`
      <tr>
        <td>
          <span class="v2-strong">
            ${contact.contact_name && contact.contact_name !== contact.contact_id
              ? contact.contact_name
              : html`<span class="v2-faint">--</span>`}
          </span>
        </td>
        <td><span class="v2-mono">${contact.contact_id || html`<span class="v2-faint">--</span>`}</span></td>
        <td>${platformBadge(contact.platform)}</td>
        <td>
          <span class="v2-mono">${truncateId(contact.canonical_entity_id || contact.observed_entity_id, 16)}</span>
          ${contact.observed_entity_id &&
          contact.canonical_entity_id &&
          contact.observed_entity_id !== contact.canonical_entity_id
            ? html`<div class="v2-muted" style="font-size: var(--v2-text-xs);">observed ${truncateId(contact.observed_entity_id, 16)}</div>`
            : nothing}
        </td>
        <td><span class="v2-muted">${contact.origin || html`<span class="v2-faint">--</span>`}</span></td>
      </tr>
    `,
  );
}

function renderEntityDetailPanel(props: IdentityPageProps) {
  if (!props.selectedEntityId && !props.entityDetailLoading) {
    return nothing;
  }
  return html`
    <div class="v2-card" style="margin-bottom: var(--v2-space-4);">
      <div class="v2-row-between" style="margin-bottom: var(--v2-space-3); align-items: flex-start;">
        <div>
          <div class="v2-page-title" style="font-size: var(--v2-text-lg); margin-bottom: 4px;">
            ${props.selectedEntity?.name || props.selectedEntityId || "Entity detail"}
          </div>
          <div class="v2-page-subtitle">
            ${props.entityDetailLoading
              ? "Loading entity detail..."
              : "Inspect the selected entity and the contacts currently linked to it."}
          </div>
        </div>
        <button class="v2-btn v2-btn--secondary" @click=${props.onEntityClear}>Clear</button>
      </div>

      ${props.selectedEntity
        ? html`
            <div class="v2-grid-2" style="gap: var(--v2-space-3); margin-bottom: var(--v2-space-4);">
              <div>
                <div class="v2-label">Entity ID</div>
                <div class="v2-mono">${props.selectedEntity.id}</div>
              </div>
              <div>
                <div class="v2-label">Type</div>
                <div>${props.selectedEntity.type || html`<span class="v2-faint">--</span>`}</div>
              </div>
              <div>
                <div class="v2-label">Origin</div>
                <div>${props.selectedEntity.origin || html`<span class="v2-faint">--</span>`}</div>
              </div>
              <div>
                <div class="v2-label">Created</div>
                <div>${formatDate(props.selectedEntity.created_at)}</div>
              </div>
              <div style="grid-column: 1 / -1;">
                <div class="v2-label">Flags</div>
                <div>
                  ${props.selectedEntity.is_user
                    ? html`<span class="v2-badge v2-badge--info">user</span>`
                    : nothing}
                  ${props.selectedEntity.is_agent
                    ? html`<span class="v2-badge v2-badge--success">agent</span>`
                    : nothing}
                  ${!props.selectedEntity.is_user && !props.selectedEntity.is_agent
                    ? html`<span class="v2-faint">--</span>`
                    : nothing}
                </div>
              </div>
            </div>
          `
        : nothing}

      ${props.entityDetailLoading
        ? html`<div class="v2-muted">Loading...</div>`
        : renderV2Table({
            headers: ["Label", "Identifier", "Platform", "Entity", "Origin"],
            rows: renderContactRows(props.selectedEntityContacts),
            empty: "No contacts are linked to this entity yet.",
            loading: false,
            error: null,
          })}
    </div>
  `;
}

function renderEntitiesTab(props: IdentityPageProps) {
  const rows = props.entities.map(
    (entity) => html`
      <tr @click=${() => props.onEntitySelect(entity.id)} style="cursor: pointer;">
        <td><span class="v2-mono">${truncateId(entity.id)}</span></td>
        <td><span class="v2-strong">${entity.name || html`<span class="v2-faint">--</span>`}</span></td>
        <td>${entity.type || html`<span class="v2-faint">--</span>`}</td>
        <td>${entity.origin || html`<span class="v2-faint">--</span>`}</td>
        <td>
          ${entity.is_user ? html`<span class="v2-badge v2-badge--info">user</span>` : nothing}
          ${entity.is_agent ? html`<span class="v2-badge v2-badge--success">agent</span>` : nothing}
          ${!entity.is_user && !entity.is_agent ? html`<span class="v2-faint">--</span>` : nothing}
        </td>
        <td><span class="v2-muted">${formatDate(entity.created_at)}</span></td>
      </tr>
    `,
  );

  return html`
    ${renderSectionHeader("Entities", "Canonical identity graph — contacts, channels, and linking evidence", props)}
    ${renderSearchBar("Search entities by name or ID...")}
    ${renderEntityDetailPanel(props)}
    <div class="v2-card" style="padding: 0; overflow: hidden;">
      ${renderV2Table({
        headers: ["Entity ID", "Name", "Type", "Origin", "Flags", "Created"],
        rows,
        empty: "No entities found. Connect adapters to start building the identity graph.",
        loading: props.loading,
        error: props.error,
      })}
    </div>
  `;
}

function renderContactsTab(props: IdentityPageProps) {
  return html`
    ${renderSectionHeader("Contacts", "Resolved contacts across adapters and origins", props)}
    ${renderSearchBar("Search contacts...")}
    <div class="v2-card" style="padding: 0; overflow: hidden;">
      ${renderV2Table({
        headers: ["Label", "Identifier", "Platform", "Entity", "Origin"],
        rows: renderContactRows(props.contacts),
        empty: "No contacts resolved yet.",
        loading: props.loading,
        error: props.error,
      })}
    </div>
  `;
}

function channelPrimaryLabel(channel: IdentityPageProps["channels"][number]) {
  return channel.container_name || channel.thread_name || channel.thread_id || channel.container_id || "--";
}

function channelSecondaryLabel(channel: IdentityPageProps["channels"][number]) {
  return channel.thread_name || channel.thread_id || null;
}

function renderChannelsTab(props: IdentityPageProps) {
  const rows = props.channels.map(
    (channel) => html`
      <tr>
        <td>${platformBadge(channel.platform)}</td>
        <td><span class="v2-mono">${truncateId(channel.connection_id)}</span></td>
        <td>
          <div class="v2-strong">${channelPrimaryLabel(channel)}</div>
          ${channel.container_kind || channel.space_name
            ? html`<div class="v2-muted" style="font-size: var(--v2-text-xs);">${[channel.container_kind, channel.space_name].filter(Boolean).join(" · ")}</div>`
            : nothing}
        </td>
        <td>
          ${channelSecondaryLabel(channel)
            ? html`<span class="v2-mono">${channelSecondaryLabel(channel)}</span>`
            : html`<span class="v2-faint">--</span>`}
        </td>
        <td><span class="v2-mono">${truncateId(channel.id)}</span></td>
      </tr>
    `,
  );

  return html`
    ${renderSectionHeader("Channels", "Canonical channel directory and addressability", props)}
    ${renderSearchBar("Search channels...")}
    <div class="v2-card" style="padding: 0; overflow: hidden;">
      ${renderV2Table({
        headers: ["Platform", "Connection", "Channel", "Thread", "Channel ID"],
        rows,
        empty: "No channels found.",
        loading: props.loading,
        error: props.error,
      })}
    </div>
  `;
}

function renderGroupDetailPanel(props: IdentityPageProps) {
  if (!props.selectedGroupId && !props.groupDetailLoading) {
    return nothing;
  }
  return html`
    <div class="v2-card" style="margin-top: var(--v2-space-4);">
      <div class="v2-row-between" style="margin-bottom: var(--v2-space-3); align-items: flex-start;">
        <div>
          <div class="v2-page-title" style="font-size: var(--v2-text-lg); margin-bottom: 4px;">
            ${props.selectedGroup?.name || props.selectedGroupId || "Group detail"}
          </div>
          <div class="v2-page-subtitle">
            ${props.groupDetailLoading
              ? "Loading group members..."
              : `${props.groupMembers.length} members · ${props.selectedGroup?.description || "Inspect the entities currently assigned to this group."}`}
          </div>
        </div>
        <button class="v2-btn v2-btn--secondary" @click=${props.onGroupClear}>Clear</button>
      </div>

      ${props.selectedGroup
        ? html`
            <div class="v2-grid-2" style="gap: var(--v2-space-3); margin-bottom: var(--v2-space-4);">
              <div>
                <div class="v2-label">Group ID</div>
                <div class="v2-mono">${props.selectedGroup.id}</div>
              </div>
              <div>
                <div class="v2-label">Members</div>
                <div>${props.selectedGroup.member_count ?? props.groupMembers.length}</div>
              </div>
              <div>
                <div class="v2-label">Parent</div>
                <div>${props.selectedGroup.parent_group_id || html`<span class="v2-faint">--</span>`}</div>
              </div>
              <div>
                <div class="v2-label">Created</div>
                <div>${formatDate(props.selectedGroup.created_at)}</div>
              </div>
            </div>
          `
        : nothing}

      ${props.groupDetailLoading
        ? html`<div class="v2-muted">Loading...</div>`
        : renderV2Table({
            headers: ["Entity", "Type", "Role", "Entity ID"],
            rows: props.groupMembers.map(
              (member) => html`
                <tr>
                  <td><span class="v2-strong">${member.entity_name || html`<span class="v2-faint">--</span>`}</span></td>
                  <td>${member.entity_type || html`<span class="v2-faint">--</span>`}</td>
                  <td>${member.role || html`<span class="v2-faint">--</span>`}</td>
                  <td><span class="v2-mono">${truncateId(member.entity_id, 24)}</span></td>
                </tr>
              `,
            ),
            empty: "No members in this group.",
            loading: false,
            error: null,
          })}
    </div>
  `;
}

function renderGroupsTab(props: IdentityPageProps) {
  const rows = props.groups.map(
    (group) => html`
      <tr @click=${() => props.onGroupSelect(group.id)} style="cursor: pointer;">
        <td><span class="v2-strong">${group.name || html`<span class="v2-faint">Unnamed</span>`}</span></td>
        <td>${group.member_count ?? 0}</td>
        <td><span class="v2-mono">${group.parent_group_id ? truncateId(group.parent_group_id) : html`<span class="v2-faint">--</span>`}</span></td>
        <td><span class="v2-muted">${group.description || html`<span class="v2-faint">--</span>`}</span></td>
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
    ${renderGroupDetailPanel(props)}
  `;
}

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
    (policy) => html`
      <tr>
        <td><span class="v2-strong">${policy.name || html`<span class="v2-faint">Unnamed</span>`}</span></td>
        <td>${effectBadge(policy.effect)}</td>
        <td>${policy.priority ?? html`<span class="v2-faint">--</span>`}</td>
        <td>${enabledDot(policy.enabled)}</td>
        <td>
          ${policy.is_builtin
            ? html`<span class="v2-badge v2-badge--neutral">built-in</span>`
            : html`<span class="v2-faint">custom</span>`}
        </td>
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

function confidenceBadge(confidence: number | undefined) {
  if (confidence == null) return html`<span class="v2-faint">--</span>`;
  const pct = Math.round(confidence * 100);
  let klass = "v2-badge--danger";
  if (pct >= 90) klass = "v2-badge--success";
  else if (pct >= 70) klass = "v2-badge--warning";
  return html`<span class="v2-badge ${klass}">${pct}%</span>`;
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
          <span style="color: var(--v2-text-muted);">→</span>
          <span class="v2-mono">${truncateId(candidate.target_entity_id, 16)}</span>
        </div>
        ${confidenceBadge(candidate.confidence)}
      </div>
      ${candidate.reason
        ? html`<p class="v2-muted" style="font-size: var(--v2-text-xs); margin-bottom: var(--v2-space-3);">${candidate.reason}</p>`
        : nothing}
      <div class="v2-row" style="gap: var(--v2-space-2);">
        <button class="v2-btn v2-btn--primary v2-btn--sm" ?disabled=${isBusy} @click=${() => onResolve(candidate.id, "approved")}>
          ${isBusy ? "Processing..." : "Approve"}
        </button>
        <button class="v2-btn v2-btn--secondary v2-btn--sm" ?disabled=${isBusy} @click=${() => onResolve(candidate.id, "rejected")}>
          Reject
        </button>
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
      <div class="v2-empty-state" style="padding: var(--v2-space-8);"><p class="v2-muted">Loading...</p></div>
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
      ${props.mergeCandidates.map((candidate) =>
        renderMergeCard(candidate, props.mergeBusyId, props.onResolveMerge),
      )}
    </div>
  `;
}

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
