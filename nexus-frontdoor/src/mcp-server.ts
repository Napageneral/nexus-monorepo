// ---------------------------------------------------------------------------
// MCP (Model Context Protocol) Server — JSON-RPC 2.0 over HTTP
// ---------------------------------------------------------------------------

import type { FrontdoorStore, ServerRecord, CreditBalanceRecord } from "./frontdoor-store.js";
import type { CloudProvider, ServerPlan } from "./cloud-provider.js";
import type { FrontdoorConfig, SessionRecord } from "./types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface McpContext {
  session: SessionRecord;
  store: FrontdoorStore;
  config: FrontdoorConfig;
  cloudProvider: CloudProvider | null;
  helpers: McpHelpers;
}

/** Callbacks into server.ts business logic the MCP tools need. */
export interface McpHelpers {
  installAppOnServer: (params: {
    serverId: string;
    appId: string;
    accountId: string;
    version?: string;
    source: "purchase" | "manual" | "auto_provision" | "api";
  }) => Promise<
    | { ok: true; version: string }
    | { ok: false; error: string; detail?: string; status?: number }
  >;
  uninstallAppFromServer: (params: {
    serverId: string;
    appId: string;
  }) => Promise<{ ok: true } | { ok: false; error: string; detail?: string; status?: number }>;
  deleteServer: (params: {
    session: SessionRecord;
    serverId: string;
  }) => Promise<{ ok: true; status: string } | { ok: false; error: string; status?: number }>;
  createServer: (params: {
    session: SessionRecord;
    plan?: string;
    displayName?: string;
  }) => Promise<
    | { ok: true; serverId: string; tenantId: string; status: string }
    | { ok: false; error: string }
  >;
  deterministicServerNameFromId: (serverId: string) => string;
  getServerPublicUrl: (server: ServerRecord) => string;
}

export type McpToolHandler = (
  params: Record<string, unknown>,
  context: McpContext,
) => Promise<McpToolResult>;

// ---------------------------------------------------------------------------
// JSON-RPC error codes
// ---------------------------------------------------------------------------

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textResult(data: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string): McpToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function jsonRpcError(id: unknown, code: number, message: string): unknown {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  };
}

function jsonRpcResult(id: unknown, result: unknown): unknown {
  return { jsonrpc: "2.0", id, result };
}

// ---------------------------------------------------------------------------
// MCP Server class
// ---------------------------------------------------------------------------

export class McpServer {
  private tools = new Map<string, { def: McpToolDefinition; handler: McpToolHandler }>();

  registerTool(def: McpToolDefinition, handler: McpToolHandler): void {
    this.tools.set(def.name, { def, handler });
  }

  getToolDefinitions(): McpToolDefinition[] {
    return [...this.tools.values()].map((t) => t.def);
  }

  async handleRequest(raw: unknown, context: McpContext): Promise<unknown> {
    if (typeof raw !== "object" || raw === null) {
      return jsonRpcError(null, PARSE_ERROR, "Parse error");
    }

    const msg = raw as Record<string, unknown>;
    const jsonrpc = msg.jsonrpc;
    const id = msg.id;
    const method = msg.method;

    if (jsonrpc !== "2.0" || typeof method !== "string") {
      return jsonRpcError(id, INVALID_REQUEST, "Invalid JSON-RPC request");
    }

    const params = (msg.params ?? {}) as Record<string, unknown>;

    switch (method) {
      case "initialize":
        return jsonRpcResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "nexus-platform",
            version: "1.0.0",
          },
        });

      case "notifications/initialized":
      case "initialized":
        // Client acknowledgment — no response needed for notification
        return jsonRpcResult(id, {});

      case "ping":
        return jsonRpcResult(id, {});

      case "tools/list":
        return jsonRpcResult(id, {
          tools: this.getToolDefinitions().map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });

      case "tools/call": {
        const toolName = typeof params.name === "string" ? params.name : "";
        const toolArgs = (typeof params.arguments === "object" && params.arguments !== null
          ? params.arguments
          : {}) as Record<string, unknown>;

        const entry = this.tools.get(toolName);
        if (!entry) {
          return jsonRpcError(id, METHOD_NOT_FOUND, `Unknown tool: ${toolName}`);
        }

        // Validate required params against inputSchema
        const schema = entry.def.inputSchema;
        if (schema && typeof schema === "object") {
          const required = Array.isArray((schema as Record<string, unknown>).required)
            ? ((schema as Record<string, unknown>).required as string[])
            : [];
          const missing = required.filter((key) => toolArgs[key] === undefined || toolArgs[key] === null || toolArgs[key] === "");
          if (missing.length > 0) {
            return jsonRpcError(id, INVALID_PARAMS, `Missing required parameter(s): ${missing.join(", ")}`);
          }
          // Type-check properties if defined
          const properties = (schema as Record<string, unknown>).properties as Record<string, { type?: string }> | undefined;
          if (properties) {
            for (const [key, val] of Object.entries(toolArgs)) {
              const propSchema = properties[key];
              if (propSchema?.type === "string" && typeof val !== "string") {
                return jsonRpcError(id, INVALID_PARAMS, `Parameter '${key}' must be a string`);
              }
              if (propSchema?.type === "number" && typeof val !== "number") {
                return jsonRpcError(id, INVALID_PARAMS, `Parameter '${key}' must be a number`);
              }
              if (propSchema?.type === "boolean" && typeof val !== "boolean") {
                return jsonRpcError(id, INVALID_PARAMS, `Parameter '${key}' must be a boolean`);
              }
            }
          }
        }

        try {
          const result = await entry.handler(toolArgs, context);
          return jsonRpcResult(id, result);
        } catch (err) {
          console.error(`[mcp] tool ${toolName} error:`, err);
          return jsonRpcResult(id, errorResult(`Internal error: ${String(err)}`));
        }
      }

      default:
        return jsonRpcError(id, METHOD_NOT_FOUND, `Unknown method: ${method}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Create & register all 13 tools
// ---------------------------------------------------------------------------

export function createMcpServer(): McpServer {
  const mcp = new McpServer();

  // =========================================================================
  // Phase 2: Server Management Tools
  // =========================================================================

  // -- nexus.servers.list ---------------------------------------------------
  mcp.registerTool(
    {
      name: "nexus.servers.list",
      description: "List all servers belonging to the authenticated user",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["running", "provisioning", "all"],
            description: "Filter by server status (default: all)",
          },
        },
      },
    },
    async (params, ctx) => {
      const statusFilter = typeof params.status === "string" ? params.status : "all";
      const allServers = ctx.store.getServersForUser(ctx.session.principal.userId);
      let servers = allServers.filter((s) => s.status !== "deleted");

      if (statusFilter !== "all") {
        servers = servers.filter((s) => s.status === statusFilter);
      }

      const items = servers.map((s) => {
        const installs = ctx.store.getServerEffectiveAppInstalls(s.serverId);
        return {
          serverId: s.serverId,
          displayName: s.displayName,
          generatedName:
            s.generatedName || ctx.helpers.deterministicServerNameFromId(s.serverId),
          accountId: s.accountId,
          status: s.status,
          plan: s.plan,
          appCount: installs.length,
          installedAppIds: installs
            .filter((i) => i.status === "installed")
            .map((i) => i.appId),
        };
      });

      return textResult({ servers: items });
    },
  );

  // -- nexus.servers.create -------------------------------------------------
  mcp.registerTool(
    {
      name: "nexus.servers.create",
      description:
        "Create and provision a new server. Returns immediately with provisioning status.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Display name for the server (optional)",
          },
          planId: {
            type: "string",
            description: 'Server plan ID (e.g. "cax11", "cax21", "cax31")',
          },
        },
      },
    },
    async (params, ctx) => {
      const plan = typeof params.planId === "string" ? params.planId : undefined;
      const displayName = typeof params.name === "string" ? params.name : undefined;

      const result = await ctx.helpers.createServer({
        session: ctx.session,
        plan,
        displayName,
      });

      if (!result.ok) {
        return errorResult(result.error);
      }

      return textResult({
        serverId: result.serverId,
        tenantId: result.tenantId,
        status: result.status,
      });
    },
  );

  // -- nexus.servers.get ----------------------------------------------------
  mcp.registerTool(
    {
      name: "nexus.servers.get",
      description: "Get detailed information about a specific server",
      inputSchema: {
        type: "object",
        properties: {
          serverId: {
            type: "string",
            description: "The server ID (e.g. srv-xxxx)",
          },
        },
        required: ["serverId"],
      },
    },
    async (params, ctx) => {
      const serverId = typeof params.serverId === "string" ? params.serverId : "";
      if (!serverId) return errorResult("serverId is required");

      const server = ctx.store.getServer(serverId);
      if (!server) return errorResult("Server not found");

      // Check user has access
      const userServers = ctx.store.getServersForUser(ctx.session.principal.userId);
      const hasAccess = userServers.some((s) => s.serverId === serverId);
      if (!hasAccess) return errorResult("Access denied");

      const installs = ctx.store.getServerEffectiveAppInstalls(serverId);

      return textResult({
        serverId: server.serverId,
        displayName: server.displayName,
        generatedName:
          server.generatedName || ctx.helpers.deterministicServerNameFromId(server.serverId),
        accountId: server.accountId,
        status: server.status,
        plan: server.plan,
        runtimePublicBaseUrl: ctx.helpers.getServerPublicUrl(server),
        installedApps: installs.map((i) => ({
          appId: i.appId,
          status: i.status,
          version: i.version ?? null,
          installedAt: i.installedAtMs
            ? new Date(i.installedAtMs).toISOString()
            : null,
        })),
      });
    },
  );

  // -- nexus.servers.delete -------------------------------------------------
  mcp.registerTool(
    {
      name: "nexus.servers.delete",
      description:
        "Delete a server. Requires confirm: true to prevent accidental deletion.",
      inputSchema: {
        type: "object",
        properties: {
          serverId: {
            type: "string",
            description: "The server ID to delete",
          },
          confirm: {
            type: "boolean",
            description:
              "Must be true to confirm deletion. Without this, returns a confirmation prompt.",
          },
        },
        required: ["serverId"],
      },
    },
    async (params, ctx) => {
      const serverId = typeof params.serverId === "string" ? params.serverId : "";
      if (!serverId) return errorResult("serverId is required");

      if (params.confirm !== true) {
        return textResult({
          confirmation_required: true,
          message: `Are you sure you want to delete server ${serverId}? This will destroy the VPS and all data. Call again with confirm: true to proceed.`,
        });
      }

      const result = await ctx.helpers.deleteServer({
        session: ctx.session,
        serverId,
      });

      if (!result.ok) {
        return errorResult(result.error);
      }

      return textResult({ ok: true, status: result.status });
    },
  );

  // =========================================================================
  // Phase 3: App & Token Management Tools
  // =========================================================================

  // -- nexus.apps.catalog ---------------------------------------------------
  mcp.registerTool(
    {
      name: "nexus.apps.catalog",
      description: "List available apps in the catalog",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Optional category filter",
          },
        },
      },
    },
    async (_params, ctx) => {
      const products = ctx.store.listProducts();
      const items = products.map((p) => ({
        appId: p.productId,
        displayName: p.displayName,
        tagline: p.tagline ?? null,
        latestVersion: p.manifestVersion ?? null,
      }));
      return textResult({ apps: items });
    },
  );

  // -- nexus.apps.install ---------------------------------------------------
  mcp.registerTool(
    {
      name: "nexus.apps.install",
      description: "Install an app on a server",
      inputSchema: {
        type: "object",
        properties: {
          serverId: { type: "string", description: "Target server ID" },
          appId: { type: "string", description: "App ID to install" },
          version: { type: "string", description: "Version to install (default: latest)" },
        },
        required: ["serverId", "appId"],
      },
    },
    async (params, ctx) => {
      const serverId = typeof params.serverId === "string" ? params.serverId : "";
      const appId = typeof params.appId === "string" ? params.appId : "";
      const version = typeof params.version === "string" ? params.version : undefined;
      if (!serverId || !appId) return errorResult("serverId and appId are required");

      const accountId = ctx.session.principal.accountId ?? ctx.session.principal.userId;
      const result = await ctx.helpers.installAppOnServer({
        serverId,
        appId,
        accountId,
        version,
        source: "api",
      });

      if (!result.ok) {
        return errorResult(`Install failed: ${result.error}${result.detail ? ` — ${result.detail}` : ""}`);
      }

      return textResult({ ok: true, appId, version: result.version });
    },
  );

  // -- nexus.apps.uninstall -------------------------------------------------
  mcp.registerTool(
    {
      name: "nexus.apps.uninstall",
      description: "Uninstall an app from a server",
      inputSchema: {
        type: "object",
        properties: {
          serverId: { type: "string", description: "Server ID" },
          appId: { type: "string", description: "App ID to uninstall" },
          confirm: {
            type: "boolean",
            description: "Must be true to confirm uninstall",
          },
        },
        required: ["serverId", "appId"],
      },
    },
    async (params, ctx) => {
      const serverId = typeof params.serverId === "string" ? params.serverId : "";
      const appId = typeof params.appId === "string" ? params.appId : "";
      if (!serverId || !appId) return errorResult("serverId and appId are required");

      if (params.confirm !== true) {
        return textResult({
          confirmation_required: true,
          message: `Are you sure you want to uninstall ${appId} from server ${serverId}? Call again with confirm: true.`,
        });
      }

      const result = await ctx.helpers.uninstallAppFromServer({ serverId, appId });

      if (!result.ok) {
        return errorResult(`Uninstall failed: ${result.error}`);
      }

      return textResult({ ok: true, appId });
    },
  );

  // -- nexus.tokens.create --------------------------------------------------
  mcp.registerTool(
    {
      name: "nexus.tokens.create",
      description:
        "Create a new API token. The token value is returned only once — store it securely.",
      inputSchema: {
        type: "object",
        properties: {
          displayName: {
            type: "string",
            description: "Human-readable name for the token",
          },
          expiresInDays: {
            type: "number",
            description: "Token expiration in days (optional, null = no expiry)",
          },
        },
      },
    },
    async (params, ctx) => {
      const accountId = ctx.session.principal.accountId;
      if (!accountId) return errorResult("No account associated with this session");

      const displayName =
        typeof params.displayName === "string" && params.displayName.trim()
          ? params.displayName.trim()
          : "Unnamed Token";
      const expiresInDays =
        typeof params.expiresInDays === "number" ? params.expiresInDays : null;

      // Generate token — use same crypto as server.ts
      const { randomBytes, createHash } = await import("node:crypto");
      const token = `nex_t_${randomBytes(32).toString("base64url")}`;
      const tokenId = `tok-${randomBytes(8).toString("hex")}`;
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expiresAtMs = expiresInDays
        ? Date.now() + expiresInDays * 86400000
        : undefined;

      ctx.store.createApiToken({
        tokenId,
        tokenHash,
        userId: ctx.session.principal.userId,
        accountId,
        displayName,
        expiresAtMs,
      });

      return textResult({
        token,
        tokenId,
        displayName,
        expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
      });
    },
  );

  // -- nexus.tokens.list ----------------------------------------------------
  mcp.registerTool(
    {
      name: "nexus.tokens.list",
      description: "List all API tokens for the authenticated user (secrets not included)",
      inputSchema: { type: "object", properties: {} },
    },
    async (_params, ctx) => {
      const tokens = ctx.store.listApiTokens(ctx.session.principal.userId);
      return textResult({
        tokens: tokens.map((t) => ({
          tokenId: t.tokenId,
          displayName: t.displayName,
          lastUsed: t.lastUsedMs ? new Date(t.lastUsedMs).toISOString() : null,
          expiresAt: t.expiresAtMs ? new Date(t.expiresAtMs).toISOString() : null,
          createdAt: t.createdAtMs ? new Date(t.createdAtMs).toISOString() : null,
        })),
      });
    },
  );

  // -- nexus.tokens.revoke --------------------------------------------------
  mcp.registerTool(
    {
      name: "nexus.tokens.revoke",
      description: "Revoke (delete) an API token by its ID",
      inputSchema: {
        type: "object",
        properties: {
          tokenId: { type: "string", description: "Token ID to revoke (tok-xxx)" },
        },
        required: ["tokenId"],
      },
    },
    async (params, ctx) => {
      const tokenId = typeof params.tokenId === "string" ? params.tokenId : "";
      if (!tokenId) return errorResult("tokenId is required");

      // Verify this token belongs to the user
      const tokens = ctx.store.listApiTokens(ctx.session.principal.userId);
      const exists = tokens.some((t) => t.tokenId === tokenId);
      if (!exists) return errorResult("Token not found or does not belong to you");

      ctx.store.revokeApiToken(tokenId);
      return textResult({ ok: true, tokenId });
    },
  );

  // =========================================================================
  // Phase 4: Account Tools
  // =========================================================================

  // -- nexus.account.info ---------------------------------------------------
  mcp.registerTool(
    {
      name: "nexus.account.info",
      description: "Get account information for the authenticated user",
      inputSchema: { type: "object", properties: {} },
    },
    async (_params, ctx) => {
      const accountId = ctx.session.principal.accountId;
      if (!accountId) return errorResult("No account associated with this session");

      const account = ctx.store.getAccount(accountId);
      if (!account) return errorResult("Account not found");

      const servers = ctx.store
        .getServersForUser(ctx.session.principal.userId)
        .filter((s) => s.status !== "deleted");

      return textResult({
        accountId: account.accountId,
        displayName: account.displayName,
        email: ctx.session.principal.email ?? null,
        status: account.status,
        serverCount: servers.length,
        createdAt: account.createdAtMs
          ? new Date(account.createdAtMs).toISOString()
          : null,
      });
    },
  );

  // -- nexus.account.plans --------------------------------------------------
  mcp.registerTool(
    {
      name: "nexus.account.plans",
      description: "List available server plans with pricing",
      inputSchema: { type: "object", properties: {} },
    },
    async (_params, ctx) => {
      const plans: ServerPlan[] = ctx.cloudProvider
        ? ctx.cloudProvider.listPlans()
        : [];

      return textResult({
        plans: plans.map((p) => ({
          id: p.id,
          name: p.name,
          priceMonthlyEur: p.priceMonthlyEur,
          vcpus: p.vcpus,
          memoryMb: p.memoryMb,
          diskGb: p.diskGb,
        })),
      });
    },
  );

  // -- nexus.account.usage --------------------------------------------------
  mcp.registerTool(
    {
      name: "nexus.account.usage",
      description: "Get basic usage summary for the current billing period",
      inputSchema: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["current", "last_month"],
            description: "Which period to query (default: current)",
          },
        },
      },
    },
    async (_params, ctx) => {
      const accountId = ctx.session.principal.accountId;
      if (!accountId) return errorResult("No account associated with this session");

      const servers = ctx.store
        .getServersForUser(ctx.session.principal.userId)
        .filter((s) => s.status !== "deleted");

      const credits = ctx.store.getCreditBalance(accountId);
      const isFreeTier = !!(credits?.freeTierExpiresAtMs && credits.freeTierExpiresAtMs > Date.now());
      const runningServers = servers.filter((s) => s.status === "running");

      // Estimate hourly burn rate
      const HOURLY_RATES: Record<string, number> = { cax11: 1, cax21: 1, cax31: 2 };
      let hourlyBurnCents = 0;
      for (const s of runningServers) {
        hourlyBurnCents += HOURLY_RATES[s.plan] ?? 1;
      }

      return textResult({
        accountId,
        balanceCents: credits?.balanceCents ?? 0,
        formattedBalance: `$${((credits?.balanceCents ?? 0) / 100).toFixed(2)}`,
        freeTier: isFreeTier
          ? {
              active: true,
              expiresAt: credits?.freeTierExpiresAtMs
                ? new Date(credits.freeTierExpiresAtMs).toISOString()
                : null,
            }
          : { active: false },
        activeServers: servers.length,
        runningServers: runningServers.length,
        hourlyBurnCents,
        estimatedDaysRemaining:
          hourlyBurnCents > 0 && credits && credits.balanceCents > 0 && !isFreeTier
            ? Math.floor(credits.balanceCents / (hourlyBurnCents * 24))
            : null,
        serverDetails: servers.map((s) => ({
          serverId: s.serverId,
          plan: s.plan,
          status: s.status,
        })),
      });
    },
  );

  // -- nexus.account.credits ------------------------------------------------
  mcp.registerTool(
    {
      name: "nexus.account.credits",
      description:
        "Get credit balance, free tier status, and recent transactions",
      inputSchema: { type: "object", properties: {} },
    },
    async (_params, ctx) => {
      const accountId = ctx.session.principal.accountId;
      if (!accountId) return errorResult("No account associated with this session");

      const credits = ctx.store.getCreditBalance(accountId);
      const transactions = ctx.store.getCreditTransactions(accountId, { limit: 10 });
      const isFreeTier = !!(credits?.freeTierExpiresAtMs && credits.freeTierExpiresAtMs > Date.now());

      return textResult({
        accountId,
        balanceCents: credits?.balanceCents ?? 0,
        currency: credits?.currency ?? "usd",
        formattedBalance: `$${((credits?.balanceCents ?? 0) / 100).toFixed(2)}`,
        freeTier: isFreeTier
          ? {
              active: true,
              expiresAt: credits?.freeTierExpiresAtMs
                ? new Date(credits.freeTierExpiresAtMs).toISOString()
                : null,
              daysRemaining: credits?.freeTierExpiresAtMs
                ? Math.max(0, Math.ceil((credits.freeTierExpiresAtMs - Date.now()) / 86400000))
                : 0,
            }
          : { active: false },
        recentTransactions: transactions.map((t) => ({
          transactionId: t.transactionId,
          type: t.type,
          amountCents: t.amountCents,
          balanceAfterCents: t.balanceAfterCents,
          description: t.description,
          createdAt: new Date(t.createdAtMs).toISOString(),
        })),
      });
    },
  );

  return mcp;
}
