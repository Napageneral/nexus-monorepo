import { html, nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import type { UsageState } from "./controllers/usage.ts";
import { parseAgentSessionKey } from "../shared/session-key-utils.ts";
import { refreshChatAvatar } from "./app-chat.ts";
import { renderChatControls, renderTab, renderThemeToggle } from "./app-render.helpers.ts";
import { approveAclRequest, denyAclRequest, loadAclRequests } from "./controllers/acl-requests.ts";
import { loadAgentFileContent, loadAgentFiles, saveAgentFile } from "./controllers/agent-files.ts";
import { loadAgentIdentities, loadAgentIdentity } from "./controllers/agent-identity.ts";
import { loadAgentSkills } from "./controllers/agent-skills.ts";
import { loadAgents } from "./controllers/agents.ts";
import { loadInstalledAppMethods, loadInstalledApps } from "./controllers/apps.ts";
import { loadChatHistory } from "./controllers/chat.ts";
import {
  applyConfig,
  loadConfig,
  runUpdate,
  saveConfig,
  updateConfigFormValue,
  removeConfigFormValue,
} from "./controllers/config.ts";
import { loadDebug, callDebugMethod } from "./controllers/debug.ts";
import { loadIdentitySurface, resolveIdentityMergeCandidate } from "./controllers/identity.ts";
import {
  createIngressCredential,
  loadIngressCredentials,
  revokeIngressCredential,
  rotateIngressCredential,
} from "./controllers/ingress-credentials.ts";
import {
  cancelIntegrationCustomFlow,
  checkIntegrationCustomFlow,
  disconnectIntegrationAdapter,
  loadIntegrations,
  setIntegrationsPayloadText,
  setIntegrationsSelectedAdapter,
  startIntegrationCustomFlow,
  startIntegrationOAuth,
  submitIntegrationCustomFlow,
  testIntegrationAdapter,
} from "./controllers/integrations.ts";
import { loadLogs } from "./controllers/logs.ts";
import {
  loadMemoryEntityDetail,
  loadMemoryFactDetail,
  loadMemoryEpisodeInspector,
  loadMemoryObservationDetail,
  loadMemoryQualityItems,
  loadMemoryQualitySummary,
  loadMemoryRunEpisodes,
  loadMemoryRuns,
  runMemorySearch,
} from "./controllers/memory-review.ts";
import { loadPresence } from "./controllers/presence.ts";
import {
  loadScheduleRuns,
  toggleScheduleJob,
  runScheduleJob,
  removeScheduleJob,
  addScheduleJob,
  loadAutomationMeeseeks,
} from "./controllers/schedules.ts";
import { deleteSession, loadSessions, patchSession } from "./controllers/sessions.ts";
import {
  installSkill,
  loadSkills,
  saveSkillApiKey,
  updateSkillEdit,
  updateSkillEnabled,
} from "./controllers/skills.ts";
import { loadUsage, loadSessionTimeSeries, loadSessionLogs } from "./controllers/usage.ts";
import { resolveConversationSessionKey } from "./conversation-session.ts";
import { icons } from "./icons.ts";
import { normalizeBasePath, TAB_GROUPS, subtitleForTab, titleForTab } from "./navigation.ts";

// Module-scope debounce for usage date changes
let usageDateDebounceTimeout: number | null = null;
const debouncedLoadUsage = (state: UsageState) => {
  if (usageDateDebounceTimeout) {
    clearTimeout(usageDateDebounceTimeout);
  }
  usageDateDebounceTimeout = window.setTimeout(() => void loadUsage(state), 400);
};

import { renderAdaptersView } from "./views/adapters-view.ts";
// ─── View imports ────────────────────────────────────────────────────────
import { renderAgents } from "./views/agents.ts";
import { renderChat } from "./views/chat.ts";
import { renderHomeView } from "./views/home-view.ts";
import { renderIdentityView } from "./views/identity-view.ts";
import { renderInstances } from "./views/instances.ts";
import { renderIntegrations } from "./views/integrations.ts";
import { renderMemory } from "./views/memory.ts";
import { renderOperationsView } from "./views/operations-view.ts";
import { renderRuntimeUrlConfirmation } from "./views/runtime-url-confirmation.ts";
import { renderSessions } from "./views/sessions.ts";
import { renderSkills } from "./views/skills.ts";
import { renderSystemView } from "./views/system-view.ts";

const AVATAR_DATA_RE = /^data:/i;
const AVATAR_HTTP_RE = /^https?:\/\//i;

function resolveAssistantAvatarUrl(state: AppViewState): string | undefined {
  const list = state.agentsList?.agents ?? [];
  const parsed = parseAgentSessionKey(state.sessionKey);
  const agentId = parsed?.agentId ?? state.agentsList?.defaultId ?? "main";
  const agent = list.find((entry) => entry.id === agentId);
  const identity = agent?.identity;
  const candidate = identity?.avatarUrl ?? identity?.avatar;
  if (!candidate) {
    return undefined;
  }
  if (AVATAR_DATA_RE.test(candidate) || AVATAR_HTTP_RE.test(candidate)) {
    return candidate;
  }
  return identity?.avatarUrl;
}

export function renderApp(state: AppViewState) {
  const presenceCount = state.presenceEntries.length;
  const sessionsCount = state.sessionsResult?.count ?? null;
  const scheduleNext = state.scheduleStatus?.nextWakeAtMs ?? null;
  const chatDisabledReason = state.connected ? null : "Disconnected from runtime.";
  const isChat = state.tab === "console";
  const chatFocus = isChat && (state.settings.chatFocusMode || state.onboarding);
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const assistantAvatarUrl = resolveAssistantAvatarUrl(state);
  const chatAvatarUrl = state.chatAvatarUrl ?? assistantAvatarUrl ?? null;
  const configValue =
    state.configForm ?? (state.configSnapshot?.config as Record<string, unknown> | null);
  const basePath = normalizeBasePath(state.basePath ?? "");
  const resolvedAgentId =
    state.agentsSelectedId ??
    state.agentsList?.defaultId ??
    state.agentsList?.agents?.[0]?.id ??
    null;
  return html`
    <div class="shell ${isChat ? "shell--chat" : ""} ${chatFocus ? "shell--chat-focus" : ""} ${state.settings.navCollapsed ? "shell--nav-collapsed" : ""} ${state.onboarding ? "shell--onboarding" : ""}">
      <header class="topbar">
        <div class="topbar-left">
          <button
            class="nav-collapse-toggle"
            @click=${() =>
              state.applySettings({
                ...state.settings,
                navCollapsed: !state.settings.navCollapsed,
              })}
            title="${state.settings.navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
            aria-label="${state.settings.navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
          >
            <span class="nav-collapse-toggle__icon">${icons.menu}</span>
          </button>
          <div class="brand">
            <div class="brand-logo">
              <img src=${basePath ? `${basePath}/favicon.svg` : "/favicon.svg"} alt="Nexus" />
            </div>
            <div class="brand-text">
              <div class="brand-title">NEXUS</div>
              <div class="brand-sub">Operator Console</div>
            </div>
          </div>
        </div>
        <div class="topbar-status">
          <div class="pill">
            <span class="statusDot ${state.connected ? "ok" : ""}"></span>
            <span>Health</span>
            <span class="mono">${state.connected ? "OK" : "Offline"}</span>
          </div>
          ${renderThemeToggle(state)}
        </div>
      </header>
      <aside class="nav ${state.settings.navCollapsed ? "nav--collapsed" : ""}">
        ${TAB_GROUPS.map((group) => {
          const isGroupCollapsed = state.settings.navGroupsCollapsed[group.label] ?? false;
          const hasActiveTab = group.tabs.some((tab) => tab === state.tab);
          return html`
            <div class="nav-group ${isGroupCollapsed && !hasActiveTab ? "nav-group--collapsed" : ""}">
              <button
                class="nav-label"
                @click=${() => {
                  const next = { ...state.settings.navGroupsCollapsed };
                  next[group.label] = !isGroupCollapsed;
                  state.applySettings({
                    ...state.settings,
                    navGroupsCollapsed: next,
                  });
                }}
                aria-expanded=${!isGroupCollapsed}
              >
                <span class="nav-label__text">${group.label}</span>
                <span class="nav-label__chevron">${isGroupCollapsed ? "+" : "−"}</span>
              </button>
              <div class="nav-group__items">
                ${group.tabs.map((tab) => renderTab(state, tab))}
              </div>
            </div>
          `;
        })}

      </aside>
      <main class="content ${isChat ? "content--chat" : ""}">
        <section class="content-header">
          <div>
            <div class="page-title">${titleForTab(state.tab)}</div>
            <div class="page-sub">${subtitleForTab(state.tab)}</div>
          </div>
          <div class="page-meta">
            ${state.lastError ? html`<div class="pill danger">${state.lastError}</div>` : nothing}
            ${isChat ? renderChatControls(state) : nothing}
          </div>
        </section>

        <!-- ═══ HOME ═══ -->
        ${
          state.tab === "home"
            ? renderHomeView({
                connected: state.connected,
                lastError: state.lastError,
                overdueItems: 0,
                dueNowItems: 0,
                aclPendingCount: state.aclRequests.length,
                integrationWarnings: state.integrationsAdapters.filter(
                  (adapter) => adapter.status !== "connected",
                ).length,
                scheduleCount: state.scheduleJobs.length,
                memoryReviewCount: state.memoryRuns.length,
                mergeCandidates: state.identityMergeCandidates,
                mergeBusyId: state.identityMergeBusyId,
                onOpenIdentity: () => void state.setTab("identity"),
                onOpenIdentityMerges: () => {
                  state.identitySubTab = "merges";
                  void state.setTab("identity");
                },
                onOpenOperations: () => void state.setTab("operations"),
                onOpenIntegrations: () => void state.setTab("integrations"),
                onOpenMemory: () => void state.setTab("memory"),
                onOpenConsole: () => void state.setTab("console"),
                onOpenSystem: () => void state.setTab("system"),
                onResolveMerge: (id, status) =>
                  void resolveIdentityMergeCandidate(state, id, status),
              })
            : nothing
        }

        <!-- ═══ CONSOLE ═══ -->
        ${
          state.tab === "console"
            ? renderChat({
                conversationId: state.conversationId,
                onConversationIdChange: (next) => {
                  state.conversationId = next;
                  state.sessionKey = resolveConversationSessionKey(state.sessionsResult, next);
                  state.chatMessage = "";
                  state.chatAttachments = [];
                  state.chatStream = null;
                  state.chatStreamStartedAt = null;
                  state.chatRunId = null;
                  state.chatQueue = [];
                  state.resetToolStream();
                  state.resetChatScroll();
                  state.applySettings({
                    ...state.settings,
                    conversationId: next,
                    lastActiveSessionKey: state.sessionKey || state.settings.lastActiveSessionKey,
                  });
                  void state.loadAssistantIdentity();
                  void loadChatHistory(state);
                  void refreshChatAvatar(state);
                },
                thinkingLevel: state.chatThinkingLevel,
                showThinking,
                loading: state.chatLoading,
                sending: state.chatSending,
                compactionStatus: state.compactionStatus,
                assistantAvatarUrl: chatAvatarUrl,
                messages: state.chatMessages,
                toolMessages: state.chatToolMessages,
                stream: state.chatStream,
                streamStartedAt: state.chatStreamStartedAt,
                draft: state.chatMessage,
                queue: state.chatQueue,
                connected: state.connected,
                canSend: state.connected,
                disabledReason: chatDisabledReason,
                error: state.lastError,
                conversations: state.conversationsResult,
                sessions: state.sessionsResult,
                focusMode: chatFocus,
                onRefresh: () => {
                  state.resetToolStream();
                  return Promise.all([loadChatHistory(state), refreshChatAvatar(state)]);
                },
                onToggleFocusMode: () => {
                  if (state.onboarding) {
                    return;
                  }
                  state.applySettings({
                    ...state.settings,
                    chatFocusMode: !state.settings.chatFocusMode,
                  });
                },
                onChatScroll: (event) => state.handleChatScroll(event),
                onDraftChange: (next) => (state.chatMessage = next),
                attachments: state.chatAttachments,
                onAttachmentsChange: (next) => (state.chatAttachments = next),
                onSend: () => state.handleSendChat(),
                canAbort: Boolean(state.chatRunId),
                onAbort: () => void state.handleAbortChat(),
                onQueueRemove: (id) => state.removeQueuedMessage(id),
                onNewSession: () => state.handleSendChat("/new", { restoreDraft: true }),
                showNewMessages: state.chatNewMessagesBelow && !state.chatManualRefreshInFlight,
                onScrollToBottom: () => state.scrollToBottom(),
                sidebarOpen: state.sidebarOpen,
                sidebarContent: state.sidebarContent,
                sidebarError: state.sidebarError,
                splitRatio: state.splitRatio,
                onOpenSidebar: (content: string) => state.handleOpenSidebar(content),
                onCloseSidebar: () => state.handleCloseSidebar(),
                onSplitRatioChange: (ratio: number) => state.handleSplitRatioChange(ratio),
                assistantName: state.assistantName,
                assistantAvatar: state.assistantAvatar,
              })
            : nothing
        }

        <!-- ═══ AGENTS ═══ -->
        ${
          state.tab === "agents"
            ? renderAgents({
                loading: state.agentsLoading,
                error: state.agentsError,
                agentsList: state.agentsList,
                selectedAgentId: resolvedAgentId,
                activePanel: state.agentsPanel,
                configForm: configValue,
                configLoading: state.configLoading,
                configSaving: state.configSaving,
                configDirty: state.configFormDirty,
                adapterConnectionsLoading: state.integrationsLoading,
                adapterConnectionsError: state.integrationsError,
                adapterConnections: state.integrationsAdapters,
                scheduleLoading: state.scheduleLoading,
                scheduleStatus: state.scheduleStatus,
                scheduleJobs: state.scheduleJobs,
                scheduleError: state.scheduleError,
                agentFilesLoading: state.agentFilesLoading,
                agentFilesError: state.agentFilesError,
                agentFilesList: state.agentFilesList,
                agentFileActive: state.agentFileActive,
                agentFileContents: state.agentFileContents,
                agentFileDrafts: state.agentFileDrafts,
                agentFileSaving: state.agentFileSaving,
                agentIdentityLoading: state.agentIdentityLoading,
                agentIdentityError: state.agentIdentityError,
                agentIdentityById: state.agentIdentityById,
                agentSkillsLoading: state.agentSkillsLoading,
                agentSkillsReport: state.agentSkillsReport,
                agentSkillsError: state.agentSkillsError,
                agentSkillsAgentId: state.agentSkillsAgentId,
                skillsFilter: state.skillsFilter,
                onRefresh: async () => {
                  await loadAgents(state);
                  const agentIds = state.agentsList?.agents?.map((entry) => entry.id) ?? [];
                  if (agentIds.length > 0) {
                    void loadAgentIdentities(state, agentIds);
                  }
                },
                onSelectAgent: (agentId) => {
                  if (state.agentsSelectedId === agentId) {
                    return;
                  }
                  state.agentsSelectedId = agentId;
                  state.agentFilesList = null;
                  state.agentFilesError = null;
                  state.agentFilesLoading = false;
                  state.agentFileActive = null;
                  state.agentFileContents = {};
                  state.agentFileDrafts = {};
                  state.agentSkillsReport = null;
                  state.agentSkillsError = null;
                  state.agentSkillsAgentId = null;
                  void loadAgentIdentity(state, agentId);
                  if (state.agentsPanel === "files") {
                    void loadAgentFiles(state, agentId);
                  }
                  if (state.agentsPanel === "skills") {
                    void loadAgentSkills(state, agentId);
                  }
                },
                onSelectPanel: (panel) => {
                  state.agentsPanel = panel;
                  if (panel === "files" && resolvedAgentId) {
                    if (state.agentFilesList?.agentId !== resolvedAgentId) {
                      state.agentFilesList = null;
                      state.agentFilesError = null;
                      state.agentFileActive = null;
                      state.agentFileContents = {};
                      state.agentFileDrafts = {};
                      void loadAgentFiles(state, resolvedAgentId);
                    }
                  }
                  if (panel === "skills") {
                    if (resolvedAgentId) {
                      void loadAgentSkills(state, resolvedAgentId);
                    }
                  }
                  if (panel === "accounts") {
                    void loadIntegrations(state);
                  }
                  if (panel === "automations") {
                    void state.loadSchedules();
                  }
                },
                onLoadFiles: (agentId) => loadAgentFiles(state, agentId),
                onSelectFile: (name) => {
                  state.agentFileActive = name;
                  if (!resolvedAgentId) {
                    return;
                  }
                  void loadAgentFileContent(state, resolvedAgentId, name);
                },
                onFileDraftChange: (name, content) => {
                  state.agentFileDrafts = { ...state.agentFileDrafts, [name]: content };
                },
                onFileReset: (name) => {
                  const base = state.agentFileContents[name] ?? "";
                  state.agentFileDrafts = { ...state.agentFileDrafts, [name]: base };
                },
                onFileSave: (name) => {
                  if (!resolvedAgentId) {
                    return;
                  }
                  const content =
                    state.agentFileDrafts[name] ?? state.agentFileContents[name] ?? "";
                  void saveAgentFile(state, resolvedAgentId, name, content);
                },
                onToolsProfileChange: (agentId, profile, clearAllow) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "tools"];
                  if (profile) {
                    updateConfigFormValue(state, [...basePath, "profile"], profile);
                  } else {
                    removeConfigFormValue(state, [...basePath, "profile"]);
                  }
                  if (clearAllow) {
                    removeConfigFormValue(state, [...basePath, "allow"]);
                  }
                },
                onToolsOverridesChange: (agentId, alsoAllow, deny) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "tools"];
                  if (alsoAllow.length > 0) {
                    updateConfigFormValue(state, [...basePath, "alsoAllow"], alsoAllow);
                  } else {
                    removeConfigFormValue(state, [...basePath, "alsoAllow"]);
                  }
                  if (deny.length > 0) {
                    updateConfigFormValue(state, [...basePath, "deny"], deny);
                  } else {
                    removeConfigFormValue(state, [...basePath, "deny"]);
                  }
                },
                onConfigReload: () => loadConfig(state),
                onConfigSave: () => saveConfig(state),
                onAccountsRefresh: () => loadIntegrations(state),
                onScheduleRefresh: () => state.loadSchedules(),
                onSkillsFilterChange: (next) => (state.skillsFilter = next),
                onSkillsRefresh: () => {
                  if (resolvedAgentId) {
                    void loadAgentSkills(state, resolvedAgentId);
                  }
                },
                onAgentSkillToggle: (agentId, skillName, enabled) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const entry = list[index] as { skills?: unknown };
                  const normalizedSkill = skillName.trim();
                  if (!normalizedSkill) {
                    return;
                  }
                  const allSkills =
                    state.agentSkillsReport?.skills?.map((skill) => skill.name).filter(Boolean) ??
                    [];
                  const existing = Array.isArray(entry.skills)
                    ? entry.skills.map((name) => String(name).trim()).filter(Boolean)
                    : undefined;
                  const base = existing ?? allSkills;
                  const next = new Set(base);
                  if (enabled) {
                    next.add(normalizedSkill);
                  } else {
                    next.delete(normalizedSkill);
                  }
                  updateConfigFormValue(state, ["agents", "list", index, "skills"], [...next]);
                },
                onAgentSkillsClear: (agentId) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  removeConfigFormValue(state, ["agents", "list", index, "skills"]);
                },
                onAgentSkillsDisableAll: (agentId) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  updateConfigFormValue(state, ["agents", "list", index, "skills"], []);
                },
                onModelChange: (agentId, modelId) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "model"];
                  if (!modelId) {
                    removeConfigFormValue(state, basePath);
                    return;
                  }
                  const entry = list[index] as { model?: unknown };
                  const existing = entry?.model;
                  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                    const fallbacks = (existing as { fallbacks?: unknown }).fallbacks;
                    const next = {
                      primary: modelId,
                      ...(Array.isArray(fallbacks) ? { fallbacks } : {}),
                    };
                    updateConfigFormValue(state, basePath, next);
                  } else {
                    updateConfigFormValue(state, basePath, modelId);
                  }
                },
                onModelFallbacksChange: (agentId, fallbacks) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "model"];
                  const entry = list[index] as { model?: unknown };
                  const normalized = fallbacks.map((name) => name.trim()).filter(Boolean);
                  const existing = entry.model;
                  const resolvePrimary = () => {
                    if (typeof existing === "string") {
                      return existing.trim() || null;
                    }
                    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                      const primary = (existing as { primary?: unknown }).primary;
                      if (typeof primary === "string") {
                        const trimmed = primary.trim();
                        return trimmed || null;
                      }
                    }
                    return null;
                  };
                  const primary = resolvePrimary();
                  if (normalized.length === 0) {
                    if (primary) {
                      updateConfigFormValue(state, basePath, primary);
                    } else {
                      removeConfigFormValue(state, basePath);
                    }
                    return;
                  }
                  const next = primary
                    ? { primary, fallbacks: normalized }
                    : { fallbacks: normalized };
                  updateConfigFormValue(state, basePath, next);
                },
              })
            : nothing
        }

        <!-- ═══ IDENTITY ═══ -->
        ${
          state.tab === "identity"
            ? renderIdentityView({
                subTab: state.identitySubTab,
                onSubTabChange: (sub) => {
                  state.identitySubTab = sub;
                  if (sub === "entities") {
                    state.memorySearchType = "entities" as any;
                    void runMemorySearch(state);
                    return;
                  }
                  if (sub === "access") {
                    void loadAclRequests(state);
                    void loadIngressCredentials(state);
                    return;
                  }
                  void loadIdentitySurface(state);
                },
                identityLoading: state.identityLoading,
                identityError: state.identityError,
                mergeBusyId: state.identityMergeBusyId,
                contacts: state.identityContacts,
                channels: state.identityChannels,
                groups: state.identityGroups,
                policies: state.identityPolicies,
                mergeCandidates: state.identityMergeCandidates,
                onOpenEntity: (entityId) => {
                  state.identitySubTab = "entities";
                  state.directorySelectedEntityId = entityId;
                  void state.setTab("identity");
                  void loadMemoryEntityDetail(state, entityId);
                },
                onResolveMerge: (id, status) =>
                  void resolveIdentityMergeCandidate(state, id, status),
                directoryProps: {
                  loading: state.memorySearchLoading,
                  error: state.memoryError,
                  searchQuery: state.directorySearchQuery,
                  searchResult: state.memorySearchResult,
                  detailLoading: state.memoryDetailLoading,
                  detailEntity: state.memoryDetailEntity,
                  selectedEntityId: state.directorySelectedEntityId,
                  onSearchQueryChange: (value) => {
                    state.directorySearchQuery = value;
                    state.memorySearchType = "entities" as any;
                  },
                  onSearch: () => {
                    state.memorySearchQuery = state.directorySearchQuery;
                    state.memorySearchType = "entities" as any;
                    state.directorySelectedEntityId = null;
                    void runMemorySearch(state);
                  },
                  onEntitySelect: (entityId) => {
                    state.directorySelectedEntityId = entityId;
                    void loadMemoryEntityDetail(state, entityId);
                  },
                  onBack: () => {
                    state.directorySelectedEntityId = null;
                  },
                },
                accessProps: {
                  subTab: state.accessSubTab,
                  onSubTabChange: (sub) => {
                    state.accessSubTab = sub;
                  },
                  approvalsProps: {
                    loading:
                      state.accessSubTab === "requests"
                        ? state.aclRequestsLoading
                        : state.ingressCredentialsLoading,
                    error:
                      state.accessSubTab === "requests"
                        ? state.aclRequestsError
                        : state.ingressCredentialsError,
                    requests: state.aclRequests,
                    resolvingId: state.aclRequestsResolvingId,
                    ingressLoading: state.ingressCredentialsLoading,
                    ingressError: state.ingressCredentialsError,
                    ingressCredentials: state.ingressCredentials,
                    ingressEntityIdFilter: state.ingressCredentialsEntityIdFilter,
                    ingressCreateEntityId: state.ingressCredentialCreateEntityId,
                    ingressCreateRole: state.ingressCredentialCreateRole,
                    ingressCreateScopes: state.ingressCredentialCreateScopes,
                    ingressCreateLabel: state.ingressCredentialCreateLabel,
                    ingressCreateExpiresAt: state.ingressCredentialCreateExpiresAt,
                    ingressCreating: state.ingressCredentialCreating,
                    ingressBusyId: state.ingressCredentialBusyId,
                    onRefresh: () => {
                      if (state.accessSubTab === "requests") {
                        void loadAclRequests(state);
                      } else {
                        void loadIngressCredentials(state);
                      }
                    },
                    onApprove: (id, mode) => approveAclRequest(state, { id, mode }),
                    onDeny: (id) => denyAclRequest(state, id),
                    onIngressFilterChange: (next) => {
                      state.ingressCredentialsEntityIdFilter = next;
                    },
                    onIngressCreateEntityIdChange: (next) => {
                      state.ingressCredentialCreateEntityId = next;
                    },
                    onIngressCreateRoleChange: (next) => {
                      state.ingressCredentialCreateRole = next;
                    },
                    onIngressCreateScopesChange: (next) => {
                      state.ingressCredentialCreateScopes = next;
                    },
                    onIngressCreateLabelChange: (next) => {
                      state.ingressCredentialCreateLabel = next;
                    },
                    onIngressCreateExpiresAtChange: (next) => {
                      state.ingressCredentialCreateExpiresAt = next;
                    },
                    onIngressRefresh: () => loadIngressCredentials(state),
                    onIngressCreate: () => createIngressCredential(state),
                    onIngressRotate: (id) => rotateIngressCredential(state, id),
                    onIngressRevoke: (id) => revokeIngressCredential(state, id),
                  },
                },
              })
            : nothing
        }

        <!-- ═══ INTEGRATIONS ═══ -->
        ${
          state.tab === "integrations"
            ? renderAdaptersView({
                subTab: state.adaptersSubTab,
                onSubTabChange: (sub) => {
                  state.adaptersSubTab = sub;
                  void loadIntegrations(state);
                  void loadIngressCredentials(state);
                  void loadInstalledApps(state);
                },
                integrationsProps: {
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
                  onRefresh: () => {
                    void loadIntegrations(state);
                    void loadIngressCredentials(state);
                    void loadInstalledApps(state);
                  },
                  onSelectAdapter: (adapter) => setIntegrationsSelectedAdapter(state, adapter),
                  onPayloadChange: (payloadText) => setIntegrationsPayloadText(state, payloadText),
                  onOAuthStart: (adapter) => startIntegrationOAuth(state, adapter),
                  onCustomStart: (adapter) => startIntegrationCustomFlow(state, adapter),
                  onCustomSubmit: (adapter) => submitIntegrationCustomFlow(state, adapter),
                  onCustomStatus: (adapter) => checkIntegrationCustomFlow(state, adapter),
                  onCustomCancel: (adapter) => cancelIntegrationCustomFlow(state, adapter),
                  onTest: (adapter) => testIntegrationAdapter(state, adapter),
                  onDisconnect: (adapter) => disconnectIntegrationAdapter(state, adapter),
                },
                credentialsLoading: state.ingressCredentialsLoading,
                credentialsError: state.ingressCredentialsError,
                ingressCredentials: state.ingressCredentials,
                appsLoading: state.appsLoading,
                appsError: state.appsError,
                installedApps: state.installedApps,
                selectedAppId: state.selectedAppId,
                appMethodsLoading: state.appMethodsLoading,
                appMethodsError: state.appMethodsError,
                appMethods: state.appMethods,
                onSelectApp: (id) => void loadInstalledAppMethods(state, id),
              })
            : nothing
        }

        <!-- ═══ MEMORY ═══ -->
        ${
          state.tab === "memory"
            ? renderMemory({
                loading: state.memoryLoading,
                error: state.memoryError,
                runs: state.memoryRuns,
                selectedRunId: state.memorySelectedRunId,
                episodesLoading: state.memoryEpisodesLoading,
                episodes: state.memoryEpisodes,
                selectedEpisodeId: state.memorySelectedEpisodeId,
                inspectorLoading: state.memoryInspectorLoading,
                episodeDetail: state.memoryEpisodeDetail,
                episodeOutputs: state.memoryEpisodeOutputs,
                searchQuery: state.memorySearchQuery,
                searchType: state.memorySearchType,
                searchLoading: state.memorySearchLoading,
                searchResult: state.memorySearchResult,
                subTab: state.memorySubTab,
                qualityScope: state.memoryQualityScope,
                qualityLoading: state.memoryQualityLoading,
                qualitySummary: state.memoryQualitySummary,
                qualityBucket: state.memoryQualityBucket,
                qualityItemsLoading: state.memoryQualityItemsLoading,
                qualityItems: state.memoryQualityItems,
                detailLoading: state.memoryDetailLoading,
                detailKind: state.memoryDetailKind,
                detailEntity: state.memoryDetailEntity,
                detailFact: state.memoryDetailFact,
                detailObservation: state.memoryDetailObservation,
                onRefresh: () => loadMemoryRuns(state),
                onRunSelect: (runId) => loadMemoryRunEpisodes(state, runId),
                onEpisodeSelect: (episodeId) => loadMemoryEpisodeInspector(state, episodeId),
                onEntitySelect: (entityId) => loadMemoryEntityDetail(state, entityId),
                onFactSelect: (factId) => loadMemoryFactDetail(state, factId),
                onObservationSelect: (observationId) =>
                  loadMemoryObservationDetail(state, observationId),
                onSearchQueryChange: (value) => {
                  state.memorySearchQuery = value;
                },
                onSearchTypeChange: (value) => {
                  state.memorySearchType = value;
                },
                onSubTabChange: (value) => {
                  state.memorySubTab = value;
                },
                onSearch: () => runMemorySearch(state),
                onQualityScopeChange: (scope) => {
                  state.memoryQualityScope = scope;
                  state.memoryQualityItemsOffset = 0;
                  void loadMemoryQualitySummary(state, { loadItems: true });
                },
                onQualityBucketSelect: (bucket) => {
                  state.memoryQualityBucket = bucket;
                  state.memoryQualityItemsOffset = 0;
                  void loadMemoryQualityItems(state, bucket, { offset: 0 });
                },
                onQualityPage: (offset) => {
                  state.memoryQualityItemsOffset = Math.max(0, Math.trunc(offset));
                  void loadMemoryQualityItems(state, state.memoryQualityBucket, {
                    offset: state.memoryQualityItemsOffset,
                  });
                },
              })
            : nothing
        }

        <!-- ═══ OPERATIONS ═══ -->
        ${
          state.tab === "operations"
            ? renderOperationsView({
                subTab: state.operationsSubTab,
                onSubTabChange: (sub) => {
                  state.operationsSubTab = sub;
                  void state.loadSchedules();
                  void loadAutomationMeeseeks(state);
                },
                automationsProps: {
                  subTab: state.automationsSubTab,
                  onSubTabChange: (sub) => {
                    state.automationsSubTab = sub;
                  },
                  scheduleProps: {
                    loading: state.scheduleLoading,
                    status: state.scheduleStatus,
                    jobDefinitions: state.scheduleJobDefinitions,
                    jobs: state.scheduleJobs,
                    error: state.scheduleError,
                    busy: state.scheduleBusy,
                    form: state.scheduleForm,
                    runsJobId: state.scheduleRunsJobId,
                    runs: state.scheduleRuns,
                    meeseeksLoading: state.automationMeeseeksLoading,
                    meeseeksError: state.automationMeeseeksError,
                    meeseeks: state.automationMeeseeks,
                    onFormChange: (patch) =>
                      (state.scheduleForm = { ...state.scheduleForm, ...patch }),
                    onRefresh: () => {
                      void state.loadSchedules();
                      void loadAutomationMeeseeks(state);
                    },
                    onAdd: () => addScheduleJob(state),
                    onToggle: (job, enabled) => toggleScheduleJob(state, job, enabled),
                    onRun: (job) => runScheduleJob(state, job),
                    onRemove: (job) => removeScheduleJob(state, job),
                    onLoadRuns: (jobId) => loadScheduleRuns(state, jobId),
                  },
                },
              })
            : nothing
        }

        <!-- ═══ SYSTEM ═══ -->
        ${
          state.tab === "system"
            ? renderSystemView({
                subTab: state.systemSubTab,
                onSubTabChange: (sub) => {
                  state.systemSubTab = sub;
                  if (sub === "overview") {
                    void state.loadOverview();
                    return;
                  }
                  if (sub === "sessions") {
                    void loadSessions(state);
                    return;
                  }
                  if (sub === "config") {
                    void loadConfig(state);
                    return;
                  }
                  if (sub === "logs") {
                    void loadLogs(state, { reset: true });
                    return;
                  }
                  if (sub === "debug") {
                    void loadDebug(state);
                    return;
                  }
                  void loadUsage(state);
                },
                overviewProps: {
                  connected: state.connected,
                  hello: state.hello,
                  settings: state.settings,
                  password: state.password,
                  lastError: state.lastError,
                  presenceCount,
                  sessionsCount,
                  scheduleEnabled: state.scheduleStatus?.enabled ?? null,
                  scheduleNext,
                  lastChannelsRefresh: state.channelsLastSuccess,
                  onSettingsChange: (next) => state.applySettings(next),
                  onPasswordChange: (next) => (state.password = next),
                  onConnect: () => state.connect(),
                  onRefresh: () => state.loadOverview(),
                },
                sessionsProps: {
                  loading: state.sessionsLoading,
                  result: state.sessionsResult,
                  error: state.sessionsError,
                  activeMinutes: state.sessionsFilterActive,
                  limit: state.sessionsFilterLimit,
                  includeGlobal: state.sessionsIncludeGlobal,
                  includeUnknown: state.sessionsIncludeUnknown,
                  basePath: state.basePath,
                  onFiltersChange: (next) => {
                    state.sessionsFilterActive = next.activeMinutes;
                    state.sessionsFilterLimit = next.limit;
                    state.sessionsIncludeGlobal = next.includeGlobal;
                    state.sessionsIncludeUnknown = next.includeUnknown;
                    void loadSessions(state, {
                      activeMinutes: Number(next.activeMinutes) || undefined,
                      limit: Number(next.limit) || undefined,
                      includeGlobal: next.includeGlobal,
                      includeUnknown: next.includeUnknown,
                    });
                  },
                  onRefresh: () => loadSessions(state),
                  onPatch: (key, patch) => patchSession(state, key, patch),
                  onDelete: (key) => deleteSession(state, key),
                },
                configProps: {
                  raw: state.configRaw,
                  originalRaw: state.configRawOriginal,
                  valid: state.configValid,
                  issues: state.configIssues,
                  loading: state.configLoading,
                  saving: state.configSaving,
                  applying: state.configApplying,
                  updating: state.updateRunning,
                  connected: state.connected,
                  schema: state.configSchema,
                  schemaLoading: state.configSchemaLoading,
                  uiHints: state.configUiHints,
                  formMode: state.configFormMode,
                  formValue: state.configForm,
                  originalValue: state.configFormOriginal,
                  searchQuery: state.configSearchQuery,
                  activeSection: state.configActiveSection,
                  activeSubsection: state.configActiveSubsection,
                  onRawChange: (next) => {
                    state.configRaw = next;
                  },
                  onFormModeChange: (mode) => (state.configFormMode = mode),
                  onFormPatch: (path, value) => updateConfigFormValue(state, path, value),
                  onSearchChange: (query) => (state.configSearchQuery = query),
                  onSectionChange: (section) => {
                    state.configActiveSection = section;
                    state.configActiveSubsection = null;
                  },
                  onSubsectionChange: (section) => (state.configActiveSubsection = section),
                  onReload: () => loadConfig(state),
                  onSave: () => saveConfig(state),
                  onApply: () => applyConfig(state),
                  onUpdate: () => runUpdate(state),
                },
                debugProps: {
                  loading: state.debugLoading,
                  status: state.debugStatus,
                  health: state.debugHealth,
                  models: state.debugModels,
                  heartbeat: state.debugHeartbeat,
                  eventLog: state.eventLog,
                  callMethod: state.debugCallMethod,
                  callParams: state.debugCallParams,
                  callResult: state.debugCallResult,
                  callError: state.debugCallError,
                  onCallMethodChange: (next) => (state.debugCallMethod = next),
                  onCallParamsChange: (next) => (state.debugCallParams = next),
                  onRefresh: () => loadDebug(state),
                  onCall: () => callDebugMethod(state),
                },
                logsProps: {
                  loading: state.logsLoading,
                  error: state.logsError,
                  file: state.logsFile,
                  entries: state.logsEntries,
                  filterText: state.logsFilterText,
                  levelFilters: state.logsLevelFilters,
                  autoFollow: state.logsAutoFollow,
                  truncated: state.logsTruncated,
                  onFilterTextChange: (next) => (state.logsFilterText = next),
                  onLevelToggle: (level, enabled) => {
                    state.logsLevelFilters = { ...state.logsLevelFilters, [level]: enabled };
                  },
                  onToggleAutoFollow: (next) => (state.logsAutoFollow = next),
                  onRefresh: () => loadLogs(state, { reset: true }),
                  onExport: (lines, label) => state.exportLogs(lines, label),
                  onScroll: (event) => state.handleLogsScroll(event),
                },
                usageProps: {
                  loading: state.usageLoading,
                  error: state.usageError,
                  startDate: state.usageStartDate,
                  endDate: state.usageEndDate,
                  sessions: state.usageResult?.sessions ?? [],
                  sessionsLimitReached: (state.usageResult?.sessions?.length ?? 0) >= 1000,
                  totals: state.usageResult?.totals ?? null,
                  aggregates: state.usageResult?.aggregates ?? null,
                  costDaily: state.usageCostSummary?.daily ?? [],
                  selectedSessions: state.usageSelectedSessions,
                  selectedDays: state.usageSelectedDays,
                  selectedHours: state.usageSelectedHours,
                  chartMode: state.usageChartMode,
                  dailyChartMode: state.usageDailyChartMode,
                  timeSeriesMode: state.usageTimeSeriesMode,
                  timeSeriesBreakdownMode: state.usageTimeSeriesBreakdownMode,
                  timeSeries: state.usageTimeSeries,
                  timeSeriesLoading: state.usageTimeSeriesLoading,
                  sessionLogs: state.usageSessionLogs,
                  sessionLogsLoading: state.usageSessionLogsLoading,
                  sessionLogsExpanded: state.usageSessionLogsExpanded,
                  logFilterRoles: state.usageLogFilterRoles,
                  logFilterTools: state.usageLogFilterTools,
                  logFilterHasTools: state.usageLogFilterHasTools,
                  logFilterQuery: state.usageLogFilterQuery,
                  query: state.usageQuery,
                  queryDraft: state.usageQueryDraft,
                  sessionSort: state.usageSessionSort,
                  sessionSortDir: state.usageSessionSortDir,
                  recentSessions: state.usageRecentSessions,
                  sessionsTab: state.usageSessionsTab,
                  visibleColumns:
                    state.usageVisibleColumns as import("./views/usage.ts").UsageColumnId[],
                  timeZone: state.usageTimeZone,
                  contextExpanded: state.usageContextExpanded,
                  headerPinned: state.usageHeaderPinned,
                  onStartDateChange: (date) => {
                    state.usageStartDate = date;
                    state.usageSelectedDays = [];
                    state.usageSelectedHours = [];
                    state.usageSelectedSessions = [];
                    debouncedLoadUsage(state);
                  },
                  onEndDateChange: (date) => {
                    state.usageEndDate = date;
                    state.usageSelectedDays = [];
                    state.usageSelectedHours = [];
                    state.usageSelectedSessions = [];
                    debouncedLoadUsage(state);
                  },
                  onRefresh: () => loadUsage(state),
                  onTimeZoneChange: (zone) => {
                    state.usageTimeZone = zone;
                  },
                  onToggleContextExpanded: () => {
                    state.usageContextExpanded = !state.usageContextExpanded;
                  },
                  onToggleSessionLogsExpanded: () => {
                    state.usageSessionLogsExpanded = !state.usageSessionLogsExpanded;
                  },
                  onLogFilterRolesChange: (next) => {
                    state.usageLogFilterRoles = next;
                  },
                  onLogFilterToolsChange: (next) => {
                    state.usageLogFilterTools = next;
                  },
                  onLogFilterHasToolsChange: (next) => {
                    state.usageLogFilterHasTools = next;
                  },
                  onLogFilterQueryChange: (next) => {
                    state.usageLogFilterQuery = next;
                  },
                  onLogFilterClear: () => {
                    state.usageLogFilterRoles = [];
                    state.usageLogFilterTools = [];
                    state.usageLogFilterHasTools = false;
                    state.usageLogFilterQuery = "";
                  },
                  onToggleHeaderPinned: () => {
                    state.usageHeaderPinned = !state.usageHeaderPinned;
                  },
                  onSelectHour: (hour, shiftKey) => {
                    if (shiftKey && state.usageSelectedHours.length > 0) {
                      const allHours = Array.from({ length: 24 }, (_, i) => i);
                      const lastSelected =
                        state.usageSelectedHours[state.usageSelectedHours.length - 1];
                      const lastIdx = allHours.indexOf(lastSelected);
                      const thisIdx = allHours.indexOf(hour);
                      if (lastIdx !== -1 && thisIdx !== -1) {
                        const [start, end] =
                          lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
                        const range = allHours.slice(start, end + 1);
                        state.usageSelectedHours = [
                          ...new Set([...state.usageSelectedHours, ...range]),
                        ];
                      }
                    } else {
                      if (state.usageSelectedHours.includes(hour)) {
                        state.usageSelectedHours = state.usageSelectedHours.filter(
                          (h) => h !== hour,
                        );
                      } else {
                        state.usageSelectedHours = [...state.usageSelectedHours, hour];
                      }
                    }
                  },
                  onQueryDraftChange: (query) => {
                    state.usageQueryDraft = query;
                    if (state.usageQueryDebounceTimer) {
                      window.clearTimeout(state.usageQueryDebounceTimer);
                    }
                    state.usageQueryDebounceTimer = window.setTimeout(() => {
                      state.usageQuery = state.usageQueryDraft;
                      state.usageQueryDebounceTimer = null;
                    }, 250);
                  },
                  onApplyQuery: () => {
                    if (state.usageQueryDebounceTimer) {
                      window.clearTimeout(state.usageQueryDebounceTimer);
                      state.usageQueryDebounceTimer = null;
                    }
                    state.usageQuery = state.usageQueryDraft;
                  },
                  onClearQuery: () => {
                    if (state.usageQueryDebounceTimer) {
                      window.clearTimeout(state.usageQueryDebounceTimer);
                      state.usageQueryDebounceTimer = null;
                    }
                    state.usageQueryDraft = "";
                    state.usageQuery = "";
                  },
                  onSessionSortChange: (sort) => {
                    state.usageSessionSort = sort;
                  },
                  onSessionSortDirChange: (dir) => {
                    state.usageSessionSortDir = dir;
                  },
                  onSessionsTabChange: (tab) => {
                    state.usageSessionsTab = tab;
                  },
                  onToggleColumn: (column) => {
                    if (state.usageVisibleColumns.includes(column)) {
                      state.usageVisibleColumns = state.usageVisibleColumns.filter(
                        (entry) => entry !== column,
                      );
                    } else {
                      state.usageVisibleColumns = [...state.usageVisibleColumns, column];
                    }
                  },
                  onSelectSession: (key, shiftKey) => {
                    state.usageTimeSeries = null;
                    state.usageSessionLogs = null;
                    state.usageRecentSessions = [
                      key,
                      ...state.usageRecentSessions.filter((entry) => entry !== key),
                    ].slice(0, 8);

                    if (shiftKey && state.usageSelectedSessions.length > 0) {
                      const isTokenMode = state.usageChartMode === "tokens";
                      const sortedSessions = [...(state.usageResult?.sessions ?? [])].toSorted(
                        (a, b) => {
                          const valA = isTokenMode
                            ? (a.usage?.totalTokens ?? 0)
                            : (a.usage?.totalCost ?? 0);
                          const valB = isTokenMode
                            ? (b.usage?.totalTokens ?? 0)
                            : (b.usage?.totalCost ?? 0);
                          return valB - valA;
                        },
                      );
                      const allKeys = sortedSessions.map((s) => s.key);
                      const lastSelected =
                        state.usageSelectedSessions[state.usageSelectedSessions.length - 1];
                      const lastIdx = allKeys.indexOf(lastSelected);
                      const thisIdx = allKeys.indexOf(key);
                      if (lastIdx !== -1 && thisIdx !== -1) {
                        const [start, end] =
                          lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
                        const range = allKeys.slice(start, end + 1);
                        const newSelection = [
                          ...new Set([...state.usageSelectedSessions, ...range]),
                        ];
                        state.usageSelectedSessions = newSelection;
                      }
                    } else {
                      if (
                        state.usageSelectedSessions.length === 1 &&
                        state.usageSelectedSessions[0] === key
                      ) {
                        state.usageSelectedSessions = [];
                      } else {
                        state.usageSelectedSessions = [key];
                      }
                    }

                    if (state.usageSelectedSessions.length === 1) {
                      void loadSessionTimeSeries(state, state.usageSelectedSessions[0]);
                      void loadSessionLogs(state, state.usageSelectedSessions[0]);
                    }
                  },
                  onSelectDay: (day, shiftKey) => {
                    if (shiftKey && state.usageSelectedDays.length > 0) {
                      const allDays = (state.usageCostSummary?.daily ?? []).map((d) => d.date);
                      const lastSelected =
                        state.usageSelectedDays[state.usageSelectedDays.length - 1];
                      const lastIdx = allDays.indexOf(lastSelected);
                      const thisIdx = allDays.indexOf(day);
                      if (lastIdx !== -1 && thisIdx !== -1) {
                        const [start, end] =
                          lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
                        const range = allDays.slice(start, end + 1);
                        const newSelection = [...new Set([...state.usageSelectedDays, ...range])];
                        state.usageSelectedDays = newSelection;
                      }
                    } else {
                      if (state.usageSelectedDays.includes(day)) {
                        state.usageSelectedDays = state.usageSelectedDays.filter((d) => d !== day);
                      } else {
                        state.usageSelectedDays = [day];
                      }
                    }
                  },
                  onChartModeChange: (mode) => {
                    state.usageChartMode = mode;
                  },
                  onDailyChartModeChange: (mode) => {
                    state.usageDailyChartMode = mode;
                  },
                  onTimeSeriesModeChange: (mode) => {
                    state.usageTimeSeriesMode = mode;
                  },
                  onTimeSeriesBreakdownChange: (mode) => {
                    state.usageTimeSeriesBreakdownMode = mode;
                  },
                  onClearDays: () => {
                    state.usageSelectedDays = [];
                  },
                  onClearHours: () => {
                    state.usageSelectedHours = [];
                  },
                  onClearSessions: () => {
                    state.usageSelectedSessions = [];
                    state.usageTimeSeries = null;
                    state.usageSessionLogs = null;
                  },
                  onClearFilters: () => {
                    state.usageSelectedDays = [];
                    state.usageSelectedHours = [];
                    state.usageSelectedSessions = [];
                    state.usageTimeSeries = null;
                    state.usageSessionLogs = null;
                  },
                },
              })
            : nothing
        }
      </main>
      ${renderRuntimeUrlConfirmation(state)}
    </div>
  `;
}
