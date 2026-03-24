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
    expect(window.location.pathname).toBe("/integrations");
  });

  it("hydrates operations tab from the location", async () => {
    const app = mountApp("/operations");
    await app.updateComplete;

    expect(app.tab).toBe("operations");
    expect(window.location.pathname).toBe("/operations");
  });

  it("respects /ui base paths", async () => {
    const app = mountApp("/ui/operations");
    await app.updateComplete;

    expect(app.basePath).toBe("/ui");
    expect(app.tab).toBe("operations");
    expect(window.location.pathname).toBe("/ui/operations");
  });

  it("infers nested base paths", async () => {
    const app = mountApp("/apps/nexus/operations");
    await app.updateComplete;

    expect(app.basePath).toBe("/apps/nexus");
    expect(app.tab).toBe("operations");
    expect(window.location.pathname).toBe("/apps/nexus/operations");
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
    const app = mountApp("/console");
    await app.updateComplete;

    const link = app.querySelector<HTMLAnchorElement>('a.nav-item[href="/integrations"]');
    expect(link).not.toBeNull();
    link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));

    await app.updateComplete;
    expect(app.tab).toBe("integrations");
    expect(window.location.pathname).toBe("/integrations");
  });

  it("keeps chat and nav usable on narrow viewports", async () => {
    const app = mountApp("/console");
    await app.updateComplete;

    expect(window.matchMedia("(max-width: 768px)").matches).toBe(true);

    const split = app.querySelector(".chat-split-container");
    expect(split).not.toBeNull();
    if (split) {
      expect(getComputedStyle(split).position).not.toBe("fixed");
    }

    const chatMain = app.querySelector(".chat-main");
    expect(chatMain).not.toBeNull();
    if (chatMain) {
      expect(getComputedStyle(chatMain).display).not.toBe("none");
    }

    if (split) {
      split.classList.add("chat-split-container--open");
      await app.updateComplete;
      expect(getComputedStyle(split).position).toBe("fixed");
    }
    if (chatMain) {
      expect(getComputedStyle(chatMain).display).toBe("none");
    }
  });

  it("auto-scrolls chat history to the latest message", async () => {
    const app = mountApp("/console");
    await app.updateComplete;

    const initialContainer: HTMLElement | null = app.querySelector(".chat-thread");
    expect(initialContainer).not.toBeNull();
    if (!initialContainer) {
      return;
    }
    initialContainer.style.maxHeight = "180px";
    initialContainer.style.overflow = "auto";

    app.chatMessages = Array.from({ length: 60 }, (_, index) => ({
      role: "assistant",
      content: `Line ${index} - ${"x".repeat(200)}`,
      timestamp: Date.now() + index,
    }));

    await app.updateComplete;
    for (let i = 0; i < 6; i++) {
      await nextFrame();
    }

    const container = app.querySelector(".chat-thread");
    expect(container).not.toBeNull();
    if (!container) {
      return;
    }
    const maxScroll = container.scrollHeight - container.clientHeight;
    expect(maxScroll).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) {
      if (container.scrollTop === maxScroll) {
        break;
      }
      await nextFrame();
    }
    expect(container.scrollTop).toBe(maxScroll);
  });

  it("hydrates token from URL params and strips it", async () => {
    const app = mountApp("/ui/system?token=abc123");
    await app.updateComplete;

    expect(app.settings.token).toBe("abc123");
    expect(window.location.pathname).toBe("/ui/system");
    expect(window.location.search).toBe("");
  });

  it("strips password URL params without importing them", async () => {
    const app = mountApp("/ui/system?password=sekret");
    await app.updateComplete;

    expect(app.password).toBe("");
    expect(window.location.pathname).toBe("/ui/system");
    expect(window.location.search).toBe("");
  });

  it("hydrates token from URL params even when settings already set", async () => {
    localStorage.setItem("nexus.control.settings.v1", JSON.stringify({ token: "existing-token" }));
    const app = mountApp("/ui/system?token=abc123");
    await app.updateComplete;

    expect(app.settings.token).toBe("abc123");
    expect(window.location.pathname).toBe("/ui/system");
    expect(window.location.search).toBe("");
  });

  it("hydrates token from URL hash and strips it", async () => {
    const app = mountApp("/ui/system#token=abc123");
    await app.updateComplete;

    expect(app.settings.token).toBe("abc123");
    expect(window.location.pathname).toBe("/ui/system");
    expect(window.location.hash).toBe("");
  });

  it("loads canonical console paths without redirect", async () => {
    const app = mountApp("/console");
    await app.updateComplete;

    expect(app.tab).toBe("console");
    expect(window.location.pathname).toBe("/console");
  });

  it("loads canonical base-path operations routes without redirect", async () => {
    const app = mountApp("/ui/operations");
    await app.updateComplete;

    expect(app.basePath).toBe("/ui");
    expect(app.tab).toBe("operations");
    expect(window.location.pathname).toBe("/ui/operations");
  });
});
