import { html, nothing } from "lit";
import type { AppViewState } from "../ui/app-view-state.ts";
import { icons } from "../ui/icons.ts";
import { loadAgents, createAgent } from "../ui/controllers/agents.ts";
import { loadIntegrations } from "../ui/controllers/integrations.ts";
import { renderAppsPage as renderPluginsPage } from "./pages/apps.ts";
import { renderAgentsPage } from "./pages/agents.ts";
import { renderAgentCreateWizard, type AgentCreateStep, type AgentCreateForm } from "./pages/agent-create.ts";
import { renderAgentDetail, type AgentDetailTab, type AgentDetailModal } from "./pages/agent-detail.ts";
import { renderMonitorPage } from "./pages/monitor.ts";
import { renderIdentityPage, type IdentityPageProps } from "./pages/identity.ts";
import { renderMemoryPage, type MemoryPageProps } from "./pages/memory.ts";
import { V2_PRIMARY_TABS, V2_SECONDARY_TABS, v2IconForTab, v2TitleForTab, type V2Tab } from "./navigation.ts";
// User menu and workspace switcher available for future frontdoor integration
// import { renderUserMenuDropdown, renderWorkspaceSwitcher } from "./components/dropdowns.ts";

// ─── Inline SVG icons for v2 chrome ──────────────────────────────────
const v2 = {
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

// ─── Agent wizard state helpers ──────────────────────────────────────
function getWizardState(state: AppViewState): { active: boolean; step: AgentCreateStep; form: AgentCreateForm } {
  const s = state as any;
  if (!s._v2WizardForm) {
    s._v2WizardForm = {
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
    active: s._v2WizardActive ?? false,
    step: (s._v2WizardStep as AgentCreateStep) ?? 1,
    form: s._v2WizardForm as AgentCreateForm,
  };
}

function openWizard(state: AppViewState) {
  const s = state as any;
  s._v2WizardActive = true;
  s._v2WizardStep = 1;
  s._v2WizardForm = {
    name: "",
    description: "",
    model: "sonnet",
    selectedApps: new Set<string>(),
    actionPolicy: "full",
    budget: "5",
    maxSteps: "100",
    memory: "persistent",
  };
  s.tab = "__v2_force__";
  state.setTab("agents" as any);
}

function closeWizard(state: AppViewState) {
  (state as any)._v2WizardActive = false;
  (state as any).tab = "__v2_force__";
  state.setTab("agents" as any);
}

// ─── Extended tab type (adds settings) ───────────────────────────────
type V2ActiveView = V2Tab | "settings";

function resolveV2Tab(state: AppViewState): V2ActiveView {
  const t = (state as any).v2Tab as V2ActiveView | undefined;
  if (t) return t;
  switch (state.tab) {
    case "integrations": return "plugins";
    case "agents": return "agents";
    case "system": return "monitor";
    case "identity": return "identity";
    case "memory": return "memory";
    default: return "plugins";
  }
}

function legacyTabFor(tab: V2ActiveView): string {
  switch (tab) {
    case "plugins": return "integrations";
    case "agents": return "agents";
    case "monitor": return "system";
    case "identity": return "identity";
    case "memory": return "memory";
    case "settings": return "system";
    default: return "integrations";
  }
}

function setV2Tab(state: AppViewState, tab: V2ActiveView) {
  (state as any).v2Tab = tab;
  const legacyTab = legacyTabFor(tab);
  if (state.tab === legacyTab) {
    (state as any).tab = "__v2_force__";
  }
  state.setTab(legacyTab as any);
}

// ─── Nav tab button ──────────────────────────────────────────────────
function renderNavTab(state: AppViewState, tab: V2Tab, activeTab: V2ActiveView) {
  return html`
    <button
      class="v2-nav-tab ${tab === activeTab ? "v2-nav-tab--active" : ""}"
      @click=${() => setV2Tab(state, tab)}
    >
      ${icons[v2IconForTab(tab)] ?? nothing}
      ${v2TitleForTab(tab)}
    </button>
  `;
}

// ─── Notifications panel ─────────────────────────────────────────────
function renderNotificationsPanel(state: AppViewState) {
  const open = (state as any).v2NotificationsOpen ?? false;
  if (!open) return nothing;
  const close = () => { (state as any).v2NotificationsOpen = false; (state as any).tab = "__v2_force__"; state.setTab(legacyTabFor(resolveV2Tab(state)) as any); };
  return html`
    <div class="v2-notifications-panel v2-notifications-panel--open">
      <div class="v2-notifications-header">
        <span class="v2-notifications-title">Notifications</span>
        <button class="v2-icon-btn" @click=${close}>${v2.x}</button>
      </div>
      <div class="v2-notifications-body">
        ${v2.bell}
        <div>No notifications yet</div>
      </div>
    </div>
  `;
}

// ─── Settings page (rendered inline under nav, not overlay) ──────────
type SettingsSubPage = "profile" | "api-keys" | "auth";

function resolveSettingsSub(state: AppViewState): SettingsSubPage {
  const raw = (state as any).v2SettingsSub as string;
  // Redirect removed pages to profile
  if (raw === "billing" || raw === "usage" || raw === "invoices") return "profile";
  return (raw as SettingsSubPage) ?? "profile";
}

function setSettingsSub(state: AppViewState, sub: SettingsSubPage) {
  (state as any).v2SettingsSub = sub;
  // Force re-render
  (state as any).tab = "__v2_force__";
  state.setTab("system" as any);
}

function renderSettingsSidebar(state: AppViewState, activeSub: SettingsSubPage) {
  const item = (sub: SettingsSubPage, icon: any, label: string) => html`
    <button
      class="v2-dropdown-item ${activeSub === sub ? "v2-dropdown-item--active" : ""}"
      @click=${() => setSettingsSub(state, sub)}
    >${icon} ${label}</button>
  `;
  return html`
    <aside class="v2-settings-sidebar-inline">
      <div>
        <div class="v2-section-label">Server</div>
        ${item("profile", v2.user, "Profile")}
        ${item("api-keys", v2.key, "API Keys")}
        ${item("auth", v2.shield, "Auth")}
      </div>
    </aside>
  `;
}

function renderSettingsContent(sub: SettingsSubPage) {
  switch (sub) {
    case "profile":
      return html`
        <div style="margin-bottom: var(--v2-space-5);">
          <div class="v2-page-title" style="font-size: var(--v2-text-xl);">Profile</div>
          <div class="v2-page-subtitle">Your identity and permissions on this server.</div>
        </div>
        <div class="v2-card" style="margin-bottom: var(--v2-space-4);">
          <div class="v2-row" style="gap: var(--v2-space-4); align-items: center;">
            <div class="v2-avatar" style="width: 48px; height: 48px; font-size: 18px;"><span>T</span></div>
            <div>
              <div class="v2-strong" style="font-size: var(--v2-text-base);">Tyler Brandt</div>
              <div class="v2-muted" style="font-size: var(--v2-text-xs);">tyler@intent-systems.com</div>
            </div>
            <div style="margin-left: auto;">
              <span class="v2-badge v2-badge--success">Operator</span>
            </div>
          </div>
        </div>
        <div class="v2-section-label" style="margin-bottom: var(--v2-space-3);">Server Permissions</div>
        <div class="v2-card">
          <div class="v2-grid-2" style="gap: var(--v2-space-4);">
            <div>
              <div class="v2-label">Role</div>
              <div class="v2-strong">Operator (Full Access)</div>
            </div>
            <div>
              <div class="v2-label">Server</div>
              <div class="v2-strong">Primary</div>
            </div>
            <div>
              <div class="v2-label">Agents</div>
              <div class="v2-muted" style="font-size: var(--v2-text-xs);">Create, configure, delete</div>
            </div>
            <div>
              <div class="v2-label">Integrations</div>
              <div class="v2-muted" style="font-size: var(--v2-text-xs);">Connect, disconnect, configure</div>
            </div>
            <div>
              <div class="v2-label">Identity</div>
              <div class="v2-muted" style="font-size: var(--v2-text-xs);">Resolve merges, manage policies</div>
            </div>
            <div>
              <div class="v2-label">System</div>
              <div class="v2-muted" style="font-size: var(--v2-text-xs);">Full runtime access, config, debug</div>
            </div>
          </div>
        </div>
      `;
    case "api-keys":
      return html`
        <div class="v2-row-between" style="margin-bottom: var(--v2-space-5);">
          <div>
            <div class="v2-page-title" style="font-size: var(--v2-text-xl);">API Keys</div>
            <div class="v2-page-subtitle">These keys allow you to authenticate API requests to this server.</div>
          </div>
          <button class="v2-btn v2-btn--primary">+ Create API Key</button>
        </div>
        <div class="v2-card">
          <div class="v2-empty">
            <div class="v2-empty-icon">${v2.key}</div>
            <div class="v2-empty-title">No API keys yet</div>
            <div class="v2-empty-description">Create your first API key to get started.</div>
          </div>
        </div>
      `;
    case "auth":
      return html`
        <div>
          <div class="v2-page-title" style="font-size: var(--v2-text-xl);">Auth</div>
          <div class="v2-page-subtitle" style="margin-bottom: var(--v2-space-5);">Manage connection credentials and OAuth settings.</div>
        </div>
        <div class="v2-filter-bar">
          <div class="v2-search-wrap">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input class="v2-search-input" type="text" placeholder="Search connections..." />
          </div>
        </div>
        <div class="v2-card">
          <div class="v2-muted" style="padding: var(--v2-space-4); text-align: center; font-size: var(--v2-text-xs);">
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
    <div class="v2-settings-page">
      ${renderSettingsSidebar(state, sub)}
      <div class="v2-settings-page-content">
        ${renderSettingsContent(sub)}
      </div>
    </div>
  `;
}

// ─── Main render ─────────────────────────────────────────────────────
export function renderAppV2(state: AppViewState) {
  const activeTab = resolveV2Tab(state);
  const basePath = (state as any).basePath ?? "";
  const isSettings = activeTab === "settings";
  const isAgentDetail = activeTab === "agents" && !getWizardState(state).active && !!(state as any)._v2AgentDetailId;

  return html`
    <div class="v2-shell" data-v2-theme="${state.themeResolved === "dark" ? "dark" : "light"}">
      <!-- ═══ TOP NAV (app-level chrome) ═══ -->
      <nav class="v2-topnav">
        <div class="v2-topnav-left">
          <div class="v2-logo" @click=${() => setV2Tab(state, "plugins")} style="cursor: pointer;">
            <div class="v2-logo-mark">
              <img src="${basePath ? `${basePath}/favicon.svg` : "/favicon.svg"}" alt="" />
            </div>
            <span class="v2-logo-text">nexus</span>
          </div>
        </div>

        <div class="v2-topnav-center">
          ${V2_PRIMARY_TABS.map((tab) => renderNavTab(state, tab, activeTab))}
          <div class="v2-nav-sep"></div>
          ${V2_SECONDARY_TABS.map((tab) => renderNavTab(state, tab, activeTab))}
        </div>

        <div class="v2-topnav-right">
          <div class="v2-env-toggle">
            <span>Production</span>
            <div class="v2-env-toggle-switch"></div>
          </div>

          <div class="v2-divider-v"></div>

          <button class="v2-icon-btn" title="Command palette">${v2.command}</button>
          <button class="v2-icon-btn" title="Notifications" @click=${() => {
            (state as any).v2NotificationsOpen = !(state as any).v2NotificationsOpen;
            (state as any).tab = "__v2_force__";
            state.setTab(legacyTabFor(activeTab === "settings" ? "plugins" : activeTab as V2Tab) as any);
          }}>${v2.bell}</button>
          <button class="v2-icon-btn ${isSettings ? "v2-icon-btn--active" : ""}" title="Settings" @click=${() => setV2Tab(state, "settings")}>${icons.settings}</button>
        </div>
      </nav>

      <!-- ═══ MAIN CONTENT ═══ -->
      <main class="v2-main ${isSettings ? "v2-main--settings" : ""} ${isAgentDetail ? "v2-main--agent-detail" : ""}">
        ${activeTab === "plugins" ? renderPluginsPage({
          loading: state.integrationsLoading,
          error: state.integrationsError,
          adapters: state.integrationsAdapters,
          onRefresh: () => void loadIntegrations(state as any),
          onSelectAdapter: (adapter) => { (state as any).integrationsSelectedAdapter = adapter; (state as any).tab = "__v2_force__"; state.setTab("integrations" as any); },
          onOAuthStart: () => {},
        }) : nothing}

        ${activeTab === "agents"
          ? (() => {
              const wiz = getWizardState(state);
              if (wiz.active) {
                return renderAgentCreateWizard({
                  step: wiz.step,
                  form: wiz.form,
                  adapters: state.integrationsAdapters,
                  onStepChange: (step) => { (state as any)._v2WizardStep = step; (state as any).tab = "__v2_force__"; state.setTab("agents" as any); },
                  onFormChange: (patch) => { Object.assign(wiz.form, patch); (state as any).tab = "__v2_force__"; state.setTab("agents" as any); },
                  onAppToggle: (adapter) => {
                    if (wiz.form.selectedApps.has(adapter)) wiz.form.selectedApps.delete(adapter);
                    else wiz.form.selectedApps.add(adapter);
                    (state as any).tab = "__v2_force__"; state.setTab("agents" as any);
                  },
                  onCancel: () => closeWizard(state),
                  onCreate: async () => {
                    const form = wiz.form;
                    const agentId = await createAgent(state as any, {
                      name: form.name,
                      model: form.model,
                      description: form.description,
                      memory: form.memory,
                    });
                    if (agentId) {
                      (state as any)._v2AgentDetailId = agentId;
                    }
                    closeWizard(state);
                  },
                });
              }
              // Check if we're viewing an agent detail
              const selectedAgent = (state as any)._v2AgentDetailId as string | null;
              if (selectedAgent) {
                const detailTab = ((state as any)._v2AgentDetailTab as AgentDetailTab) ?? "settings";
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
                  stream: state.chatStream,
                  streamStartedAt: state.chatStreamStartedAt,
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

                const activeModal = ((state as any)._v2AgentModal as AgentDetailModal) ?? null;
                return renderAgentDetail({
                  agentId: selectedAgent,
                  agentsList: state.agentsList,
                  activeTab: detailTab,
                  activeModal,
                  chatProps,
                  onTabChange: (tab) => { (state as any)._v2AgentDetailTab = tab; (state as any).tab = "__v2_force__"; state.setTab("agents" as any); },
                  onModalChange: (modal) => { (state as any)._v2AgentModal = modal; (state as any).tab = "__v2_force__"; state.setTab("agents" as any); },
                  onBack: () => { (state as any)._v2AgentDetailId = null; (state as any).tab = "__v2_force__"; state.setTab("agents" as any); },
                });
              }
              return renderAgentsPage({
                loading: state.agentsLoading,
                error: state.agentsError,
                agentsList: state.agentsList,
                onSelectAgent: (agentId) => { (state as any)._v2AgentDetailId = agentId; (state as any).tab = "__v2_force__"; state.setTab("agents" as any); },
                onCreateAgent: () => openWizard(state),
                onRefresh: () => void loadAgents(state as any),
              });
            })()
          : nothing}

        ${activeTab === "monitor" ? renderMonitorPage({ connected: state.connected, loading: false }) : nothing}
        ${activeTab === "settings" ? renderSettingsPage(state) : nothing}

        ${activeTab === "identity" ? renderIdentityPage({
          subTab: (state as any)._v2IdentitySubTab ?? "entities",
          onSubTabChange: (sub) => { (state as any)._v2IdentitySubTab = sub; state.tab = "__v2_force__" as any; state.setTab("identity" as any); },
          loading: state.identityLoading ?? false,
          error: state.identityError ?? null,
          entities: ((state as any).identityEntities ?? []),
          onEntitySelect: (id) => { (state as any)._v2IdentitySubTab = "entities"; state.tab = "__v2_force__" as any; state.setTab("identity" as any); },
          contacts: (state as any).identityContacts ?? [],
          channels: (state as any).identityChannels ?? [],
          groups: (state as any).identityGroups ?? [],
          policies: (state as any).identityPolicies ?? [],
          mergeCandidates: state.identityMergeCandidates ?? [],
          mergeBusyId: state.identityMergeBusyId ?? null,
          onResolveMerge: (id, status) => {
            const { resolveIdentityMergeCandidate } = require("../ui/controllers/identity.ts");
            void resolveIdentityMergeCandidate(state, id, status);
          },
          onRefresh: () => {
            const { loadIdentitySurface } = require("../ui/controllers/identity.ts");
            void loadIdentitySurface(state as any);
          },
        } as IdentityPageProps) : nothing}

        ${activeTab === "memory" ? renderMemoryPage({
          subTab: (state as any)._v2MemorySubTab ?? "library",
          onSubTabChange: (sub) => { (state as any)._v2MemorySubTab = sub; state.tab = "__v2_force__" as any; state.setTab("memory" as any); },
          loading: (state as any).memoryLoading ?? false,
          error: (state as any).memoryError ?? null,
          runs: (state as any).memoryRuns ?? [],
          selectedRunId: (state as any).memorySelectedRunId ?? null,
          onRunSelect: (runId) => {
            (state as any).memorySelectedRunId = runId;
            const { loadMemoryRunEpisodes } = require("../ui/controllers/memory-review.ts");
            void loadMemoryRunEpisodes(state as any, runId);
          },
          episodes: (state as any).memoryEpisodes ?? [],
          episodesLoading: (state as any).memoryEpisodesLoading ?? false,
          selectedEpisodeId: (state as any).memorySelectedEpisodeId ?? null,
          onEpisodeSelect: (episodeId) => {
            (state as any).memorySelectedEpisodeId = episodeId;
            const { loadMemoryEpisodeInspector } = require("../ui/controllers/memory-review.ts");
            void loadMemoryEpisodeInspector(state as any, episodeId);
          },
          inspectorLoading: (state as any).memoryInspectorLoading ?? false,
          episodeDetail: (state as any).memoryEpisodeDetail ?? null,
          searchQuery: (state as any).memorySearchQuery ?? "",
          searchType: (state as any).memorySearchType ?? "semantic",
          searchLoading: (state as any).memorySearchLoading ?? false,
          searchResults: (state as any).memorySearchResults ?? [],
          onSearchQueryChange: (q) => { (state as any).memorySearchQuery = q; },
          onSearchTypeChange: (t) => { (state as any).memorySearchType = t; },
          onSearch: () => {
            const { runMemorySearch } = require("../ui/controllers/memory-review.ts");
            void runMemorySearch(state as any);
          },
          qualityLoading: (state as any).memoryQualityLoading ?? false,
          qualitySummary: (state as any).memoryQualitySummary ?? null,
          qualityBucket: (state as any).memoryQualityBucket ?? "high",
          qualityItems: (state as any).memoryQualityItems ?? [],
          onQualityBucketSelect: (bucket) => {
            (state as any).memoryQualityBucket = bucket;
            const { loadMemoryQualityItems } = require("../ui/controllers/memory-review.ts");
            void loadMemoryQualityItems(state as any, bucket);
          },
          detailKind: (state as any).memoryDetailKind ?? null,
          detailLoading: (state as any).memoryDetailLoading ?? false,
          detailEntity: (state as any).memoryDetailEntity ?? null,
          detailFact: (state as any).memoryDetailFact ?? null,
          detailObservation: (state as any).memoryDetailObservation ?? null,
          onEntitySelect: (id) => {
            const { loadMemoryEntityDetail } = require("../ui/controllers/memory-review.ts");
            void loadMemoryEntityDetail(state as any, id);
          },
          onFactSelect: (id) => {
            const { loadMemoryFactDetail } = require("../ui/controllers/memory-review.ts");
            void loadMemoryFactDetail(state as any, id);
          },
          onObservationSelect: (id) => {
            const { loadMemoryObservationDetail } = require("../ui/controllers/memory-review.ts");
            void loadMemoryObservationDetail(state as any, id);
          },
          onRefresh: () => {
            const { loadMemoryRuns } = require("../ui/controllers/memory-review.ts");
            void loadMemoryRuns(state as any);
          },
        } as MemoryPageProps) : nothing}
      </main>

      <!-- ═══ OVERLAYS ═══ -->
      ${renderNotificationsPanel(state)}
    </div>
  `;
}
