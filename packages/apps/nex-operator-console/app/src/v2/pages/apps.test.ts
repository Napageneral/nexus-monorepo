import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { renderAppsPage, type AppsPageProps } from "./apps.ts";

function createProps(overrides: Partial<AppsPageProps> = {}): AppsPageProps {
  return {
    loading: false,
    loaded: true,
    error: null,
    adapters: [],
    onRefresh: vi.fn(),
    onSelectAdapter: vi.fn(),
    onOAuthStart: vi.fn(),
    ...overrides,
  };
}

describe("apps page", () => {
  it("renders platform picker when no adapters", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(renderAppsPage(createProps({ adapters: [] })), container);

    const heading = container.querySelector(".v2-platform-picker-title");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toContain("Hey Tyler Brandt");

    const grid = container.querySelector(".v2-platform-grid");
    expect(grid).not.toBeNull();
    expect(grid?.querySelectorAll(".v2-platform-icon").length).toBeGreaterThan(0);

    document.body.removeChild(container);
  });

  it("renders a loading state before connector inventory resolves", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(renderAppsPage(createProps({ loaded: false, adapters: [] })), container);

    expect(container.textContent).toContain("Loading connectors");
    expect(container.querySelector(".v2-platform-picker")).toBeNull();

    document.body.removeChild(container);
  });

  it("renders an error state when connector inventory fails", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderAppsPage(createProps({ loaded: true, error: "runtime timeout", adapters: [] })),
      container,
    );

    expect(container.textContent).toContain("Could not load connectors");
    expect(container.textContent).toContain("runtime timeout");
    expect(container.querySelector(".v2-platform-picker")).toBeNull();

    document.body.removeChild(container);
  });

  it("renders connected apps table when adapters exist", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderAppsPage(
        createProps({
          adapters: [
            {
              adapter: "gmail",
              name: "Gmail",
              status: "connected",
              authMethod: "oauth",
              account: null,
              lastSync: null,
              error: null,
            } as any,
          ],
        }),
      ),
      container,
    );

    const table = container.querySelector(".v2-table");
    expect(table).not.toBeNull();

    const badge = container.querySelector(".v2-badge--success");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("Active");

    expect(container.textContent).toContain("Gmail");

    document.body.removeChild(container);
  });

  it("renders get started cards", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderAppsPage(
        createProps({
          adapters: [
            {
              adapter: "slack",
              name: "Slack",
              status: "connected",
              authMethod: "oauth",
              account: null,
              lastSync: null,
              error: null,
            } as any,
          ],
        }),
      ),
      container,
    );

    const section = container.querySelector(".v2-get-started-section");
    expect(section).not.toBeNull();

    const label = container.querySelector(".v2-get-started-label");
    expect(label?.textContent).toContain("Get started");

    const cards = container.querySelectorAll(".v2-get-started-card");
    expect(cards.length).toBe(3);

    document.body.removeChild(container);
  });
});
