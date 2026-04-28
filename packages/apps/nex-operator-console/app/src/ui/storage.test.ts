import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSettings } from "./storage.ts";

const SETTINGS_KEY = "nexus.control.settings";

describe("loadSettings", () => {
  const originalUrl = window.location.href;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", originalUrl);
  });

  it("uses the current runtime origin for runtime-served console pages", () => {
    window.history.replaceState({}, "", "/app/console/chat");
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        runtimeUrl: "ws://127.0.0.1:9",
      }),
    );

    expect(loadSettings().runtimeUrl).toBe(`ws://${window.location.host}`);
  });

  it("preserves a saved runtime URL for non-runtime-served pages", () => {
    window.history.replaceState({}, "", "/");
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        runtimeUrl: "ws://127.0.0.1:18789",
      }),
    );

    expect(loadSettings().runtimeUrl).toBe("ws://127.0.0.1:18789");
  });
});
