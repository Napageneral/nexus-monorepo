import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab } from "./navigation.ts";
import { setTabFromRoute, syncUrlWithTab } from "./app-settings.ts";

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

  it("does not coerce mounted console routes into integrations", () => {
    const host = createHost("home");
    host.basePath = "/app/console";

    setTabFromRoute(host, "console");
    expect(host.tab).toBe("console");

    setTabFromRoute(host, "home");
    expect(host.tab).toBe("home");
  });

  it("strips memory-scoped query params when leaving memory", () => {
    const host = createHost("memory");
    host.basePath = "/app/console";
    window.history.replaceState(
      {},
      "",
      "/app/console/memory?memory_scope=run&memory_bucket=unconsolidated_facts&memory_run=run-1",
    );

    syncUrlWithTab(host, "integrations", true);

    const url = new URL(window.location.href);
    expect(url.pathname).toBe("/app/console/integrations");
    expect(url.searchParams.get("memory_scope")).toBeNull();
    expect(url.searchParams.get("memory_bucket")).toBeNull();
    expect(url.searchParams.get("memory_run")).toBeNull();
  });

  it("preserves nested identity detail routes during hydration sync", () => {
    const host = createHost("identity");
    host.basePath = "/app/console";
    window.history.replaceState({}, "", "/app/console/identity/entity/entity-casey");

    syncUrlWithTab(host, "identity", true, { preserveNestedPath: true });

    expect(window.location.pathname).toBe("/app/console/identity/entity/entity-casey");
  });

  it("does not preserve arbitrary nested paths outside known identity detail routes", () => {
    const host = createHost("integrations");
    host.basePath = "/app/console";
    window.history.replaceState({}, "", "/app/console/integrations/custom/legacy");

    syncUrlWithTab(host, "integrations", true, { preserveNestedPath: true });

    expect(window.location.pathname).toBe("/app/console/integrations");
  });
});
