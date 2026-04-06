import { html, nothing } from "lit";
import type { AppViewState } from "../ui/app-view-state.ts";
import { icons } from "../ui/icons.ts";
import { loadAgents, createAgent, deriveAgentWorkspaceBindingId } from "../ui/controllers/agents.ts";
import {
  clearIdentityEntityDetail,
  clearIdentityGroupDetail,
  loadIdentityEntityDetail,
  loadIdentityGroupDetail,
  loadIdentitySurface,
  resolveIdentityMergeCandidate,
} from "../ui/controllers/identity.ts";
import {
  cancelIntegrationCustomFlow,
  backfillIntegrationAdapter,
  checkIntegrationCustomFlow,
  disconnectIntegrationAdapter,
  loadIntegrations,
  setIntegrationsPayloadText,
  setIntegrationsSelectedAdapter,
  setIntegrationLivesync,
  startIntegrationCustomFlow,
  startIntegrationOAuth,
  submitIntegrationCustomFlow,
  testIntegrationAdapter,
} from "../ui/controllers/integrations.ts";
import { loadRecords, refreshRecordsSurface, searchRecords } from "../ui/controllers/records.ts";
import {
  loadMemoryEntityDetail,
  loadMemoryEpisodeInspector,
  loadMemoryFactDetail,
  loadMemoryObservationDetail,
  loadMemoryQualityItems,
  loadMemoryQualitySummary,
  loadMemoryRunEpisodes,
  loadMemoryRuns,
  runMemorySearch,
} from "../ui/controllers/memory-review.ts";
import { renderAgentsPage } from "./pages/agents.ts";
import { renderAgentCreateWizard, type AgentCreateStep, type AgentCreateForm } from "./pages/agent-create.ts";
import { renderAgentDetail, type AgentDetailTab, type AgentDetailModal } from "./pages/agent-detail.ts";
import { renderMonitorPage, type MonitorPageProps } from "./pages/monitor.ts";
import { loadMonitorHistory, loadMonitorStats } from "../ui/controllers/monitor.ts";
import { renderJobsPage, type JobsPageProps } from "./pages/jobs.ts";
import { renderRecordsPage, type RecordsPageProps } from "./pages/records.ts";
import { renderIdentityPage, type IdentityPageProps } from "./pages/identity.ts";
import { renderMemoryPage, type MemoryPageProps } from "./pages/memory.ts";
import { renderIntegrations } from "../ui/views/integrations.ts";
import { loadScheduleJobs } from "../ui/controllers/schedules.ts";
import { inferBasePathFromPathname, normalizeBasePath } from "../ui/navigation.ts";
import {
  CONSOLE_PRIMARY_TABS,
  CONSOLE_SECONDARY_TABS,
  consoleIconForTab,
  consoleTabFromLegacy,
  consoleTitleForTab,
  type ConsoleTab,
} from "./navigation.ts";
// User menu and workspace switcher available for future frontdoor integration
// import { renderUserMenuDropdown, renderWorkspaceSwitcher } from "./components/dropdowns.ts";

// ─── Inline SVG icons for the console chrome ───────────────────────────
const chromeIcons = {
  chevronDown: html`<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>`,
  sparkle: html`<svg viewBox="0 0 24 24"><path d="M12 3v1m0 16v1m-8-9H3m18 0h-1m-2.636-6.364-.707.707M6.343 17.657l-.707.707m0-12.728.707.707m11.314 11.314.707.707"/></svg>`,
  x: html`<svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  bell: html`<svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  command: html`<svg viewBox="0 0 24 24"><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></svg>`,
  puzzle: html`<svg viewBox="0 0 24 24"><path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02z"/></svg>`,
  messageCircle: html`<svg viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/></svg>`,
  user: html`<svg viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  creditCard: html`<svg viewBox="0 0 24 24"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
  barChart2: html`<svg viewBox="0 0 24 24"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>`,
  fileText: html`<svg viewBox="0 0 24 24"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  key: html`<svg viewBox="0 0 24 24"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.3 9.3"/><path d="m18 5 3-3"/></svg>`,
  shield: html`<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>`,
};

function flattenMemorySearchResult(result: AppViewState["memorySearchResult"]) {
  if (!result) {
    return [];
  }
  return [
    ...(result.entities ?? []).map((entity) => ({
      id: entity.id,
      kind: "entity",
      text: entity.name || entity.id,
      score: entity.score,
      entity_id: entity.id,
    })),
    ...(result.facts ?? []).map((fact) => ({
      id: fact.id,
      kind: "fact",
      text: [fact.subject, fact.predicate, fact.object].filter(Boolean).join(" -> ") || fact.id,
      score: fact.score,
      entity_id: undefined,
    })),
    ...(result.observations ?? []).map((observation) => ({
      id: observation.id,
      kind: "observation",
      text: observation.text,
      score: observation.score,
      entity_id: observation.entity_id,
    })),
  ];
}

// ─── Agent wizard state helpers ──────────────────────────────────────
function getWizardState(state: AppViewState): { active: boolean; step: AgentCreateStep; form: AgentCreateForm } {
  const s = state as any;
  if (!s._consoleWizardForm) {
    s._consoleWizardForm = {
      name: "",
      description: "",
      model: "sonnet" as const,
      selectedApps: new Set<string>(),
      actionPolicy: "full" as const,
      budget: "5",
      maxSteps: "100",
      memory: "persistent" as const,
    };
  }
  return {
    active: s._consoleWizardActive ?? false,
    step: (s._consoleWizardStep as AgentCreateStep) ?? 1,
    form: s._consoleWizardForm as AgentCreateForm,
  };
}

function openWizard(state: AppViewState) {
  const s = state as any;
  s._consoleWizardActive = true;
  s._consoleWizardStep = 1;
  s._consoleWizardForm = {
    name: "",
    description: "",
    model: "sonnet",
    selectedApps: new Set<string>(),
    actionPolicy: "full",
    budget: "5",
    maxSteps: "100",
    memory: "persistent",
  };
  s.tab = "__console_force__";
  state.setTab("agents" as any);
}

function closeWizard(state: AppViewState) {
  (state as any)._consoleWizardActive = false;
  (state as any).tab = "__console_force__";
  state.setTab("agents" as any);
}

// ─── Extended tab type (adds settings) ───────────────────────────────
type ConsoleActiveView = ConsoleTab | "settings";

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

const IDENTITY_SUBTABS = new Set<IdentityPageProps["subTab"]>([
  "entities",
  "contacts",
  "channels",
  "groups",
  "policies",
  "merges",
]);

function identityBasePath(state: AppViewState): string {
  const base = consoleBasePath(state);
  return `${base}/identity`;
}

function consoleBasePath(state: AppViewState): string {
  const explicit = normalizeBasePath((state as any).basePath ?? "");
  if (explicit) {
    return explicit;
  }
  if (typeof window !== "undefined") {
    return inferBasePathFromPathname(window.location.pathname);
  }
  return "";
}

function pathForConsoleTab(state: AppViewState, tab: ConsoleActiveView): string {
  const base = consoleBasePath(state);
  const segment = tab === "settings" ? "settings" : tab;
  return `${base}/${segment}`;
}

function resolveConsoleRouteFromLocation(state: AppViewState): ConsoleActiveView | null {
  if (typeof window === "undefined") {
    return null;
  }
  const url = new URL(window.location.href);
  const base = consoleBasePath(state);
  let pathname = url.pathname;
  if (base && pathname.startsWith(base)) {
    pathname = pathname.slice(base.length) || "/";
  }
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.trim().toLowerCase());

  const head = segments[0];
  const legacyView = url.searchParams.get("view")?.trim().toLowerCase() ?? "";
  switch (head) {
    case undefined:
    case "":
    case "chat":
    case "home":
    case "console":
    case "connectors":
    case "integrations":
      if (legacyView === "records") {
        return "records";
      }
      return "connectors";
    case "agents":
      return "agents";
    case "monitor":
    case "system":
      if (legacyView === "settings") {
        return "settings";
      }
      return "monitor";
    case "jobs":
    case "operations":
      return "jobs";
    case "records":
      return "records";
    case "identity":
      return "identity";
    case "memory":
      return "memory";
    case "settings":
      return "settings";
    default:
      return null;
  }
}

function ensureConsoleRoute(state: AppViewState, tab: ConsoleActiveView) {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  const canonicalPath = tab === "identity"
    ? url.pathname
    : pathForConsoleTab(state, tab);
  let dirty = false;
  if (url.pathname !== canonicalPath) {
    url.pathname = canonicalPath;
    dirty = true;
  }
  if (url.searchParams.has("view")) {
    url.searchParams.delete("view");
    dirty = true;
  }
  if (url.searchParams.has("group")) {
    url.searchParams.delete("group");
    dirty = true;
  }
  if (url.searchParams.has("entity")) {
    url.searchParams.delete("entity");
    dirty = true;
  }
  if (tab !== "memory") {
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("memory_")) {
        url.searchParams.delete(key);
        dirty = true;
      }
    }
  }
  if (dirty) {
    window.history.replaceState({}, "", url.toString());
  }
}

function pathForIdentitySubTab(state: AppViewState, subTab: IdentityPageProps["subTab"]) {
  const root = identityBasePath(state);
  switch (subTab) {
    case "contacts":
      return `${root}/contacts`;
    case "channels":
      return `${root}/channels`;
    case "groups":
      return `${root}/groups`;
    case "policies":
      return `${root}/policies`;
    case "merges":
      return `${root}/merges`;
    case "entities":
    default:
      return root;
  }
}

function resolveIdentityRouteFromLocation(state: AppViewState): {
  subTab: IdentityPageProps["subTab"];
  entityId: string | null;
  groupId: string | null;
} {
  const fallbackSubTab =
    (state as any)._consoleIdentitySubTab ?? "entities";
  if (typeof window === "undefined") {
    return {
      subTab: fallbackSubTab,
      entityId: null,
      groupId: null,
    };
  }

  const url = new URL(window.location.href);
  const base = normalizeBasePath((state as any).basePath ?? "");
  let pathname = url.pathname;
  if (base && pathname.startsWith(base)) {
    pathname = pathname.slice(base.length) || "/";
  }
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.trim());

  let subTab: IdentityPageProps["subTab"] = fallbackSubTab;
  let entityId: string | null = null;
  let groupIdFromPath: string | null = null;
  if (segments[0] === "identity") {
    if (segments[1] === "entity" && segments[2]) {
      subTab = "entities";
      entityId = decodeURIComponent(segments.slice(2).join("/"));
    } else if (segments[1] === "groups" && segments[2]) {
      subTab = "groups";
      groupIdFromPath = decodeURIComponent(segments.slice(2).join("/"));
    } else {
      const next = segments[1]?.toLowerCase();
      if (next && IDENTITY_SUBTABS.has(next as IdentityPageProps["subTab"])) {
        subTab = next as IdentityPageProps["subTab"];
      } else {
        subTab = "entities";
      }
    }
  }

  const groupId = subTab === "groups" ? groupIdFromPath : null;

  return { subTab, entityId, groupId };
}

function syncIdentityRouteState(
  state: AppViewState,
  subTab: IdentityPageProps["subTab"],
  opts?: { entityId?: string | null; groupId?: string | null },
) {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  url.pathname =
    subTab === "entities" && opts?.entityId?.trim()
      ? `${pathForIdentitySubTab(state, "entities")}/entity/${encodeURIComponent(opts.entityId.trim())}`
      : subTab === "groups" && opts?.groupId?.trim()
        ? `${pathForIdentitySubTab(state, "groups")}/${encodeURIComponent(opts.groupId.trim())}`
        : pathForIdentitySubTab(state, subTab);

  url.searchParams.delete("view");
  url.searchParams.delete("entity");
  url.searchParams.delete("group");
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("memory_")) {
      url.searchParams.delete(key);
    }
  }

  window.history.replaceState({}, "", url.toString());
}

function ensureIdentityDetailFromLocation(state: AppViewState) {
  if (typeof window === "undefined" || !state.connected) {
    return;
  }
  const { entityId, groupId } = resolveIdentityRouteFromLocation(state);

  if (entityId && state.identitySelectedEntityId !== entityId && (state as any)._consoleIdentityPendingEntityId !== entityId) {
    (state as any)._consoleIdentityPendingEntityId = entityId;
    void loadIdentityEntityDetail(state as any, entityId).finally(() => {
      if ((state as any)._consoleIdentityPendingEntityId === entityId) {
        (state as any)._consoleIdentityPendingEntityId = null;
      }
    });
  }

  if (groupId && state.identitySelectedGroupId !== groupId && (state as any)._consoleIdentityPendingGroupId !== groupId) {
    (state as any)._consoleIdentityPendingGroupId = groupId;
    void loadIdentityGroupDetail(state as any, groupId).finally(() => {
      if ((state as any)._consoleIdentityPendingGroupId === groupId) {
        (state as any)._consoleIdentityPendingGroupId = null;
      }
    });
  }
}

function resolveConsoleTab(state: AppViewState): ConsoleActiveView {
  const t = (state as any).consoleTab as ConsoleActiveView | undefined;
  if (t) return t;
  const explicit = resolveConsoleRouteFromLocation(state);
  if (explicit) {
    return explicit;
  }
  return consoleTabFromLegacy(state.tab);
}

function legacyTabFor(tab: ConsoleActiveView): string {
  switch (tab) {
    case "connectors": return "integrations";
    case "agents": return "agents";
    case "monitor": return "system";
    case "jobs": return "operations";
    case "records": return "integrations";
    case "identity": return "identity";
    case "memory": return "memory";
    case "settings": return "system";
    default: return "integrations";
  }
}

function syncConsoleRoute(state: AppViewState, tab: ConsoleActiveView) {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  url.pathname = pathForConsoleTab(state, tab);
  url.searchParams.delete("view");
  if (tab !== "identity") {
    url.searchParams.delete("group");
  }
  window.history.replaceState({}, "", url.toString());
}

function setConsoleTab(state: AppViewState, tab: ConsoleActiveView) {
  (state as any).consoleTab = tab;
  const legacyTab = legacyTabFor(tab);
  if (state.tab === legacyTab) {
    (state as any).tab = "__console_force__";
  }
  state.setTab(legacyTab as any);
  syncConsoleRoute(state, tab);
}

// ─── Nav tab button ──────────────────────────────────────────────────
function renderNavTab(state: AppViewState, tab: ConsoleTab, activeTab: ConsoleActiveView) {
  return html`
    <button
      class="console-nav-tab ${tab === activeTab ? "console-nav-tab--active" : ""}"
      @click=${() => setConsoleTab(state, tab)}
    >
      ${icons[consoleIconForTab(tab)] ?? nothing}
      ${consoleTitleForTab(tab)}
    </button>
  `;
}

// ─── Notifications panel ─────────────────────────────────────────────
function renderNotificationsPanel(state: AppViewState) {
  const open = (state as any).consoleNotificationsOpen ?? false;
  if (!open) return nothing;
  const close = () => { (state as any).consoleNotificationsOpen = false; (state as any).tab = "__console_force__"; state.setTab(legacyTabFor(resolveConsoleTab(state)) as any); };
  return html`
    <div class="console-notifications-panel console-notifications-panel--open">
      <div class="console-notifications-header">
        <span class="console-notifications-title">Notifications</span>
        <button class="console-icon-btn" @click=${close}>${chromeIcons.x}</button>
      </div>
      <div class="console-notifications-body">
        ${chromeIcons.bell}
        <div>No notifications yet</div>
      </div>
    </div>
  `;
}

// ─── Settings page (rendered inline under nav, not overlay) ──────────
type SettingsSubPage = "profile" | "api-keys" | "auth";

function resolveSettingsSub(state: AppViewState): SettingsSubPage {
  const raw = (state as any).consoleSettingsSub as string;
  // Redirect removed pages to profile
  if (raw === "billing" || raw === "usage" || raw === "invoices") return "profile";
  return (raw as SettingsSubPage) ?? "profile";
}

function setSettingsSub(state: AppViewState, sub: SettingsSubPage) {
  (state as any).consoleSettingsSub = sub;
  // Force re-render
  (state as any).tab = "__console_force__";
  state.setTab("system" as any);
}

function renderSettingsSidebar(state: AppViewState, activeSub: SettingsSubPage) {
  const item = (sub: SettingsSubPage, icon: any, label: string) => html`
    <button
      class="console-dropdown-item ${activeSub === sub ? "console-dropdown-item--active" : ""}"
      @click=${() => setSettingsSub(state, sub)}
    >${icon} ${label}</button>
  `;
  return html`
    <aside class="console-settings-sidebar-inline">
      <div>
        <div class="console-section-label">Server</div>
        ${item("profile", chromeIcons.user, "Profile")}
        ${item("api-keys", chromeIcons.key, "API Keys")}
        ${item("auth", chromeIcons.shield, "Auth")}
      </div>
    </aside>
  `;
}

function renderSettingsContent(sub: SettingsSubPage, state?: AppViewState) {
  // Resolve identity from runtime state
  const hello = state?.connected ? (state as any).hello as { snapshot?: any; session?: any } | null : null;
  const snapshot = hello?.snapshot ?? {};
  const sessionInfo = hello?.session ?? {};
  const userName = sessionInfo?.name ?? sessionInfo?.displayName ?? snapshot?.operatorName ?? "Unknown User";
  const userEmail = sessionInfo?.email ?? snapshot?.operatorEmail ?? "Not connected";
  const userRole = sessionInfo?.role ?? (state?.connected ? "Operator" : "Disconnected");
  const userInitial = userName.charAt(0).toUpperCase();
  const serverName = snapshot?.serverName ?? snapshot?.name ?? "Primary";
  const uptime = snapshot?.uptimeMs ? formatUptime(snapshot.uptimeMs) : "n/a";
  const isConnected = state?.connected ?? false;

  switch (sub) {
    case "profile":
      return html`
        <div style="margin-bottom: var(--console-space-5);">
          <div class="console-page-title" style="font-size: var(--console-text-xl);">Profile</div>
          <div class="console-page-subtitle">Your identity and permissions on this server.</div>
        </div>
        <div class="console-card" style="margin-bottom: var(--console-space-4);">
          <div class="console-row" style="gap: var(--console-space-4); align-items: center;">
            <div class="console-avatar" style="width: 48px; height: 48px; font-size: 18px;"><span>${userInitial}</span></div>
            <div>
              <div class="console-strong" style="font-size: var(--console-text-base);">${userName}</div>
              <div class="console-muted" style="font-size: var(--console-text-xs);">${userEmail}</div>
            </div>
            <div style="margin-left: auto;">
              <span class="console-badge ${isConnected ? "console-badge--success" : "console-badge--neutral"}">${userRole}</span>
            </div>
          </div>
        </div>
        <div class="console-section-label" style="margin-bottom: var(--console-space-3);">Server Permissions</div>
        <div class="console-card">
          <div class="console-grid-2" style="gap: var(--console-space-4);">
            <div>
              <div class="console-label">Role</div>
              <div class="console-strong">${userRole}${isConnected ? " (Full Access)" : ""}</div>
            </div>
            <div>
              <div class="console-label">Server</div>
              <div class="console-strong">${serverName}</div>
            </div>
            <div>
              <div class="console-label">Agents</div>
              <div class="console-muted" style="font-size: var(--console-text-xs);">Create, configure, delete</div>
            </div>
            <div>
              <div class="console-label">Integrations</div>
              <div class="console-muted" style="font-size: var(--console-text-xs);">Connect, disconnect, configure</div>
            </div>
            <div>
              <div class="console-label">Identity</div>
              <div class="console-muted" style="font-size: var(--console-text-xs);">Resolve merges, manage policies</div>
            </div>
            <div>
              <div class="console-label">System</div>
              <div class="console-muted" style="font-size: var(--console-text-xs);">Full runtime access, config, debug</div>
            </div>
          </div>
        </div>
      `;
    case "api-keys":
      return html`
        <div class="console-row-between" style="margin-bottom: var(--console-space-5);">
          <div>
            <div class="console-page-title" style="font-size: var(--console-text-xl);">API Keys</div>
            <div class="console-page-subtitle">These keys allow you to authenticate API requests to this server.</div>
          </div>
          <button class="console-btn console-btn--primary">+ Create API Key</button>
        </div>
        <div class="console-card">
          <div class="console-empty">
            <div class="console-empty-icon">${chromeIcons.key}</div>
            <div class="console-empty-title">No API keys yet</div>
            <div class="console-empty-description">Create your first API key to get started.</div>
          </div>
        </div>
      `;
    case "auth":
      return html`
        <div>
          <div class="console-page-title" style="font-size: var(--console-text-xl);">Auth</div>
          <div class="console-page-subtitle" style="margin-bottom: var(--console-space-5);">Manage connection credentials and OAuth settings.</div>
        </div>
        <div class="console-filter-bar">
          <div class="console-search-wrap">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input class="console-search-input" type="text" placeholder="Search connections..." />
          </div>
        </div>
        <div class="console-card">
          <div class="console-muted" style="padding: var(--console-space-4); text-align: center; font-size: var(--console-text-xs);">
            Connection auth management will be connected to the runtime adapter list.
          </div>
        </div>
      `;
    default:
      return nothing;
  }
}

function renderSettingsPage(state: AppViewState) {
  const sub = resolveSettingsSub(state);
  return html`
    <div class="console-settings-page">
      ${renderSettingsSidebar(state, sub)}
      <div class="console-settings-page-content">
        ${renderSettingsContent(sub, state)}
      </div>
    </div>
  `;
}

// ─── Main render ─────────────────────────────────────────────────────
export function renderConsoleApp(state: AppViewState) {
  const activeTab = resolveConsoleTab(state);
  const basePath = (state as any).basePath ?? "";
  const isSettings = activeTab === "settings";
  const isAgentDetail = activeTab === "agents" && !getWizardState(state).active && !!(state as any)._consoleAgentDetailId;
  ensureConsoleRoute(state, activeTab);
  if (activeTab === "identity") {
    ensureIdentityDetailFromLocation(state);
  }

  return html`
    <div class="console-shell" data-console-theme="${state.themeResolved === "dark" ? "dark" : "light"}">
      <!-- ═══ TOP NAV (app-level chrome) ═══ -->
      <nav class="console-topnav">
        <div class="console-topnav-left">
          <div class="console-logo" @click=${() => setConsoleTab(state, "connectors")} style="cursor: pointer;">
            <div class="console-logo-mark">
              <img src="${basePath ? `${basePath}/favicon.svg` : "/favicon.svg"}" alt="" />
            </div>
            <span class="console-logo-text">nexus</span>
          </div>
        </div>

        <div class="console-topnav-center">
          ${CONSOLE_PRIMARY_TABS.map((tab) => renderNavTab(state, tab, activeTab))}
          <div class="console-nav-sep"></div>
          ${CONSOLE_SECONDARY_TABS.map((tab) => renderNavTab(state, tab, activeTab))}
        </div>

        <div class="console-topnav-right">
          <div class="console-env-toggle">
            <span>Production</span>
            <div class="console-env-toggle-switch"></div>
          </div>

          <div class="console-divider-v"></div>

          <button class="console-icon-btn" title="Command palette">${chromeIcons.command}</button>
          <button class="console-icon-btn" title="Notifications" @click=${() => {
            (state as any).consoleNotificationsOpen = !(state as any).consoleNotificationsOpen;
            (state as any).tab = "__console_force__";
            state.setTab(legacyTabFor(activeTab === "settings" ? "connectors" : activeTab as ConsoleTab) as any);
          }}>${chromeIcons.bell}</button>
          <button class="console-icon-btn ${isSettings ? "console-icon-btn--active" : ""}" title="Settings" @click=${() => setConsoleTab(state, "settings")}>${icons.settings}</button>
        </div>
      </nav>

      <!-- ═══ MAIN CONTENT ═══ -->
      <main class="console-main ${isSettings ? "console-main--settings" : ""} ${isAgentDetail ? "console-main--agent-detail" : ""}">
        ${activeTab === "connectors" ? renderIntegrations({
          connected: state.connected,
          loading: state.integrationsLoading,
          busyAdapter: state.integrationsBusyAdapter,
          busyAction: state.integrationsBusyAction,
          error: state.integrationsError,
          message: state.integrationsMessage,
          adapters: state.integrationsAdapters,
          selectedAdapter: state.integrationsSelectedAdapter,
          sessionId: state.integrationsSessionId,
          payloadText: state.integrationsPayloadText,
          pendingFields: state.integrationsPendingFields,
          instructions: state.integrationsInstructions,
          onRefresh: () => void loadIntegrations(state as any),
          onSelectAdapter: (adapter) => setIntegrationsSelectedAdapter(state as any, adapter),
          onPayloadChange: (payloadText) => setIntegrationsPayloadText(state as any, payloadText),
          onOAuthStart: (adapter) => void startIntegrationOAuth(state as any, adapter),
          onCustomStart: (adapter) => void startIntegrationCustomFlow(state as any, adapter),
          onCustomSubmit: (adapter) => void submitIntegrationCustomFlow(state as any, adapter),
          onCustomStatus: (adapter) => void checkIntegrationCustomFlow(state as any, adapter),
          onCustomCancel: (adapter) => void cancelIntegrationCustomFlow(state as any, adapter),
          onTest: (adapter) => void testIntegrationAdapter(state as any, adapter),
          onBackfill: (adapter) => void backfillIntegrationAdapter(state as any, adapter),
          onLivesyncToggle: (adapter, enabled) => void setIntegrationLivesync(state as any, adapter, enabled),
          onDisconnect: (adapter) => void disconnectIntegrationAdapter(state as any, adapter),
        }) : nothing}

        ${activeTab === "agents"
          ? (() => {
              const wiz = getWizardState(state);
              if (wiz.active) {
                return renderAgentCreateWizard({
                  step: wiz.step,
                  form: wiz.form,
                  adapters: state.integrationsAdapters,
                  onStepChange: (step) => { (state as any)._consoleWizardStep = step; (state as any).tab = "__console_force__"; state.setTab("agents" as any); },
                  onFormChange: (patch) => { Object.assign(wiz.form, patch); (state as any).tab = "__console_force__"; state.setTab("agents" as any); },
                  onAppToggle: (adapter) => {
                    if (wiz.form.selectedApps.has(adapter)) wiz.form.selectedApps.delete(adapter);
                    else wiz.form.selectedApps.add(adapter);
                    (state as any).tab = "__console_force__"; state.setTab("agents" as any);
                  },
                  onCancel: () => closeWizard(state),
                  onCreate: async () => {
                    const form = wiz.form;
                    const agentId = await createAgent(state as any, {
                      name: form.name,
                      workspace: deriveAgentWorkspaceBindingId(form.name),
                    });
                    if (agentId) {
                      (state as any)._consoleAgentDetailId = agentId;
                      closeWizard(state);
                    }
                  },
                });
              }
              // Check if we're viewing an agent detail
              const selectedAgent = (state as any)._consoleAgentDetailId as string | null;
              if (selectedAgent) {
                const detailTab = ((state as any)._consoleAgentDetailTab as AgentDetailTab) ?? "settings";
                // Build chat props from existing state if connected
                const chatProps = state.connected ? {
                  conversationId: state.conversationId,
                  onConversationIdChange: () => {},
                  thinkingLevel: state.chatThinkingLevel,
                  showThinking: state.settings.chatShowThinking,
                  loading: state.chatLoading,
                  sending: state.chatSending,
                  messages: state.chatMessages,
                  toolMessages: state.chatToolMessages,
                  draft: state.chatMessage,
                  queue: state.chatQueue,
                  connected: state.connected,
                  canSend: state.connected,
                  disabledReason: state.connected ? null : "Disconnected",
                  error: state.lastError,
                  conversations: state.conversationsResult,
                  sessions: state.sessionsResult,
                  focusMode: false,
                  assistantName: state.assistantName || "Agent",
                  assistantAvatar: state.assistantAvatar,
                  onRefresh: () => {},
                  onToggleFocusMode: () => {},
                  onDraftChange: (next: string) => { (state as any).chatMessage = next; },
                  onSend: () => state.handleSendChat(),
                  onAbort: () => void state.handleAbortChat(),
                  onQueueRemove: () => {},
                  onNewSession: () => state.handleSendChat("/new", { restoreDraft: true }),
                  onChatScroll: () => {},
                } as any : null;

                const activeModal = ((state as any)._consoleAgentModal as AgentDetailModal) ?? null;
                return renderAgentDetail({
                  agentId: selectedAgent,
                  agentsList: state.agentsList,
                  activeTab: detailTab,
                  activeModal,
                  chatProps,
                  onTabChange: (tab) => { (state as any)._consoleAgentDetailTab = tab; (state as any).tab = "__console_force__"; state.setTab("agents" as any); },
                  onModalChange: (modal) => { (state as any)._consoleAgentModal = modal; (state as any).tab = "__console_force__"; state.setTab("agents" as any); },
                  onBack: () => { (state as any)._consoleAgentDetailId = null; (state as any).tab = "__console_force__"; state.setTab("agents" as any); },
                });
              }
              return renderAgentsPage({
                loading: state.agentsLoading,
                error: state.agentsError,
                agentsList: state.agentsList,
                onSelectAgent: (agentId) => { (state as any)._consoleAgentDetailId = agentId; (state as any).tab = "__console_force__"; state.setTab("agents" as any); },
                onCreateAgent: () => openWizard(state),
                onRefresh: () => void loadAgents(state as any),
              });
            })()
          : nothing}

        ${activeTab === "monitor" ? renderMonitorPage({
          subTab: ((state as any)._consoleMonitorSubTab as MonitorPageProps["subTab"]) ?? "live",
          onSubTabChange: (tab: string) => {
            (state as any)._consoleMonitorSubTab = tab;
            if (tab === "history") {
              void loadMonitorHistory(state as any, {
                method: (state as any)._consoleMonitorMethodFilter || undefined,
                action: ((state as any)._consoleMonitorActionFilter && (state as any)._consoleMonitorActionFilter !== "all") ? (state as any)._consoleMonitorActionFilter : undefined,
                status: ((state as any)._consoleMonitorStatusFilter && (state as any)._consoleMonitorStatusFilter !== "all") ? (state as any)._consoleMonitorStatusFilter : undefined,
                limit: 50,
                offset: (state as any)._consoleMonitorHistoryOffset ?? 0,
              });
              void loadMonitorStats(state as any);
            }
            state.requestUpdate();
          },
          // Live
          liveOps: (state as any).monitorLiveOps ?? [],
          paused: (state as any).monitorPaused ?? false,
          onTogglePause: () => { (state as any).monitorPaused = !(state as any).monitorPaused; state.requestUpdate(); },
          onClear: () => { (state as any).monitorLiveOps = []; state.requestUpdate(); },
          // History
          historyOps: (state as any).monitorHistoryOps ?? [],
          historyTotal: (state as any).monitorHistoryTotal ?? 0,
          historyLoading: (state as any).monitorHistoryLoading ?? false,
          historyError: (state as any).monitorHistoryError ?? null,
          historyOffset: (state as any)._consoleMonitorHistoryOffset ?? 0,
          onHistoryPage: (offset: number) => {
            (state as any)._consoleMonitorHistoryOffset = offset;
            void loadMonitorHistory(state as any, {
              method: (state as any)._consoleMonitorMethodFilter || undefined,
              action: ((state as any)._consoleMonitorActionFilter && (state as any)._consoleMonitorActionFilter !== "all") ? (state as any)._consoleMonitorActionFilter : undefined,
              status: ((state as any)._consoleMonitorStatusFilter && (state as any)._consoleMonitorStatusFilter !== "all") ? (state as any)._consoleMonitorStatusFilter : undefined,
              limit: 50,
              offset,
            });
            state.requestUpdate();
          },
          onHistoryRefresh: () => {
            void loadMonitorHistory(state as any, {
              method: (state as any)._consoleMonitorMethodFilter || undefined,
              action: ((state as any)._consoleMonitorActionFilter && (state as any)._consoleMonitorActionFilter !== "all") ? (state as any)._consoleMonitorActionFilter : undefined,
              status: ((state as any)._consoleMonitorStatusFilter && (state as any)._consoleMonitorStatusFilter !== "all") ? (state as any)._consoleMonitorStatusFilter : undefined,
              limit: 50,
              offset: (state as any)._consoleMonitorHistoryOffset ?? 0,
            });
            void loadMonitorStats(state as any);
            state.requestUpdate();
          },
          // Filters
          methodFilter: (state as any)._consoleMonitorMethodFilter ?? "",
          actionFilter: (state as any)._consoleMonitorActionFilter ?? "all",
          statusFilter: (state as any)._consoleMonitorStatusFilter ?? "all",
          onMethodFilterChange: (v: string) => { (state as any)._consoleMonitorMethodFilter = v; state.requestUpdate(); },
          onActionFilterChange: (v: string) => { (state as any)._consoleMonitorActionFilter = v; state.requestUpdate(); },
          onStatusFilterChange: (v: string) => { (state as any)._consoleMonitorStatusFilter = v; state.requestUpdate(); },
          // Stats
          stats: (state as any).monitorStats ?? null,
        }) : nothing}

        ${activeTab === "jobs" ? renderJobsPage({
          subTab: ((state as any)._consoleJobsSubTab as JobsPageProps["subTab"]) ?? "overview",
          onSubTabChange: (tab: string) => { (state as any)._consoleJobsSubTab = tab; state.requestUpdate(); },
          definitions: (state.scheduleJobDefinitions ?? []).map((job) => ({
            id: job.id,
            name: job.name,
            description: job.description ?? "",
            createdAt: Date.parse(job.created_at),
          })),
          definitionsLoading: state.scheduleLoading,
          queueItems: (state.scheduleQueueEntries ?? []).map((entry: any) => ({
            id: entry.id ?? "",
            jobId: entry.job_definition_id ?? "",
            state: entry.queue_status ?? "unknown",
            priority: entry.attempt_count ?? 0,
            queuedAt: entry.created_at ? Date.parse(entry.created_at) : Date.now(),
            leasedUntil: entry.lease_expires_at ? Date.parse(entry.lease_expires_at) : undefined,
            attempts: entry.attempt_count ?? 0,
          })),
          queueLoading: state.scheduleLoading,
          queueFilter: (state as any)._consoleJobsQueueFilter ?? "all",
          onQueueFilterChange: (f: string) => { (state as any)._consoleJobsQueueFilter = f; state.requestUpdate(); },
          runs: (state.scheduleRuns ?? []).map((r: any) => ({
            id: r.id ?? r.runId ?? "",
            jobId: r.job_definition_id ?? r.jobId ?? "",
            trigger: r.trigger_source ?? r.trigger ?? "schedule",
            status: r.status ?? "unknown",
            startedAt: r.started_at ? Date.parse(r.started_at) : (r.startedAt ?? r.startedAtMs ?? Date.now()),
            durationMs: r.duration_ms ?? r.durationMs,
            output: r.output,
          })),
          runsLoading: state.scheduleLoading,
          schedules: state.scheduleJobs.map((j: any) => ({
            id: j.id ?? "",
            name: j.name ?? j.job_name ?? j.id ?? "",
            jobId: j.job_definition_id ?? j.jobDefinitionId ?? j.jobId ?? "",
            cron: j.expression ?? j.cron ?? "",
            nextRunAt: j.next_run_at ? Date.parse(j.next_run_at) : j.nextRunAtMs,
            lastRunAt: j.last_run_at ? Date.parse(j.last_run_at) : j.lastRunAtMs,
            enabled: Boolean(j.enabled),
          })),
          schedulesLoading: state.scheduleLoading,
          onScheduleToggle: (id: string, enabled: boolean) => {
            const job = state.scheduleJobs.find((j: any) => j.id === id);
            if (job) { import("../ui/controllers/schedules.ts").then(m => m.toggleScheduleJob(state as any, job, enabled)); }
          },
          onScheduleRun: (id: string) => {
            const job = state.scheduleJobs.find((j: any) => j.id === id);
            if (job) { import("../ui/controllers/schedules.ts").then(m => m.runScheduleJob(state as any, job)); }
          },
          onScheduleRemove: (id: string) => {
            const job = state.scheduleJobs.find((j: any) => j.id === id);
            if (job) { import("../ui/controllers/schedules.ts").then(m => m.removeScheduleJob(state as any, job)); }
          },
          onNewSchedule: () => { /* TODO: open schedule template modal */ },
          onRefresh: () => { void loadScheduleJobs(state as any); },
        }) : nothing}

        ${activeTab === "records" ? renderRecordsPage({
          subTab: ((state as any)._consoleRecordsSubTab as RecordsPageProps["subTab"]) ?? "browse",
          onSubTabChange: (tab: string) => {
            (state as any)._consoleRecordsSubTab = tab;
            state.requestUpdate();
            if (tab === "browse" || tab === "channels") {
              void refreshRecordsSurface(state as any);
            }
          },
          records: (state.recordsItems ?? []).map((record: any) => ({
            id: record.id ?? "",
            platform: record.platform ?? "unknown",
            channel: record.thread_id ?? record.container_id ?? record.sender_contact_id ?? "unknown",
            recordId: record.record_id ?? record.id ?? "",
            type: record.content_type ?? "unknown",
            preview:
              record.content?.trim() ||
              record.attachments?.[0]?.filename ||
              record.metadata?.sender_name ||
              "Attachment",
            payload: record,
            timestamp: record.timestamp ?? record.received_at ?? Date.now(),
          })),
          recordsLoading: state.recordsLoading ?? false,
          recordsOffset: state.recordsOffset ?? 0,
          recordsLimit: state.recordsLimit ?? 50,
          recordsHasMore: state.recordsHasMore ?? false,
          platformFilter: state.recordsPlatformFilter ?? "",
          onPlatformFilterChange: (platform: string) => {
            state.recordsPlatformFilter = platform;
            void refreshRecordsSurface(state as any);
          },
          onRecordsPage: (offset: number) => { void loadRecords(state as any, offset); },
          expandedRecordId: (state as any)._consoleRecordsExpanded ?? null,
          onRecordExpand: (id: string | null) => { (state as any)._consoleRecordsExpanded = id; state.requestUpdate(); },
          channels: (state.recordsChannels ?? []).map((channel: any) => ({
            id: channel.id ?? "",
            platform: channel.platform ?? "unknown",
            connectionId: channel.connection_id ?? "",
            container: channel.container_name ?? channel.container_id ?? "",
            thread: channel.thread_name ?? channel.thread_id ?? "",
            createdAt: channel.created_at ?? Date.now(),
          })),
          channelsLoading: state.recordsChannelsLoading ?? false,
          onChannelSelect: (channelId: string) => {
            const channel = (state.recordsChannels ?? []).find((entry: any) => entry.id === channelId);
            if (!channel) {
              return;
            }
            state.recordsPlatformFilter = channel.platform ?? "";
            void loadRecords(state as any, 0);
          },
          searchQuery: state.recordsSearchQuery ?? "",
          searchType: state.recordsSearchPlatform ?? "",
          searchResults: (state.recordsSearchResults ?? null)?.map((record: any) => ({
            id: record.id ?? "",
            platform: record.platform ?? "unknown",
            channel: record.thread_id ?? record.container_id ?? record.sender_contact_id ?? "unknown",
            recordId: record.record_id ?? record.id ?? "",
            type: record.content_type ?? "unknown",
            preview:
              record.content?.trim() ||
              record.attachments?.[0]?.filename ||
              record.metadata?.sender_name ||
              "Attachment",
            timestamp: record.timestamp ?? record.received_at ?? Date.now(),
          })) ?? null,
          searchLoading: state.recordsSearchLoading ?? false,
          onSearchQueryChange: (q: string) => { state.recordsSearchQuery = q; state.requestUpdate(); },
          onSearchTypeChange: (t: string) => { state.recordsSearchPlatform = t; state.requestUpdate(); },
          onSearch: () => { void searchRecords(state as any); },
          onRefresh: () => { void refreshRecordsSurface(state as any); },
        }) : nothing}

        ${activeTab === "settings" ? renderSettingsPage(state) : nothing}

        ${activeTab === "identity" ? renderIdentityPage({
          subTab: resolveIdentityRouteFromLocation(state).subTab,
          onSubTabChange: (sub) => {
            (state as any)._consoleIdentitySubTab = sub;
            if (sub !== "entities") {
              clearIdentityEntityDetail(state as any);
            }
            if (sub !== "groups") {
              clearIdentityGroupDetail(state as any);
            }
            syncIdentityRouteState(state, sub, {
              entityId: sub === "entities" ? state.identitySelectedEntityId ?? null : null,
              groupId: sub === "groups" ? state.identitySelectedGroupId ?? null : null,
            });
            state.requestUpdate();
          },
          loading: state.identityLoading ?? false,
          error: state.identityError ?? null,
          entityRouteMode: !!resolveIdentityRouteFromLocation(state).entityId,
          groupRouteMode: !!resolveIdentityRouteFromLocation(state).groupId,
          onBackToEntities: () => {
            syncIdentityRouteState(state, "entities", { entityId: null, groupId: null });
            clearIdentityEntityDetail(state as any);
          },
          onBackToGroups: () => {
            syncIdentityRouteState(state, "groups", { entityId: null, groupId: null });
            clearIdentityGroupDetail(state as any);
          },
          entities: (state.identityEntities ?? []),
          selectedEntityId: state.identitySelectedEntityId ?? null,
          selectedEntity: state.identitySelectedEntity ?? null,
          selectedEntityContacts: state.identitySelectedEntityContacts ?? [],
          entityDetailLoading: state.identityEntityDetailLoading ?? false,
          onEntitySelect: (id) => {
            (state as any)._consoleIdentitySubTab = "entities";
            syncIdentityRouteState(state, "entities", { entityId: id, groupId: null });
            void loadIdentityEntityDetail(state as any, id);
          },
          onEntityClear: () => {
            syncIdentityRouteState(state, "entities", { entityId: null, groupId: null });
            clearIdentityEntityDetail(state as any);
          },
          contacts: (state as any).identityContacts ?? [],
          channels: (state as any).identityChannels ?? [],
          groups: (state as any).identityGroups ?? [],
          selectedGroupId: state.identitySelectedGroupId ?? null,
          selectedGroup: state.identitySelectedGroup ?? null,
          groupMembers: state.identityGroupMembers ?? [],
          groupDetailLoading: state.identityGroupDetailLoading ?? false,
          onGroupSelect: (id) => {
            (state as any)._consoleIdentitySubTab = "groups";
            syncIdentityRouteState(state, "groups", { entityId: null, groupId: id });
            void loadIdentityGroupDetail(state as any, id);
          },
          onGroupClear: () => {
            syncIdentityRouteState(state, "groups", { entityId: null, groupId: null });
            clearIdentityGroupDetail(state as any);
          },
          policies: (state as any).identityPolicies ?? [],
          mergeCandidates: state.identityMergeCandidates ?? [],
          mergeBusyId: state.identityMergeBusyId ?? null,
          onResolveMerge: (id, status) => {
            void resolveIdentityMergeCandidate(state, id, status);
          },
          onRefresh: () => {
            void (async () => {
              await loadIdentitySurface(state as any);
              if (state.identitySelectedEntityId) {
                await loadIdentityEntityDetail(state as any, state.identitySelectedEntityId);
              }
              if (state.identitySelectedGroupId) {
                await loadIdentityGroupDetail(state as any, state.identitySelectedGroupId);
              }
            })();
          },
        } as IdentityPageProps) : nothing}

        ${activeTab === "memory" ? renderMemoryPage({
          subTab: (state as any)._consoleMemorySubTab ?? "library",
          onSubTabChange: (sub) => {
            (state as any)._consoleMemorySubTab = sub;
            if (sub === "quality") {
              void loadMemoryQualitySummary(state as any, { loadItems: true });
            } else if (
              sub === "search" &&
              !(state as any).memorySearchLoading &&
              !(state as any).memorySearchResult
            ) {
              void runMemorySearch(state as any);
            } else if (
              sub === "library" &&
              !(state as any).memoryLoading &&
              (!Array.isArray((state as any).memoryRuns) || (state as any).memoryRuns.length === 0)
            ) {
              void loadMemoryRuns(state as any);
            }
            state.requestUpdate();
          },
          loading: (state as any).memoryLoading ?? false,
          error: (state as any).memoryError ?? null,
          runs: (state as any).memoryRuns ?? [],
          selectedRunId: (state as any).memorySelectedRunId ?? null,
          onRunSelect: (runId) => {
            (state as any).memorySelectedRunId = runId;
            void loadMemoryRunEpisodes(state as any, runId);
          },
          episodes: (state as any).memoryEpisodes ?? [],
          episodesLoading: (state as any).memoryEpisodesLoading ?? false,
          selectedEpisodeId: (state as any).memorySelectedEpisodeId ?? null,
          onEpisodeSelect: (episodeId) => {
            (state as any).memorySelectedEpisodeId = episodeId;
            void loadMemoryEpisodeInspector(state as any, episodeId);
          },
          inspectorLoading: (state as any).memoryInspectorLoading ?? false,
          episodeDetail: (state as any).memoryEpisodeDetail ?? null,
          searchQuery: (state as any).memorySearchQuery ?? "",
          searchType: (state as any).memorySearchType ?? "all",
          searchLoading: (state as any).memorySearchLoading ?? false,
          searchResults: flattenMemorySearchResult((state as any).memorySearchResult ?? null),
          onSearchQueryChange: (q) => { (state as any).memorySearchQuery = q; },
          onSearchTypeChange: (t) => { (state as any).memorySearchType = t; },
          onSearch: () => {
            void runMemorySearch(state as any);
          },
          qualityScope: (state as any).memoryQualityScope ?? "run",
          qualityLoading: (state as any).memoryQualityLoading ?? false,
          qualitySummary: (state as any).memoryQualitySummary ?? null,
          qualityItemsLoading: (state as any).memoryQualityItemsLoading ?? false,
          qualityBucket: (state as any).memoryQualityBucket ?? "unconsolidated_facts",
          qualityItems: (state as any).memoryQualityItems ?? null,
          onQualityScopeChange: (scope) => {
            (state as any).memoryQualityScope = scope;
            (state as any).memoryQualityItemsOffset = 0;
            void loadMemoryQualitySummary(state as any, { loadItems: true });
          },
          onQualityBucketSelect: (bucket) => {
            (state as any).memoryQualityBucket = bucket;
            (state as any).memoryQualityItemsOffset = 0;
            void loadMemoryQualityItems(state as any, bucket, { offset: 0 });
          },
          onQualityPage: (offset) => {
            (state as any).memoryQualityItemsOffset = Math.max(0, Math.trunc(offset));
            void loadMemoryQualityItems(state as any, (state as any).memoryQualityBucket, {
              offset: (state as any).memoryQualityItemsOffset,
            });
          },
          detailKind: (state as any).memoryDetailKind ?? null,
          detailLoading: (state as any).memoryDetailLoading ?? false,
          detailEntity: (state as any).memoryDetailEntity ?? null,
          detailFact: (state as any).memoryDetailFact ?? null,
          detailObservation: (state as any).memoryDetailObservation ?? null,
          onEntitySelect: (id) => {
            void loadMemoryEntityDetail(state as any, id);
          },
          onFactSelect: (id) => {
            void loadMemoryFactDetail(state as any, id);
          },
          onObservationSelect: (id) => {
            void loadMemoryObservationDetail(state as any, id);
          },
          onRefresh: () => {
            void loadMemoryRuns(state as any);
          },
        } as MemoryPageProps) : nothing}
      </main>

      <!-- ═══ OVERLAYS ═══ -->
      ${renderNotificationsPanel(state)}
    </div>
  `;
}
