import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { renderAgentCreateWizard, type AgentCreateProps, type AgentCreateForm } from "./agent-create.ts";

function createForm(overrides: Partial<AgentCreateForm> = {}): AgentCreateForm {
  return {
    name: "",
    description: "",
    model: "sonnet",
    selectedApps: new Set(),
    actionPolicy: "full",
    budget: "10.00",
    maxSteps: "25",
    memory: "stateless",
    ...overrides,
  };
}

function createProps(overrides: Partial<AgentCreateProps> = {}): AgentCreateProps {
  return {
    step: 1,
    form: createForm(),
    adapters: [],
    onStepChange: vi.fn(),
    onFormChange: vi.fn(),
    onAppToggle: vi.fn(),
    onCancel: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
}

describe("agent create wizard", () => {
  it("renders step 1 basics form", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(renderAgentCreateWizard(createProps({ step: 1 })), container);

    const nameInput = container.querySelector("input.v2-input");
    expect(nameInput).not.toBeNull();

    const labels = Array.from(container.querySelectorAll(".v2-label"));
    expect(labels.some((l) => l.textContent?.includes("Name"))).toBe(true);
    expect(labels.some((l) => l.textContent?.includes("Model"))).toBe(true);

    const models = container.querySelectorAll(".v2-selectable");
    expect(models.length).toBe(3);

    document.body.removeChild(container);
  });

  it("renders step 4 review", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderAgentCreateWizard(
        createProps({
          step: 4,
          form: createForm({ name: "My Agent", model: "opus", budget: "25.00", maxSteps: "50" }),
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("My Agent");
    expect(container.textContent).toContain("Opus");
    expect(container.textContent).toContain("$25.00");
    expect(container.textContent).toContain("50");

    document.body.removeChild(container);
  });

  it("disables Next button when name is empty", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderAgentCreateWizard(createProps({ step: 1, form: createForm({ name: "" }) })),
      container,
    );

    const nextBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Next"),
    );
    expect(nextBtn).not.toBeUndefined();
    expect(nextBtn?.disabled).toBe(true);

    document.body.removeChild(container);
  });

  it("enables Next button when name is filled", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderAgentCreateWizard(createProps({ step: 1, form: createForm({ name: "Test" }) })),
      container,
    );

    const nextBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Next"),
    );
    expect(nextBtn).not.toBeUndefined();
    expect(nextBtn?.disabled).toBe(false);

    document.body.removeChild(container);
  });
});
