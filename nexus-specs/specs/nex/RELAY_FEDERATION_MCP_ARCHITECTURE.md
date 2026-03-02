# Relay, Federation & MCP Communication Architecture

> **Status**: Draft — session capture from 2026-02-27 design discussion
> **Context**: Analysis of [AgentWorkforce/relay](https://github.com/AgentWorkforce/relay) and how its patterns apply to Nex-to-Nex communication, MCP adoption, and the frontdoor relay broker.

---

## 1. The Core Insight

Nex has sophisticated agent communication *within* a single runtime (broker, session queue, Meeseeks pattern, bus). What's missing is a **federation layer** — how Nex runtimes communicate with each other, and how external agents participate in the Nex ecosystem without running Nex themselves.

Agent Relay solves a narrower version of this (coordinating CLI agents via PTY + WebSocket). The patterns are portable. The infrastructure is not — Nex federation requires identity-aware, privacy-bounded, memory-sharing communication that Relay doesn't need.

---

## 2. Architecture: Frontdoor as Relay Broker

The Nex frontdoor server (already the central admin hub) becomes the relay broker for Nex-to-Nex communication.

```
                    ┌──────────────────────────────────────────────┐
                    │              NEX FRONTDOOR                    │
                    │                                              │
                    │  ┌──────────────┐  ┌───────┐  ┌──────────┐ │
                    │  │ Relay Broker  │  │ Spike │  │ GlowBot  │ │
                    │  │ (WebSocket)   │  │  API  │  │   API    │ │
                    │  └──────┬────────┘  └───┬───┘  └────┬─────┘ │
                    │         │               │           │        │
                    │  ┌──────┴───────────────┴───────────┴──────┐ │
                    │  │         Central Identity / IAM           │ │
                    │  │  (Nex runtimes as entities, ACL, routing)│ │
                    │  └─────────────────────────────────────────┘ │
                    │                                              │
                    │  ┌─────────────────────────────────────────┐ │
                    │  │           MCP Server Endpoint            │ │
                    │  │  nex_send / nex_inbox / nex_who          │ │
                    │  │  spike_ask / glowbot_config              │ │
                    │  │  nex_provision / nex_status              │ │
                    │  └─────────────────────────────────────────┘ │
                    └───────────┬──────────────────┬───────────────┘
                                │ WebSocket         │ WebSocket
                       ┌────────┴───────┐   ┌──────┴─────────┐
                       │  Tyler's Nex   │   │  Casey's Nex   │
                       │  (nex-peer     │   │  (nex-peer     │
                       │   adapter)     │   │   adapter)     │
                       └────────────────┘   └────────────────┘
```

### Nex Runtime as Entity

Each Nex runtime gets an entity in the frontdoor's identity graph:

- **entity_type**: `nex-runtime`
- **entity_id**: unique runtime identifier (ULID)
- **identities**: [websocket connection, API key, owner entity reference]
- **permissions**: what it can access, who it can talk to, what data it shares
- **metadata**: capabilities, installed adapters, active agents, product installs (Spike, GlowBot, etc.)

### Relay Broker Responsibilities

- **Registration**: Nex runtime connects, authenticates with API key, registers presence
- **Routing**: Messages between runtimes, IAM checks at the boundary
- **Privacy enforcement**: Each Nex's IAM decides what crosses the wire *before* the message leaves
- **Message deduplication**: Content-hash + TTL cache (60s window, 1000 entries)
- **Delivery acknowledgment**: Broker confirms delivery to receiving Nex
- **Offline message store**: Messages for disconnected runtimes persisted until reconnection
- **Presence**: "who's online" for discovery and coordination

### Privacy & Boundaries

When Tyler's Nex talks to Casey's Nex:
- Each side's IAM layer filters what crosses the boundary
- Shared operational understanding of capabilities (published via entity metadata)
- Private information stays private unless explicitly shared
- Merge depth is configurable (share everything ↔ share nothing)
- Communication channel is just another adapter: `nex-peer`

---

## 3. MCP Zero-Modification Integration

### How Agent Relay Does It

1. Relay writes `.mcp.json` into project root pointing at `@relaycast/mcp` (npm package)
2. Any MCP-compatible CLI (Claude Code, Codex, Gemini CLI) reads `.mcp.json` on startup
3. CLI spawns `npx -y @relaycast/mcp` as a sidecar child process
4. MCP server connects to cloud WebSocket, exposes tools: `relay_send()`, `relay_inbox()`, `relay_who()`
5. Agent calls these like any other MCP tool — zero modification to agent CLI

### Nex MCP Implementation: `@nexus/mcp`

Build an MCP server package that:
- Connects to the Nex frontdoor (WebSocket) or local Nex runtime (Unix socket / HTTP)
- Exposes tools for external agents to participate in the Nex ecosystem
- Enables any MCP-compatible CLI to become a "light client" to a Nex "full node"

#### MCP Tools to Expose

**Communication:**
- `nex_send(to, message, opts?)` — Send message through the Nex pipeline
- `nex_inbox(since?)` — Check for messages directed at this agent
- `nex_who()` — List online Nex runtimes / agents

**Memory (read-only for external agents):**
- `nex_memory_query(query, scope?)` — Semantic search against memory system
- `nex_recall(entity, topic?)` — Recall elements about an entity

**Products:**
- `spike_ask(repo, question)` — Query a Spike instance
- `glowbot_config(...)` — Configure GlowBot settings

**Admin/Provisioning:**
- `nex_provision(plan, opts?)` — Provision a new Nex runtime
- `nex_status(runtime_id?)` — Check runtime health/status

#### MCP Config Format

```json
{
  "mcpServers": {
    "nexus": {
      "command": "npx",
      "args": ["-y", "@nexus/mcp"],
      "env": {
        "NEX_RELAY_URL": "wss://frontdoor.yourdomain.com/relay",
        "NEX_API_KEY": "nex_key_...",
        "NEX_AGENT_NAME": "claude-code-tyler"
      }
    }
  }
}
```

### Adoption Impact

- Users can participate in Nex without leaving their CLI of choice
- External agents can query memory, send messages, interact with Spike/GlowBot
- Dramatically lowers adoption barrier — drop in a config file and go
- Works with Claude Code, Codex, Gemini CLI, any MCP-compatible tool

---

## 4. Agent-Enabled Commerce Flow

The MCP interface enables fully agentic purchasing and provisioning:

```
External Agent (any MCP-compatible CLI)
  │
  ├── nex_hub_browse({ product: "spike" })  → pricing, features, setup info
  ├── nex_hub_purchase({ product: "spike", plan: "pro" })  → Stripe checkout
  ├── nex_hub_provision({ product: "spike" })
  │   └── Provisions: Nex runtime + Spike install
  │       ├── Auto-assigns phone number (from Twilio pool)
  │       ├── Auto-assigns email (custom domain routing)
  │       └── Returns: API key, MCP config, endpoints
  ├── spike_configure({ repo: "owner/repo", ... })  → GitHub integration
  └── spike_ask({ question: "How does auth work?" })  → First query, fully operational
```

### Identity Primitives — Bundled Provisioning

On Nex runtime creation, optionally auto-provision:

| Primitive | Provider | Cost/month | Notes |
|-----------|----------|------------|-------|
| Phone number | Twilio (pool) | ~$1.15 | Pre-purchase pool, assign on provision |
| Email | Custom domain routing | ~$0 | `{agent-id}@nex.yourdomain.com` via Mailgun/SendGrid |
| Crypto wallet | ethers.js | $0 | `Wallet.createRandom()`, store keys securely |
| Virtual card | Stripe Issuing (optional) | ~$0.10 creation | For agent purchasing with spending controls |

**Total infrastructure cost: ~$1-3/month per runtime** — excellent margin on paid plans.

**Alternative providers to evaluate:**
- Phone: Telnyx (~$0.40/mo, cheaper at scale), Plivo, Bandwidth
- Email: AgentMail (purpose-built for agents), SendGrid, Postmark
- Banking: Stripe Treasury, Unit.co, Moov (if full banking needed later)

---

## 5. Delivery Acknowledgment Protocol

### Within a Single Nex Runtime (Broker-Level)

Add delivery states to the message lifecycle:

```
sent → delivered → processing → responded | failed
```

- **sent**: Message entered session queue
- **delivered**: Session queue picked it up for a turn
- **processing**: Agent actively executing with this message in context
- **responded**: Agent produced a response
- **failed**: Timeout, circuit breaker, or error

Implementation: Add `delivery_status` column to agents ledger messages table. Update at each state transition. Emit bus events (`Event.Message.Delivered`, `Event.Message.Processing`, etc.) for subscribers.

### Between Nex Runtimes (Federation-Level)

Ack semantics in the nex-peer adapter protocol:

```
Tyler's Nex sends message
  → Frontdoor broker receives     → ack: "relayed"
  → Casey's nex-peer receives     → ack: "delivered"
  → Casey's pipeline processes    → ack: "processing"
  → Casey's agent responds        → ack: "responded" + response (ACL-filtered)
  → Tyler's Nex receives response → done
```

Each ack flows back through the WebSocket connection. The originating Nex can subscribe to delivery status updates for any outbound message.

---

## 6. Message Deduplication

### When It Matters

- Cross-Nex communication (WebSocket reconnections, adapter retries, network partitions)
- MCP connections from external CLIs (tool call retries)
- Webhook adapters with retry policies

### Implementation

Content-hash + TTL cache at the `receiveEvent` stage:

```
hash = sha256(sender_id + content + timestamp_bucket)
if dedup_cache.has(hash): drop
else: dedup_cache.set(hash, ttl=60s, max_entries=1000)
```

Place in the relay broker for cross-Nex dedup, and optionally at the adapter ingestion boundary for single-Nex dedup.

---

## 7. Priority Levels

Add P0-P4 priority to the session queue. Not bounded/overflow (we don't want to drop messages), just ordering.

| Priority | Use Case |
|----------|----------|
| P0 | Owner direct messages, emergency steers |
| P1 | Interactive messages from known entities |
| P2 | Meeseeks reports, inter-agent communication |
| P3 | Background automations, memory hooks |
| P4 | Telemetry, logging, low-priority notifications |

When multiple messages are queued for the same session, process in priority order within each queue mode.

---

## 8. Restart & Recovery Policies

### Requirements (Must-Have)

- **429 / rate-limit backoff**: Exponential with jitter, respect `Retry-After` headers
- **Stream resume**: If a streaming agent turn gets interrupted (network blip, API timeout), resume from last token rather than re-running entire turn
- **Adapter restart policies**: Per-adapter configurable limits (max restarts, cooldown period, consecutive failure limits)
- **Worker crash recovery**: Meeseeks workers should auto-restart with context recovery on crash
- **Circuit breaker**: Already implemented (5 consecutive errors → open for 5 minutes → half-open probe). Extend to all retry scenarios.

### Configuration

```typescript
interface RestartPolicy {
  max_restarts: number;        // Max restart attempts before giving up
  cooldown_ms: number;         // Wait between restarts (with backoff)
  max_consecutive_failures: number;  // Consecutive failures before circuit opens
  backoff_strategy: 'linear' | 'exponential' | 'jitter';
  respect_retry_after: boolean; // Honor 429 Retry-After headers
}
```

---

## 9. PTY Mode for Workers

### Why PTY?

- **Context efficiency**: Agent offloads state to the shell environment, only recent output in context
- **Long-running tasks**: Hours of autonomous work without context overflow
- **Universal tool access**: Any CLI tool works without integration
- **Observability**: Watch/attach to terminal sessions in real time
- **Recovery**: Sessions survive process crashes (tmux/screen pattern)

### Hybrid Approach

Don't replace in-process execution. Layer PTY on top:

```
Manager Agent (in-process, broker-managed)
  ├── Memory Reader Meeseeks (in-process, fast, sub-millisecond)
  ├── Coding Worker (PTY-wrapped, context-efficient, long-running)
  └── Research Worker (PTY-wrapped, runs many commands autonomously)
```

The broker spawns the PTY, manages lifecycle, injects messages via queue modes, reads results back. Context efficiency of PTY execution + orchestration power of the broker.

### Implementation

The `automations` table already has `workspace_dir`. PTY-mode automation means:
- Instead of `startBrokerExecution()` → in-process API call
- `startPtyExecution()` → spawn PTY in workspace, communicate via stdin/stdout
- Idle detection for message injection (adopt Relay's edge-triggered pattern)
- Echo verification for delivery confirmation

---

## 10. Shadow Agent Pattern

### Concept

A shadow agent passively observes all messages to/from a primary agent in real-time during execution, with optional intervention capability.

### Difference from Meeseeks

| Aspect | Meeseeks | Shadow Agent |
|--------|----------|--------------|
| Timing | Pre-execution enrichment | During-execution observation |
| Relationship | Independent subtask | Mirrors primary's message stream |
| Intervention | Returns enrichment before primary starts | Can steer primary mid-execution |
| Awareness | Primary doesn't know meeseeks exists | Primary doesn't know shadow exists |
| Duration | Short-lived (task-scoped) | Lives as long as primary's execution |

### Implementation in Nex

New hook point: `worker:during_execution` — fires on each tool call, message, or streaming chunk.

Shadow automation config:
```typescript
{
  name: "security-shadow",
  hook_point: "worker:during_execution",
  blocking: false,  // Observe async
  shadow_config: {
    receive_incoming: true,   // See messages TO primary
    receive_outgoing: true,   // See messages FROM primary
    receive_tool_calls: true, // See tool invocations
    can_steer: true,          // Allowed to steer the primary
    speak_on: ["conviction"], // Only intervene when confident
  }
}
```

### Use Cases

1. **Spec → Implementation Review**: Shadow watches implementation, steers if it diverges from spec
2. **Security Audit**: Shadow watches file edits for injection, hardcoded secrets, auth bypasses
3. **Documentation**: Shadow watches and produces summary of what was done and why, writes to memory
4. **Cost/Performance Monitor**: Shadow watches for context waste, loops, unproductive patterns
5. **Second Opinion**: Shadow was told "you would have chosen approach B — intervene if A is failing"

---

## 11. Declarative Workflow DAGs

> **TODO**: Discuss in detail in follow-up session. Initial sketch below.

### Problem

Meeseeks chains (retain → consolidate → self-improve) work but are implicit in code. Can't track the workflow as a unit, can't see it at a glance, adding steps means modifying TypeScript.

### Vision

Declarative YAML/JSON workflow definitions that the broker executes:

```yaml
workflow: memory-retention-pipeline
trigger: episode.completed
steps:
  - name: retain
    automation: memory-writer
    hook_point: episode-created
    blocking: true
    on_failure: abort

  - name: consolidate
    automation: memory-consolidator
    hook_point: episode-retained
    depends_on: retain
    blocking: true
    on_failure: retry(2)
    blocking: false
```

### Tracking

- `workflow_execution_id` groups individual automation invocations
- States: `running`, `step_failed`, `completed`, `partially_completed`
- Bus events: `Event.Workflow.StepCompleted`, `Event.Workflow.Failed`
- Supports: sequential, parallel, DAG (depends_on), conditional branching, pause/resume

---

## 12. Agent Visibility Layer — "Slack for Agents" via Discord

### The Idea

Agents need a shared communication space — not just DMs through the broker, but channels, threads, presence, and pub/sub semantics where agents can broadcast, coordinate, and let humans observe.

This is Discord. Not "like Discord" — it IS the Discord model: servers, channels, threads, roles, mentions, presence. The difference is that agents are first-class participants, messages carry structured NexusEvent payloads alongside human-readable text, and your IAM layer enforces privacy at the entity level.

### Discord as Visibility Layer, Not Transport Layer

Use Discord as the **window into the system**, not the system itself:

```
Agent A sends message via broker
  → Broker routes to Agent B (real transport — fast, structured, reliable)
  → Broker ALSO mirrors to #agents channel in Discord (human visibility)
  → User watches agent coordination in real-time
  → User types in Discord → Discord adapter → Nex pipeline → agent receives it
```

If Discord goes down or rate-limits, agents keep working. Discord is an adapter, not the infrastructure.

### Discord Developer App for One-Click Onboarding

Create a single Discord application (developer portal). Users authorize via OAuth2 — one click "Add NexBot to Server":

- Your app joins their server (or creates one)
- You control the bot — users don't create or manage their own
- Auto-create channels: `#general`, `#agents`, `#memory`, `#alerts`, `#workflows`
- Nex runtime connects via existing Discord adapter
- Agents start posting in channels immediately

**What Discord gives for free:** mobile app, desktop app, push notifications, voice channels (TTS/STT potential), file sharing, embeds, reactions, the entire community infrastructure.

**What you build:** one Discord application, channel templates that auto-provision, message mirroring from broker to Discord, slash commands that route through Nex pipeline.

### Channel Structure (Auto-Provisioned)

```
NexBot Server (per user)
├── #general          — Human + agent general discussion
├── #agents           — Inter-agent coordination (mirrored from broker)
├── #memory           — Memory system activity (new facts, observations)
├── #alerts           — Circuit breaker trips, errors, budget warnings
├── #workflows        — Workflow DAG progress and status
└── Per-agent channels
    ├── #spike-{repo}  — Spike activity per repo
    └── #glowbot       — GlowBot activity
```

### Frontdoor-Level Federation

The same pattern works at the frontdoor level:

```
Frontdoor Discord Server
├── #federation       — Cross-Nex runtime communication (mirrored)
├── #spike-global     — All Spike instances across all runtimes
├── #glowbot-global   — All GlowBot instances
└── Per-runtime channels
    ├── #tyler-nex    — Tyler's runtime activity
    └── #casey-nex    — Casey's runtime activity
```

Humans and agents from different Nex runtimes can participate in shared spaces. Privacy boundaries still enforced by IAM — the Discord mirror only shows what the entity's permissions allow.

### The Full Agent Identity Bundle

On Nex runtime provisioning, the agent gets everything in one onboarding flow:

| Primitive | Provider | Cost/mo | Onboarding |
|-----------|----------|---------|------------|
| Phone | Twilio pool | ~$1.15 | Auto-assigned |
| Email | Custom domain routing | ~$0 | Auto-assigned |
| Discord | Developer app OAuth | $0 | One-click "Add to Server" |
| Wallet | ethers.js auto-gen | $0 | Auto-created |
| Card | Stripe Issuing (opt) | ~$0.10 | On-demand |

User signs up, clicks one OAuth button, and their agent has a phone number, email, Discord presence, and optionally a wallet. Fully operational in under a minute.

---

## 13. TODO / Follow-Up Items

### Immediate (Small, High-Value)
- [ ] Add delivery acknowledgment states to broker session queue and agents ledger
- [ ] Add message deduplication at adapter ingestion boundary
- [ ] Define priority levels (P0-P4) for session queue ordering

### Near-Term (Build)
- [ ] Design `nex-peer` adapter protocol for Nex-to-Nex communication
- [ ] Build relay broker as app on frontdoor server (WebSocket + message store + presence)
- [ ] Build `@nexus/mcp` package for external agent integration
- [ ] Implement restart policies (429 backoff, stream resume, adapter restart limits)
- [ ] Define and review APIs for frontdoor control, GlowBot, and Spike

### Medium-Term (Design)
- [ ] Spec out declarative workflow DAG system (follow-up discussion)
- [ ] Design shadow agent hook point (`worker:during_execution`) and config
- [ ] Design PTY mode for worker automations (hybrid in-process + PTY)
- [ ] Evaluate identity primitive provisioning (Twilio pool, email routing, crypto wallets)
- [ ] Design agent-enabled commerce flow (MCP purchase → provision → configure)

### Long-Term (Vision)
- [ ] Federation protocol spec (Nex-to-Nex with full IAM, memory sharing, privacy boundaries)
- [ ] Phone number pooling and assignment via Twilio/Telnyx
- [ ] Custom domain email routing for auto-provisioned agent email
- [ ] Virtual card/wallet provisioning for agent purchasing
- [ ] Shadow agent pattern as first-class automation type
- [ ] Discord developer app for one-click agent visibility layer
- [ ] Agent identity bundle: phone + email + Discord + wallet auto-provisioning
- [ ] Frontdoor-level Discord federation server for cross-Nex visibility

---

## References

- [AgentWorkforce/relay](https://github.com/AgentWorkforce/relay) — Multi-agent coordination via PTY + MCP + WebSocket
- Relaycast pricing: Free tier (2 workspaces, 3 agents), Pro $29/mo, Team $99/mo
- Relay toolkit: Apache-2.0 open source; Relaycast cloud service is proprietary
- Existing Nex specs: `BUS_ARCHITECTURE.md`, `MEESEEKS_PATTERN.md`, `RUNTIME_ROUTING.md`, `NEXUS_REQUEST.md`
