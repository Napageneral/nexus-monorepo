# Nexus Services Architecture

This document catalogs all services that Nexus needs to manage, their responsibilities, and how they should be kept running.

## Overview

Nexus is a multi-service system. The CLI should be responsible for orchestrating these services, ensuring they're running, and providing status/health information.

```
┌─────────────────────────────────────────────────────────────┐
│                      nexus CLI                               │
│  (orchestrates all services, provides status, health, etc.)  │
└─────────────────────────────────────────────────────────────┘
         │
         ├──► Gateway (local WebSocket server)
         │      └── Messaging providers (Discord, WhatsApp, Telegram, etc.)
         │      └── Agent execution (Pi embedded runner)
         │      └── Canvas host, Bridge, Browser control
         │
         ├──► Nexus Cloud (encrypted sync)
         │
         ├──► Nexus Hub (skills updates, registry)
         │
         └──► Nexus Collab (real-time collaboration)
```

---

## Service Catalog

### 1. Gateway (Core - Local)

**Purpose:** The main local service that handles all messaging, agent execution, and API endpoints.

| Property | Value |
|----------|-------|
| Binary | `nexus gateway-daemon` |
| Default Port | 18789 (WebSocket) |
| Management | launchd (macOS), systemd (Linux) |
| Config | `gateway.mode`, `gateway.port`, `gateway.bind` |
| Logs | `~/nexus/state/logs/gateway.log` |

**Sub-components:**
- **Messaging Providers:** Discord, WhatsApp, Telegram, Slack, Signal, iMessage
- **Agent Runner:** Pi embedded agent for processing messages
- **Canvas Host:** Port 18793 for UI rendering
- **Bridge:** Port 18790 for cross-process communication
- **Browser Control:** Port 18791 for browser automation
- **Heartbeat:** Periodic health checks and proactive actions
- **Cron Service:** Scheduled tasks
- **Skills Scanner:** Watches for skill changes

**Status:** ✅ Implemented, managed via launchd/systemd

---

### 2. Nexus Cloud (Sync)

**Purpose:** Encrypted backup and sync of `~/nexus/home/` directory to cloud storage.

| Property | Value |
|----------|-------|
| Binary | `nexus cloud` (Rust) |
| Protocol | E2E encrypted, keys stay local |
| Config | `nexus credential get nexus-cloud/default` |
| Sync Scope | `~/nexus/home/` minus `.nexusignore` patterns |

**Status:** ⭐ Ready but needs integration into service management

**TODO:**
- [ ] Add to launchd/systemd as a persistent watcher
- [ ] Auto-start sync daemon on `nexus init`
- [ ] Add `nexus cloud status` to show sync state

---

### 3. Nexus Hub (Skills Registry)

**Purpose:** Central registry for discovering, installing, and updating skills.

| Property | Value |
|----------|-------|
| Endpoint | TBD (likely hub.nexus.dev or similar) |
| Client | `nexus skills` commands |
| Local Cache | `~/nexus/state/skills/` |

**Status:** 🔧 In development (see `010-skills-hub.md`)

**TODO:**
- [ ] Define hub API
- [ ] Implement skill discovery (`nexus skills search`)
- [ ] Implement skill updates (`nexus skills update`)
- [ ] Background watcher for update notifications

---

### 4. Nexus Collab (Real-time Collaboration)

**Purpose:** Real-time sync for collaborative editing sessions.

| Property | Value |
|----------|-------|
| Repository | `nexus-collab` |
| Protocol | CRDT-based sync |
| Use Case | Multiple agents/users editing same workspace |

**Status:** 📥 Planned

**TODO:**
- [ ] Define collab protocol
- [ ] Integrate with gateway
- [ ] Add presence indicators

---

## Service Management Requirements

### Current State (Problems)

1. **Gateway only service managed** - Only the gateway has launchd/systemd integration
2. **Credentials not portable** - Env var pointers don't work for daemons
3. **No unified health check** - `nexus status` shows capabilities, not service health
4. **Manual restarts required** - After sleep/wake, services may not recover properly

### Desired State

1. **Single command to start all services:** `nexus up` or `nexus services start`
2. **Unified status:** `nexus services status` shows all service health
3. **Automatic recovery:** Services restart automatically after crashes/sleep
4. **Credential resolution:** Daemons can access credentials (keychain, env loading, etc.)

---

## Implementation Plan

### Phase 1: Service Health Dashboard
- [ ] Add `nexus services` command
- [ ] `nexus services status` - show all service states
- [ ] `nexus services logs <service>` - tail service logs

### Phase 2: Unified Service Management
- [ ] `nexus services start [service]` - start all or specific service
- [ ] `nexus services stop [service]` - stop all or specific service
- [ ] `nexus services restart [service]` - restart all or specific service

### Phase 3: Credential Portability
- [ ] Option to store credentials in keychain instead of env pointers
- [ ] Automatic shell env loading for daemons (`NEXUS_LOAD_SHELL_ENV`)
- [ ] 1Password integration for secrets

### Phase 4: Cloud Services Integration
- [ ] Nexus Cloud daemon management
- [ ] Nexus Hub background sync
- [ ] Nexus Collab connection management

---

## Environment Variables for Services

Services need these env vars to function properly:

```bash
# Required for all services
NEXUS_ROOT=~/nexus
NEXUS_AGENT_ID=echo  # or auto-detect single agent

# For shell env loading (loads API keys from user's shell profile)
NEXUS_LOAD_SHELL_ENV=1
SHELL=/bin/zsh
HOME=/Users/tyler

# Provider tokens (loaded via shell env or stored in keychain)
ANTHROPIC_API_KEY=sk-...
DISCORD_BOT_TOKEN=MTQ...
# etc.
```

---

## Known Issues

### Credential Resolution for Daemons

**Problem:** Credentials stored as env var pointers don't work for launchd daemons because they don't inherit the user's shell environment.

**Current Workaround:** 
- Add `NEXUS_LOAD_SHELL_ENV=1`, `SHELL=/bin/zsh`, `HOME=/Users/tyler` to plist
- Gateway loads env vars from shell at startup

**Better Solution (TODO):**
- Store credentials in macOS Keychain or 1Password
- Gateway reads from secure storage instead of env vars

### Service Recovery After Sleep

**Problem:** When laptop sleeps and wakes, services may not recover gracefully (websocket disconnects, stale state).

**Solution (TODO):**
- Implement reconnect logic with exponential backoff
- Add health checks that detect and recover from stale states
- Use launchd's `KeepAlive` with proper crash detection

---

*Last updated: 2026-01-19*
