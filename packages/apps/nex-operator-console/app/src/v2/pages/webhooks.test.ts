import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { renderWebhooksPage, type WebhooksPageProps } from "./webhooks.ts";

function createProps(overrides: Partial<WebhooksPageProps> = {}): WebhooksPageProps {
  return {
    showCreateModal: false,
    onToggleCreateModal: vi.fn(),
    ...overrides,
  };
}

describe("webhooks page", () => {
  it("renders empty state", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(renderWebhooksPage(createProps()), container);

    const emptyTitle = container.querySelector(".v2-empty-title");
    expect(emptyTitle).not.toBeNull();
    expect(emptyTitle?.textContent).toContain("No webhook subscriptions");

    document.body.removeChild(container);
  });

  it("renders use case cards", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(renderWebhooksPage(createProps()), container);

    const label = container.querySelector(".v2-get-started-label");
    expect(label).not.toBeNull();
    expect(label?.textContent).toContain("What can you do with webhooks?");

    const cards = container.querySelectorAll(".v2-get-started-card");
    expect(cards.length).toBe(3);

    document.body.removeChild(container);
  });
});
