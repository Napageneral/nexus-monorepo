import type { NexusApp } from "./app.ts";
import type { AgentsListResult } from "./types.ts";
import { refreshChat } from "./app-chat.ts";
import {
  startLogsPolling,
  stopLogsPolling,
  startDebugPolling,
  stopDebugPolling,
} from "./app-polling.ts";
import { scheduleChatScroll, scheduleLogsScroll } from "./app-scroll.ts";
import { loadAclRequests } from "./controllers/acl-requests.ts";
import { loadAgentIdentities, loadAgentIdentity } from "./controllers/agent-identity.ts";
import { loadAgentSkills } from "./controllers/agent-skills.ts";
import { loadAgents } from "./controllers/agents.ts";
import { loadInstalledApps } from "./controllers/apps.ts";
import { loadChannels } from "./controllers/channels.ts";
import { loadConfig, loadConfigSchema } from "./controllers/config.ts";
import { loadConversations } from "./controllers/conversations.ts";
import { loadDebug } from "./controllers/debug.ts";
import { loadIdentitySurface } from "./controllers/identity.ts";
import { loadIngressCredentials } from "./controllers/ingress-credentials.ts";
import { loadIntegrations } from "./controllers/integrations.ts";
import { loadLogs } from "./controllers/logs.ts";
import { loadMemoryRuns, runMemorySearch } from "./controllers/memory-review.ts";
import { loadPresence } from "./controllers/presence.ts";
import { loadAutomationMeeseeks, loadScheduleJobs } from "./controllers/schedules.ts";
import { loadSessions } from "./controllers/sessions.ts";
import { loadSkills } from "./controllers/skills.ts";
import { loadUsage } from "./controllers/usage.ts";
import {
  inferBasePathFromPathname,
  normalizeBasePath,
  normalizePath,
  pathForTab,
  tabFromPath,
  type Tab,
} from "./navigation.ts";
import { saveSettings, type UiSettings } from "./storage.ts";
import { startThemeTransition, type ThemeTransitionContext } from "./theme-transition.ts";
import { resolveTheme, type ResolvedTheme, type ThemeMode } from "./theme.ts";

type SettingsHost = {
  settings: UiSettings;
  password?: string;
  theme: ThemeMode;
  themeResolved: ResolvedTheme;
  applySessionKey: string;
  conversationId: string;
  sessionKey: string;
  tab: Tab;
  connected: boolean;
  chatHasAutoScrolled: boolean;
  logsAtBottom: boolean;
  eventLog: unknown[];
  eventLogBuffer: unknown[];
  basePath: string;
  agentsList?: AgentsListResult | null;
  agentsSelectedId?: string | null;
  agentsPanel?: "overview" | "files" | "tools" | "skills" | "accounts" | "automations";
  directorySearchQuery: string;
  directorySelectedEntityId: string | null;
  memorySearchQuery?: string;
  memorySearchType?: "all" | "facts" | "entities" | "observations";
  themeMedia: MediaQueryList | null;
  themeMediaHandler: ((event: MediaQueryListEvent) => void) | null;
  pendingRuntimeUrl?: string | null;
};

export function applySettings(host: SettingsHost, next: UiSettings) {
  const conversationId = next.conversationId?.trim() || "";
  const normalized = {
    ...next,
    conversationId,
    lastActiveSessionKey: next.lastActiveSessionKey?.trim() || "",
  };
  host.settings = normalized;
  host.conversationId = normalized.conversationId;
  saveSettings(normalized);
  if (next.theme !== host.theme) {
    host.theme = next.theme;
    applyResolvedTheme(host, resolveTheme(next.theme));
  }
  host.applySessionKey = host.settings.lastActiveSessionKey;
}

export function setLastActiveSessionKey(host: SettingsHost, next: string) {
  const trimmed = next.trim();
  if (!trimmed) {
    return;
  }
  if (host.settings.lastActiveSessionKey === trimmed) {
    return;
  }
  applySettings(host, { ...host.settings, lastActiveSessionKey: trimmed });
}

export function applySettingsFromUrl(host: SettingsHost) {
  if (!window.location.search && !window.location.hash) {
    return;
  }
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);

  const tokenRaw = params.get("token") ?? hashParams.get("token");
  const passwordRaw = params.get("password") ?? hashParams.get("password");
  const conversationRaw = params.get("conversation") ?? hashParams.get("conversation");
  const runtimeUrlRaw = params.get("runtimeUrl") ?? hashParams.get("runtimeUrl");
  let shouldCleanUrl = false;

  if (tokenRaw != null) {
    const token = tokenRaw.trim();
    if (token && token !== host.settings.token) {
      applySettings(host, { ...host.settings, token });
    }
    params.delete("token");
    hashParams.delete("token");
    shouldCleanUrl = true;
  }

  if (passwordRaw != null) {
    params.delete("password");
    hashParams.delete("password");
    shouldCleanUrl = true;
  }

  if (conversationRaw != null) {
    const conversationId = conversationRaw.trim();
    if (conversationId) {
      applySettings(host, {
        ...host.settings,
        conversationId,
      });
    }
  }

  if (runtimeUrlRaw != null) {
    const runtimeUrl = runtimeUrlRaw.trim();
    if (runtimeUrl && runtimeUrl !== host.settings.runtimeUrl) {
      host.pendingRuntimeUrl = runtimeUrl;
    }
    params.delete("runtimeUrl");
    hashParams.delete("runtimeUrl");
    shouldCleanUrl = true;
  }

  if (!shouldCleanUrl) {
    return;
  }
  url.search = params.toString();
  const nextHash = hashParams.toString();
  url.hash = nextHash ? `#${nextHash}` : "";
  window.history.replaceState({}, "", url.toString());
}

export function setTab(host: SettingsHost, next: Tab) {
  if (host.tab !== next) {
    host.tab = next;
  }
  if (next === "console") {
    host.chatHasAutoScrolled = false;
  }
  if (next === "system" && (host as unknown as NexusApp).systemSubTab === "logs") {
    startLogsPolling(host as unknown as Parameters<typeof startLogsPolling>[0]);
  } else {
    stopLogsPolling(host as unknown as Parameters<typeof stopLogsPolling>[0]);
  }
  if (next === "system" && (host as unknown as NexusApp).systemSubTab === "debug") {
    startDebugPolling(host as unknown as Parameters<typeof startDebugPolling>[0]);
  } else {
    stopDebugPolling(host as unknown as Parameters<typeof stopDebugPolling>[0]);
  }
  void refreshActiveTab(host);
  syncUrlWithTab(host, next, false);
}

export function setTheme(host: SettingsHost, next: ThemeMode, context?: ThemeTransitionContext) {
  const applyTheme = () => {
    host.theme = next;
    applySettings(host, { ...host.settings, theme: next });
    applyResolvedTheme(host, resolveTheme(next));
  };
  startThemeTransition({
    nextTheme: next,
    applyTheme,
    context,
    currentTheme: host.theme,
  });
}

export async function refreshActiveTab(host: SettingsHost) {
  // ─── Primary tabs ────────────────────────────────────────────
  if (host.tab === "console") {
    await refreshChat(host as unknown as Parameters<typeof refreshChat>[0]);
    scheduleChatScroll(
      host as unknown as Parameters<typeof scheduleChatScroll>[0],
      !host.chatHasAutoScrolled,
    );
  }
  if (host.tab === "home") {
    await Promise.all([
      loadOverview(host),
      loadAclRequests(host as unknown as Parameters<typeof loadAclRequests>[0]),
      loadIdentitySurface(host as unknown as Parameters<typeof loadIdentitySurface>[0]),
      loadMemoryRuns(host as unknown as NexusApp),
    ]);
  }
  if (host.tab === "agents") {
    await loadAgents(host as unknown as NexusApp);
    await loadConfig(host as unknown as NexusApp);
    const agentIds = host.agentsList?.agents?.map((entry) => entry.id) ?? [];
    if (agentIds.length > 0) {
      void loadAgentIdentities(host as unknown as NexusApp, agentIds);
    }
    const agentId =
      host.agentsSelectedId ?? host.agentsList?.defaultId ?? host.agentsList?.agents?.[0]?.id;
    if (agentId) {
      void loadAgentIdentity(host as unknown as NexusApp, agentId);
      if (host.agentsPanel === "skills") {
        void loadAgentSkills(host as unknown as NexusApp, agentId);
      }
      if (host.agentsPanel === "accounts") {
        void loadIntegrations(host as unknown as NexusApp);
      }
      if (host.agentsPanel === "automations") {
        void loadSchedules(host);
      }
    }
  }
  if (host.tab === "identity") {
    const identitySubTab = (host as unknown as NexusApp).identitySubTab;
    if (identitySubTab === "entities") {
      host.directorySelectedEntityId = null;
      host.directorySearchQuery = "";
      host.memorySearchQuery = "";
      host.memorySearchType = "entities";
      await runMemorySearch(host as unknown as NexusApp);
    } else if (identitySubTab === "access") {
      await loadAclRequests(host as unknown as Parameters<typeof loadAclRequests>[0]);
      await loadIngressCredentials(host as unknown as Parameters<typeof loadIngressCredentials>[0]);
    } else {
      await loadIdentitySurface(host as unknown as Parameters<typeof loadIdentitySurface>[0]);
    }
  }
  if (host.tab === "integrations") {
    await loadIntegrations(host as unknown as Parameters<typeof loadIntegrations>[0]);
    await loadIngressCredentials(host as unknown as Parameters<typeof loadIngressCredentials>[0]);
    await loadInstalledApps(host as unknown as Parameters<typeof loadInstalledApps>[0]);
  }
  if (host.tab === "memory") {
    if (!host.memorySearchQuery?.trim()) {
      host.memorySearchType = "all";
    }
    await loadMemoryRuns(host as unknown as NexusApp);
  }
  if (host.tab === "operations") {
    const operationsSubTab = (host as unknown as NexusApp).operationsSubTab;
    if (operationsSubTab === "overview") {
      await loadSchedules(host);
    } else {
      await loadSchedules(host);
    }
  }
  // ─── System sub-views ────────────────────────────────────────
  if (host.tab === "system") {
    const systemSubTab = (host as unknown as NexusApp).systemSubTab;
    if (systemSubTab === "overview") {
      await loadOverview(host);
    }
    if (systemSubTab === "sessions") {
      await loadSessions(host as unknown as Parameters<typeof loadSessions>[0]);
    }
    if (systemSubTab === "config") {
      await loadConfigSchema(host as unknown as NexusApp);
      await loadConfig(host as unknown as NexusApp);
    }
    if (systemSubTab === "debug") {
      await loadDebug(host as unknown as NexusApp);
      host.eventLog = host.eventLogBuffer;
    }
    if (systemSubTab === "logs") {
      host.logsAtBottom = true;
      await loadLogs(host as unknown as NexusApp, { reset: true });
      scheduleLogsScroll(host as unknown as Parameters<typeof scheduleLogsScroll>[0], true);
    }
    if (systemSubTab === "usage") {
      await loadUsage(host as unknown as NexusApp);
    }
  }
}

export function inferBasePath() {
  if (typeof window === "undefined") {
    return "";
  }
  const configured = window.__NEXUS_OPERATOR_CONSOLE_BASE_PATH__;
  if (typeof configured === "string" && configured.trim()) {
    return normalizeBasePath(configured);
  }
  return inferBasePathFromPathname(window.location.pathname);
}

export function syncThemeWithSettings(host: SettingsHost) {
  host.theme = host.settings.theme ?? "system";
  applyResolvedTheme(host, resolveTheme(host.theme));
}

export function applyResolvedTheme(host: SettingsHost, resolved: ResolvedTheme) {
  host.themeResolved = resolved;
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

export function attachThemeListener(host: SettingsHost) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return;
  }
  host.themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
  host.themeMediaHandler = (event) => {
    if (host.theme !== "system") {
      return;
    }
    applyResolvedTheme(host, event.matches ? "dark" : "light");
  };
  if (typeof host.themeMedia.addEventListener === "function") {
    host.themeMedia.addEventListener("change", host.themeMediaHandler);
    return;
  }
  const legacy = host.themeMedia as MediaQueryList & {
    addListener: (cb: (event: MediaQueryListEvent) => void) => void;
  };
  legacy.addListener(host.themeMediaHandler);
}

export function detachThemeListener(host: SettingsHost) {
  if (!host.themeMedia || !host.themeMediaHandler) {
    return;
  }
  if (typeof host.themeMedia.removeEventListener === "function") {
    host.themeMedia.removeEventListener("change", host.themeMediaHandler);
    return;
  }
  const legacy = host.themeMedia as MediaQueryList & {
    removeListener: (cb: (event: MediaQueryListEvent) => void) => void;
  };
  legacy.removeListener(host.themeMediaHandler);
  host.themeMedia = null;
  host.themeMediaHandler = null;
}

export function syncTabWithLocation(host: SettingsHost, replace: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  const resolved = tabFromPath(window.location.pathname, host.basePath) ?? "home";
  setTabFromRoute(host, resolved);
  syncUrlWithTab(host, resolved, replace);
}

export function onPopState(host: SettingsHost) {
  if (typeof window === "undefined") {
    return;
  }
  const resolved = tabFromPath(window.location.pathname, host.basePath);
  if (!resolved) {
    return;
  }

  const url = new URL(window.location.href);
  const conversationId = url.searchParams.get("conversation")?.trim();
  if (conversationId) {
    applySettings(host, {
      ...host.settings,
      conversationId,
    });
  }

  setTabFromRoute(host, resolved);
}

export function setTabFromRoute(host: SettingsHost, next: Tab) {
  if (host.tab !== next) {
    host.tab = next;
  }
  if (next === "console") {
    host.chatHasAutoScrolled = false;
  }
  if (next === "system" && (host as unknown as NexusApp).systemSubTab === "logs") {
    startLogsPolling(host as unknown as Parameters<typeof startLogsPolling>[0]);
  } else {
    stopLogsPolling(host as unknown as Parameters<typeof stopLogsPolling>[0]);
  }
  if (next === "system" && (host as unknown as NexusApp).systemSubTab === "debug") {
    startDebugPolling(host as unknown as Parameters<typeof startDebugPolling>[0]);
  } else {
    stopDebugPolling(host as unknown as Parameters<typeof stopDebugPolling>[0]);
  }
  if (host.connected) {
    void refreshActiveTab(host);
  }
}

export function syncUrlWithTab(host: SettingsHost, tab: Tab, replace: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  const targetPath = normalizePath(pathForTab(tab, host.basePath));
  const currentPath = normalizePath(window.location.pathname);
  const url = new URL(window.location.href);

  if (tab === "console" && host.conversationId) {
    url.searchParams.set("conversation", host.conversationId);
  } else {
    url.searchParams.delete("conversation");
  }

  if (currentPath !== targetPath) {
    url.pathname = targetPath;
  }

  if (replace) {
    window.history.replaceState({}, "", url.toString());
  } else {
    window.history.pushState({}, "", url.toString());
  }
}

export function syncUrlWithConversationId(
  host: SettingsHost,
  conversationId: string,
  replace: boolean,
) {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  if (conversationId.trim()) {
    url.searchParams.set("conversation", conversationId);
  } else {
    url.searchParams.delete("conversation");
  }
  if (replace) {
    window.history.replaceState({}, "", url.toString());
  } else {
    window.history.pushState({}, "", url.toString());
  }
}

export async function loadOverview(host: SettingsHost) {
  await Promise.all([
    loadIntegrations(host as unknown as NexusApp),
    loadIngressCredentials(host as unknown as NexusApp),
    loadPresence(host as unknown as NexusApp),
    loadConversations(host as unknown as NexusApp),
    loadSessions(host as unknown as NexusApp),
    loadScheduleJobs(host as unknown as NexusApp),
    loadDebug(host as unknown as NexusApp),
  ]);
}

export async function loadChannelsTab(host: SettingsHost) {
  await Promise.all([
    loadChannels(host as unknown as NexusApp, true),
    loadConfigSchema(host as unknown as NexusApp),
    loadConfig(host as unknown as NexusApp),
  ]);
}

export async function loadSchedules(host: SettingsHost) {
  await Promise.all([
    loadScheduleJobs(host as unknown as NexusApp),
    loadAutomationMeeseeks(host as unknown as NexusApp),
  ]);
}
