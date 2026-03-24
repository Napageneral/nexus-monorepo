import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab } from "./navigation.ts";
import { setTabFromRoute } from "./app-settings.ts";

type SettingsHost = Parameters<typeof setTabFromRoute>[0] & {
  logsPollInterval: number | null;
  debugPollInterval: number | null;
  systemSubTab: "overview" | "config" | "logs" | "debug" | "usage";
};

const createHost = (tab: Tab): SettingsHost => ({
  settings: {
    runtimeUrl: "",
    token: "",
    conversationId: "",
    lastActiveSessionKey: "main",
    theme: "system",
    chatFocusMode: false,
    chatShowThinking: true,
    splitRatio: 0.6,
    navCollapsed: false,
    navGroupsCollapsed: {},
  },
  theme: "system",
  themeResolved: "dark",
  applySessionKey: "main",
  conversationId: "",
  sessionKey: "",
  tab,
  connected: false,
  chatHasAutoScrolled: false,
  logsAtBottom: false,
  eventLog: [],
  eventLogBuffer: [],
  basePath: "",
  themeMedia: null,
  themeMediaHandler: null,
  directorySearchQuery: "",
  directorySelectedEntityId: null,
  logsPollInterval: null,
  debugPollInterval: null,
  systemSubTab: "overview",
});

describe("setTabFromRoute", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts and stops log polling based on the tab", () => {
    const host = createHost("console");
    host.systemSubTab = "logs";

    setTabFromRoute(host, "system");
    expect(host.logsPollInterval).not.toBeNull();
    expect(host.debugPollInterval).toBeNull();

    setTabFromRoute(host, "console");
    expect(host.logsPollInterval).toBeNull();
  });

  it("starts and stops debug polling based on the tab", () => {
    const host = createHost("console");
    host.systemSubTab = "debug";

    setTabFromRoute(host, "system");
    expect(host.debugPollInterval).not.toBeNull();
    expect(host.logsPollInterval).toBeNull();

    setTabFromRoute(host, "console");
    expect(host.debugPollInterval).toBeNull();
  });
});
