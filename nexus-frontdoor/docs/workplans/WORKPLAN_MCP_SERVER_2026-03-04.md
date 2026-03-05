# Workplan: Frontdoor MCP Server

**Date:** 2026-03-04
**Status:** NOT STARTED
**Spec:** `docs/specs/FRONTDOOR_MCP_SERVER_AND_AGENTIC_ACCESS_2026-03-04.md`
**Depends on:** App Installation Pipeline (for app-related tools)
**Approach:** HARD CUTOVER — no backwards compatibility, no parallel legacy paths

---

## Objective

Implement the MCP (Model Context Protocol) server on the frontdoor as the canonical programmatic access method for Nexus platform management. Stateless HTTP JSON-RPC at `POST /mcp`, authenticated via existing API bearer tokens (`nex_t_...`). Ships complete — all tools land in one cut, no "beta" or "experimental" labels.

After this workplan is complete:
- Agents can connect to frontdoor via MCP and manage servers, apps, and tokens
- All 13 MCP tools operational (servers, apps, tokens, account)
- Authenticated via existing API token system
- Human signup still required (OIDC) — agents operate after account creation
- MCP is the canonical agent interface — no alternate programmatic interfaces

---

## Current State Analysis

### What EXISTS Today

| Component | Status | Notes |
|-----------|--------|-------|
| API token auth (`readSession`) | ✅ Complete | Bearer `nex_t_...` tokens validated via SHA-256 hash lookup |
| `GET /api/servers` | ✅ Exists | Lists servers for authenticated user |
| `POST /api/servers/create` | ✅ Exists | Cloud provisioning flow |
| `DELETE /api/servers/{id}` | ✅ Exists | Deprovision + destroy |
| `GET /api/servers/{id}` | ✅ Exists | Server detail |
| `GET /api/apps/catalog` | ✅ Exists | App catalog |
| `POST /api/tokens/create` | ✅ Exists | Create API tokens |
| `GET /api/tokens` | ✅ Exists | List tokens |
| `DELETE /api/tokens/{id}` | ✅ Exists | Revoke token |
| `GET /api/plans` | ✅ Exists | Available server plans |
| WebSocket support (ws) | ✅ Exists | In devDependencies |

### What's MISSING

| Gap | Description | Complexity |
|-----|-------------|------------|
| MCP protocol implementation | No MCP code at all | Large |
| SSE transport handler | No Server-Sent Events implementation | Medium |
| Tool definitions | No MCP tool registry or schemas | Medium |
| `GET /api/account` endpoint | Account info not consolidated | Small |
| `GET /api/account/usage` endpoint | Usage summary not exposed | Small |
| MCP dependencies | No `@modelcontextprotocol/sdk` | Small |

---

## Implementation Phases

### Phase 1: MCP Transport Layer

**Goal:** Set up SSE-based MCP transport that authenticates via bearer tokens.

#### 1.1 Add MCP SDK dependency

- **File:** `package.json`
- **Decision:** Use `@modelcontextprotocol/sdk` or implement MCP protocol manually
- **Recommendation:** Implement manually — MCP JSON-RPC protocol is simple, avoids dependency weight

The MCP protocol over SSE requires:
- Client sends `POST /mcp` with `Content-Type: application/json` body containing JSON-RPC messages
- Server responds with individual JSON-RPC responses
- For streaming, server uses SSE on `GET /mcp` with `Accept: text/event-stream`

#### 1.2 Create MCP server module

- **File:** NEW `src/mcp-server.ts`
- **Exports:**
  ```typescript
  export interface McpToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;  // JSON Schema
  }

  export interface McpToolHandler {
    (params: Record<string, unknown>, context: McpContext): Promise<McpToolResult>;
  }

  export interface McpContext {
    session: SessionRecord;
    store: FrontdoorStore;
    config: FrontdoorConfig;
    cloudProvider: CloudProvider | null;
  }

  export interface McpToolResult {
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }

  export class McpServer {
    registerTool(def: McpToolDefinition, handler: McpToolHandler): void;
    handleRequest(jsonRpcMessage: unknown, context: McpContext): Promise<unknown>;
    getToolDefinitions(): McpToolDefinition[];
  }
  ```

#### 1.3 Add MCP HTTP endpoint

- **File:** `src/server.ts`
- **Route:** `POST /mcp`
- **Auth:** Read bearer token via `readSession()`, reject if unauthenticated
- **Flow:**
  ```
  1. Parse JSON-RPC request from body
  2. Dispatch to McpServer.handleRequest()
  3. Return JSON-RPC response
  ```
- **Supported methods:**
  - `initialize` → return server info + capabilities
  - `tools/list` → return tool definitions
  - `tools/call` → execute tool and return result
  - `ping` → return pong

#### 1.4 SSE transport (not needed)

- **Decision:** Stateless HTTP POST is sufficient. MCP clients (Claude Desktop, Cursor) support it natively.
- **No SSE endpoint.** If real-time streaming is needed in the future, it's a separate feature, not a transport migration.

**Validation:**
- [ ] `POST /mcp` with `initialize` method returns server info
- [ ] `POST /mcp` with `tools/list` returns tool definitions
- [ ] Unauthenticated requests get 401
- [ ] Invalid JSON-RPC format returns proper error

---

### Phase 2: Server Management Tools

**Goal:** Implement the 4 server management MCP tools.

#### 2.1 Tool: `nexus.servers.list`

- **Wraps:** `GET /api/servers`
- **Input:** `{ status?: "running" | "provisioning" | "all" }`
- **Output:** Array of server objects with id, status, plan, tenantId, createdAt
- **Implementation:** Call existing server listing code in `server.ts`

#### 2.2 Tool: `nexus.servers.create`

- **Wraps:** `POST /api/servers/create`
- **Input:** `{ name: string; planId: string }`
- **Output:** `{ serverId, tenantId, status: "provisioning" }`
- **Implementation:** Call existing cloud provisioning flow

#### 2.3 Tool: `nexus.servers.get`

- **Wraps:** `GET /api/servers/{id}`
- **Input:** `{ serverId: string }`
- **Output:** Full server detail including installed apps, status, URLs
- **Implementation:** Call existing server detail handler

#### 2.4 Tool: `nexus.servers.delete`

- **Wraps:** `DELETE /api/servers/{id}`
- **Input:** `{ serverId: string; confirm?: boolean }`
- **Output:** `{ ok: true, status: "deprovisioning" }`
- **Note:** Require `confirm: true` to prevent accidental deletion

**Validation:**
- [ ] `tools/call nexus.servers.list` returns server list
- [ ] `tools/call nexus.servers.create` provisions a new server
- [ ] `tools/call nexus.servers.get` returns server detail
- [ ] `tools/call nexus.servers.delete` with confirm destroys server
- [ ] `nexus.servers.delete` without confirm returns confirmation prompt

---

### Phase 3: App & Token Management Tools

**Goal:** Implement app and token MCP tools.

#### 3.1 Tool: `nexus.apps.catalog`

- **Wraps:** `GET /api/apps/catalog`
- **Input:** `{ category?: string }`
- **Output:** Array of available apps with metadata

#### 3.2 Tool: `nexus.apps.install`

- **Wraps:** `POST /api/servers/{serverId}/apps/{appId}/install`
- **Input:** `{ serverId: string; appId: string; version?: string }`
- **Output:** Installation result
- **Depends on:** App Installation Pipeline workplan

#### 3.3 Tool: `nexus.apps.uninstall`

- **Wraps:** `POST /api/servers/{serverId}/apps/{appId}/uninstall`
- **Input:** `{ serverId: string; appId: string; confirm?: boolean }`
- **Output:** Uninstall result

#### 3.4 Tool: `nexus.tokens.create`

- **Wraps:** `POST /api/tokens/create`
- **Input:** `{ displayName: string; scopes?: string[]; expiresInDays?: number }`
- **Output:** `{ tokenId, token: "nex_t_..." }` (token shown only once)

#### 3.5 Tool: `nexus.tokens.list`

- **Wraps:** `GET /api/tokens`
- **Input:** `{}`
- **Output:** Array of token metadata (no secrets)

#### 3.6 Tool: `nexus.tokens.revoke`

- **Wraps:** `DELETE /api/tokens/{id}`
- **Input:** `{ tokenId: string }`
- **Output:** `{ ok: true }`

**Validation:**
- [ ] All 6 tools callable via MCP protocol
- [ ] App install tool works end-to-end (requires App Installation Pipeline)
- [ ] Token creation returns usable token
- [ ] Token revocation prevents future use

---

### Phase 4: Account Tools

**Goal:** Implement account management MCP tools.

#### 4.1 Add `GET /api/account` endpoint

- **File:** `src/server.ts`
- **Response:**
  ```json
  {
    "accountId": "acc_123",
    "displayName": "Tyler's Account",
    "email": "tyler@example.com",
    "plan": "starter",
    "servers": 1,
    "maxServers": 3,
    "createdAt": "2026-03-04T..."
  }
  ```

#### 4.2 Tool: `nexus.account.info`

- **Wraps:** `GET /api/account`
- **Input:** `{}`
- **Output:** Account summary

#### 4.3 Tool: `nexus.account.plans`

- **Wraps:** `GET /api/plans`
- **Input:** `{}`
- **Output:** Available server plans with pricing

#### 4.4 Tool: `nexus.account.usage` (basic)

- **Input:** `{ period?: "current" | "last_month" }`
- **Output:** Usage summary from `frontdoor_server_usage_daily`
- **Note:** Full credit-based usage tracking deferred to Credit System workplan

**Validation:**
- [ ] Account info tool returns correct data
- [ ] Plans tool returns available plans with pricing
- [ ] Usage tool returns basic usage data

---

### Phase 5: Documentation & Client Config

**Goal:** Make it easy for agents to connect to the MCP server.

#### 5.1 MCP server metadata

- **File:** `src/mcp-server.ts`
- **Info block returned by `initialize`:**
  ```json
  {
    "name": "nexus-platform",
    "version": "1.0.0",
    "description": "Nexus Platform Management - manage servers, apps, and account",
    "vendor": "Nexus"
  }
  ```

#### 5.2 Client configuration example

Document the MCP client config for connecting:
```json
{
  "mcpServers": {
    "nexus-platform": {
      "transport": "http",
      "url": "https://frontdoor.nexushub.sh/mcp",
      "headers": {
        "Authorization": "Bearer nex_t_YOUR_TOKEN_HERE"
      }
    }
  }
}
```

#### 5.3 Dashboard "Connect Agent" button (future)

- Show MCP config snippet in dashboard after token creation
- Copy-to-clipboard for Claude Desktop, Cursor, etc.
- **Note:** UI work deferred

**Validation:**
- [ ] Claude Desktop can connect using config snippet
- [ ] MCP tool list visible in client
- [ ] Basic server management workflow works end-to-end

---

## MCP Protocol Implementation Details

### JSON-RPC Message Format

```typescript
// Request
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "nexus.servers.list",
    "arguments": { "status": "running" }
  }
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[{\"serverId\":\"srv-xxx\",\"status\":\"running\"}]"
      }
    ]
  }
}
```

### Supported JSON-RPC Methods

| Method | Description |
|--------|-------------|
| `initialize` | Return server capabilities |
| `initialized` | Client acknowledgment (no-op) |
| `tools/list` | Return available tools |
| `tools/call` | Execute a tool |
| `ping` | Health check |

### Error Codes

| Code | Meaning |
|------|---------|
| -32700 | Parse error |
| -32600 | Invalid request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| MCP protocol changes | Implement complete tool set from day one; spec is stable |
| Token leaked in MCP config | Tokens are revocable; warn users to use scoped tokens |
| High-frequency tool calls | Rate limiting already exists via `tokenEndpoints` rate limiter |
| Destructive operations via MCP | Require `confirm: true` for delete operations |

---

## Estimated Effort

| Phase | Effort | Description |
|-------|--------|-------------|
| Phase 1: MCP Transport | 3-4 hours | JSON-RPC handler, auth, endpoint |
| Phase 2: Server Tools | 2-3 hours | 4 tools wrapping existing APIs |
| Phase 3: App & Token Tools | 2-3 hours | 6 tools, depends on App Install Pipeline |
| Phase 4: Account Tools | 1-2 hours | 3 tools + new account endpoint |
| Phase 5: Documentation | 1 hour | Config examples, metadata |
| **Total** | **9-13 hours** | |

---

## Changelog

- 2026-03-04: Initial workplan created from gap analysis
- 2026-03-04: Added HARD CUTOVER approach, removed incremental/optional language
