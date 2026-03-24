import { describe, expect, it, vi } from "vitest";
import {
  loadInstalledApps,
  loadInstalledAppMethods,
  type InstalledApp,
  type InstalledAppMethod,
} from "./apps.ts";

function createState(request: (method: string, params?: unknown) => Promise<unknown>) {
  return {
    client: {
      request: request as <T>(method: string, params?: unknown) => Promise<T>,
    },
    connected: true,
    appsLoading: false,
    appsError: null as string | null,
    installedApps: [] as InstalledApp[],
    selectedAppId: "",
    appMethodsLoading: false,
    appMethodsError: null as string | null,
    appMethods: [] as InstalledAppMethod[],
  };
}

describe("apps controller", () => {
  it("loads installed apps and the selected app methods", async () => {
    const request = vi.fn(async (method: string, params?: unknown) => {
      switch (method) {
        case "apps.list":
          return {
            apps: [
              { id: "crm", display_name: "CRM", version: "1.0.0" },
              { id: "support", display_name: "Support", version: "1.2.0" },
            ],
          };
        case "apps.methods":
          expect(params).toEqual({ id: "crm" });
          return {
            methods: [{ name: "contacts.sync", action: "write", description: "Sync contacts" }],
          };
        default:
          throw new Error(`unexpected method: ${method}`);
      }
    });

    const state = createState(request);
    await loadInstalledApps(state);

    expect(request.mock.calls).toEqual([
      ["apps.list", {}],
      ["apps.methods", { id: "crm" }],
    ]);
    expect(state.selectedAppId).toBe("crm");
    expect(state.installedApps).toHaveLength(2);
    expect(state.appMethods).toHaveLength(1);
  });

  it("loads methods for a selected app", async () => {
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method !== "apps.methods") {
        throw new Error(`unexpected method: ${method}`);
      }
      expect(params).toEqual({ id: "crm" });
      return {
        methods: [{ name: "contacts.sync", action: "write" }],
      };
    });

    const state = createState(request);
    await loadInstalledAppMethods(state, "crm");

    expect(state.selectedAppId).toBe("crm");
    expect(state.appMethods).toEqual([{ name: "contacts.sync", action: "write" }]);
  });
});
