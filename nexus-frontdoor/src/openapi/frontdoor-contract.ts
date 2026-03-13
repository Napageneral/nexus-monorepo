export type OpenApiSchema = Record<string, unknown>;

export type FrontdoorOpenApiRoute = {
  method: "get" | "post";
  path: string;
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  security?: Array<Record<string, string[]>>;
  parameters?: Array<Record<string, unknown>>;
  requestBody?: {
    required?: boolean;
    content: {
      "application/json": {
        schema: OpenApiSchema;
      };
    };
  };
  responses: Record<
    string,
    {
      description: string;
      content?: {
        "application/json": {
          schema: OpenApiSchema;
        };
      };
    }
  >;
};

const okBooleanSchema: OpenApiSchema = { type: "boolean" };

const runtimeDescriptorSchema: OpenApiSchema = {
  type: "object",
  required: ["server_id", "tenant_id", "base_url", "http_base_url", "ws_url", "sse_url"],
  properties: {
    server_id: { type: "string" },
    tenant_id: { type: "string" },
    base_url: { type: "string", format: "uri" },
    http_base_url: { type: "string", format: "uri" },
    ws_url: { type: "string", format: "uri" },
    sse_url: { type: "string", format: "uri" },
  },
};

const runtimeTokenResponseSchema: OpenApiSchema = {
  type: "object",
  required: [
    "ok",
    "access_token",
    "token_type",
    "expires_in",
    "refresh_token",
    "refresh_expires_in",
    "server_id",
    "tenant_id",
    "entity_id",
    "scopes",
    "roles",
    "runtime",
  ],
  properties: {
    ok: { type: "boolean", enum: [true] },
    access_token: { type: "string" },
    token_type: { type: "string", enum: ["Bearer"] },
    expires_in: { type: "number" },
    key_id: { type: "string" },
    refresh_token: { type: "string" },
    refresh_expires_in: { type: "number" },
    server_id: { type: "string" },
    tenant_id: { type: "string" },
    entity_id: { type: "string" },
    scopes: { type: "array", items: { type: "string" } },
    roles: { type: "array", items: { type: "string" } },
    runtime: runtimeDescriptorSchema,
  },
};

const loginSuccessSchema: OpenApiSchema = {
  type: "object",
  required: [
    "ok",
    "authenticated",
    "session_id",
    "entity_id",
    "user_id",
    "roles",
    "scopes",
    "server_count",
  ],
  properties: {
    ok: { type: "boolean", enum: [true] },
    authenticated: { type: "boolean", enum: [true] },
    session_id: { type: "string" },
    tenant_id: { type: "string" },
    server_id: { type: ["string", "null"] },
    entity_id: { type: "string" },
    user_id: { type: "string" },
    roles: { type: "array", items: { type: "string" } },
    scopes: { type: "array", items: { type: "string" } },
    account_id: { type: ["string", "null"] },
    server_count: { type: "number" },
  },
};

const authMeSchema: OpenApiSchema = {
  type: "object",
  required: [
    "ok",
    "user_id",
    "username",
    "display_name",
    "roles",
    "scopes",
    "account_id",
    "server_id",
    "tenant_id",
  ],
  properties: {
    ok: { type: "boolean", enum: [true] },
    user_id: { type: "string" },
    username: { type: "string" },
    display_name: { type: "string" },
    email: { type: ["string", "null"] },
    roles: { type: "array", items: { type: "string" } },
    scopes: { type: "array", items: { type: "string" } },
    account_id: { type: ["string", "null"] },
    server_id: { type: ["string", "null"] },
    tenant_id: { type: ["string", "null"] },
  },
};

const appsCatalogSchema: OpenApiSchema = {
  type: "object",
  required: ["ok", "items"],
  properties: {
    ok: { type: "boolean", enum: [true] },
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["app_id", "display_name", "installed_on"],
        properties: {
          app_id: { type: "string" },
          display_name: { type: "string" },
          tagline: { type: ["string", "null"] },
          accent_color: { type: ["string", "null"] },
          homepage_url: { type: ["string", "null"] },
          latest_version: { type: ["string", "null"] },
          installed_on: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const serverPayloadSchema: OpenApiSchema = {
  type: "object",
  required: [
    "server_id",
    "display_name",
    "generated_name",
    "account_id",
    "status",
    "plan",
    "runtime_public_base_url",
    "backup_enabled",
    "delete_protection_enabled",
    "rebuild_protection_enabled",
    "archived_at",
    "destroyed_at",
    "last_recovered_at",
    "active_recovery_point_id",
    "installed_app_ids",
    "installed_apps",
  ],
  properties: {
    server_id: { type: "string" },
    display_name: { type: "string" },
    generated_name: { type: "string" },
    account_id: { type: "string" },
    status: { type: "string" },
    plan: { type: "string" },
    runtime_public_base_url: { type: "string", format: "uri" },
    backup_enabled: { type: "boolean" },
    delete_protection_enabled: { type: "boolean" },
    rebuild_protection_enabled: { type: "boolean" },
    archived_at: { type: ["string", "null"] },
    destroyed_at: { type: ["string", "null"] },
    last_recovered_at: { type: ["string", "null"] },
    active_recovery_point_id: { type: ["string", "null"] },
    installed_app_ids: { type: "array", items: { type: "string" } },
    installed_apps: {
      type: "array",
      items: {
        type: "object",
        required: ["app_id", "status", "version", "installed_at"],
        properties: {
          app_id: { type: "string" },
          status: { type: "string" },
          version: { type: ["string", "null"] },
          installed_at: { type: ["string", "null"] },
        },
      },
    },
  },
};

const serverResponseSchema: OpenApiSchema = {
  type: "object",
  required: ["ok", "server"],
  properties: {
    ok: { type: "boolean", enum: [true] },
    server: serverPayloadSchema,
  },
};

const installStatusSchema: OpenApiSchema = {
  type: "object",
  required: [
    "ok",
    "server_id",
    "app_id",
    "entitlement_status",
    "install_status",
    "entry_path",
    "last_error",
  ],
  properties: {
    ok: { type: "boolean", enum: [true] },
    server_id: { type: "string" },
    app_id: { type: "string" },
    entitlement_status: { type: "string" },
    install_status: { type: "string" },
    entry_path: { type: "string" },
    last_error: { type: ["string", "null"] },
  },
};

const installResponseSchema: OpenApiSchema = {
  type: "object",
  required: ["ok", "server_id", "app_id", "install_status", "entry_path", "version"],
  properties: {
    ok: { type: "boolean", enum: [true] },
    server_id: { type: "string" },
    app_id: { type: "string" },
    install_status: { type: "string" },
    entry_path: { type: "string" },
    version: { type: "string" },
  },
};

const errorResponseSchema: OpenApiSchema = {
  type: "object",
  required: ["ok", "error"],
  properties: {
    ok: okBooleanSchema,
    error: { type: "string" },
    detail: { type: ["string", "null"] },
    server_count: { type: "number" },
  },
};

export const frontdoorOpenApiRoutes: FrontdoorOpenApiRoute[] = [
  {
    method: "post",
    path: "/api/auth/login",
    operationId: "frontdoor.auth.login",
    summary: "Authenticate a frontdoor user session",
    tags: ["Auth"],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["username", "password"],
            properties: {
              username: { type: "string" },
              password: { type: "string" },
            },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Authenticated session details",
        content: { "application/json": { schema: loginSuccessSchema } },
      },
      "401": {
        description: "Invalid credentials",
        content: { "application/json": { schema: errorResponseSchema } },
      },
      "429": {
        description: "Login rate limited",
        content: { "application/json": { schema: errorResponseSchema } },
      },
    },
  },
  {
    method: "get",
    path: "/api/auth/me",
    operationId: "frontdoor.auth.me",
    summary: "Return the authenticated frontdoor user context",
    tags: ["Auth"],
    security: [{ cookieSession: [] }],
    responses: {
      "200": {
        description: "Authenticated user context",
        content: { "application/json": { schema: authMeSchema } },
      },
      "401": {
        description: "Not authenticated",
        content: { "application/json": { schema: errorResponseSchema } },
      },
    },
  },
  {
    method: "get",
    path: "/api/apps/catalog",
    operationId: "frontdoor.apps.catalog",
    summary: "List installable apps from the frontdoor product catalog",
    tags: ["Apps"],
    responses: {
      "200": {
        description: "App catalog",
        content: { "application/json": { schema: appsCatalogSchema } },
      },
    },
  },
  {
    method: "post",
    path: "/api/runtime/token",
    operationId: "frontdoor.runtime.token.issue",
    summary: "Mint a runtime access token for the active server context",
    tags: ["Runtime"],
    security: [{ cookieSession: [] }],
    requestBody: {
      required: false,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              client_id: { type: "string" },
              server_id: { type: "string" },
            },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Runtime access token response",
        content: { "application/json": { schema: runtimeTokenResponseSchema } },
      },
      "401": {
        description: "Not authenticated",
        content: { "application/json": { schema: errorResponseSchema } },
      },
      "400": {
        description: "Invalid server context",
        content: { "application/json": { schema: errorResponseSchema } },
      },
    },
  },
  {
    method: "post",
    path: "/api/runtime/token/refresh",
    operationId: "frontdoor.runtime.token.refresh",
    summary: "Refresh a runtime access token using a refresh token",
    tags: ["Runtime"],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["refresh_token"],
            properties: {
              refresh_token: { type: "string" },
              client_id: { type: "string" },
              server_id: { type: "string" },
            },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Refreshed runtime token response",
        content: { "application/json": { schema: runtimeTokenResponseSchema } },
      },
      "400": {
        description: "Invalid request",
        content: { "application/json": { schema: errorResponseSchema } },
      },
      "401": {
        description: "Invalid refresh token",
        content: { "application/json": { schema: errorResponseSchema } },
      },
    },
  },
  {
    method: "post",
    path: "/api/runtime/token/revoke",
    operationId: "frontdoor.runtime.token.revoke",
    summary: "Revoke a runtime refresh token",
    tags: ["Runtime"],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["refresh_token"],
            properties: {
              refresh_token: { type: "string" },
            },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Refresh token revoked",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["ok"],
              properties: {
                ok: okBooleanSchema,
              },
            },
          },
        },
      },
      "404": {
        description: "Refresh token not found",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["ok"],
              properties: {
                ok: okBooleanSchema,
              },
            },
          },
        },
      },
    },
  },
  {
    method: "get",
    path: "/api/servers/{serverId}",
    operationId: "frontdoor.servers.get",
    summary: "Get one hosted server and installed app state",
    tags: ["Servers"],
    security: [{ cookieSession: [] }],
    parameters: [
      {
        name: "serverId",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
    ],
    responses: {
      "200": {
        description: "Server details",
        content: { "application/json": { schema: serverResponseSchema } },
      },
      "401": {
        description: "Not authenticated",
        content: { "application/json": { schema: errorResponseSchema } },
      },
      "400": {
        description: "Missing server id",
        content: { "application/json": { schema: errorResponseSchema } },
      },
    },
  },
  {
    method: "get",
    path: "/api/servers/{serverId}/apps/{appId}/install-status",
    operationId: "frontdoor.servers.apps.installStatus",
    summary: "Get app entitlement and install status for a hosted server",
    tags: ["Apps", "Servers"],
    security: [{ cookieSession: [] }],
    parameters: [
      {
        name: "serverId",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
      {
        name: "appId",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
    ],
    responses: {
      "200": {
        description: "Install status",
        content: { "application/json": { schema: installStatusSchema } },
      },
      "401": {
        description: "Not authenticated",
        content: { "application/json": { schema: errorResponseSchema } },
      },
      "400": {
        description: "Invalid request",
        content: { "application/json": { schema: errorResponseSchema } },
      },
    },
  },
  {
    method: "post",
    path: "/api/servers/{serverId}/apps/{appId}/install",
    operationId: "frontdoor.servers.apps.install",
    summary: "Install an app on a hosted server",
    tags: ["Apps", "Servers"],
    security: [{ cookieSession: [] }],
    parameters: [
      {
        name: "serverId",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
      {
        name: "appId",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
    ],
    responses: {
      "200": {
        description: "App install result",
        content: { "application/json": { schema: installResponseSchema } },
      },
      "403": {
        description: "Install blocked by entitlement or access policy",
        content: { "application/json": { schema: errorResponseSchema } },
      },
      "401": {
        description: "Not authenticated",
        content: { "application/json": { schema: errorResponseSchema } },
      },
      "400": {
        description: "Invalid install request",
        content: { "application/json": { schema: errorResponseSchema } },
      },
      "404": {
        description: "App not found",
        content: { "application/json": { schema: errorResponseSchema } },
      },
    },
  },
];
