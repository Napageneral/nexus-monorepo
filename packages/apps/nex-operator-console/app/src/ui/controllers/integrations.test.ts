import { describe, expect, it, vi } from "vitest";
import {
  disconnectIntegrationAdapter,
  loadIntegrations,
  startIntegrationCustomFlow,
  submitIntegrationCustomFlow,
  testIntegrationAdapter,
  type IntegrationsState,
} from "./integrations.ts";

type ClientRequestMock = ReturnType<typeof vi.fn>;

function makeState(requestMock: ClientRequestMock): IntegrationsState {
  return {
    client: {
      request: requestMock as NonNullable<IntegrationsState["client"]>["request"],
    },
    connected: true,
    integrationsLoading: false,
    integrationsBusyAdapter: null,
    integrationsBusyAction: null,
    integrationsError: null,
    integrationsMessage: null,
    integrationsAdapters: [],
    integrationsSelectedAdapter: "",
    integrationsSessionId: "",
    integrationsPayloadText: "{}",
    integrationsPendingFields: [],
    integrationsInstructions: null,
  };
}

describe("integrations controller", () => {
  it("loads adapters and selects the first adapter by default", async () => {
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === "adapters.connections.list") {
        return {
          connections: [
            {
              connectionId: "connection-github",
              adapter: "github",
              name: "GitHub",
              status: "connected",
              authMethodId: null,
              authMethod: "custom_flow",
              account: null,
              lastSync: null,
              error: null,
            },
            {
              connectionId: "connection-slack",
              adapter: "slack",
              name: "Slack",
              status: "disconnected",
              authMethodId: null,
              authMethod: "oauth2",
              account: null,
              lastSync: 123,
              error: null,
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = makeState(request);

    await loadIntegrations(state);

    expect(request).toHaveBeenNthCalledWith(1, "adapters.connections.list", {});
    expect(state.integrationsAdapters).toHaveLength(2);
    expect(state.integrationsSelectedAdapter).toBe("github");
    expect(state.integrationsError).toBeNull();
    expect(state.integrationsLoading).toBe(false);
  });

  it("runs custom setup start+submit and refreshes adapters", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: "requires_input",
        sessionId: "setup-123",
        instructions: "Provide fields",
        fields: [{ name: "app_id", label: "App ID", type: "text", required: true }],
      })
      .mockResolvedValueOnce({
        connections: [
          {
            connectionId: "connection-github",
            adapter: "github",
            name: "GitHub",
            status: "connected",
            authMethod: "custom_flow",
            authMethodId: null,
            account: "installation-42",
            lastSync: 1,
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        connections: [{ id: "installation-42", status: "ready" }],
      })
      .mockResolvedValueOnce({
        status: "completed",
        sessionId: "setup-123",
        message: "Connected",
      })
      .mockResolvedValueOnce({
        connections: [
          {
            connectionId: "connection-github",
            adapter: "github",
            name: "GitHub",
            status: "connected",
            authMethod: "custom_flow",
            authMethodId: null,
            account: "installation-42",
            lastSync: 999,
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        connections: [{ id: "installation-42", status: "active" }],
      })

    const state = makeState(request);
    state.integrationsAdapters = [
      {
        adapter: "github",
        name: "GitHub",
        status: "disconnected",
        authMethod: "custom_flow",
        account: null,
        lastSync: null,
        error: null,
      },
    ];
    state.integrationsSelectedAdapter = "github";
    state.integrationsPayloadText = JSON.stringify({
      app_id: "9001",
      installation_id: "42",
      private_key_pem: "pem",
    });

    await startIntegrationCustomFlow(state, "github");
    expect(state.integrationsSessionId).toBe("setup-123");
    expect(state.integrationsPendingFields).toHaveLength(1);
    expect(state.integrationsInstructions).toBe("Provide fields");

    await submitIntegrationCustomFlow(state, "github");
    expect(state.integrationsSessionId).toBe("");
    expect(state.integrationsPendingFields).toEqual([]);
    expect(state.integrationsInstructions).toBeNull();

    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "adapter.connections.custom.start",
      "adapters.connections.list",
      "adapter.connections.list",
      "adapter.connections.custom.submit",
      "adapters.connections.list",
      "adapter.connections.list",
    ]);
  });

  it("surfaces payload parse errors and skips the setup request", async () => {
    const request = vi.fn();
    const state = makeState(request);
    state.integrationsAdapters = [
      {
        adapter: "github",
        name: "GitHub",
        status: "disconnected",
        authMethod: "custom_flow",
        account: null,
        lastSync: null,
        error: null,
      },
    ];
    state.integrationsSelectedAdapter = "github";
    state.integrationsPayloadText = "[]";

    await startIntegrationCustomFlow(state, "github");

    expect(request).not.toHaveBeenCalled();
    expect(state.integrationsError).toContain("Payload must be a JSON object.");
  });

  it("tests and disconnects an adapter with refresh", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, latency: 19 })
      .mockResolvedValueOnce({
        connections: [
          {
            connectionId: "connection-github",
            adapter: "github",
            name: "GitHub",
            status: "connected",
            authMethod: "custom_flow",
            authMethodId: null,
            account: "installation-42",
            lastSync: 1,
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        connections: [{ id: "installation-42", status: "active" }],
      })
      .mockResolvedValueOnce({
        status: "disconnected",
        account: "installation-42",
        service: "github",
      })
      .mockResolvedValueOnce({
        connections: [
          {
            connectionId: "connection-github",
            adapter: "github",
            name: "GitHub",
            status: "disconnected",
            authMethod: "custom_flow",
            authMethodId: null,
            account: null,
            lastSync: 2,
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        connections: [],
      })

    const state = makeState(request);
    state.integrationsAdapters = [
      {
        adapter: "github",
        name: "GitHub",
        status: "connected",
        authMethod: "custom_flow",
        account: "installation-42",
        lastSync: null,
        error: null,
      },
    ];
    state.integrationsSelectedAdapter = "github";
    state.integrationsSessionId = "setup-123";
    state.integrationsPendingFields = [
      { name: "app_id", label: "App ID", type: "text", required: true },
    ];
    state.integrationsInstructions = "fill in";

    await testIntegrationAdapter(state, "github");
    expect(state.integrationsMessage).toContain("connection test passed");

    await disconnectIntegrationAdapter(state, "github");
    expect(state.integrationsSessionId).toBe("");
    expect(state.integrationsPendingFields).toEqual([]);
    expect(state.integrationsInstructions).toBeNull();
    expect(state.integrationsMessage).toContain("github: disconnected");

    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "adapter.connections.test",
      "adapters.connections.list",
      "adapter.connections.list",
      "adapter.connections.disconnect",
      "adapters.connections.list",
      "adapter.connections.list",
    ]);
  });
});
