import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NexusApp } from "./app.ts";
import "../styles.css";

// oxlint-disable-next-line typescript/unbound-method
const originalConnect = NexusApp.prototype.connect;

function mountApp(pathname: string) {
  window.history.replaceState({}, "", pathname);
  const app = document.createElement("nexus-app") as NexusApp;
  document.body.append(app);
  return app;
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
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

describe("operator console routing", () => {
  it("hydrates the tab from the location", async () => {
    const app = mountApp("/agents");
    await app.updateComplete;

    expect(app.tab).toBe("agents");
    expect(window.location.pathname).toBe("/agents");
  });

  it("hydrates integrations tab from the location", async () => {
    const app = mountApp("/integrations");
    await app.updateComplete;

    expect(app.tab).toBe("integrations");
    expect(window.location.pathname).toBe("/connectors");
  });

  it("hydrates operations tab from the location", async () => {
    const app = mountApp("/operations");
    await app.updateComplete;

    expect(app.tab).toBe("operations");
    expect(window.location.pathname).toBe("/jobs");
  });

  it("respects /ui base paths", async () => {
    const app = mountApp("/ui/operations");
    await app.updateComplete;

    expect(app.basePath).toBe("/ui");
    expect(app.tab).toBe("operations");
    expect(window.location.pathname).toBe("/ui/jobs");
  });

  it("infers nested base paths", async () => {
    const app = mountApp("/apps/nexus/operations");
    await app.updateComplete;

    expect(app.basePath).toBe("/apps/nexus");
    expect(app.tab).toBe("operations");
    expect(window.location.pathname).toBe("/apps/nexus/jobs");
  });

  it("honors explicit base path overrides", async () => {
    window.__NEXUS_OPERATOR_CONSOLE_BASE_PATH__ = "/nexus";
    const app = mountApp("/nexus/identity");
    await app.updateComplete;

    expect(app.basePath).toBe("/nexus");
    expect(app.tab).toBe("identity");
    expect(window.location.pathname).toBe("/nexus/identity");
  });

  it("updates the URL when clicking nav items", async () => {
    const app = mountApp("/app/console/identity/channels");
    await app.updateComplete;

    const subTabs = Array.from(
      app.renderRoot.querySelectorAll<HTMLButtonElement>(".console-detail-tab"),
    );
    const groupsButton = subTabs.find((button) =>
      button.textContent?.toLowerCase().includes("groups"),
    );
    expect(groupsButton).not.toBeUndefined();
    groupsButton?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );

    await app.updateComplete;
    expect(app.tab).toBe("identity");
    expect(window.location.pathname).toBe("/app/console/identity/groups");
    expect(window.location.search).toBe("");
  });

  it("loads canonical mounted connectors routes without query state", async () => {
    const app = mountApp("/app/console/connectors");
    await app.updateComplete;

    expect(app.basePath).toBe("/app/console");
    expect(app.tab).toBe("integrations");
    expect(window.location.pathname).toBe("/app/console/connectors");
    expect(window.location.search).toBe("");
  });

  it("loads canonical mounted records routes without query state", async () => {
    const app = mountApp("/app/console/records");
    await app.updateComplete;

    expect(app.basePath).toBe("/app/console");
    expect(app.tab).toBe("integrations");
    expect(window.location.pathname).toBe("/app/console/records");
    expect(window.location.search).toBe("");
    expect(app.renderRoot.textContent ?? "").toContain("Records");
  });

  it("rewrites legacy console view query URLs to canonical mounted paths", async () => {
    const app = mountApp("/app/console/integrations?view=records&memory_scope=run");
    await app.updateComplete;

    expect(app.basePath).toBe("/app/console");
    expect(app.tab).toBe("integrations");
    expect(window.location.pathname).toBe("/app/console/records");
    expect(window.location.search).toBe("");
  });

  it("keeps group detail on a nested identity path without query leakage", async () => {
    const app = mountApp("/app/console/identity/groups/group-owner");
    await app.updateComplete;

    expect(app.basePath).toBe("/app/console");
    expect(app.tab).toBe("identity");
    expect(window.location.pathname).toBe("/app/console/identity/groups/group-owner");
    expect(window.location.search).toBe("");
  });

  it("renders the canonical console shell in shadow DOM on mounted routes", async () => {
    const app = mountApp("/app/console/identity/channels");
    await app.updateComplete;

    const topNav = app.renderRoot.querySelector(".console-topnav");
    const channelSearch = app.renderRoot.querySelector('input[placeholder="Search channels..."]');

    expect(topNav).not.toBeNull();
    expect(app.renderRoot.textContent ?? "").toContain("Channels");
    expect(channelSearch).not.toBeNull();
  });

  it("keeps mounted channel routes stable after refresh actions", async () => {
    const app = mountApp("/app/console/identity/channels");
    await app.updateComplete;

    const refresh = Array.from(
      app.renderRoot.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.trim().toLowerCase() === "refresh");
    expect(refresh).not.toBeNull();
    refresh?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    await app.updateComplete;
    await nextFrame();

    expect(window.location.pathname).toBe("/app/console/identity/channels");
    expect(window.location.search).toBe("");
  });

  it("hydrates token from URL params and strips it", async () => {
    const app = mountApp("/ui/system?token=abc123");
    await app.updateComplete;

    expect(app.settings.token).toBe("abc123");
    expect(window.location.pathname).toBe("/ui/monitor");
    expect(window.location.search).toBe("");
  });

  it("strips password URL params without importing them", async () => {
    const app = mountApp("/ui/system?password=sekret");
    await app.updateComplete;

    expect(app.password).toBe("");
    expect(window.location.pathname).toBe("/ui/monitor");
    expect(window.location.search).toBe("");
  });

  it("hydrates token from URL params even when settings already set", async () => {
    localStorage.setItem("nexus.control.settings", JSON.stringify({ token: "existing-token" }));
    const app = mountApp("/ui/system?token=abc123");
    await app.updateComplete;

    expect(app.settings.token).toBe("abc123");
    expect(window.location.pathname).toBe("/ui/monitor");
    expect(window.location.search).toBe("");
  });

  it("hydrates token from URL hash and strips it", async () => {
    const app = mountApp("/ui/system#token=abc123");
    await app.updateComplete;

    expect(app.settings.token).toBe("abc123");
    expect(window.location.pathname).toBe("/ui/monitor");
    expect(window.location.hash).toBe("");
  });

  it("loads canonical console paths without redirect", async () => {
    const app = mountApp("/console");
    await app.updateComplete;

    expect(app.tab).toBe("console");
    expect(window.location.pathname).toBe("/chat");
  });

  it("loads canonical base-path operations routes without redirect", async () => {
    const app = mountApp("/ui/operations");
    await app.updateComplete;

    expect(app.basePath).toBe("/ui");
    expect(app.tab).toBe("operations");
    expect(window.location.pathname).toBe("/ui/jobs");
  });

  it("keeps mounted runtime app entry routes stable", async () => {
    const app = mountApp("/app/console/chat");
    await app.updateComplete;

    expect(app.basePath).toBe("/app/console");
    expect(app.tab).toBe("console");
    expect(window.location.pathname).toBe("/app/console/chat");
    expect(app.renderRoot.querySelector("nexus-console-chat-host")).not.toBeNull();
  });

  it("clears stale chat lane params when navigating with console tabs", async () => {
    const app = mountApp("/app/console/connectors?lane=lane%3Aagent%3Aentity-assistant");
    await app.updateComplete;

    expect(window.location.pathname).toBe("/app/console/connectors");
    expect(window.location.search).toBe("");

    const chatButton = Array.from(
      app.renderRoot.querySelectorAll<HTMLButtonElement>(".console-nav-tab"),
    ).find((button) => button.textContent?.trim().includes("Chat"));
    expect(chatButton).not.toBeUndefined();
    chatButton?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );
    await app.updateComplete;

    expect(window.location.pathname).toBe("/app/console/chat");
    expect(window.location.search).toBe("");
  });

  it("clears stale chat lane params on the mounted chat entry route", async () => {
    const app = mountApp("/app/console/chat?lane=lane%3Aagent%3Aentity-assistant");
    await app.updateComplete;

    expect(app.basePath).toBe("/app/console");
    expect(app.tab).toBe("console");
    expect(window.location.pathname).toBe("/app/console/chat");
    expect(window.location.search).toBe("");
  });

  it("keeps nested mounted identity detail routes stable", async () => {
    const app = mountApp("/app/console/identity/entity/entity-casey");
    await app.updateComplete;

    expect(app.basePath).toBe("/app/console");
    expect(app.tab).toBe("identity");
    expect(window.location.pathname).toBe("/app/console/identity/entity/entity-casey");
  });

  it("keeps nested mounted group detail routes stable", async () => {
    const app = mountApp("/app/console/identity/groups/group-owner");
    await app.updateComplete;

    expect(app.basePath).toBe("/app/console");
    expect(app.tab).toBe("identity");
    expect(window.location.pathname).toBe("/app/console/identity/groups/group-owner");
    expect(window.location.search).toBe("");
  });

  it("lets canonical identity paths beat stale query params", async () => {
    const app = mountApp("/app/console/identity/groups/group-owner?view=contacts&group=wrong");
    await app.updateComplete;

    expect(app.basePath).toBe("/app/console");
    expect(app.tab).toBe("identity");
    expect(window.location.pathname).toBe("/app/console/identity/groups/group-owner");
    expect(window.location.search).toBe("");
  });
});
