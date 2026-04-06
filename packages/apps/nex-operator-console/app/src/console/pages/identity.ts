import { html, nothing } from "lit";
import type { TemplateResult } from "lit";

export type IdentitySubTab = "entities" | "contacts" | "channels" | "groups" | "policies" | "merges";

export type IdentityPageProps = {
  subTab: IdentitySubTab;
  onSubTabChange: (sub: IdentitySubTab) => void;
  loading: boolean;
  error: string | null;
  entityRouteMode?: boolean;
  groupRouteMode?: boolean;
  onBackToEntities?: () => void;
  onBackToGroups?: () => void;

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

function renderConsoleTable(opts: {
  headers: string[];
  rows: TemplateResult[];
  empty: string;
  loading: boolean;
  error: string | null;
}) {
  if (opts.error) {
    return html`<div class="console-callout console-callout--danger">${opts.error}</div>`;
  }
  if (opts.loading) {
    return html`<div class="console-empty-state" style="padding: var(--console-space-8);"><p class="console-muted">Loading...</p></div>`;
  }
  if (opts.rows.length === 0) {
    return html`
      <div class="console-empty-state" style="padding: var(--console-space-8); text-align: center;">
        <p class="console-muted">${opts.empty}</p>
      </div>
    `;
  }
  return html`
    <div class="console-table-wrap">
      <table class="console-table">
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
    <div class="console-detail-tabs">
      ${SUB_TABS.map(
        (tab) => html`
          <button
            class="console-detail-tab ${active === tab.key ? "console-detail-tab--active" : ""}"
            @click=${() => onChange(tab.key)}
          >${tab.label}</button>
        `,
      )}
    </div>
  `;
}

function renderSectionHeader(title: string, subtitle: string, props: IdentityPageProps) {
  return html`
    <div class="console-page-header">
      <div class="console-page-header-row">
        <div>
          <h1 class="console-page-title">${title}</h1>
          <p class="console-page-subtitle">${subtitle}</p>
        </div>
        <button class="console-btn console-btn--secondary" @click=${props.onRefresh}>Refresh</button>
      </div>
    </div>
  `;
}

function renderSearchBar(placeholder: string) {
  return html`
    <div class="console-filter-bar">
      <div class="console-search-wrap">
        ${searchIcon}
        <input class="console-search-input" type="text" placeholder="${placeholder}" />
      </div>
    </div>
  `;
}

function platformBadge(platform: string | undefined) {
  if (!platform) return html`<span class="console-faint">--</span>`;
  const label = normalizePlatformFamily(platform) || platform.toLowerCase();
  const normalized = label.toLowerCase();
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
    background: "var(--console-surface-2)",
    color: "var(--console-text)",
    border: "var(--console-border)",
  };
  return html`
    <span
      class="console-badge"
      style="background:${style.background}; color:${style.color}; border: 1px solid ${style.border};"
    >${label}</span>
  `;
}

function renderContactRows(
  contacts: IdentityPageProps["contacts"] | IdentityPageProps["selectedEntityContacts"],
  opts?: {
    showEntity?: boolean;
    entitiesById?: Map<string, IdentityPageProps["entities"][number]>;
    onEntitySelect?: (entityId: string) => void;
  },
) {
  return contacts.map(
    (contact) => html`
      <tr>
        <td>
          <div class="console-mono console-strong">
            ${contact.contact_id || html`<span class="console-faint">--</span>`}
          </div>
          ${contact.contact_name && contact.contact_name !== contact.contact_id
            ? html`<div class="console-muted" style="font-size: var(--console-text-xs);">${contact.contact_name}</div>`
            : nothing}
        </td>
        <td>${platformBadge(contact.platform)}</td>
        ${opts?.showEntity === false
          ? nothing
          : html`
              <td>
                ${(() => {
                  const entityId = contact.canonical_entity_id || contact.observed_entity_id;
                  if (!entityId) {
                    return html`<span class="console-faint">--</span>`;
                  }
                  const entity = opts?.entitiesById?.get(entityId);
                  return html`
                    ${opts?.onEntitySelect
                      ? html`
                          <button class="console-link-button" @click=${() => opts.onEntitySelect?.(entityId)}>
                            ${entity?.name || truncateId(entityId, 18)}
                          </button>
                        `
                      : html`<div class="console-strong">${entity?.name || truncateId(entityId, 18)}</div>`}
                    <div class="console-muted console-mono" style="font-size: var(--console-text-xs);">
                      ${truncateId(entityId, 18)}
                    </div>
                    ${contact.observed_entity_id &&
                    contact.canonical_entity_id &&
                    contact.observed_entity_id !== contact.canonical_entity_id
                      ? html`<div class="console-muted console-mono" style="font-size: var(--console-text-xs);">observed ${truncateId(contact.observed_entity_id, 18)}</div>`
                      : nothing}
                  `;
                })()}
              </td>
            `}
        <td><span class="console-muted">${contact.origin || html`<span class="console-faint">--</span>`}</span></td>
      </tr>
    `,
  );
}

function normalizeAddressToken(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  if (trimmed.includes("@")) {
    return trimmed;
  }
  const strippedPrefix = trimmed.replace(/^[a-z0-9_-]+:/i, "");
  const digitsOnly = strippedPrefix.replace(/\D/g, "");
  if (digitsOnly.length >= 7) {
    return digitsOnly;
  }
  return strippedPrefix.replace(/\s+/g, "");
}

function normalizePlatformFamily(platform: string | null | undefined): string {
  const normalized = (platform ?? "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "sms") {
    return "phone";
  }
  return normalized;
}

function channelsCompatibleWithContact(
  channel: IdentityPageProps["channels"][number],
  contact: IdentityPageProps["selectedEntityContacts"][number],
): boolean {
  const channelPlatform = normalizePlatformFamily(channel.platform);
  const contactPlatform = normalizePlatformFamily(contact.platform);
  if (!channelPlatform || !contactPlatform) {
    return true;
  }
  if (channelPlatform === contactPlatform) {
    return true;
  }
  const family = new Set([channelPlatform, contactPlatform]);
  return family.has("imessage") && family.has("phone");
}

function renderEntityDetailPanel(props: IdentityPageProps) {
  if (!props.selectedEntityId && !props.entityDetailLoading) {
    return nothing;
  }
  const relatedChannels = props.selectedEntityContacts.length
    ? props.channels.filter((channel, index, list) => {
        const channelTokens = [
          channel.container_id,
          channel.container_name,
          channel.thread_id,
          channel.thread_name,
        ]
          .map((value) => normalizeAddressToken(value))
          .filter(Boolean);
        if (!channelTokens.length) {
          return false;
        }
        const matches = props.selectedEntityContacts.some((contact) => {
          if (!channelsCompatibleWithContact(channel, contact)) {
            return false;
          }
          const contactToken = normalizeAddressToken(contact.contact_id);
          return !!contactToken && channelTokens.includes(contactToken);
        });
        return matches && list.findIndex((candidate) => candidate.id === channel.id) === index;
      })
    : [];
  return html`
    <div id="identity-entity-detail" class="console-card" style="margin-bottom: var(--console-space-4);">
      <div class="console-row-between" style="margin-bottom: var(--console-space-3); align-items: flex-start;">
        <div>
          <div class="console-page-title" style="font-size: var(--console-text-lg); margin-bottom: 4px;">
            ${props.selectedEntity?.name || props.selectedEntityId || "Entity detail"}
          </div>
          <div class="console-page-subtitle">
            ${props.entityDetailLoading
              ? "Loading entity detail..."
              : `${props.selectedEntityContacts.length} linked contacts · ${relatedChannels.length} matching channels`}
          </div>
        </div>
        <button class="console-btn console-btn--secondary" @click=${props.onEntityClear}>Clear</button>
      </div>

      ${!props.entityDetailLoading && !props.selectedEntity
        ? html`
            <div class="console-card" style="padding: var(--console-space-3); margin-bottom: var(--console-space-4); background: var(--console-bg-raised);">
              <div class="console-strong" style="margin-bottom: 4px;">Entity details are unavailable</div>
              <div class="console-muted" style="font-size: var(--console-text-sm);">
                The current route points at
                <span class="console-mono">${props.selectedEntityId}</span>, but the runtime did not
                return a current entity record for it.
              </div>
            </div>
          `
        : nothing}

      ${props.selectedEntity
        ? html`
            <div class="console-grid-4" style="gap: var(--console-space-3); margin-bottom: var(--console-space-4);">
              <div class="console-card" style="padding: var(--console-space-3); background: var(--console-bg-raised);">
                <div class="console-label console-label--upper">Linked contacts</div>
                <div class="console-strong" style="font-size: var(--console-text-lg);">${props.selectedEntityContacts.length}</div>
              </div>
              <div class="console-card" style="padding: var(--console-space-3); background: var(--console-bg-raised);">
                <div class="console-label console-label--upper">Matching channels</div>
                <div class="console-strong" style="font-size: var(--console-text-lg);">${relatedChannels.length}</div>
              </div>
              <div class="console-card" style="padding: var(--console-space-3); background: var(--console-bg-raised);">
                <div class="console-label console-label--upper">Type</div>
                <div class="console-strong">${props.selectedEntity.type || html`<span class="console-faint">--</span>`}</div>
              </div>
              <div class="console-card" style="padding: var(--console-space-3); background: var(--console-bg-raised);">
                <div class="console-label console-label--upper">Origin</div>
                <div class="console-strong">${props.selectedEntity.origin || html`<span class="console-faint">--</span>`}</div>
              </div>
            </div>
            <div class="console-grid-2" style="gap: var(--console-space-3); margin-bottom: var(--console-space-4);">
              <div>
                <div class="console-label">Entity ID</div>
                <div class="console-mono">${props.selectedEntity.id}</div>
              </div>
              <div>
                <div class="console-label">Created</div>
                <div>${formatDate(props.selectedEntity.created_at)}</div>
              </div>
              <div style="grid-column: 1 / -1;">
                <div class="console-label">Flags</div>
                <div>
                  ${props.selectedEntity.is_user
                    ? html`<span class="console-badge console-badge--info">user</span>`
                    : nothing}
                  ${props.selectedEntity.is_agent
                    ? html`<span class="console-badge console-badge--success">agent</span>`
                    : nothing}
                  ${!props.selectedEntity.is_user && !props.selectedEntity.is_agent
                    ? html`<span class="console-faint">--</span>`
                    : nothing}
                </div>
              </div>
            </div>
          `
        : nothing}

      ${props.entityDetailLoading
        ? html`<div class="console-muted">Loading...</div>`
        : html`
            <div class="console-grid-2" style="gap: var(--console-space-3); margin-bottom: var(--console-space-4);">
              <div class="console-card" style="padding: var(--console-space-3);">
                <div class="console-label">Linked contacts</div>
                <div class="console-strong" style="font-size: var(--console-text-lg);">${props.selectedEntityContacts.length}</div>
                <div class="console-muted" style="font-size: var(--console-text-xs);">Addressable contacts currently mapped to this entity</div>
              </div>
              <div class="console-card" style="padding: var(--console-space-3);">
                <div class="console-label">Matching channels</div>
                <div class="console-strong" style="font-size: var(--console-text-lg);">${relatedChannels.length}</div>
                <div class="console-muted" style="font-size: var(--console-text-xs);">Observed channels whose identifiers match linked contact data</div>
              </div>
            </div>
            <div style="margin-bottom: var(--console-space-4);">
              <div class="console-label" style="margin-bottom: var(--console-space-2);">Linked contacts</div>
              ${renderConsoleTable({
                headers: ["Identifier", "Platform", "Origin"],
                rows: renderContactRows(props.selectedEntityContacts, {
                  showEntity: false,
                  onEntitySelect: props.onEntitySelect,
                }),
                empty: "No contacts are linked to this entity yet.",
                loading: false,
                error: null,
              })}
            </div>
            <div>
              <div class="console-label" style="margin-bottom: var(--console-space-2);">Matching channels</div>
              ${renderConsoleTable({
                headers: ["Platform", "Channel", "Address", "Connection", "Channel ID"],
                rows: renderChannelRows(relatedChannels),
                empty: "No current channels match this entity's linked contact identifiers.",
                loading: false,
                error: null,
              })}
            </div>
          `}
    </div>
  `;
}

function renderEntityDetailPage(props: IdentityPageProps) {
  return html`
    ${renderSectionHeader(
      props.selectedEntity?.name || props.selectedEntityId || "Entity",
      "Dedicated entity detail view with linked contacts and core identity facts",
      props,
    )}
    <div class="console-row" style="margin-bottom: var(--console-space-4);">
      <button class="console-btn console-btn--secondary" @click=${props.onBackToEntities}>Back to entities</button>
    </div>
    ${renderEntityDetailPanel(props)}
  `;
}

function renderEntitiesTab(props: IdentityPageProps) {
  if (props.entityRouteMode) {
    return renderEntityDetailPage(props);
  }
  const rows = props.entities.map(
    (entity) => html`
      <tr
        @click=${() => props.onEntitySelect(entity.id)}
        style=${[
          "cursor: pointer;",
          props.selectedEntityId === entity.id
            ? "background: rgba(59, 130, 246, 0.08);"
            : "",
        ].join(" ")}
      >
        <td><span class="console-mono">${truncateId(entity.id)}</span></td>
        <td><span class="console-strong">${entity.name || html`<span class="console-faint">--</span>`}</span></td>
        <td>${entity.type || html`<span class="console-faint">--</span>`}</td>
        <td>${entity.origin || html`<span class="console-faint">--</span>`}</td>
        <td>
          ${entity.is_user ? html`<span class="console-badge console-badge--info">user</span>` : nothing}
          ${entity.is_agent ? html`<span class="console-badge console-badge--success">agent</span>` : nothing}
          ${!entity.is_user && !entity.is_agent ? html`<span class="console-faint">--</span>` : nothing}
        </td>
        <td><span class="console-muted">${formatDate(entity.created_at)}</span></td>
      </tr>
    `,
  );

  return html`
    ${renderSectionHeader("Entities", "Canonical identity graph — contacts, channels, and linking evidence", props)}
    ${renderSearchBar("Search entities by name or ID...")}
    <div class="console-card" style="padding: 0; overflow: hidden;">
      ${renderConsoleTable({
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
  const entitiesById = new Map(props.entities.map((entity) => [entity.id, entity]));
  return html`
    ${renderSectionHeader("Contacts", "Resolved contacts across adapters and origins", props)}
    ${renderSearchBar("Search contacts...")}
    <div class="console-card" style="padding: 0; overflow: hidden;">
      ${renderConsoleTable({
        headers: ["Identifier", "Platform", "Entity", "Origin"],
        rows: renderContactRows(props.contacts, {
          entitiesById,
          onEntitySelect: props.onEntitySelect,
        }),
        empty: "No contacts resolved yet.",
        loading: props.loading,
        error: props.error,
      })}
    </div>
  `;
}

function channelPrimaryLabel(channel: IdentityPageProps["channels"][number]) {
  return channel.thread_name || channel.container_name || channel.space_name || channel.container_id || channel.thread_id || "--";
}

function channelSecondaryLabel(channel: IdentityPageProps["channels"][number]) {
  const details = [channel.container_name, channel.thread_name, channel.space_name, channel.container_id, channel.thread_id]
    .map((value) => value?.trim())
    .filter((value): value is string => !!value);
  const primary = channelPrimaryLabel(channel);
  const unique = [...new Set(details)].filter((value) => value !== primary);
  return unique[0] ?? null;
}

function channelAddressLabel(channel: IdentityPageProps["channels"][number]) {
  return channel.container_id || channel.thread_id || "--";
}

function channelMetaLabel(channel: IdentityPageProps["channels"][number]) {
  const parts = [channel.container_kind, channel.space_name]
    .map((value) => value?.trim())
    .filter((value): value is string => !!value);
  return parts.length ? parts.join(" · ") : null;
}

function renderChannelRows(channels: IdentityPageProps["channels"]) {
  return channels.map(
    (channel) => html`
      <tr>
        <td>${platformBadge(channel.platform)}</td>
        <td>
          <div class="console-strong console-mono" style="font-size: var(--console-text-xs);">
            ${channelAddressLabel(channel)}
          </div>
          ${channel.thread_id && channel.thread_id !== channelAddressLabel(channel)
            ? html`<div class="console-muted console-mono" style="font-size: var(--console-text-xs);">${channel.thread_id}</div>`
            : nothing}
        </td>
        <td>
          <div class="console-strong">${channelPrimaryLabel(channel)}</div>
          ${channelMetaLabel(channel)
            ? html`<div class="console-muted" style="font-size: var(--console-text-xs);">${channelMetaLabel(channel)}</div>`
            : nothing}
        </td>
        <td>
          ${channelSecondaryLabel(channel)
            ? html`<div class="console-muted">${channelSecondaryLabel(channel)}</div>`
            : nothing}
          ${!channelSecondaryLabel(channel) ? html`<span class="console-faint">--</span>` : nothing}
        </td>
        <td>
          <div class="console-mono">${truncateId(channel.connection_id, 18)}</div>
          <div class="console-faint console-mono" style="font-size: var(--console-text-xs);">${truncateId(channel.id, 18)}</div>
        </td>
      </tr>
    `,
  );
}

function renderChannelsTab(props: IdentityPageProps) {
  return html`
    ${renderSectionHeader("Channels", "Canonical channel directory and addressability", props)}
    ${renderSearchBar("Search channels...")}
    <div class="console-card" style="padding: 0; overflow: hidden;">
      ${renderConsoleTable({
        headers: ["Platform", "Address", "Label", "Context", "Connection · Channel ID"],
        rows: renderChannelRows(props.channels),
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
  const ownerGroup = props.selectedGroup?.name?.trim().toLowerCase() === "owner";
  const memberTypeCounts = new Map<string, number>();
  const memberRoleCounts = new Map<string, number>();
  for (const member of props.groupMembers) {
    const type = (member.entity_type || "unknown").trim().toLowerCase();
    const role = (member.role || "member").trim().toLowerCase();
    memberTypeCounts.set(type, (memberTypeCounts.get(type) ?? 0) + 1);
    memberRoleCounts.set(role, (memberRoleCounts.get(role) ?? 0) + 1);
  }
  const memberTypeSummary = [...memberTypeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => `${count} ${type}`)
    .join(" · ");
  const memberRoleSummary = [...memberRoleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([role, count]) => `${count} ${role}`)
    .join(" · ");
  return html`
    <div id="identity-group-detail" class="console-card" style="margin-top: var(--console-space-4);">
      <div class="console-row-between" style="margin-bottom: var(--console-space-3); align-items: flex-start;">
        <div>
          <div class="console-page-title" style="font-size: var(--console-text-lg); margin-bottom: 4px;">
            ${props.selectedGroup?.name || props.selectedGroupId || "Group detail"}
          </div>
          <div class="console-page-subtitle">
            ${props.groupDetailLoading
              ? "Loading group members..."
              : `${props.groupMembers.length} members · ${props.selectedGroup?.description || "Inspect the entities currently assigned to this group."}`}
          </div>
        </div>
        <button class="console-btn console-btn--secondary" @click=${props.onGroupClear}>Clear</button>
      </div>

      ${ownerGroup
        ? html`
            <div class="console-card" style="padding: var(--console-space-3); margin-bottom: var(--console-space-4); background: var(--console-bg-raised);">
              <div class="console-strong" style="margin-bottom: 4px;">Why does Owner have ${props.selectedGroup?.member_count ?? props.groupMembers.length} members?</div>
              <div class="console-muted" style="font-size: var(--console-text-sm);">
                Owner is the operator-managed role group for entities that currently hold owner-level access in this runtime. The member roster below is the concrete list of those assigned entities.
              </div>
              ${(memberTypeSummary || memberRoleSummary)
                ? html`
                    <div class="console-muted" style="font-size: var(--console-text-xs); margin-top: var(--console-space-2);">
                      ${memberTypeSummary || "Member type breakdown unavailable"}
                      ${memberRoleSummary ? html` · ${memberRoleSummary}` : nothing}
                    </div>
                  `
                : nothing}
            </div>
          `
        : !props.groupDetailLoading
          ? html`
              <div class="console-card" style="padding: var(--console-space-3); margin-bottom: var(--console-space-4); background: var(--console-bg-raised);">
                <div class="console-strong" style="margin-bottom: 4px;">Membership summary</div>
                <div class="console-muted" style="font-size: var(--console-text-sm);">
                  ${(props.selectedGroup?.member_count ?? props.groupMembers.length)} entities are currently assigned to this group.
                </div>
                ${(memberTypeSummary || memberRoleSummary)
                  ? html`
                      <div class="console-muted" style="font-size: var(--console-text-xs); margin-top: var(--console-space-2);">
                        ${memberTypeSummary || "Member type breakdown unavailable"}
                        ${memberRoleSummary ? html` · ${memberRoleSummary}` : nothing}
                      </div>
                    `
                  : nothing}
              </div>
            `
          : nothing}

      ${props.selectedGroup
        ? html`
            <div class="console-grid-2" style="gap: var(--console-space-3); margin-bottom: var(--console-space-4);">
              <div>
                <div class="console-label">Group ID</div>
                <div class="console-mono">${props.selectedGroup.id}</div>
              </div>
              <div>
                <div class="console-label">Members</div>
                <div>${props.selectedGroup.member_count ?? props.groupMembers.length}</div>
              </div>
              <div>
                <div class="console-label">Parent</div>
                <div>${props.selectedGroup.parent_group_id || html`<span class="console-faint">--</span>`}</div>
              </div>
              <div>
                <div class="console-label">Created</div>
                <div>${formatDate(props.selectedGroup.created_at)}</div>
              </div>
            </div>
          `
        : nothing}

      ${props.groupDetailLoading
        ? html`<div class="console-muted">Loading...</div>`
        : renderConsoleTable({
            headers: ["Entity", "Type", "Role", "Entity ID"],
            rows: props.groupMembers.map(
              (member) => html`
                <tr>
                  <td>
                    ${member.entity_id
                      ? html`
                          <button class="console-link-button" @click=${() => props.onEntitySelect(member.entity_id!)}>
                            ${member.entity_name || member.entity_id}
                          </button>
                        `
                      : html`<span class="console-strong">${member.entity_name || html`<span class="console-faint">--</span>`}</span>`}
                  </td>
                  <td>${member.entity_type || html`<span class="console-faint">--</span>`}</td>
                  <td>${member.role || html`<span class="console-faint">--</span>`}</td>
                  <td><span class="console-mono">${truncateId(member.entity_id, 24)}</span></td>
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

function renderGroupDetailPage(props: IdentityPageProps) {
  return html`
    ${renderSectionHeader(
      props.selectedGroup?.name || props.selectedGroupId || "Group",
      "Dedicated group detail view with membership truth and owner-role semantics",
      props,
    )}
    <div class="console-row" style="margin-bottom: var(--console-space-4);">
      <button class="console-btn console-btn--secondary" @click=${props.onBackToGroups}>Back to groups</button>
    </div>
    ${renderGroupDetailPanel(props)}
  `;
}

function renderGroupsTab(props: IdentityPageProps) {
  if (props.groupRouteMode) {
    return renderGroupDetailPage(props);
  }
  const rows = props.groups.map(
    (group) => html`
      <tr
        @click=${() => props.onGroupSelect(group.id)}
        style=${[
          "cursor: pointer;",
          props.selectedGroupId === group.id
            ? "background: rgba(59, 130, 246, 0.08);"
            : "",
        ].join(" ")}
      >
        <td><span class="console-strong">${group.name || html`<span class="console-faint">Unnamed</span>`}</span></td>
        <td>${group.member_count ?? 0}</td>
        <td><span class="console-mono">${group.parent_group_id ? truncateId(group.parent_group_id) : html`<span class="console-faint">--</span>`}</span></td>
        <td><span class="console-muted">${group.description || html`<span class="console-faint">--</span>`}</span></td>
      </tr>
    `,
  );

  return html`
    ${renderSectionHeader("Groups", "Operator-managed group structure and membership", props)}
    ${renderSearchBar("Search groups...")}
    <div class="console-card" style="padding: 0; overflow: hidden;">
      ${renderConsoleTable({
        headers: ["Name", "Members", "Parent", "Description"],
        rows,
        empty: "No groups configured.",
        loading: props.loading,
        error: props.error,
      })}
    </div>
  `;
}

function effectBadge(effect: string | undefined) {
  if (!effect) return html`<span class="console-faint">--</span>`;
  const lower = effect.toLowerCase();
  if (lower === "allow") return html`<span class="console-badge console-badge--success">allow</span>`;
  if (lower === "deny") return html`<span class="console-badge console-badge--danger">deny</span>`;
  return html`<span class="console-badge console-badge--neutral">${effect}</span>`;
}

function enabledDot(enabled: boolean | undefined) {
  const color = enabled ? "var(--console-green, #22c55e)" : "var(--console-text-faint, #555)";
  return html`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span>`;
}

function renderPoliciesTab(props: IdentityPageProps) {
  const rows = props.policies.map(
    (policy) => html`
      <tr>
        <td><span class="console-strong">${policy.name || html`<span class="console-faint">Unnamed</span>`}</span></td>
        <td>${effectBadge(policy.effect)}</td>
        <td>${policy.priority ?? html`<span class="console-faint">--</span>`}</td>
        <td>${enabledDot(policy.enabled)}</td>
        <td>
          ${policy.is_builtin
            ? html`<span class="console-badge console-badge--neutral">built-in</span>`
            : html`<span class="console-faint">custom</span>`}
        </td>
      </tr>
    `,
  );

  return html`
    ${renderSectionHeader("Policies", "Active grants, effects, and runtime policy ordering", props)}
    ${renderSearchBar("Search policies...")}
    <div class="console-card" style="padding: 0; overflow: hidden;">
      ${renderConsoleTable({
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
  if (confidence == null) return html`<span class="console-faint">--</span>`;
  const pct = Math.round(confidence * 100);
  let klass = "console-badge--danger";
  if (pct >= 90) klass = "console-badge--success";
  else if (pct >= 70) klass = "console-badge--warning";
  return html`<span class="console-badge ${klass}">${pct}%</span>`;
}

function renderMergeCard(
  candidate: IdentityPageProps["mergeCandidates"][number],
  busyId: string | null,
  onResolve: IdentityPageProps["onResolveMerge"],
) {
  const isBusy = busyId === candidate.id;
  return html`
    <div class="console-card" style="border: 1px solid var(--console-border, rgba(255,255,255,0.08)); margin-bottom: var(--console-space-3);">
      <div class="console-row-between" style="margin-bottom: var(--console-space-3);">
        <div class="console-row" style="gap: var(--console-space-3); flex-wrap: wrap;">
          <span class="console-mono">${truncateId(candidate.source_entity_id, 16)}</span>
          <span style="color: var(--console-text-muted);">→</span>
          <span class="console-mono">${truncateId(candidate.target_entity_id, 16)}</span>
        </div>
        ${confidenceBadge(candidate.confidence)}
      </div>
      ${candidate.reason
        ? html`<p class="console-muted" style="font-size: var(--console-text-xs); margin-bottom: var(--console-space-3);">${candidate.reason}</p>`
        : nothing}
      <div class="console-row" style="gap: var(--console-space-2);">
        <button class="console-btn console-btn--primary console-btn--sm" ?disabled=${isBusy} @click=${() => onResolve(candidate.id, "approved")}>
          ${isBusy ? "Processing..." : "Approve"}
        </button>
        <button class="console-btn console-btn--secondary console-btn--sm" ?disabled=${isBusy} @click=${() => onResolve(candidate.id, "rejected")}>
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
      <div class="console-callout console-callout--danger">${props.error}</div>
    `;
  }
  if (props.loading) {
    return html`
      ${renderSectionHeader("Merge Queue", "Pending identity merges for operator review", props)}
      <div class="console-empty-state" style="padding: var(--console-space-8);"><p class="console-muted">Loading...</p></div>
    `;
  }
  if (props.mergeCandidates.length === 0) {
    return html`
      ${renderSectionHeader("Merge Queue", "Pending identity merges for operator review", props)}
      <div class="console-empty-state" style="padding: var(--console-space-8); text-align: center;">
        <p class="console-muted">No pending merge candidates. Identity resolution is clean.</p>
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
    <div style="padding: var(--console-space-4) 0;">
      ${props.subTab === "entities" ? renderEntitiesTab(props) : nothing}
      ${props.subTab === "contacts" ? renderContactsTab(props) : nothing}
      ${props.subTab === "channels" ? renderChannelsTab(props) : nothing}
      ${props.subTab === "groups" ? renderGroupsTab(props) : nothing}
      ${props.subTab === "policies" ? renderPoliciesTab(props) : nothing}
      ${props.subTab === "merges" ? renderMergeQueueTab(props) : nothing}
    </div>
  `;
}
