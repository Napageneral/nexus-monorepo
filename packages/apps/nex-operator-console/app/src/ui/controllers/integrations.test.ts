import { describe, expect, it, vi } from "vitest";
import {
  beginAddIntegrationConnector,
  backfillIntegrationAdapter,
  connectIntegrationAdapter,
  disconnectIntegrationAdapter,
  loadIntegrations,
  selectIntegrationCatalogAdapter,
  setIntegrationLivesync,
  startIntegrationCustomFlow,
  submitIntegrationCustomFlow,
  testIntegrationAdapter,
  uploadIntegrationAdapter,
  type IntegrationsState,
} from "./integrations.ts";

type ClientRequestMock = ReturnType<typeof vi.fn>;

const GITHUB_CUSTOM_AUTH = {
  methods: [
    {
      id: "github_custom",
      type: "custom_flow" as const,
      label: "GitHub App",
      icon: "github",
      service: "github",
    },
  ],
};

const SLACK_AUTH = {
  methods: [
    {
      id: "slack_user_token",
      type: "api_key" as const,
      label: "Slack User Token",
      icon: "slack",
      service: "slack",
      fields: [
        {
          name: "user_token",
          label: "User Token",
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
          label: "Bot Token",
          type: "secret" as const,
          required: true,
        },
      ],
    },
  ],
};

const WHATSAPP_UPLOAD_AUTH = {
  methods: [
    {
      id: "whatsapp_session_upload",
      type: "file_upload" as const,
      label: "Upload WhatsApp Session",
      icon: "whatsapp",
      accept: [".zip"],
    },
  ],
};

function makeState(requestMock: ClientRequestMock): IntegrationsState {
  return {
    client: {
      request: requestMock as NonNullable<IntegrationsState["client"]>["request"],
    },
    connected: true,
    integrationsLoading: false,
    integrationsCatalogLoading: false,
    integrationsBusyAdapter: null,
    integrationsBusyAction: null,
    integrationsError: null,
    integrationsCatalogError: null,
    integrationsMessage: null,
    integrationsLoaded: false,
    integrationsAdapters: [],
    integrationsCatalog: [],
    integrationsSelectedConnectionKey: "",
    integrationsSelectedAuthMethodId: "",
    integrationsSessionId: "",
    integrationsPayloadText: "{}",
    integrationsPendingFields: [],
    integrationsInstructions: null,
  };
}

describe("integrations controller", () => {
  it("selects the first catalog connector when starting add flow", () => {
    const request = vi.fn();
    const state = makeState(request);
    state.integrationsCatalog = [
      {
        adapter: "linkedin",
        name: "LinkedIn",
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
    ];

    beginAddIntegrationConnector(state);

    expect(state.integrationsSelectedConnectionKey).toBe("");
    expect(state.integrationsMessage).toBeNull();
  });

  it("selects the catalog adapter directly instead of a durable row", () => {
    const request = vi.fn();
    const state = makeState(request);
    state.integrationsAdapters = [
      {
        connectionId: "slack-user",
        adapter: "slack",
        name: "Slack",
        status: "connected",
        authMethod: "api_key",
        authMethodId: "slack_user_token",
        auth: SLACK_AUTH,
        account: "tyler",
        lastSync: 123,
        error: null,
      },
      {
        connectionId: "",
        adapter: "linkedin",
        name: "LinkedIn",
        status: "disconnected",
        authMethod: null,
        authMethodId: null,
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
      },
    ] as any;
    state.integrationsCatalog = [
      {
        adapter: "linkedin",
        name: "LinkedIn",
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
    ];

    selectIntegrationCatalogAdapter(state, "linkedin");

    expect(state.integrationsSelectedConnectionKey).toBe("catalog::linkedin");
    expect(state.integrationsMessage).toContain("new");
    expect(state.integrationsMessage).toContain("Existing connections stay unchanged");
    expect(state.integrationsPayloadText).toBe("{}");
  });

  it("does not preselect an auth method when a catalog adapter has multiple setup options", () => {
    const request = vi.fn();
    const state = makeState(request);
    state.integrationsCatalog = [
      {
        adapter: "slack",
        name: "Slack",
        auth: SLACK_AUTH,
      },
    ];

    selectIntegrationCatalogAdapter(state, "slack");

    expect(state.integrationsSelectedConnectionKey).toBe("catalog::slack");
    expect(state.integrationsSelectedAuthMethodId).toBe("");
  });

  it("merges duplicate catalog rows and prefers published setup metadata", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "adapters.connections.list") {
        return { connections: [] };
      }
      if (method === "adapters.catalog.list") {
        return {
          adapters: [
            {
              adapter: "slack",
              name: "Slack",
              registered: true,
            },
            {
              adapter: "slack",
              name: "Slack",
              published: true,
              publishedVersion: "0.1.0",
              auth: SLACK_AUTH,
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = makeState(request);

    await loadIntegrations(state);
    selectIntegrationCatalogAdapter(state, "slack");

    expect(state.integrationsCatalog).toHaveLength(1);
    expect(state.integrationsCatalog[0]).toMatchObject({
      adapter: "slack",
      published: true,
      registered: true,
      publishedVersion: "0.1.0",
    });
    expect(state.integrationsCatalog[0]?.auth?.methods).toHaveLength(2);
    expect(state.integrationsSelectedConnectionKey).toBe("catalog::slack");
    expect(state.integrationsSelectedAuthMethodId).toBe("");
  });

  it("loads connections and selects the first connection by default", async () => {
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
              auth: GITHUB_CUSTOM_AUTH,
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
              authMethod: null,
              auth: SLACK_AUTH,
              account: null,
              lastSync: 123,
              error: null,
            },
          ],
        };
      }
      if (method === "adapters.catalog.list") {
        return {
          adapters: [
            {
              adapter: "github",
              name: "GitHub",
              auth: GITHUB_CUSTOM_AUTH,
            },
            {
              adapter: "slack",
              name: "Slack",
              auth: SLACK_AUTH,
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = makeState(request);

    await loadIntegrations(state);

    expect(request).toHaveBeenNthCalledWith(1, "adapters.connections.list", {});
    expect(request).toHaveBeenNthCalledWith(2, "adapters.catalog.list", {});
    expect(state.integrationsAdapters).toHaveLength(2);
    expect(state.integrationsCatalog).toHaveLength(2);
    expect(state.integrationsSelectedConnectionKey).toBe("connection-github");
    expect(state.integrationsSelectedAuthMethodId).toBe("github_custom");
    expect(state.integrationsError).toBeNull();
    expect(state.integrationsLoaded).toBe(true);
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
            auth: GITHUB_CUSTOM_AUTH,
            account: "installation-42",
            lastSync: 1,
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        adapters: [
          {
            adapter: "slack",
            name: "Slack",
            auth: SLACK_AUTH,
          },
        ],
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
            auth: GITHUB_CUSTOM_AUTH,
            account: "installation-42",
            lastSync: 999,
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        adapters: [
          {
            adapter: "github",
            name: "GitHub",
            auth: GITHUB_CUSTOM_AUTH,
          },
        ],
      })

    const state = makeState(request);
    state.integrationsAdapters = [
      {
        connectionId: "connection-github",
        adapter: "github",
        name: "GitHub",
        status: "disconnected",
        authMethod: "custom_flow",
        auth: GITHUB_CUSTOM_AUTH,
        account: null,
        lastSync: null,
        error: null,
      },
    ];
    state.integrationsSelectedConnectionKey = "connection-github";
    state.integrationsSelectedAuthMethodId = "github_custom";
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
      "adapters.connections.custom.start",
      "adapters.connections.list",
      "adapters.catalog.list",
      "adapters.connections.custom.submit",
      "adapters.connections.list",
      "adapters.catalog.list",
    ]);
  });

  it("surfaces payload parse errors and skips the setup request", async () => {
    const request = vi.fn();
    const state = makeState(request);
    state.integrationsAdapters = [
      {
        connectionId: "connection-github",
        adapter: "github",
        name: "GitHub",
        status: "disconnected",
        authMethod: "custom_flow",
        auth: GITHUB_CUSTOM_AUTH,
        account: null,
        lastSync: null,
        error: null,
      },
    ];
    state.integrationsSelectedConnectionKey = "connection-github";
    state.integrationsSelectedAuthMethodId = "github_custom";
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
            auth: GITHUB_CUSTOM_AUTH,
            account: "installation-42",
            lastSync: 1,
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        adapters: [
          {
            adapter: "github",
            name: "GitHub",
            auth: GITHUB_CUSTOM_AUTH,
          },
        ],
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
            auth: GITHUB_CUSTOM_AUTH,
            account: null,
            lastSync: 2,
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        adapters: [
          {
            adapter: "github",
            name: "GitHub",
            auth: GITHUB_CUSTOM_AUTH,
          },
        ],
      })

    const state = makeState(request);
    state.integrationsAdapters = [
      {
        connectionId: "connection-github",
        adapter: "github",
        name: "GitHub",
        status: "connected",
        authMethod: "custom_flow",
        auth: GITHUB_CUSTOM_AUTH,
        account: "installation-42",
        lastSync: null,
        error: null,
        metadata: { monitor: { running: true } },
      },
    ];
    state.integrationsSelectedConnectionKey = "connection-github";
    state.integrationsSelectedAuthMethodId = "github_custom";
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
      "adapters.connections.test",
      "adapters.connections.list",
      "adapters.catalog.list",
      "adapters.connections.disconnect",
      "adapters.connections.list",
      "adapters.catalog.list",
    ]);
  });

  it("backs fills and toggles livesync on a concrete connection", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: "queued",
        connectionId: "connection-github",
        since: "2001-01-01T00:00:00Z",
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
            auth: GITHUB_CUSTOM_AUTH,
            account: "installation-42",
            lastSync: 3,
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        adapters: [
          {
            adapter: "github",
            name: "GitHub",
            auth: GITHUB_CUSTOM_AUTH,
          },
        ],
      })
      .mockResolvedValueOnce({
        connectionId: "connection-github",
        enabled: false,
        status: "disabled",
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
            auth: GITHUB_CUSTOM_AUTH,
            account: "installation-42",
            lastSync: 4,
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        connectionId: "connection-github",
        enabled: true,
        status: "enabled",
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
            auth: GITHUB_CUSTOM_AUTH,
            account: "installation-42",
            lastSync: 5,
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        adapters: [
          {
            adapter: "github",
            name: "GitHub",
            auth: GITHUB_CUSTOM_AUTH,
          },
        ],
      })

    const state = makeState(request);
    state.integrationsAdapters = [
      {
        connectionId: "connection-github",
        adapter: "github",
        name: "GitHub",
        status: "connected",
        authMethod: "custom_flow",
        auth: GITHUB_CUSTOM_AUTH,
        account: "installation-42",
        lastSync: null,
        error: null,
        metadata: { monitor: { running: true } },
      },
    ];
    state.integrationsSelectedConnectionKey = "connection-github";
    state.integrationsSelectedAuthMethodId = "github_custom";

    await backfillIntegrationAdapter(state, "github");
    expect(state.integrationsMessage).toContain("backfill queued");

    await setIntegrationLivesync(state, "github", false);
    expect(state.integrationsMessage).toContain("livesync disabled");

    await setIntegrationLivesync(state, "github", true);
    expect(state.integrationsMessage).toContain("livesync enabled");

    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "adapters.connections.backfill",
      "adapters.connections.list",
      "adapters.catalog.list",
      "adapters.connections.livesync.disable",
      "adapters.connections.list",
      "adapters.catalog.list",
      "adapters.connections.livesync.enable",
      "adapters.connections.list",
      "adapters.catalog.list",
    ]);
  });

  it("creates an api-key connection for Slack and refreshes adapters", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        connectionId: "connection-slack",
        status: "connected",
        account: "tyler",
        service: "slack",
      })
      .mockResolvedValueOnce({
        connections: [
          {
            connectionId: "connection-slack",
            adapter: "slack",
            name: "Slack",
            status: "connected",
            authMethod: "api_key",
            authMethodId: "slack_user_token",
            auth: SLACK_AUTH,
            account: "tyler",
            lastSync: 123,
            error: null,
          },
        ],
      })

    const state = makeState(request);
    state.integrationsAdapters = [
      {
        connectionId: "",
        adapter: "slack",
        name: "Slack",
        status: "disconnected",
        authMethod: null,
        authMethodId: null,
        auth: SLACK_AUTH,
        account: null,
        lastSync: null,
        error: null,
      },
    ];
    state.integrationsSelectedConnectionKey = "slack::disconnected";
    state.integrationsSelectedAuthMethodId = "slack_user_token";
    state.integrationsPayloadText = JSON.stringify({
      user_token: "xoxp-user-token",
    });

    await connectIntegrationAdapter(state, "slack");

    expect(request).toHaveBeenNthCalledWith(1, "adapters.connections.create", {
      adapter: "slack",
      authMethodId: "slack_user_token",
      fields: {
        user_token: "xoxp-user-token",
      },
    });
    expect(state.integrationsMessage).toContain("slack: connected for tyler");
    expect(state.integrationsAdapters[0]).toMatchObject({
      connectionId: "connection-slack",
      account: "tyler",
      status: "connected",
    });
  });

  it("uploads a file through the selected file-upload setup method", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: "imported",
        preview: { rows: 7 },
      })
      .mockResolvedValueOnce({ connections: [] })
      .mockResolvedValueOnce({
        adapters: [
          {
            adapter: "whatsapp",
            name: "WhatsApp",
            auth: WHATSAPP_UPLOAD_AUTH,
          },
        ],
      });

    const state = makeState(request);
    state.integrationsCatalog = [
      {
        adapter: "whatsapp",
        name: "WhatsApp",
        auth: WHATSAPP_UPLOAD_AUTH,
      },
    ];
    state.integrationsSelectedConnectionKey = "catalog::whatsapp";
    state.integrationsSelectedAuthMethodId = "whatsapp_session_upload";
    state.integrationsPayloadText = JSON.stringify({
      fields: {
        filePath: "/Users/tyler/export.zip",
      },
    });

    await uploadIntegrationAdapter(state, "whatsapp");

    expect(request).toHaveBeenNthCalledWith(1, "adapters.connections.upload", {
      adapter: "whatsapp",
      authMethodId: "whatsapp_session_upload",
      filePath: "/Users/tyler/export.zip",
      fileName: "export.zip",
    });
    expect(state.integrationsMessage).toContain("whatsapp: upload imported (7 rows)");
  });

  it("creates a fresh connection from a catalog selection even when durable rows exist", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        connectionId: "connection-slack-fresh",
        status: "connected",
        account: "tyler",
        service: "slack",
      })
      .mockResolvedValueOnce({
        connections: [
          {
            connectionId: "connection-slack-existing",
            adapter: "slack",
            name: "Slack",
            status: "connected",
            authMethod: "api_key",
            authMethodId: "slack_user_token",
            auth: SLACK_AUTH,
            account: "existing",
            lastSync: 999,
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        adapters: [
          {
            adapter: "slack",
            name: "Slack",
            auth: SLACK_AUTH,
          },
        ],
      });

    const state = makeState(request);
    state.integrationsAdapters = [
      {
        connectionId: "connection-slack-existing",
        adapter: "slack",
        name: "Slack",
        status: "connected",
        authMethod: "api_key",
        authMethodId: "slack_user_token",
        auth: SLACK_AUTH,
        account: "existing",
        lastSync: 123,
        error: null,
      },
    ] as any;
    state.integrationsCatalog = [
      {
        adapter: "slack",
        name: "Slack",
        auth: SLACK_AUTH,
      },
    ];
    state.integrationsSelectedConnectionKey = "catalog::slack";
    state.integrationsSelectedAuthMethodId = "slack_user_token";
    state.integrationsPayloadText = JSON.stringify({
      user_token: "fresh-token",
    });

    await connectIntegrationAdapter(state, "slack");

    expect(request).toHaveBeenNthCalledWith(1, "adapters.connections.create", {
      adapter: "slack",
      authMethodId: "slack_user_token",
      fields: {
        user_token: "fresh-token",
      },
    });
    expect(state.integrationsMessage).toContain("slack: connected for tyler");
  });
});
