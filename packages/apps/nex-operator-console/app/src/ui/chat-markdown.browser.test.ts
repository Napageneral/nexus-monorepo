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

describe("chat markdown rendering", () => {
  it("renders markdown inside the agent detail chat panel", async () => {
    const app = mountApp("/agents");
    await app.updateComplete;

    const timestamp = Date.now();
    app.connected = true;
    (app as unknown as { _consoleAgentDetailId?: string })._consoleAgentDetailId = "agent-test";
    app.chatMessages = [
      {
        role: "assistant",
        content: [
          { type: "toolcall", name: "noop", arguments: {} },
          { type: "toolresult", name: "noop", text: "Hello **world**" },
        ],
        timestamp,
      },
    ];
    (app as unknown as { tab?: string }).tab = "__console_force__";
    app.setTab("agents");

    await app.updateComplete;

    const toolCards = Array.from(app.renderRoot.querySelectorAll<HTMLElement>(".chat-tool-card"));
    const toolCard = toolCards.find((card) =>
      card.querySelector(".chat-tool-card__preview, .chat-tool-card__inline"),
    );
    expect(toolCard).not.toBeUndefined();
    toolCard?.click();

    await app.updateComplete;

    const strong = app.renderRoot.querySelector(".sidebar-markdown strong");
    expect(strong?.textContent).toBe("world");
  });
});
