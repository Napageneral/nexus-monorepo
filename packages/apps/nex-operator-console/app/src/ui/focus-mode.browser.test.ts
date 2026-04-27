import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NexusApp } from "./app.ts";

// oxlint-disable-next-line typescript/unbound-method
const originalConnect = NexusApp.prototype.connect;

function mountApp(pathname: string) {
  window.history.replaceState({}, "", pathname);
  const app = document.createElement("nexus-app") as NexusApp;
  document.body.append(app);
  return app;
}

beforeEach(() => {
  NexusApp.prototype.connect = () => {
    // no-op: avoid real runtime WS connections in browser tests
  };
  window.__NEXUS_OPERATOR_CONSOLE_BASE_PATH__ = undefined;
  localStorage.clear();
  document.body.innerHTML = "";
});

afterEach(() => {
  NexusApp.prototype.connect = originalConnect;
  window.__NEXUS_OPERATOR_CONSOLE_BASE_PATH__ = undefined;
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("global chat mount", () => {
  it("mounts the console chat host on the chat tab only", async () => {
    const app = mountApp("/console");
    await app.updateComplete;

    expect(app.tab).toBe("console");
    expect(window.location.pathname).toBe("/chat");
    expect(app.querySelector(".shell")).toBeNull();
    expect(app.renderRoot.querySelector("nexus-console-chat-host")).not.toBeNull();

    app.setTab("integrations");
    await app.updateComplete;

    expect(app.tab).toBe("integrations");
    expect(app.renderRoot.querySelector("nexus-console-chat-host")).toBeNull();
  });
});
