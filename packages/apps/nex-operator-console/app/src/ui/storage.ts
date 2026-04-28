const KEY = "nexus.control.settings";
const LEGACY_KEY = "nexus.control.settings.v1";

import type { ThemeMode } from "./theme.ts";

export type UiSettings = {
  runtimeUrl: string;
  token: string;
  conversationId: string;
  lastActiveSessionKey: string;
  theme: ThemeMode;
  chatFocusMode: boolean;
  chatShowThinking: boolean;
  splitRatio: number; // Sidebar split ratio (0.4 to 0.7, default 0.6)
  navCollapsed: boolean; // Collapsible sidebar state
  navGroupsCollapsed: Record<string, boolean>; // Which nav groups are collapsed
};

function defaultRuntimeUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}`;
}

function isRuntimeServedConsole(): boolean {
  return location.pathname === "/app/console" || location.pathname.startsWith("/app/console/");
}

function resolveRuntimeUrl(stored: unknown, fallback: string): string {
  const parsed = typeof stored === "string" && stored.trim() ? stored.trim() : fallback;
  // A console loaded from the runtime itself should not be stranded by an old
  // dev-server or remote runtime URL persisted in localStorage.
  if (isRuntimeServedConsole()) {
    return fallback;
  }
  return parsed;
}

export function loadSettings(): UiSettings {
  const defaultUrl = defaultRuntimeUrl();

  const defaults: UiSettings = {
    runtimeUrl: defaultUrl,
    token: "",
    conversationId: "",
    lastActiveSessionKey: "",
    theme: "system",
    chatFocusMode: false,
    chatShowThinking: true,
    splitRatio: 0.6,
    navCollapsed: false,
    navGroupsCollapsed: {},
  };

  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    const resolved = {
      runtimeUrl: resolveRuntimeUrl(parsed.runtimeUrl, defaults.runtimeUrl),
      token: typeof parsed.token === "string" ? parsed.token : defaults.token,
      conversationId:
        typeof parsed.conversationId === "string" && parsed.conversationId.trim()
          ? parsed.conversationId.trim()
          : defaults.conversationId,
      lastActiveSessionKey:
        typeof parsed.lastActiveSessionKey === "string" && parsed.lastActiveSessionKey.trim()
          ? parsed.lastActiveSessionKey.trim()
          : defaults.lastActiveSessionKey,
      theme:
        parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system"
          ? parsed.theme
          : defaults.theme,
      chatFocusMode:
        typeof parsed.chatFocusMode === "boolean" ? parsed.chatFocusMode : defaults.chatFocusMode,
      chatShowThinking:
        typeof parsed.chatShowThinking === "boolean"
          ? parsed.chatShowThinking
          : defaults.chatShowThinking,
      splitRatio:
        typeof parsed.splitRatio === "number" &&
        parsed.splitRatio >= 0.4 &&
        parsed.splitRatio <= 0.7
          ? parsed.splitRatio
          : defaults.splitRatio,
      navCollapsed:
        typeof parsed.navCollapsed === "boolean" ? parsed.navCollapsed : defaults.navCollapsed,
      navGroupsCollapsed:
        typeof parsed.navGroupsCollapsed === "object" && parsed.navGroupsCollapsed !== null
          ? parsed.navGroupsCollapsed
          : defaults.navGroupsCollapsed,
    };
    if (!localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, JSON.stringify(resolved));
      localStorage.removeItem(LEGACY_KEY);
    }
    return resolved;
  } catch {
    return defaults;
  }
}

export function saveSettings(next: UiSettings) {
  localStorage.setItem(KEY, JSON.stringify(next));
}
