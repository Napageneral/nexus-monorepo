# Gateway RPC Comparison

OpenClaw's gateway RPC system vs Nexus's approach (to be specced).

---

## OpenClaw Gateway RPC

OpenClaw's gateway provides a WebSocket-based RPC interface with 87+ methods for controlling the system.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GATEWAY SERVER                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐ │
│  │  WebSocket      │     │    HTTP          │     │  Event System    │ │
│  │  RPC Server     │     │  Endpoints       │     │  (broadcast)     │ │
│  └────────┬────────┘     └────────┬─────────┘     └────────┬─────────┘ │
│           │                       │                        │           │
│           └───────────────────────┼────────────────────────┘           │
│                                   │                                     │
│                     ┌─────────────▼─────────────┐                      │
│                     │     Method Handlers       │                      │
│                     │     (87+ methods)         │                      │
│                     └─────────────┬─────────────┘                      │
│                                   │                                     │
│  ┌──────────────┬─────────────────┼─────────────────┬──────────────┐   │
│  │              │                 │                 │              │   │
│  ▼              ▼                 ▼                 ▼              ▼   │
│ Config      Channels          Sessions          Nodes          Browser │
│ Manager     Manager           Manager          Registry        Control │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### RPC Methods by Domain

#### Core (5 methods)
| Method | Purpose |
|--------|---------|
| `health` | Gateway health check |
| `status` | Full system status |
| `wake` | Wake gateway from sleep |
| `logs.tail` | Tail gateway logs |
| `system-presence` | System presence info |

#### Config (5 methods)
| Method | Purpose |
|--------|---------|
| `config.get` | Get config value |
| `config.set` | Set config value |
| `config.apply` | Apply config changes |
| `config.patch` | Patch config object |
| `config.schema` | Get config schema |

#### Channels (2 methods)
| Method | Purpose |
|--------|---------|
| `channels.status` | List channel status |
| `channels.logout` | Logout from channel |

#### Sessions (6 methods)
| Method | Purpose |
|--------|---------|
| `sessions.list` | List all sessions |
| `sessions.preview` | Preview session content |
| `sessions.patch` | Update session metadata |
| `sessions.reset` | Reset session |
| `sessions.delete` | Delete session |
| `sessions.compact` | Compact session history |

#### Agents (7 methods)
| Method | Purpose |
|--------|---------|
| `agent` | Send message to agent |
| `agent.identity.get` | Get agent identity |
| `agent.wait` | Wait for agent completion |
| `agents.list` | List available agents |
| `agents.files.list` | List agent files |
| `agents.files.get` | Get agent file content |
| `agents.files.set` | Update agent file |

#### Skills (4 methods)
| Method | Purpose |
|--------|---------|
| `skills.status` | Skill system status |
| `skills.bins` | List skill binaries |
| `skills.install` | Install skill |
| `skills.update` | Update skill |

#### Exec Approvals (6 methods)
| Method | Purpose |
|--------|---------|
| `exec.approvals.get` | Get approval settings |
| `exec.approvals.set` | Set approval settings |
| `exec.approvals.node.get` | Get node approval settings |
| `exec.approvals.node.set` | Set node approval settings |
| `exec.approval.request` | Request approval |
| `exec.approval.resolve` | Resolve approval |

#### Nodes (8 methods)
| Method | Purpose |
|--------|---------|
| `node.list` | List connected nodes |
| `node.describe` | Describe node capabilities |
| `node.invoke` | Invoke command on node |
| `node.invoke.result` | Get invocation result |
| `node.event` | Send event to node |
| `node.rename` | Rename node |
| `node.pair.*` | Node pairing (4 methods) |

#### Devices (5 methods)
| Method | Purpose |
|--------|---------|
| `device.pair.list` | List paired devices |
| `device.pair.approve` | Approve device |
| `device.pair.reject` | Reject device |
| `device.token.rotate` | Rotate device token |
| `device.token.revoke` | Revoke device token |

#### Cron (7 methods)
| Method | Purpose |
|--------|---------|
| `cron.list` | List cron jobs |
| `cron.status` | Cron system status |
| `cron.add` | Add cron job |
| `cron.update` | Update cron job |
| `cron.remove` | Remove cron job |
| `cron.run` | Run cron job now |
| `cron.runs` | List cron run history |

#### Other Domains
- **Models**: `models.list`
- **TTS**: 6 methods for text-to-speech
- **Usage**: `usage.status`, `usage.cost`
- **Browser**: `browser.request`
- **Chat**: `chat.history`, `chat.abort`, `chat.send`
- **Wizard**: 4 methods for onboarding
- **Misc**: `send`, `update.run`, heartbeat methods, voicewake

### Gateway Events (broadcast)

```typescript
const GATEWAY_EVENTS = [
  "connect.challenge",       // Auth challenge
  "agent",                   // Agent activity
  "chat",                    // Chat messages
  "presence",                // Online status
  "tick",                    // Heartbeat
  "talk.mode",               // Voice mode change
  "shutdown",                // Gateway shutting down
  "health",                  // Health update
  "heartbeat",               // Periodic heartbeat
  "cron",                    // Cron job executed
  "node.pair.requested",     // Node wants to pair
  "node.pair.resolved",      // Pairing result
  "node.invoke.request",     // Node command request
  "device.pair.requested",   // Device pairing
  "device.pair.resolved",    // Device pairing result
  "voicewake.changed",       // Wake word changed
  "exec.approval.requested", // Tool needs approval
  "exec.approval.resolved",  // Approval given/denied
];
```

---

## Nexus Approach (TBD)

### What NEX Needs

NEX doesn't have a gateway RPC system specced yet. Key components needed:

#### 1. NEX Daemon WebSocket

A WebSocket server for:
- Client connections (Control UI, CLI, mobile apps)
- Event broadcasting
- RPC method handling

#### 2. RPC Method Subset

Nexus probably doesn't need all 87+ methods. Essential ones:

| Method | Nexus Equivalent | Priority |
|--------|------------------|----------|
| `health` | `nex.health` | High |
| `status` | `nex.status` | High |
| `config.get/set` | `nex.config.*` | High |
| `adapters.status` | New (no equivalent) | High |
| `sessions.list/preview` | `nex.sessions.*` | Medium |
| `agent` | Via adapters | N/A |
| `exec.approval.*` | Via IAM | Medium |

#### 3. Event System

Broadcast events to connected clients:
- `adapter.connected/disconnected`
- `agent.started/completed`
- `approval.requested/resolved`
- `config.changed`
- `shutdown`

### Architectural Difference

**OpenClaw:** Everything in gateway process
```
Gateway Process
  ├── WebSocket server
  ├── All channel monitors
  ├── All RPC handlers
  ├── Browser control
  ├── Node registry
  ├── Cron scheduler
  └── Agent execution
```

**Nexus:** NEX orchestrates separate components
```
NEX Daemon
  ├── WebSocket server (RPC)
  ├── Pipeline orchestrator
  └── Adapter manager
        ├── Adapter processes (separate)
        └── ...
        
Broker (separate)
  └── Agent execution
```

### RPC as Debugging Interface

For Nexus, RPC could primarily serve debugging/admin:

```bash
# Check NEX health
nexus rpc health

# List active adapters
nexus rpc adapters.status

# Preview session
nexus rpc sessions.preview --key "discord/user/123"

# Get config value
nexus rpc config.get "agent.model"
```

This is different from OpenClaw where RPC is the primary control interface.

---

## Mapping OpenClaw → Nexus

| OpenClaw Domain | Nexus Approach |
|-----------------|----------------|
| `channels.*` | Adapter-based (separate processes) |
| `sessions.*` | Ledger queries + session management |
| `agent.*` | Broker interface |
| `config.*` | YAML config + hot reload |
| `exec.approval.*` | IAM approval queue |
| `cron.*` | Automations (declarative) |
| `node.*` | Node adapter (TBD) |
| `browser.*` | Browser subsystem (TBD) |

---

## What to Port

### Essential Methods

| Method | Why |
|--------|-----|
| `health` | Doctor, monitoring, health checks |
| `status` | System overview for debugging |
| `config.get/set` | Runtime configuration |
| `sessions.list/preview` | Session inspection |
| `send` | Convenience wrapper for adapter sends |

### Skip for Now

| Method | Why Skip |
|--------|----------|
| `cron.*` | Replaced by automations |
| `wizard.*` | Different onboarding approach |
| `tts.*` | Skill-based capability |
| `voicewake.*` | Not in scope |
| Channel-specific | Per-adapter responsibility |

### Defer Decision

| Method | Reason |
|--------|--------|
| `node.*` | Depends on node system design |
| `browser.*` | Depends on browser subsystem design |
| `models.*` | Depends on model catalog design |

---

## Security Considerations

From OpenClaw v2026.2.1 release:
- "require TLS 1.3 minimum for TLS listeners"
- "secure Chrome extension relay CDP sessions"

Nexus RPC should:
- Require authentication for all RPC calls
- Support TLS for non-loopback connections
- Rate limit RPC methods
- Audit log admin operations

---

*NEX daemon and RPC interface need dedicated spec work. This document captures OpenClaw patterns for reference.*
