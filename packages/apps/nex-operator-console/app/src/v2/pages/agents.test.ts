import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { renderAgentsPage, type AgentsPageProps } from "./agents.ts";

function createProps(overrides: Partial<AgentsPageProps> = {}): AgentsPageProps {
  return {
    loading: false,
    error: null,
    agentsList: null,
    onSelectAgent: vi.fn(),
    onCreateAgent: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
}

describe("agents page", () => {
  it("renders empty state when no agents", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(renderAgentsPage(createProps({ agentsList: null })), container);

    const emptyTitle = container.querySelector(".v2-empty-title");
    expect(emptyTitle).not.toBeNull();
    expect(emptyTitle?.textContent).toContain("No agents yet");

    document.body.removeChild(container);
  });

  it("renders agent cards when agents exist", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderAgentsPage(
        createProps({
          agentsList: {
            defaultId: "main",
            mainKey: "agent:main",
            scope: "local",
            agents: [
              { id: "sales-bot", name: "Sales Bot", identity: { name: "Sales Bot" } },
            ],
          },
        }),
      ),
      container,
    );

    const cards = container.querySelectorAll(".v2-card--interactive");
    expect(cards.length).toBe(1);
    expect(container.textContent).toContain("Sales Bot");

    document.body.removeChild(container);
  });

  it("shows create agent button", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(renderAgentsPage(createProps({ agentsList: null })), container);

    const createBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "+ Create agent",
    );
    expect(createBtn).not.toBeUndefined();

    document.body.removeChild(container);
  });
});
