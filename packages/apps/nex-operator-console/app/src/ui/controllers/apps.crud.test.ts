import { describe, expect, it, vi } from "vitest";
import { installApp, type AppsState } from "./apps.ts";

type ClientRequestMock = ReturnType<typeof vi.fn>;

function makeState(requestMock: ClientRequestMock): AppsState {
  return {
    client: {
      request: requestMock as NonNullable<AppsState["client"]>["request"],
    },
    connected: true,
    appsLoading: false,
    appsError: null,
    installedApps: [],
    selectedAppId: "",
    appMethodsLoading: false,
    appMethodsError: null,
    appMethods: [],
  };
}

describe("apps CRUD controller", () => {
  // ---------------------------------------------------------------------------
  // installApp
  // ---------------------------------------------------------------------------
  describe("installApp", () => {
    it("installs an app and refreshes the list", async () => {
      const request = vi
        .fn()
        .mockResolvedValueOnce({ ok: true }) // apps.install
        .mockResolvedValueOnce({ // apps.list (from loadInstalledApps refresh)
          apps: [{ id: "my-app", display_name: "My App", status: "installed" }],
        })
        .mockResolvedValueOnce({ // apps.methods (from loadInstalledAppMethods)
          methods: [{ name: "doStuff", action: "run" }],
        });
      const state = makeState(request);

      const ok = await installApp(state, "my-app");

      expect(ok).toBe(true);
      expect(request).toHaveBeenNthCalledWith(1, "apps.install", { id: "my-app" });
      expect(request).toHaveBeenNthCalledWith(2, "apps.list", {});
      expect(state.installedApps).toHaveLength(1);
      expect(state.installedApps[0].id).toBe("my-app");
    });

    it("returns false on request failure", async () => {
      const request = vi.fn().mockRejectedValueOnce(new Error("install failed"));
      const state = makeState(request);

      const ok = await installApp(state, "bad-app");

      expect(ok).toBe(false);
    });

    it("returns false when disconnected", async () => {
      const request = vi.fn();
      const state = makeState(request);
      state.connected = false;

      const ok = await installApp(state, "my-app");

      expect(ok).toBe(false);
      expect(request).not.toHaveBeenCalled();
    });
  });
});
