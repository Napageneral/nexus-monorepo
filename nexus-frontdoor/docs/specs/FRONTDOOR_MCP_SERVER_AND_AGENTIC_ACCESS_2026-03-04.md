# Frontdoor MCP Server and Agentic Access Strategy

**Date:** 2026-03-04
**Status:** DRAFT
**Author:** Architecture Team
**Component:** nexus-frontdoor

---

## Table of Contents

1. [Overview](#overview)
2. [MCP Server Architecture](#mcp-server-architecture)
3. [Tool Definitions](#tool-definitions)
4. [Authentication & Authorization](#authentication--authorization)
5. [Signup Strategy](#signup-strategy)
6. [Credit & Billing System](#credit--billing-system)
7. [Free Tier](#free-tier)
8. [Security Considerations](#security-considerations)
9. [Implementation Roadmap](#implementation-roadmap)

---

## Overview

The Nexus Frontdoor platform control plane provides both human-facing (dashboard) and programmatic (API, MCP) interfaces for managing Nexus servers, apps, and account resources. This specification defines:

1. **MCP Server for Platform Management** - An MCP (Model Context Protocol) server that exposes Nexus platform capabilities to AI agents and agentic workflows
2. **Agentic Access Strategy** - A phased approach to enabling agent-driven account creation, authentication, and resource management
3. **Credit & Billing System** - A prepaid credits model supporting crypto payments and usage-based billing

### Goals

- Enable AI agents to manage Nexus infrastructure programmatically
- Provide secure, token-based authentication for agent workflows
- Support both human-initiated and agent-initiated signup flows
- Implement flexible payment options (Stripe, crypto) for agentic use cases
- Maintain security and fraud prevention throughout

### Non-Goals

- Replacing the human dashboard (both interfaces coexist)
- Supporting all payment methods immediately (phased rollout)
- Providing direct SSH or runtime-level access via MCP (that's handled by tenant VPS MCP servers)

---

## MCP Server Architecture

### Endpoint

```
https://frontdoor.nexushub.sh/mcp
```

**Transport:** Server-Sent Events (SSE)
**Protocol:** MCP 2024-11-05

### Connection Flow

```
┌─────────────┐                                    ┌──────────────────┐
│   Agent     │                                    │   Frontdoor      │
│  (Claude,   │                                    │   MCP Server     │
│   Cursor)   │                                    │                  │
└──────┬──────┘                                    └────────┬─────────┘
       │                                                    │
       │  POST /mcp                                         │
       │  Authorization: Bearer nex_t_abc123...             │
       ├───────────────────────────────────────────────────>│
       │                                                    │
       │                           SSE Connection Established│
       │<───────────────────────────────────────────────────┤
       │                                                    │
       │  Request: tools/list                               │
       ├───────────────────────────────────────────────────>│
       │                                                    │
       │  Response: [list of available tools]               │
       │<───────────────────────────────────────────────────┤
       │                                                    │
       │  Request: tools/call (nexus.servers.create)        │
       ├───────────────────────────────────────────────────>│
       │                                                    │
       │         [validates token, checks scopes]           │
       │         [calls internal API: POST /api/servers]    │
       │                                                    │
       │  Response: {serverId, status, ...}                 │
       │<───────────────────────────────────────────────────┤
       │                                                    │
```

### Implementation

The MCP server is implemented as a dedicated handler in the frontdoor application:

**Route:** `POST /mcp`

**Handler Stack:**
1. `mcpAuthMiddleware` - Validates Bearer token from Authorization header
2. `mcpHandler` - Processes MCP protocol messages
3. Tool execution layer - Maps MCP tool calls to internal API methods

**Code Structure:**
```
frontdoor/
  handlers/
    mcp/
      server.go           # MCP protocol handler (SSE transport)
      auth.go             # Token validation middleware
      tools.go            # Tool registry and dispatch
      tools_servers.go    # Server management tools
      tools_apps.go       # App management tools
      tools_tokens.go     # Token management tools
      tools_account.go    # Account info tools
```

### Tool Categories

The MCP server exposes tools in four categories:

1. **Platform Management** - Server lifecycle (create, list, delete)
2. **App Management** - App catalog, install, uninstall
3. **Token Management** - API token creation and revocation
4. **Account** - Account info, plans, billing

---

## Tool Definitions

All tools follow the MCP tool schema format. Below are the detailed definitions.

### Platform Management Tools

#### `nexus.servers.list`

List all servers for the authenticated account.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {}
}
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "servers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "serverId": {"type": "string"},
          "name": {"type": "string"},
          "hostname": {"type": "string"},
          "planId": {"type": "string"},
          "status": {"type": "string", "enum": ["provisioning", "running", "suspended", "deleted"]},
          "createdAtMs": {"type": "number"},
          "region": {"type": "string"}
        }
      }
    }
  }
}
```

**Maps to:** `GET /api/servers`

---

#### `nexus.servers.create`

Create a new Nexus server.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "name": {"type": "string", "description": "Human-readable server name"},
    "planId": {"type": "string", "description": "Plan ID (e.g., 'cax11', 'cax21')"},
    "region": {"type": "string", "description": "Region code (e.g., 'fsn1', 'nbg1')"}
  },
  "required": ["name", "planId"]
}
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "serverId": {"type": "string"},
    "status": {"type": "string"},
    "hostname": {"type": "string"},
    "message": {"type": "string"}
  }
}
```

**Maps to:** `POST /api/servers/create`

**Validation:**
- Account must have payment on file (or be in free tier)
- Plan must be valid and available
- Account credit balance must be sufficient

---

#### `nexus.servers.get`

Get details for a specific server.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "serverId": {"type": "string"}
  },
  "required": ["serverId"]
}
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "serverId": {"type": "string"},
    "name": {"type": "string"},
    "hostname": {"type": "string"},
    "planId": {"type": "string"},
    "status": {"type": "string"},
    "ipAddress": {"type": "string"},
    "createdAtMs": {"type": "number"},
    "region": {"type": "string"},
    "apps": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "appId": {"type": "string"},
          "name": {"type": "string"},
          "status": {"type": "string"}
        }
      }
    }
  }
}
```

**Maps to:** `GET /api/servers/{id}`

---

#### `nexus.servers.delete`

Delete a server (destroys VPS and all data).

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "serverId": {"type": "string"},
    "confirm": {"type": "boolean", "description": "Must be true to confirm deletion"}
  },
  "required": ["serverId", "confirm"]
}
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "success": {"type": "boolean"},
    "message": {"type": "string"}
  }
}
```

**Maps to:** `DELETE /api/servers/{id}`

**Validation:**
- `confirm` must be `true`
- Server must belong to the authenticated account

---

### App Management Tools

#### `nexus.apps.catalog`

List available apps in the Nexus app catalog.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "category": {"type": "string", "description": "Filter by category (optional)"}
  }
}
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "apps": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "appId": {"type": "string"},
          "name": {"type": "string"},
          "description": {"type": "string"},
          "category": {"type": "string"},
          "version": {"type": "string"}
        }
      }
    }
  }
}
```

**Maps to:** `GET /api/apps/catalog`

---

#### `nexus.apps.install`

Install an app on a server.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "serverId": {"type": "string"},
    "appId": {"type": "string"},
    "config": {
      "type": "object",
      "description": "App-specific configuration (optional)",
      "additionalProperties": true
    }
  },
  "required": ["serverId", "appId"]
}
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "success": {"type": "boolean"},
    "installId": {"type": "string"},
    "status": {"type": "string"},
    "message": {"type": "string"}
  }
}
```

**Maps to:** `POST /api/servers/{serverId}/apps/{appId}/install`

---

#### `nexus.apps.uninstall`

Uninstall an app from a server.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "serverId": {"type": "string"},
    "appId": {"type": "string"}
  },
  "required": ["serverId", "appId"]
}
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "success": {"type": "boolean"},
    "message": {"type": "string"}
  }
}
```

**Maps to:** `POST /api/servers/{serverId}/apps/{appId}/uninstall`

---

#### `nexus.apps.list`

List installed apps on a server.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "serverId": {"type": "string"}
  },
  "required": ["serverId"]
}
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "apps": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "appId": {"type": "string"},
          "name": {"type": "string"},
          "status": {"type": "string"},
          "installedAtMs": {"type": "number"}
        }
      }
    }
  }
}
```

**Maps to:** `GET /api/servers/{serverId}/apps`

---

### Token Management Tools

#### `nexus.tokens.create`

Create a new API token.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "name": {"type": "string", "description": "Human-readable token name"},
    "scopes": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Token scopes (e.g., ['servers:read', 'servers:write'])"
    },
    "expiresInDays": {
      "type": "number",
      "description": "Token expiration in days (optional, 0 = no expiration)"
    }
  },
  "required": ["name"]
}
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "tokenId": {"type": "string"},
    "token": {"type": "string", "description": "The API token (only shown once)"},
    "name": {"type": "string"},
    "scopes": {"type": "array", "items": {"type": "string"}},
    "createdAtMs": {"type": "number"},
    "expiresAtMs": {"type": "number"}
  }
}
```

**Maps to:** `POST /api/tokens/create`

**Security Note:** The full token value is only returned in the creation response. It cannot be retrieved later.

---

#### `nexus.tokens.list`

List all API tokens for the account.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {}
}
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "tokens": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "tokenId": {"type": "string"},
          "name": {"type": "string"},
          "scopes": {"type": "array", "items": {"type": "string"}},
          "createdAtMs": {"type": "number"},
          "expiresAtMs": {"type": "number"},
          "lastUsedAtMs": {"type": "number"}
        }
      }
    }
  }
}
```

**Maps to:** `GET /api/tokens`

**Note:** Token values are never returned in list responses, only metadata.

---

#### `nexus.tokens.revoke`

Revoke an API token.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "tokenId": {"type": "string"}
  },
  "required": ["tokenId"]
}
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "success": {"type": "boolean"},
    "message": {"type": "string"}
  }
}
```

**Maps to:** `DELETE /api/tokens/{tokenId}`

---

### Account Tools

#### `nexus.account.info`

Get account information for the authenticated user.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {}
}
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "accountId": {"type": "string"},
    "email": {"type": "string"},
    "name": {"type": "string"},
    "createdAtMs": {"type": "number"},
    "creditBalanceCents": {"type": "number"},
    "currency": {"type": "string"},
    "freeTierUsed": {"type": "boolean"}
  }
}
```

**Maps to:** `GET /api/auth/session`

---

#### `nexus.plans.list`

List available server plans.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {}
}
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "plans": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "planId": {"type": "string"},
          "name": {"type": "string"},
          "description": {"type": "string"},
          "vcpus": {"type": "number"},
          "memoryMb": {"type": "number"},
          "diskGb": {"type": "number"},
          "pricePerHourCents": {"type": "number"},
          "pricePerMonthCents": {"type": "number"}
        }
      }
    }
  }
}
```

**Maps to:** `GET /api/plans`

---

## Authentication & Authorization

### Token-Based Authentication

The MCP server uses the same API token authentication as the frontdoor REST API.

**Token Format:** `nex_t_<base58_encoded_random_bytes>`

**Authentication Flow:**

```
1. Agent connects to MCP endpoint with Bearer token
   POST /mcp
   Authorization: Bearer nex_t_abc123...

2. mcpAuthMiddleware extracts token from header

3. Validate token:
   - Query frontdoor_api_tokens table
   - Check expiration (if set)
   - Load associated account

4. Attach session context to request:
   {
     accountId: "...",
     tokenId: "...",
     scopes: ["servers:read", "servers:write", ...],
   }

5. Tool execution checks scopes before calling API methods
```

### Token Scopes

Scopes control which tools are available to a given token:

| Scope | Tools Enabled |
|-------|---------------|
| `servers:read` | `nexus.servers.list`, `nexus.servers.get` |
| `servers:write` | `nexus.servers.create`, `nexus.servers.delete` |
| `apps:read` | `nexus.apps.catalog`, `nexus.apps.list` |
| `apps:write` | `nexus.apps.install`, `nexus.apps.uninstall` |
| `tokens:read` | `nexus.tokens.list` |
| `tokens:write` | `nexus.tokens.create`, `nexus.tokens.revoke` |
| `account:read` | `nexus.account.info`, `nexus.plans.list` |

**Default Scopes:** New tokens created via dashboard get all scopes by default. Tokens created via API can specify custom scopes.

### Rate Limiting

MCP connections are subject to the same rate limits as API requests:

- **Per-token limit:** 1000 requests per hour
- **Per-account limit:** 5000 requests per hour
- **Connection limit:** 10 concurrent MCP connections per account

Rate limit headers are not applicable to SSE, but rate limit errors are returned as MCP error responses.

### Session Management

- Each MCP connection maintains a persistent SSE session
- Token validation occurs once at connection time
- If a token is revoked, active connections using that token continue until closed (no real-time revocation)
- Recommended: agents should gracefully handle connection errors and re-authenticate

---

## Signup Strategy

The agentic signup strategy is rolled out in three phases, balancing security, user experience, and automation.

### Phase 1: Human Signup Required (Current)

**Status:** Implemented
**Timeline:** Now

**Flow:**

```
┌──────────┐                                    ┌──────────────┐
│  Human   │                                    │  Frontdoor   │
│          │                                    │  Dashboard   │
└────┬─────┘                                    └──────┬───────┘
     │                                                 │
     │  1. Navigate to frontdoor.nexushub.sh          │
     ├────────────────────────────────────────────────>│
     │                                                 │
     │  2. Click "Sign Up" → Google OIDC              │
     ├────────────────────────────────────────────────>│
     │                                                 │
     │  3. Authenticate with Google                    │
     │<────────────────────────────────────────────────┤
     │                                                 │
     │  4. Redirected to dashboard (account created)   │
     │<────────────────────────────────────────────────┤
     │                                                 │
     │  5. Navigate to "API Tokens" section            │
     ├────────────────────────────────────────────────>│
     │                                                 │
     │  6. Click "Create Token" → copy nex_t_...       │
     │<────────────────────────────────────────────────┤
     │                                                 │

     Human provides token to agent (paste into config, share securely)

     │                                                 │
┌────┴─────┐                                    ┌─────┴────────┐
│  Agent   │                                    │  MCP Server  │
│          │                                    │              │
└────┬─────┘                                    └──────┬───────┘
     │                                                 │
     │  7. Connect to MCP with Bearer token            │
     ├────────────────────────────────────────────────>│
     │                                                 │
     │  8. Agent can now manage resources              │
     │<────────────────────────────────────────────────┤
     │                                                 │
```

**Key Points:**
- Human identity verification via OIDC (Google, GitHub)
- Human controls payment information
- Human explicitly creates and shares API tokens with agents
- Secure by default: no automated account creation risk

**Limitations:**
- Requires human involvement for every agent
- Not fully autonomous for agentic workflows

---

### Phase 2: Streamlined MCP Config Generation (Soon)

**Status:** Planned
**Timeline:** Q2 2026

**Enhancements:**

1. **"Generate MCP Config" Button** in dashboard
   - One-click generates a ready-to-use MCP configuration block
   - Includes endpoint URL and fresh API token
   - Format matches Claude Desktop `claude_desktop_config.json`

   Example output:
   ```json
   {
     "mcpServers": {
       "nexus": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-sse", "https://frontdoor.nexushub.sh/mcp"],
         "env": {
           "AUTHORIZATION": "Bearer nex_t_abc123..."
         }
       }
     }
   }
   ```

2. **Quick Setup Guides**
   - Step-by-step instructions for Claude Desktop, Cursor, Continue.dev
   - Copy-paste config snippets
   - Verification checklist

3. **Token Templates**
   - Pre-defined token scope templates: "Read Only", "Full Access", "CI/CD"
   - One-click token creation with appropriate scopes

**Benefits:**
- Reduced setup friction for users
- Clear path from signup to agent access
- Still maintains human-in-the-loop for security

---

### Phase 3: Agentic Signup with Payment (Future)

**Status:** Planned
**Timeline:** Q3 2026 (after credit system & crypto payment integration)

**Prerequisites:**
- Credit system implementation (see below)
- Crypto payment integration (USDC, ETH)
- Email verification system
- Fraud detection and rate limiting

**Flow:**

```
┌──────────┐                                    ┌──────────────┐
│  Agent   │                                    │  Frontdoor   │
│          │                                    │  API         │
└────┬─────┘                                    └──────┬───────┘
     │                                                 │
     │  POST /api/accounts/create                      │
     │  {                                              │
     │    "email": "agent@example.com",                │
     │    "paymentProof": {                            │
     │      "method": "crypto",                        │
     │      "txHash": "0x..."                          │
     │    }                                            │
     │  }                                              │
     ├────────────────────────────────────────────────>│
     │                                                 │
     │         [validates payment proof]               │
     │         [creates account + credits]             │
     │         [generates API token]                   │
     │                                                 │
     │  Response:                                      │
     │  {                                              │
     │    "accountId": "...",                          │
     │    "apiToken": "nex_t_...",                     │
     │    "creditBalanceCents": 10000,                 │
     │    "message": "Account created. Verify email."  │
     │  }                                              │
     │<────────────────────────────────────────────────┤
     │                                                 │
     │  [agent stores token, can now use MCP]          │
     │                                                 │
```

**Endpoint:** `POST /api/accounts/create`

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "email": {
      "type": "string",
      "format": "email",
      "description": "Contact email (required for notifications)"
    },
    "paymentProof": {
      "type": "object",
      "properties": {
        "method": {"type": "string", "enum": ["crypto", "stripe"]},
        "txHash": {"type": "string", "description": "Crypto transaction hash (if method=crypto)"},
        "paymentIntentId": {"type": "string", "description": "Stripe payment intent ID (if method=stripe)"}
      },
      "required": ["method"]
    }
  },
  "required": ["email", "paymentProof"]
}
```

**Validation:**
1. Email format validation
2. Email domain reputation check (prevent disposable emails)
3. Payment proof verification:
   - **Crypto:** Query blockchain API, confirm tx is confirmed and sent to correct address
   - **Stripe:** Validate payment intent status
4. Rate limiting: max 3 account creation attempts per IP per day
5. Fraud detection: flag suspicious patterns (VPN, known bad actors, etc.)

**Security Measures:**
- Email verification required before server provisioning
- Initial credit deposit required (no free signups via API)
- Account suspended if email bounces
- IP-based rate limiting
- CAPTCHA requirement for high-risk IPs (future)

---

## Credit & Billing System

The credit system enables prepaid, usage-based billing for Nexus servers. Agents and users deposit funds, and usage is automatically deducted.

### Database Schema

#### `frontdoor_account_credits`

Stores account credit balances.

```sql
CREATE TABLE frontdoor_account_credits (
  account_id          TEXT PRIMARY KEY,
  balance_cents       INTEGER NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'USD',
  updated_at_ms       INTEGER NOT NULL,

  FOREIGN KEY (account_id) REFERENCES frontdoor_accounts(account_id)
);

CREATE INDEX idx_credits_balance ON frontdoor_account_credits(balance_cents);
```

---

#### `frontdoor_credit_transactions`

Audit log for all credit transactions.

```sql
CREATE TABLE frontdoor_credit_transactions (
  transaction_id      TEXT PRIMARY KEY,
  account_id          TEXT NOT NULL,
  amount_cents        INTEGER NOT NULL, -- positive = deposit, negative = charge
  balance_after_cents INTEGER NOT NULL,
  type                TEXT NOT NULL,     -- 'deposit', 'usage', 'refund', 'adjustment'
  description         TEXT,
  reference_id        TEXT,              -- stripe payment ID, crypto tx hash, server ID, etc.
  created_at_ms       INTEGER NOT NULL,

  FOREIGN KEY (account_id) REFERENCES frontdoor_accounts(account_id)
);

CREATE INDEX idx_transactions_account ON frontdoor_credit_transactions(account_id, created_at_ms);
CREATE INDEX idx_transactions_type ON frontdoor_credit_transactions(type);
CREATE INDEX idx_transactions_reference ON frontdoor_credit_transactions(reference_id);
```

---

### Credit Operations

#### Deposit

**Trigger:** User/agent makes a payment (Stripe, crypto)

**Process:**
1. Payment webhook confirms successful payment
2. Convert payment amount to cents (USD)
3. Insert transaction record:
   ```sql
   INSERT INTO frontdoor_credit_transactions (
     transaction_id, account_id, amount_cents, type, description, reference_id, created_at_ms
   ) VALUES (
     'txn_...', 'acc_...', 10000, 'deposit', 'Stripe payment', 'pi_...', <now>
   );
   ```
4. Update balance:
   ```sql
   UPDATE frontdoor_account_credits
   SET balance_cents = balance_cents + 10000,
       updated_at_ms = <now>
   WHERE account_id = 'acc_...';
   ```

---

#### Usage Charge

**Trigger:** Hourly billing job

**Process:**
1. Query all running servers:
   ```sql
   SELECT server_id, account_id, plan_id, status
   FROM frontdoor_servers
   WHERE status = 'running';
   ```
2. For each server, calculate hourly cost based on plan pricing
3. Deduct from account credits:
   ```sql
   INSERT INTO frontdoor_credit_transactions (
     transaction_id, account_id, amount_cents, type, description, reference_id, created_at_ms
   ) VALUES (
     'txn_...', 'acc_...', -15, 'usage', 'cax11 server 1 hour', 'srv_...', <now>
   );

   UPDATE frontdoor_account_credits
   SET balance_cents = balance_cents - 15,
       updated_at_ms = <now>
   WHERE account_id = 'acc_...';
   ```

---

#### Low Balance Handling

**Thresholds:**
- **Warning:** balance < 500 cents ($5)
- **Critical:** balance < 100 cents ($1)
- **Suspend:** balance <= 0

**Process:**
1. Hourly job checks account balances
2. If balance < 500 cents:
   - Send email warning: "Low credit balance, please add funds"
   - Show dashboard banner
3. If balance < 100 cents:
   - Send urgent email: "Critical: add funds within 24 hours or servers will be suspended"
4. If balance <= 0:
   - Suspend all running servers (status = 'suspended')
   - Send email: "Servers suspended due to insufficient credits"
   - Servers can be resumed after credit deposit

**Grace Period:** 24 hours from critical warning to suspension

---

### Payment Methods

#### Stripe

**Integration:**
- Standard Stripe checkout flow
- Payment intent webhooks confirm successful payments
- Automatic credit deposit on payment confirmation

**Flow:**
1. User/agent initiates deposit via dashboard or API
2. Frontdoor creates Stripe payment intent
3. User completes payment in Stripe checkout
4. Webhook `payment_intent.succeeded` triggers credit deposit

---

#### Crypto (USDC, ETH)

**Integration:**
- Generate unique deposit address per account
- Poll blockchain API for incoming transactions
- Confirm transaction (wait for N confirmations)
- Convert crypto amount to USD using oracle price feed
- Deposit credits

**Flow:**
1. User/agent requests deposit address: `GET /api/billing/crypto/deposit-address`
2. Response includes:
   ```json
   {
     "address": "0x...",
     "currency": "USDC",
     "network": "Ethereum",
     "minAmount": "10.00"
   }
   ```
3. User/agent sends crypto to address
4. Blockchain monitor detects transaction
5. After confirmations, credits are deposited
6. Webhook/email notifies user of credit deposit

**Supported Currencies:**
- USDC (ERC-20, Arbitrum, Polygon)
- ETH (mainnet, Arbitrum)

---

### Usage Billing

**Billing Frequency:** Hourly

**Calculation:**
- Each running server is billed hourly based on plan pricing
- Prorated to the second (hourly rate / 3600 * seconds)

**Example:**
- Plan: cax11
- Price: $0.15/hour = 15 cents/hour
- Server runs for 1 hour 30 minutes = 5400 seconds
- Charge: 15 * (5400 / 3600) = 22.5 cents

**Billing Job:**
- Cron job runs every hour
- Queries all running servers
- Calculates usage since last billing cycle
- Deducts credits for each server
- Updates last_billed_at timestamp

**Implementation:**
```go
// Pseudo-code
func BillingJob() {
  servers := QueryRunningServers()

  for _, server := range servers {
    plan := GetPlan(server.PlanId)
    hoursSinceLastBill := (now - server.LastBilledAt) / 3600000
    chargeCents := plan.PricePerHourCents * hoursSinceLastBill

    DeductCredits(server.AccountId, chargeCents, server.ServerId)
    UpdateLastBilledAt(server.ServerId, now)
  }

  CheckLowBalances()
}
```

---

## Free Tier

Every new account receives a free trial server to explore Nexus.

### Free Tier Rules

- **Plan:** cax11 (smallest available plan)
- **Duration:** 7 days from account creation
- **Limit:** 1 free server per account
- **Functionality:** Full access to all apps and features
- **After 7 days:**
  - Server is automatically suspended
  - Data is retained for 30 days
  - User must add payment to resume server
  - Or user can delete the server and create a paid server

### Free Tier Tracking

**Database Field:**
```sql
ALTER TABLE frontdoor_accounts ADD COLUMN free_tier_used BOOLEAN DEFAULT FALSE;
```

**Logic:**
1. When account is created, `free_tier_used = FALSE`
2. When user creates their first server:
   - If `free_tier_used = FALSE`:
     - Create server with `is_free_tier = TRUE` flag
     - Set `free_tier_used = TRUE`
     - Set `free_tier_expires_at_ms = now + 7 days`
   - If `free_tier_used = TRUE`:
     - Require payment on file before provisioning
3. Daily job checks for expired free tier servers:
   ```sql
   SELECT server_id FROM frontdoor_servers
   WHERE is_free_tier = TRUE
     AND free_tier_expires_at_ms < <now>
     AND status = 'running';
   ```
   - Suspend servers
   - Send email: "Free tier expired. Add payment to continue."

### Free Tier to Paid Transition

**Flow:**
1. User adds payment method (Stripe or crypto deposit)
2. Dashboard shows "Resume Free Tier Server" option
3. User clicks "Resume" → server status changes to 'running'
4. Billing starts immediately (hourly charges apply)

**Alternatively:**
- User can delete free tier server and create a new paid server on any plan

---

## Security Considerations

### Token Security

1. **Token Generation:**
   - Use cryptographically secure random bytes (32+ bytes)
   - Base58 encoding for readability
   - Prefix `nex_t_` for easy identification

2. **Token Storage:**
   - Hashed in database (SHA-256)
   - Plaintext token only shown once at creation time
   - Agents must securely store tokens (env vars, secret managers)

3. **Token Revocation:**
   - Immediate revocation via API or dashboard
   - Revoked tokens fail authentication instantly
   - Active MCP connections continue until closed (no real-time kill)

4. **Token Scopes:**
   - Principle of least privilege
   - Agents should request only necessary scopes
   - Admins can audit token usage via dashboard

---

### MCP Connection Security

1. **TLS Required:**
   - All MCP connections over HTTPS
   - Reject plain HTTP connections

2. **Rate Limiting:**
   - Per-token and per-account limits
   - Prevent abuse and DoS attacks

3. **Input Validation:**
   - All tool inputs validated against JSON schema
   - Reject malformed requests
   - Sanitize string inputs to prevent injection

4. **Authorization:**
   - Every tool call checks token scopes
   - Server ownership verification (user can only act on their own servers)
   - No privilege escalation vectors

---

### Agentic Signup Security

1. **Email Verification:**
   - Required before server provisioning
   - Prevents fake account spam
   - Bounce detection → account suspension

2. **Payment Verification:**
   - Crypto: wait for blockchain confirmations (6+ for ETH, 30+ for BTC)
   - Stripe: webhook signature verification
   - Minimum deposit amount ($10) to deter abuse

3. **Fraud Detection:**
   - IP-based rate limiting (max 3 signups/day per IP)
   - Email domain reputation check
   - Flag VPN/proxy traffic for manual review
   - Machine learning model (future): detect suspicious patterns

4. **Account Limits:**
   - Max 10 servers per account (can be increased with verification)
   - Max 50 API tokens per account
   - Max 10 concurrent MCP connections per account

---

### Credit System Security

1. **Double-Spend Prevention:**
   - Atomic balance updates with database transactions
   - Balance can never go negative (check before charge)

2. **Audit Trail:**
   - All transactions logged immutably
   - Reference IDs link to external payment systems
   - Tamper-proof: append-only log

3. **Refund Protection:**
   - Refunds require admin approval
   - Refund transaction type clearly logged
   - Prevent abuse: max 2 refunds per account per month

---

## Implementation Roadmap

### Phase 1: MCP Server Foundation (Q1 2026)

**Deliverables:**
- [x] Token-based API authentication (already implemented)
- [ ] MCP server endpoint (`POST /mcp`)
- [ ] SSE transport handler
- [ ] Tool registry and dispatch system
- [ ] All platform management tools (servers, apps, tokens, account)
- [ ] Token scope enforcement
- [ ] Rate limiting
- [ ] MCP server documentation

**Timeline:** 4 weeks

**Testing:**
- Integration tests for all tools
- Load testing (1000 concurrent connections)
- Security audit (token validation, authorization)

---

### Phase 2: Streamlined MCP Config (Q2 2026)

**Deliverables:**
- [ ] "Generate MCP Config" button in dashboard
- [ ] Config output for Claude Desktop, Cursor, Continue.dev
- [ ] Token scope templates
- [ ] Quick setup guides and documentation
- [ ] Video tutorials

**Timeline:** 2 weeks

**Testing:**
- User testing with real agents (Claude Desktop, Cursor)
- Feedback collection and iteration

---

### Phase 3: Credit System (Q2 2026)

**Deliverables:**
- [ ] Database schema: `frontdoor_account_credits`, `frontdoor_credit_transactions`
- [ ] Credit deposit API (Stripe integration)
- [ ] Hourly usage billing job
- [ ] Low balance warnings and suspension logic
- [ ] Dashboard: credit balance, transaction history
- [ ] Billing API endpoints for agents

**Timeline:** 6 weeks

**Testing:**
- Billing accuracy tests (verify charges match plan pricing)
- Suspension/resume flow testing
- Edge cases: concurrent charges, negative balance handling

---

### Phase 4: Crypto Payment Integration (Q3 2026)

**Deliverables:**
- [ ] Crypto deposit address generation (USDC, ETH)
- [ ] Blockchain monitor service (poll for transactions)
- [ ] Price oracle integration (convert crypto to USD)
- [ ] Crypto payment confirmation flow
- [ ] Webhook notifications for credit deposits

**Timeline:** 8 weeks

**Testing:**
- Testnet integration testing (Sepolia, Polygon Mumbai)
- Mainnet pilot with selected users
- Security audit (address generation, fund custody)

---

### Phase 5: Agentic Signup (Q3 2026)

**Deliverables:**
- [ ] `POST /api/accounts/create` endpoint
- [ ] Email verification system
- [ ] Fraud detection rules (IP limits, email reputation)
- [ ] Payment proof validation (crypto, Stripe)
- [ ] Account suspension logic (bounced emails, fraud flags)
- [ ] API documentation for agentic signup

**Timeline:** 4 weeks

**Testing:**
- Security testing (abuse scenarios, fake payments)
- Load testing (100 signups/minute)
- Fraud detection accuracy (false positive rate)

---

### Phase 6: Free Tier (Q1 2026)

**Deliverables:**
- [ ] Free tier flag in `frontdoor_servers` table
- [ ] Free tier expiration logic
- [ ] Daily job: check and suspend expired free tier servers
- [ ] Email notifications for free tier expiration
- [ ] Dashboard: free tier status, upgrade prompts

**Timeline:** 2 weeks

**Testing:**
- Free tier expiration flow (create → wait 7 days → verify suspension)
- Transition to paid (add payment → resume server)

---

## Appendix

### MCP Configuration Examples

#### Claude Desktop

File: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "nexus": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sse",
        "https://frontdoor.nexushub.sh/mcp"
      ],
      "env": {
        "AUTHORIZATION": "Bearer nex_t_your_token_here"
      }
    }
  }
}
```

---

#### Cursor / VSCode

Extension settings:

```json
{
  "mcp.servers": [
    {
      "name": "nexus",
      "url": "https://frontdoor.nexushub.sh/mcp",
      "headers": {
        "Authorization": "Bearer nex_t_your_token_here"
      }
    }
  ]
}
```

---

### API Endpoint Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/mcp` | MCP server (SSE transport) |
| `POST` | `/api/accounts/create` | Agentic signup (Phase 3) |
| `GET` | `/api/auth/session` | Account info |
| `GET` | `/api/servers` | List servers |
| `POST` | `/api/servers/create` | Create server |
| `GET` | `/api/servers/{id}` | Get server details |
| `DELETE` | `/api/servers/{id}` | Delete server |
| `GET` | `/api/apps/catalog` | List available apps |
| `POST` | `/api/servers/{id}/apps/{appId}/install` | Install app |
| `POST` | `/api/servers/{id}/apps/{appId}/uninstall` | Uninstall app |
| `GET` | `/api/servers/{id}/apps` | List installed apps |
| `POST` | `/api/tokens/create` | Create API token |
| `GET` | `/api/tokens` | List tokens |
| `DELETE` | `/api/tokens/{id}` | Revoke token |
| `GET` | `/api/plans` | List server plans |
| `GET` | `/api/billing/credits` | Get credit balance |
| `POST` | `/api/billing/deposit` | Initiate credit deposit |
| `GET` | `/api/billing/transactions` | List credit transactions |
| `GET` | `/api/billing/crypto/deposit-address` | Get crypto deposit address |

---

### Error Codes

MCP tool calls return structured errors following the MCP protocol:

**Standard Error Codes:**
- `-32600`: Invalid Request (malformed JSON)
- `-32601`: Method not found (tool doesn't exist)
- `-32602`: Invalid params (input schema violation)
- `-32603`: Internal error (server error)

**Custom Error Codes:**
- `1000`: Authentication failed (invalid token)
- `1001`: Authorization failed (insufficient scopes)
- `1002`: Rate limit exceeded
- `1003`: Resource not found
- `1004`: Insufficient credits
- `1005`: Free tier exhausted
- `1006`: Payment required

**Example Error Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": 1004,
    "message": "Insufficient credits. Please add funds to your account.",
    "data": {
      "currentBalance": 0,
      "requiredAmount": 15
    }
  }
}
```

---

### Glossary

- **MCP:** Model Context Protocol - standardized protocol for AI agents to interact with external systems
- **SSE:** Server-Sent Events - HTTP-based protocol for server-to-client streaming
- **Bearer Token:** Authentication token passed in the `Authorization` header
- **Scope:** Permission level for API tokens (e.g., `servers:read`, `apps:write`)
- **Free Tier:** 7-day trial server provided to new accounts
- **Credits:** Prepaid balance in cents (USD) used for usage-based billing
- **VPS:** Virtual Private Server (Hetzner Cloud instance running nex-runtime)

---

**Document Version:** 1.0
**Last Updated:** 2026-03-04
**Next Review:** 2026-04-01
