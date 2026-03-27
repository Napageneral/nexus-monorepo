# Operator Console API Comparison: Current Usage vs Nex Runtime Spec

## Summary

The console currently uses **73 unique RPC methods** out of **230+ operations** available in the nex runtime across 24 domains. The runtime exposes its full method catalog via the `hello-ok` handshake response's `features.methods` array, so the console can dynamically discover what's available.

## Protocol

| Aspect | Console Implementation | Nex Runtime Spec | Status |
|--------|----------------------|------------------|--------|
| Transport | WebSocket to port derived from page URL | WebSocket on `:18789` | OK — console auto-detects |
| Frame format | `{ type: "req", id, method, params }` | Same | OK |
| Response format | `{ type: "res", id, ok, payload/error }` | Same | OK |
| Events | `{ type: "event", event, payload, seq }` | Same + `stateVersion` field | OK — `stateVersion` ignored |
| Connect handshake | Sends `connect` with protocol/client/role/scopes/auth | Same — verified against spec | OK |
| Auth methods | Token, password, device pairing | Token, password, trusted-token (HMAC JWT), device pairing, Tailscale whois, loopback | Partial — missing Tailscale/loopback |
| Role | `"operator"` | `"operator"` | OK |
| Scopes | `["operator.admin", "operator.approvals"]` | Multiple scopes available | OK |
| Gap detection | `seq` field tracked, `onGap` callback | Same | OK |

## Domain-by-Domain Comparison

### ACL (Access Control)
| Method | Console Uses | Nex Has | Notes |
|--------|-------------|---------|-------|
| `acl.requests.list` | Yes | Yes | |
| `acl.requests.approve` | Yes | Yes | |
| `acl.requests.deny` | Yes | Yes | |
| `acl.policies.list` | Yes | Yes | |
| `acl.policies.create` | No | Yes | Not exposed in UI |
| `acl.policies.update` | No | Yes | Not exposed in UI |
| `acl.policies.delete` | No | Yes | Not exposed in UI |

### Adapters / Integrations
| Method | Console Uses | Nex Has | Notes |
|--------|-------------|---------|-------|
| `adapter.connections.list` | Yes | Yes | Called in both integrations.ts and channels.ts |
| `adapter.connections.oauth.start` | Yes | Yes | |
| `adapter.connections.custom.start` | Yes | Yes | |
| `adapter.connections.custom.submit` | Yes | Yes | |
| `adapter.connections.custom.status` | Yes | Yes | |
| `adapter.connections.custom.cancel` | Yes | Yes | |
| `adapter.connections.test` | Yes | Yes | |
| `adapter.connections.disconnect` | Yes | Yes | |
| `adapter.connections.oauth.callback` | No | Yes | Usually handled server-side |
| `adapters.list` | No | Yes | List available adapter definitions |
| `adapters.install` | No | Yes | Install new adapter |
| `adapters.uninstall` | No | Yes | Remove adapter |

### Agents
| Method | Console Uses | Nex Has | Notes |
|--------|-------------|---------|-------|
| `agents.list` | Yes | Yes | |
| `agents.conversations.list` | Yes | Yes | |
| `agents.conversations.history` | Yes | Yes | |
| `agents.conversations.send` | Yes | Yes | |
| `agents.conversations.abort` | Yes | Yes | |
| `agents.sessions.list` | Yes | Yes | |
| `agents.sessions.patch` | Yes | Yes | |
| `agents.sessions.archive` | Yes | Yes | |
| `agents.sessions.usage` | Yes | Yes | |
| `agents.sessions.usage.timeseries` | Yes | Yes | |
| `agents.sessions.usage.logs` | Yes | Yes | |
| `agents.files.list` | Yes | Yes | |
| `agents.files.get` | Yes | Yes | |
| `agents.files.set` | Yes | Yes | |
| `agent.identity.get` | Yes | Yes | Note: singular "agent" not "agents" |
| `agents.create` | **No** | **Yes** | **CRITICAL GAP** — v2 wizard needs this |
| `agents.update` | **No** | **Yes** | **CRITICAL GAP** — v2 detail editing needs this |
| `agents.delete` | **No** | **Yes** | **GAP** — v2 needs for agent management |
| `agents.conversations.create` | No | Yes | May be needed for new sessions |

### Apps (Installed Applications)
| Method | Console Uses | Nex Has | Notes |
|--------|-------------|---------|-------|
| `apps.list` | Yes | Yes | |
| `apps.methods` | Yes | Yes | |
| `apps.install` | No | Yes | Needed for app catalog |
| `apps.uninstall` | No | Yes | |

### Auth / Tokens
| Method | Console Uses | Nex Has | Notes |
|--------|-------------|---------|-------|
| `auth.tokens.list` | Yes | Yes | |
| `auth.tokens.create` | Yes | Yes | |
| `auth.tokens.revoke` | Yes | Yes | |
| `auth.tokens.rotate` | Yes | Yes | |
| `auth.device.pair` | No | Yes | Device pairing flow |
| `auth.device.approve` | No | Yes | |

### Channels
| Method | Console Uses | Nex Has | Notes |
|--------|-------------|---------|-------|
| `channels.list` | Yes | Yes | |
| `channels.status` | No | Yes | Per-channel status |
| `channels.configure` | No | Yes | **GAP** — v2 channel setup needs this |
| `channels.enable` | No | Yes | |
| `channels.disable` | No | Yes | |

### Config
| Method | Console Uses | Nex Has | Notes |
|--------|-------------|---------|-------|
| `config.get` | Yes | Yes | |
| `config.set` | Yes | Yes | |
| `config.apply` | Yes | Yes | |
| `config.schema` | Yes | Yes | |

### Contacts / Entities / Groups (Identity)
| Method | Console Uses | Nex Has | Notes |
|--------|-------------|---------|-------|
| `contacts.list` | Yes | Yes | |
| `channels.list` | Yes | Yes | |
| `groups.list` | Yes | Yes | |
| `entities.merge.candidates` | Yes | Yes | |
| `entities.merge.resolve` | Yes | Yes | |
| `entities.list` | No | Yes | Full entity listing |
| `entities.get` | No | Yes | Entity detail |
| `contacts.create` | No | Yes | |
| `contacts.update` | No | Yes | |

### Debug / System
| Method | Console Uses | Nex Has | Notes |
|--------|-------------|---------|-------|
| `status` | Yes | Yes | |
| `health` | Yes | Yes | |
| `models.list` | Yes | Yes | |
| `last-heartbeat` | Yes | Yes | |
| `system-presence` | Yes | Yes | |
| `device.host.list` | Yes | Yes | |

### Jobs / Schedules
| Method | Console Uses | Nex Has | Notes |
|--------|-------------|---------|-------|
| `jobs.list` | Yes | Yes | |
| `jobs.runs.list` | Yes | Yes | |
| `schedules.list` | Yes | Yes | |
| `schedules.create` | Yes | Yes | |
| `schedules.update` | Yes | Yes | |
| `schedules.delete` | Yes | Yes | |
| `schedules.trigger` | Yes | Yes | |
| `jobs.create` | No | Yes | Create job definitions |
| `jobs.runs.get` | No | Yes | Individual run detail |

### Logs
| Method | Console Uses | Nex Has | Notes |
|--------|-------------|---------|-------|
| `logs.tail` | Yes | Yes | |
| `logs.export` | No | Yes | |

### Memory
| Method | Console Uses | Nex Has | Notes |
|--------|-------------|---------|-------|
| `memory.review.runs.list` | Yes | Yes | |
| `memory.review.run.episodes.list` | Yes | Yes | |
| `memory.review.episode.get` | Yes | Yes | |
| `memory.review.episode.outputs.get` | Yes | Yes | |
| `memory.review.quality.summary` | Yes | Yes | |
| `memory.review.quality.items.list` | Yes | Yes | |
| `memory.review.search` | Yes | Yes | |
| `memory.review.entity.get` | Yes | Yes | |
| `memory.review.fact.get` | Yes | Yes | |
| `memory.review.observation.get` | Yes | Yes | |

### Skills
| Method | Console Uses | Nex Has | Notes |
|--------|-------------|---------|-------|
| `skills.status` | Yes | Yes | |
| `skills.update` | Yes | Yes | Used for toggle + API key save |
| `skills.install` | Yes | Yes | |
| `skills.create` | No | Yes | Create custom skills |
| `skills.delete` | No | Yes | |

### Usage / Cost
| Method | Console Uses | Nex Has | Notes |
|--------|-------------|---------|-------|
| `usage.cost` | Yes | Yes | |
| `update.run` | Yes | Yes | Trigger runtime self-update |

## Server-Push Events

| Event | Console Listens | Nex Sends | Notes |
|-------|----------------|-----------|-------|
| `connect.challenge` | Yes | Yes | Device auth nonce |
| `agent` | Yes | Yes | Tool streaming |
| `agent.run` | Yes | Yes | Run state changes |
| `presence` | Yes | Yes | Online users |
| `schedule` | Yes | Yes | Schedule changes |
| `acl.approval.requested` | Yes | Yes | |
| `acl.approval.resolved` | Yes | Yes | |
| `agent.created` | No | Yes | **GAP** — should update agents list |
| `agent.deleted` | No | Yes | **GAP** — should update agents list |
| `adapter.connected` | No | Yes | **GAP** — should update integrations |
| `adapter.disconnected` | No | Yes | **GAP** — should update integrations |
| `config.changed` | No | Yes | **GAP** — should refresh config |
| `health.changed` | No | Yes | **GAP** — should update status |
| `memory.episode.completed` | No | Yes | Could update memory tab |
| `shutdown` | No | Yes | **GAP** — should show disconnect warning |

## Critical Gaps for v2 UI

### 1. Agent CRUD (blocks agent creation wizard)
- `agents.create` — needed when wizard finishes "Create agent"
- `agents.update` — needed for editing agent settings (model, description, guardrails)
- `agents.delete` — needed for "Delete agent" action

### 2. Channel Configuration (blocks channel setup in agent detail)
- `channels.configure` — needed for Telegram/Slack/WhatsApp setup
- `channels.enable` / `channels.disable` — needed for channel toggles

### 3. Webhook Subscriptions (NEW — may not exist in runtime yet)
- `webhooks.list` — list webhook subscriptions
- `webhooks.create` — create new subscription
- `webhooks.update` — update subscription
- `webhooks.delete` — delete subscription
- `webhooks.events.list` — list event history
- **These likely need runtime implementation**

### 4. Missing Event Listeners
The console should subscribe to more events to keep the UI reactive:
- `agent.created` / `agent.deleted` → refresh agents list
- `adapter.connected` / `adapter.disconnected` → refresh integrations
- `config.changed` → refresh config
- `shutdown` → show disconnect warning

### 5. Billing / Profile (NEW — external service)
The Settings pages for Profile, Billing, Invoices are likely backed by an external service (not nex runtime). These may need a separate API client.
