import { describe, expect, it } from "vitest";
import {
  TAB_GROUPS,
  iconForTab,
  inferBasePathFromPathname,
  normalizeBasePath,
  normalizePath,
  pathForTab,
  subtitleForTab,
  tabFromPath,
  titleForTab,
  type Tab,
} from "./navigation.ts";

const ALL_TABS: Tab[] = TAB_GROUPS.flatMap((group) => [...group.tabs]) as Tab[];

describe("navigation metadata", () => {
  it("returns icon, title, and subtitle for every canonical tab", () => {
    for (const tab of ALL_TABS) {
      expect(iconForTab(tab)).toBeTruthy();
      expect(titleForTab(tab)).toBeTruthy();
      expect(typeof subtitleForTab(tab)).toBe("string");
    }
  });

  it("uses the operator-console IA labels", () => {
    expect(titleForTab("home")).toBe("Home");
    expect(titleForTab("identity")).toBe("Identity");
    expect(titleForTab("operations")).toBe("Operations");
    expect(titleForTab("console")).toBe("Console");
    expect(titleForTab("system")).toBe("System");
    expect(subtitleForTab("identity")).toContain("Entities");
    expect(subtitleForTab("integrations")).toContain("Integrations");
  });
});

describe("path helpers", () => {
  it("normalizes base paths and regular paths", () => {
    expect(normalizeBasePath("")).toBe("");
    expect(normalizeBasePath("ui")).toBe("/ui");
    expect(normalizeBasePath("/ui/")).toBe("/ui");
    expect(normalizeBasePath("/")).toBe("");

    expect(normalizePath("console")).toBe("/console");
    expect(normalizePath("/console/")).toBe("/console");
    expect(normalizePath("")).toBe("/");
  });

  it("builds canonical tab paths", () => {
    expect(pathForTab("home")).toBe("/home");
    expect(pathForTab("console")).toBe("/console");
    expect(pathForTab("operations")).toBe("/operations");
    expect(pathForTab("system", "/ui")).toBe("/ui/system");
  });

  it("resolves canonical tabs from paths", () => {
    expect(tabFromPath("/")).toBe("home");
    expect(tabFromPath("/console")).toBe("console");
    expect(tabFromPath("/identity")).toBe("identity");
    expect(tabFromPath("/operations")).toBe("operations");
    expect(tabFromPath("/ui/system", "/ui")).toBe("system");
    expect(tabFromPath("/apps/nexus/integrations", "/apps/nexus")).toBe("integrations");
  });

  it("rejects removed legacy routes", () => {
    expect(tabFromPath("/command-center")).toBeNull();
    expect(tabFromPath("/access")).toBeNull();
    expect(tabFromPath("/adapters")).toBeNull();
    expect(tabFromPath("/work")).toBeNull();
    expect(tabFromPath("/automations")).toBeNull();
    expect(tabFromPath("/system/overview")).toBe("system");
  });

  it("infers base paths from canonical routes", () => {
    expect(inferBasePathFromPathname("/")).toBe("");
    expect(inferBasePathFromPathname("/console")).toBe("");
    expect(inferBasePathFromPathname("/ui/system")).toBe("/ui");
    expect(inferBasePathFromPathname("/apps/nexus/integrations")).toBe("/apps/nexus");
    expect(inferBasePathFromPathname("/index.html")).toBe("");
  });
});

describe("tab groups", () => {
  it("matches the operator/system split", () => {
    expect(TAB_GROUPS.map((group) => group.label)).toEqual(["Operator", "System"]);
  });

  it("keeps tab ids unique", () => {
    const uniqueTabs = new Set(ALL_TABS);
    expect(uniqueTabs.size).toBe(ALL_TABS.length);
  });
});
