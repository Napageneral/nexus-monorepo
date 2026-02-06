# Spec TODOs

Tracking areas that need deep dives after the spec hierarchy is cleaned up.

---

## Recent Decisions (2026-02-06)

Captured during full spec cohesion review:

| Decision | Details |
|----------|---------|
| **Streaming consolidated** | Single spec at `runtime/STREAMING.md`. Broker and NEX streaming docs now redirect there. |
| **DATA_MODEL.md → Ontology** | Refactored to conceptual reference. Implementation lives in `AGENTS_LEDGER.md`. |
| **5 conceptual → 3 physical layers** | Context Assembly now documents both the 5-layer conceptual model AND the 3-layer physical model for LLM caching. |
| **Hooks > Automations** | Hooks are the general mechanism. Automations are the primary hook type at `runAutomations`. Both docs updated. |
| **Stage 4 renamed** | `executeTriggers` → `runAutomations` across all non-upstream docs. |
| **8 stages confirmed** | Keeping `runAgent` and `deliverResponse` as separate stages for clarity. |
| **Language: TS primary, Go for Cortex** | TypeScript for core (NEX, Broker, CLI, tools). Go for Cortex. See `project-structure/LANGUAGE_DECISION.md`. |
| **NexusRequest lifecycle** | Full 8-stage lifecycle, typed schema per stage, NexusRequest↔AssembledContext mappings, Nexus Ledger schema. |
| **Sandbox not V1** | Agent execution isolation deferred to later phase. |
| **Adapter System is canonical** | `ADAPTER_SYSTEM.md` is the source of truth for adapter operations. Other adapter docs align with it. |

---

## Sprint Progress (2026-02-06)

| # | TODO | Location | Status |
|---|------|----------|--------|
| 1 | ~~**Context Assembly**~~ | `broker/CONTEXT_ASSEMBLY.md` | ✅ Done |
| 2 | ~~**Streaming**~~ | `runtime/STREAMING.md` (consolidated) | ✅ Done |
| 3 | **Broker Interfaces** | `broker/INTERFACES.md` | ⏳ Pending |
| 4 | ~~**Adapter Interfaces**~~ | `adapters/ADAPTER_INTERFACES.md` | ✅ Done |
| 5 | ~~**Adapter State + Lifecycle**~~ | `adapters/ADAPTER_SYSTEM.md` | ✅ Done |
| 6 | ~~**Agent Engine**~~ | `broker/AGENT_ENGINE.md` | ✅ Done |
| 7 | ~~**Data Model Ontology**~~ | `broker/DATA_MODEL.md` | ✅ Done |
| 8 | ~~**Spec Cohesion Review**~~ | All non-upstream docs | ✅ Done |

---

## Broker Domain

| TODO | Location | Priority | Notes |
|------|----------|----------|-------|
| ~~**Interfaces**~~ | `broker/INTERFACES.md` | ~~High~~ | ✅ Largely covered — NexusRequest→AssembledContext mapping in `nex/NEXUS_REQUEST.md`. AgentResult→Ledger in `broker/AGENT_ENGINE.md`. Cortex query interface still TBD. |
| ~~**Context Assembly**~~ | `broker/CONTEXT_ASSEMBLY.md` | ~~High~~ | ✅ Done — 5 conceptual → 3 physical layers, token budget, overflow |
| ~~**Streaming**~~ | `runtime/STREAMING.md` | ~~Medium~~ | ✅ Done — Consolidated cross-cutting spec |
| ~~**Agent Engine**~~ | `broker/AGENT_ENGINE.md` | ~~High~~ | ✅ Done — pi-coding-agent wrapper, AssembledContext → AgentResult |
| **Session Lifecycle** | `broker/SESSION_LIFECYCLE.md` | High | Compaction triggers, forking rules, session creation/deletion. Referenced by many docs but doesn't exist. Port from upstream patterns. |
| **Queue Management** | `broker/QUEUE_MANAGEMENT.md` | Medium | Port 6 queue modes from upstream. Think about relation to agent ledger session management. |
| **Smart Routing** | `broker/SMART_ROUTING.md` | Low | Cortex-powered routing (v2 feature) |
| **Gateway Bot Bindings** | `environment/foundation/WORKSPACE_SYSTEM.md` | Medium | How gateway agent gets context (not harness-based) |

### Interfaces

Define exact contracts — this is the key remaining broker gap:
- NexusRequest → AssembledContext mapping (how does Broker extract what it needs?)
- AgentResult → NexusRequest.response mapping (how do results decorate back?)
- Broker → Cortex query interface (stub for now, needed for context injection)

### Smart Routing

v2 feature, lower priority:
- Cortex integration for semantic routing
- Confidence thresholds
- A/B testing explicit vs smart routing

---

## NEX Domain

| TODO | Location | Priority | Notes |
|------|----------|----------|-------|
| **NEX Daemon Spec** | `nex/DAEMON.md` | High | Process lifecycle, adapter supervision, health endpoint, signals |
| ~~**NexusRequest Lifecycle**~~ | `nex/NEXUS_REQUEST.md` | ~~High~~ | ✅ Done — 8-stage lifecycle, full schema, NexusRequest→AssembledContext mapping, persistence, Nexus Ledger schema |
| **Interface Alignment** | `nex/INTERFACES.md` | High | OutAdapterSend must reflect external CLI adapter model. BrokerDispatch must show NexusRequest → AssembledContext mapping. |
| **Config Hot-Reload** | `nex/CONFIG_RELOAD.md` | Medium | SIGUSR1 signal to daemon, selective reload |
| **Unified Config Spec** | `environment/CONFIG.md` | Medium | Resolve config.json vs config.yaml inconsistency across docs |
| **Model Catalog** | `broker/MODEL_CATALOG.md` | Medium | Provider/model registry, capability detection |
| **Automation Skill** | `environment/capabilities/skills/guides/automations/` | Medium | Create skill guide for writing automations |
| **LedgerClient Interface** | `nex/automations/` | Medium | Define the LedgerClient API for automation scripts |
| **CortexClient Interface** | `nex/automations/` | Medium | Define the CortexClient API for semantic search |
| ~~**RPC Interface**~~ | ~~`nex/RPC.md`~~ | ~~High~~ | ❌ Dropped for V1 — `nexus` CLI commands + signals sufficient. Minimal admin endpoint in daemon spec if needed. |

### NEX Daemon

The NEX daemon is the core runtime process. It IS NEX — the persistent process that:
- Spawns and supervises adapter monitor/stream processes
- Receives JSONL events from adapters and feeds them into the pipeline
- Manages health checks, restart backoff, adapter lifecycle
- Runs the timer/cron adapter for heartbeats and scheduled events

Needs spec for:
- Process startup sequence (which adapters, what order)
- Signal handling (SIGTERM for shutdown, SIGUSR1 for reload)
- Health endpoint (for doctor system)
- Graceful shutdown (drain active runs, stop adapters)
- `nexus daemon start/stop/status` CLI commands

### NexusRequest Lifecycle

The data bus lifecycle is the central integration point for the entire pipeline:

```
1. receiveEvent   → NexusRequest created (event, delivery)
2. resolveIdentity → principal.identity populated
3. resolveAccess   → permissions, session routing populated
4. runAutomations → hooks/automations context populated
5. assembleContext → Broker extracts from NexusRequest → builds AssembledContext
6. runAgent        → AgentResult decorated back onto NexusRequest.response
7. deliverResponse → delivery_result populated
8. finalize        → pipeline trace populated → full NexusRequest written to Nexus Ledger
```

This lifecycle spec must define:
- Exact NexusRequest schema at each stage
- How Broker maps NexusRequest fields to AssembledContext
- How AgentResult maps back to NexusRequest.response
- When/how the trace gets persisted to Nexus Ledger

### Config Hot-Reload

Watch for config changes and apply:
- File watcher on `config.yaml`
- Diff detection
- Selective reload (some changes require restart)
- Broadcast to connected clients

### Interface Alignment

Three interfaces need updates to reference NexusRequest:
- Interface 5 (BrokerDispatch): Should be `NexusRequest` flow
- Interface 6 (AgentInvoke): Should pull from `NexusRequest.agent`
- Interface 9 (OutAdapterSend): Should use `NexusRequest.delivery`

### Automation Skill

Create a skill in `skills/guides/automations/SKILL.md` that:
- Explains how to write automations
- References `runtime/nex/automations/AUTOMATION_SYSTEM.md`
- Provides quick-start patterns for agents

---

## Environment Domain

| TODO | Location | Priority | Notes |
|------|----------|----------|-------|
| **Credential CLI** | `environment/capabilities/credentials/CREDENTIAL_CLI.md` | Low | Detailed credential CLI spec (if needed beyond COMMANDS.md) |
| **CLI Bindings Implementation** | `interface/cli/COMMANDS.md` | Medium | Implement `nexus bindings` commands |
| **Credential Verification** | `capabilities/credentials/` | Low | Verification protocols for credentials |
| **Graceful Onboarding Degradation** | `foundation/BOOTSTRAP_ONBOARDING.md` | Low | Handle partial capability states |

---

## Cortex / Mnemonic

| TODO | Location | Priority | Notes |
|------|----------|----------|-------|
| **Port Mnemonic → Cortex** | `data/cortex/` | Medium | Rename and integrate existing Go implementation |
| **Cortex Context Injection** | `broker/CONTEXT_ASSEMBLY.md` | Medium | Auto-inject relevant memories/context. Upstream uses `memory_search`/`memory_get` tools (agent-initiated). Nexus should do automatic injection based on event content. Deferred — get bones right first, add this later. |
| **Cortex Query Interface** | `broker/INTERFACES.md` | Medium | Define `CortexQuery` / `CortexResult` types for Broker ↔ Cortex communication. Stub for now. |

---

## IAM Domain

| TODO | Location | Priority | Notes |
|------|----------|----------|-------|
| **Detailed Policy Examples** | `iam/examples/` | Low | More comprehensive policy examples |

---

## Upstream Investigations

Deep dives needed into OpenClaw functionality for porting to Nexus.

| TODO | Priority | Notes |
|------|----------|-------|
| **Gateway → NEX Adapter** | High | Investigate how OpenClaw gateway RPC translates to NEX adapter pattern. RPC as debugging interface. |
| **Doctor System** | High | Port OpenClaw's self-healing diagnostics. Health checks, repairs, config validation. |
| **Node Execution** | Medium | Multi-device orchestration — run commands on remote nodes, camera/screen capture. |
| **Browser Automation** | High | Make browser first-class in Nexus runtime, not just a skill. Playwright integration. |
| **Exec Approvals** | Medium | Human-in-the-loop approval queue. Check if IAM specs cover this or needs expansion. |
| **Plugin System Analysis** | Medium | Understand OpenClaw plugin install mechanism. Map to NEX adapter install + hook script install. |
| **Unified Message Send** | Low | Consider `nexus send` wrapper for all adapters. Convenience vs tool portability tradeoff. |

### Gateway → NEX Adapter Investigation

OpenClaw has WebSocket RPC for gateway control. Questions:
- How does this map to NEX's adapter model?
- Should RPC be a first-class adapter type?
- What RPC methods are essential for debugging?

### Doctor Investigation

OpenClaw's doctor does:
- Config validation and repair
- Service health checks
- Token generation
- System service scanning
- Automated fixes

Need to spec equivalent for NEX.

### Browser Automation Investigation (Major)

**This is a significant subsystem requiring full redesign review before porting.**

OpenClaw browser system includes:
- Three targets: host, sandbox (Docker), node (remote)
- CDP (Chrome DevTools Protocol) abstraction
- Per-session isolated Docker containers
- 16 tool actions (navigate, snapshot, screenshot, act, etc.)
- 11 act kinds (click, type, press, hover, drag, fill, etc.)
- Browser profiles for work/personal separation
- VNC debugging for visual inspection
- Node proxy for remote browser control

Questions for Nexus:
- Should browser be a first-class runtime subsystem or an adapter?
- How does browser state persist across sessions?
- What's the isolation model? (Docker required? Or host OK?)
- How do sandbox containers get managed/cleaned up?
- Integration with agent tools vs CLI access?
- Security: How to prevent malicious navigation/scraping?

**Recommendation:** Spin up focused agent session to review OpenClaw browser in depth before speccing Nexus equivalent.

### Plugin System Analysis

OpenClaw supports:
- `openclaw plugins install <path-or-npm>`
- Local, archive, npm sources
- Plugin enable/disable
- Plugin-contributed tools, hooks, channels, providers

For Nexus, this could split into:
- Adapter installation (new channel adapters)
- Hook script installation (automation scripts)
- Skill installation (already covered by hub)

---

## Adapters Domain

| TODO | Priority | Notes |
|------|----------|-------|
| ~~**Adapter Interface Spec**~~ | ~~High~~ | ✅ `adapters/ADAPTER_SYSTEM.md` — CLI protocol, registration, commands |
| ~~**Adapter State Management**~~ | ~~High~~ | ✅ `adapters/ADAPTER_SYSTEM.md` — Config (desired) + DB (runtime) split |
| ~~**Adapter Lifecycle**~~ | ~~High~~ | ✅ `adapters/ADAPTER_SYSTEM.md` — Start, stop, health, restart with backoff |
| ~~**Inbound Event Contract**~~ | ~~High~~ | ✅ `adapters/INBOUND_INTERFACE.md` — NexusEvent JSONL schema |
| ~~**Outbound Send Contract**~~ | ~~High~~ | ✅ `adapters/OUTBOUND_INTERFACE.md` + `ADAPTER_SYSTEM.md` — CLI send, formatting, delivery |
| ~~**Adapter Registry**~~ | ~~Medium~~ | ✅ `adapters/ADAPTER_SYSTEM.md` — Registration, account discovery from credentials |
| ~~**Adapter Visibility**~~ | ~~Medium~~ | ✅ `adapters/ADAPTER_SYSTEM.md` — Health monitoring, process supervision, DB state |
| ~~**Channel Porting Guide**~~ | ~~Medium~~ | ✅ `adapters/ADAPTER_SDK.md` — SDK design, scaffold patterns, embed/wrap/greenfield |
| ~~**Upstream Adapter Compatibility Review**~~ | ~~Medium~~ | ✅ `adapters/channels/*/UPSTREAM_REVIEW.md` — 9 channels reviewed (iMessage, Gmail, Discord, AIX, WhatsApp, Slack, Twitter, Voice, Calendar) |
| ~~**Adapter SDK Design**~~ | ~~High~~ | ✅ `adapters/ADAPTER_SDK.md` — Go + TS SDKs, shared infrastructure |
| ~~**Go Adapter SDK**~~ | ~~High~~ | ✅ Built: `~/nexus/home/projects/nexus/nexus-adapter-sdk-go/` — compiles, zero deps |
| **Eve Adapter (first adapter)** | **High** | 🔄 Spec complete: `channels/imessage/EVE_ADAPTER_PLAN.md` — ready to implement |
| **TS Adapter SDK** | Medium | Future: `@nexus/adapter-sdk` npm package for Discord, WhatsApp, Slack adapters |

---

## Capabilities Expansion

| TODO | Priority | Notes |
|------|----------|-------|
| **Capabilities Overview** | High | Flesh out `capabilities/CAPABILITIES.md` with full capability→provider mapping |
| **CLI-Exposed Functionality** | High | Ensure all CLI functionality is specced in environment docs |

---

## Security & Infrastructure

| TODO | Location | Priority | Notes |
|------|----------|----------|-------|
| **Adapter Input Validation** | `adapters/SECURITY.md` | Medium | Per-channel input sanitization patterns |
| **Media Fetch Timeouts** | `adapters/SECURITY.md` | Medium | Timeout and size limits for media downloads |
| **Rate Limiting** | `adapters/RATE_LIMITING.md` | Medium | Per-sender, per-channel rate limits |
| **TLS Configuration** | `nex/TLS.md` | Medium | TLS 1.3 minimum for non-loopback |
| **Health Check Exposure** | `nex/DAEMON.md` | Medium | What health endpoint exposes, auth requirements |
| **Audit Logging** | `nex/AUDIT.md` | Medium | What gets logged, format, retention |
| **Sandbox Spec** | `broker/SANDBOX.md` | Low (not V1) | Agent execution isolation model — deferred to later phase |

### Adapter Security

Each adapter should:
- Validate all inbound data before emitting events
- Timeout media fetches (images, files, voice)
- Enforce size limits on downloads
- Rate limit per sender to prevent abuse

### TLS Configuration

NEX daemon should:
- Require TLS 1.3+ for non-loopback connections
- Support custom certificates
- Validate client certificates (optional)

### Audit Logging

What to log:
- All IAM decisions (allow/deny)
- All admin operations (config changes, session deletes)
- All tool executions (especially elevated)
- All adapter connect/disconnect events

### Sandbox Spec (Major Gap)

OpenClaw has Docker-based sandboxing for:
- Browser containers (per-session isolation)
- Code execution (agent tool sandboxing)

Nexus needs to decide:
- Is sandboxing required or optional?
- Docker vs other isolation (Firecracker, gVisor, etc.)?
- Per-session vs shared sandboxes?
- What gets mounted (workspace, read-only vs read-write)?
- How are sandbox containers managed/cleaned up?

---

## Deferred

| TODO | Priority | Notes |
|------|----------|-------|
| **Enterprise/Plugin Review** | Low | Review overlap with Nexus Cloud/Hub (FORK_MAPPING.md) |

---

*This file tracks spec work that needs deeper attention.*
