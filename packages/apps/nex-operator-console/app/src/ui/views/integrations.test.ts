import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { renderIntegrations, type IntegrationsProps } from "./integrations.ts";

function createProps(overrides: Partial<IntegrationsProps> = {}): IntegrationsProps {
  return {
    connected: true,
    loading: false,
    busyAdapter: null,
    busyAction: null,
    error: null,
    catalogError: null,
    catalogLoading: false,
    message: null,
    connections: [],
    selectedConnectionKey: "",
    selectedAuthMethodId: "",
    sessionId: "",
    payloadText: "{}",
    pendingFields: [],
    instructions: null,
    catalogOpen: false,
    catalogSearch: "",
    catalogItems: [],
    onRefresh: vi.fn(),
    onAddConnector: vi.fn(),
    onCatalogClose: vi.fn(),
    onCatalogSearchChange: vi.fn(),
    onCatalogSelect: vi.fn(),
    onSelectConnection: vi.fn(),
    onSelectAuthMethod: vi.fn(),
    onPayloadChange: vi.fn(),
    onConnect: vi.fn(),
    onOAuthStart: vi.fn(),
    onCustomStart: vi.fn(),
    onCustomSubmit: vi.fn(),
    onCustomStatus: vi.fn(),
    onCustomCancel: vi.fn(),
    onUpload: vi.fn(),
    onTest: vi.fn(),
    onBackfill: vi.fn(),
    onLivesyncToggle: vi.fn(),
    onDisconnect: vi.fn(),
    ...overrides,
  };
}

describe("integrations view", () => {
  it("renders one row per connection instead of collapsing by adapter", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderIntegrations(
        createProps({
          connections: [
            {
              connectionId: "slack-user",
              adapter: "slack",
              service: "slack",
              name: "Slack Adapter",
              status: "connected",
              authMethod: "api_key",
              authMethodId: "slack_user_token",
              account: "tyler",
              lastSync: Date.now(),
              error: null,
            } as any,
            {
              connectionId: "slack-bot",
              adapter: "slack",
              service: "slack",
              name: "Slack Adapter",
              status: "connected",
              authMethod: "api_key",
              authMethodId: "slack_socket_mode",
              account: "spike",
              lastSync: Date.now(),
              error: null,
            } as any,
          ],
          selectedConnectionKey: "slack-user",
        }),
      ),
      container,
    );

    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(container.textContent).toContain("tyler");
    expect(container.textContent).toContain("spike");

    document.body.removeChild(container);
  });

  it("shows upstream account inventory notes when runtime metadata exposes them", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderIntegrations(
        createProps({
          connections: [
            {
              connectionId: "casey@moonsleep.co",
              adapter: "gog",
              service: "google",
              name: "gog-adapter",
              status: "connected",
              authMethod: "custom_flow",
              authMethodId: "gog_existing_auth",
              account: "casey@moonsleep.co",
              lastSync: Date.now(),
              error: null,
              metadata: {
                configured_accounts: 6,
              },
            } as any,
          ],
          selectedConnectionKey: "casey@moonsleep.co",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("6 upstream accounts detected");

    document.body.removeChild(container);
  });

  it("renders the add connector affordance in the header", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(renderIntegrations(createProps()), container);

    const button = Array.from(container.querySelectorAll("button")).find((node) =>
      node.textContent?.includes("Add new app"),
    );
    expect(button).toBeTruthy();

    document.body.removeChild(container);
  });

  it("renders a connector catalog modal when opened", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderIntegrations(
        createProps({
          catalogOpen: true,
          connections: [
            {
              connectionId: "",
              adapter: "linkedin",
              name: "LinkedIn",
              status: "disconnected",
              authMethod: "oauth2",
              authMethodId: "linkedin_oauth",
              auth: {
                methods: [
                  {
                    id: "linkedin_oauth",
                    type: "oauth2" as const,
                    label: "Connect with LinkedIn",
                    icon: "oauth",
                    service: "linkedin",
                    scopes: [],
                  },
                ],
              },
              account: null,
              lastSync: null,
              error: null,
            } as any,
          ],
          catalogItems: [
            {
              adapter: "linkedin",
              name: "LinkedIn",
              published: true,
              auth: {
                methods: [
                  {
                    id: "linkedin_oauth",
                    type: "oauth2" as const,
                    label: "Connect with LinkedIn",
                    icon: "oauth",
                    service: "linkedin",
                    scopes: [],
                  },
                ],
              },
            },
          ],
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Add new app");
    const searchInput = container.querySelector("input[placeholder='Search apps...']") as HTMLInputElement | null;
    expect(searchInput).toBeTruthy();
    expect(container.textContent).toContain("LinkedIn");
    expect(container.textContent).toContain("OAuth");
    expect(container.textContent).toContain("1 adapters in catalog");
    expect(container.textContent).toContain("1 published");
    expect(container.textContent).toContain("Published catalog");

    document.body.removeChild(container);
  });

  it("keeps catalog selection inside the add-app setup modal", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderIntegrations(
        createProps({
          catalogOpen: true,
          message: "Starting setup for a new Slack connection. Existing connections stay unchanged.",
          selectedConnectionKey: "catalog::slack",
          connections: [
            {
              connectionId: "slack-user",
              adapter: "slack",
              service: "slack",
              name: "Slack",
              status: "connected",
              authMethod: "api_key",
              authMethodId: "slack_user_token",
              auth: {
                methods: [
                  {
                    id: "slack_user_token",
                    type: "api_key" as const,
                    label: "Slack User Token",
                    icon: "slack",
                    service: "slack",
                    fields: [
                      {
                        name: "token",
                        label: "User token",
                        type: "secret" as const,
                        required: true,
                        placeholder: "xoxp-...",
                      },
                    ],
                  },
                ],
              },
              account: "tyler",
              lastSync: Date.now(),
              error: null,
            } as any,
          ],
          catalogItems: [
            {
              adapter: "slack",
              name: "Slack",
              service: "slack",
              auth: {
                methods: [
                  {
                    id: "slack_user_token",
                    type: "api_key" as const,
                    label: "Slack User Token",
                    icon: "slack",
                    service: "slack",
                    fields: [
                      {
                        name: "token",
                        label: "User token",
                        type: "secret" as const,
                        required: true,
                        placeholder: "xoxp-...",
                      },
                    ],
                  },
                ],
              },
            },
          ],
        }),
      ),
      container,
    );

    const setupModal = container.querySelector(".console-modal--connector-setup");
    expect(setupModal?.textContent).toContain("Add Slack");
    expect(setupModal?.textContent).toContain("Existing connections stay unchanged");
    expect(setupModal?.textContent).toContain("Setup questions");
    expect(setupModal?.textContent).toContain("User token");
    expect(container.textContent).toContain("tyler");
    expect(setupModal?.textContent).not.toContain("Not connected");

    document.body.removeChild(container);
  });

  it("writes setup question answers into the connection payload fields", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const onPayloadChange = vi.fn();
    render(
      renderIntegrations(
        createProps({
          catalogOpen: true,
          selectedConnectionKey: "catalog::slack",
          payloadText: "{}",
          onPayloadChange,
          catalogItems: [
            {
              adapter: "slack",
              name: "Slack",
              service: "slack",
              auth: {
                methods: [
                  {
                    id: "slack_user_token",
                    type: "api_key" as const,
                    label: "Slack User Token",
                    icon: "slack",
                    service: "slack",
                    fields: [
                      {
                        name: "token",
                        label: "User token",
                        type: "secret" as const,
                        required: true,
                        placeholder: "xoxp-...",
                      },
                    ],
                  },
                ],
              },
            },
          ],
        }),
      ),
      container,
    );

    const input = container.querySelector("input[placeholder='xoxp-...']") as HTMLInputElement | null;
    expect(input).toBeTruthy();
    input!.value = "xoxp-test";
    input!.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(onPayloadChange).toHaveBeenCalledTimes(1);
    expect(JSON.parse(onPayloadChange.mock.calls[0]?.[0] ?? "{}")).toEqual({
      fields: {
        token: "xoxp-test",
      },
    });

    document.body.removeChild(container);
  });

  it("shows a method choice step before setup questions when a connector has multiple auth methods", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const onSelectAuthMethod = vi.fn();
    render(
      renderIntegrations(
        createProps({
          catalogOpen: true,
          selectedConnectionKey: "catalog::slack",
          selectedAuthMethodId: "",
          onSelectAuthMethod,
          catalogItems: [
            {
              adapter: "slack",
              name: "Slack",
              service: "slack",
              auth: {
                methods: [
                  {
                    id: "slack_user_token",
                    type: "api_key" as const,
                    label: "Slack User Token",
                    icon: "slack",
                    service: "slack",
                    fields: [
                      {
                        name: "token",
                        label: "User token",
                        type: "secret" as const,
                        required: true,
                      },
                    ],
                  },
                  {
                    id: "slack_socket_mode",
                    type: "api_key" as const,
                    label: "Slack Socket Mode",
                    icon: "slack",
                    service: "slack",
                    fields: [
                      {
                        name: "bot_token",
                        label: "Bot token",
                        type: "secret" as const,
                        required: true,
                      },
                    ],
                  },
                ],
              },
            },
          ],
        }),
      ),
      container,
    );

    const setupModal = container.querySelector(".console-modal--connector-setup");
    expect(setupModal?.textContent).toContain("Choose setup method");
    expect(setupModal?.textContent).toContain("Slack User Token");
    expect(setupModal?.textContent).toContain("Slack Socket Mode");
    expect(setupModal?.textContent).not.toContain("Setup questions");
    const methodCard = container.querySelector(".connector-setup-method-card") as HTMLButtonElement | null;
    methodCard?.click();
    expect(onSelectAuthMethod).toHaveBeenCalledWith("slack_user_token");

    document.body.removeChild(container);
  });

  it("renders file upload setup fields and action inside the modal", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const onUpload = vi.fn();
    render(
      renderIntegrations(
        createProps({
          catalogOpen: true,
          selectedConnectionKey: "catalog::whatsapp",
          selectedAuthMethodId: "whatsapp_session_upload",
          onUpload,
          catalogItems: [
            {
              adapter: "whatsapp",
              name: "WhatsApp",
              service: "whatsapp",
              auth: {
                methods: [
                  {
                    id: "whatsapp_session_upload",
                    type: "file_upload" as const,
                    label: "Upload WhatsApp Session",
                    icon: "whatsapp",
                    accept: [".zip"],
                  },
                ],
              },
            },
          ],
        }),
      ),
      container,
    );

    const setupModal = container.querySelector(".console-modal--connector-setup");
    expect(setupModal?.textContent).toContain("Upload WhatsApp Session");
    expect(setupModal?.textContent).toContain("Local file path");
    expect(setupModal?.textContent).toContain("File name");
    const button = Array.from(container.querySelectorAll("button")).find((node) =>
      node.textContent?.includes("Upload File"),
    );
    expect(button).toBeTruthy();
    button?.click();
    expect(onUpload).toHaveBeenCalledWith("whatsapp");

    document.body.removeChild(container);
  });

  it("keeps the add-app catalog adapter-first instead of showing existing account identities", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderIntegrations(
        createProps({
          catalogOpen: true,
          connections: [
            {
              connectionId: "casey@moonsleep.co",
              adapter: "gog",
              service: "google",
              name: "gog-adapter",
              status: "connected",
              authMethod: "custom_flow",
              authMethodId: "gog_existing_auth",
              auth: {
                methods: [
                  {
                    id: "gog_existing_auth",
                    type: "custom_flow" as const,
                    label: "Google Workspace",
                    icon: "google",
                    service: "gog",
                  },
                ],
              },
              account: "casey@moonsleep.co",
              lastSync: Date.now(),
              error: null,
              metadata: {
                configured_accounts: 6,
              },
            } as any,
          ],
          catalogItems: [
            {
              adapter: "gog",
              name: "Google",
              auth: {
                methods: [
                  {
                    id: "gog_existing_auth",
                    type: "custom_flow" as const,
                    label: "Google Workspace",
                    icon: "google",
                    service: "gog",
                  },
                ],
              },
            },
          ],
        }),
      ),
      container,
    );

    const modal = container.querySelector(".console-modal--catalog");
    expect(modal?.textContent).toContain("Google");
    expect(modal?.textContent).toContain("Custom Setup");
    expect(modal?.textContent).not.toContain("Connected as casey@moonsleep.co");
    expect(modal?.textContent).not.toContain("6 upstream accounts detected");

    document.body.removeChild(container);
  });

  it("shows published and local catalog context for non-connectable adapters", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderIntegrations(
        createProps({
          catalogOpen: true,
          catalogItems: [
            {
              adapter: "twilio",
              name: "Twilio",
              published: true,
              publishedVersion: "0.1.0",
            },
          ],
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Twilio");
    expect(container.textContent).toContain("Published catalog");
    expect(container.textContent).toContain("Published 0.1.0");

    document.body.removeChild(container);
  });
});
