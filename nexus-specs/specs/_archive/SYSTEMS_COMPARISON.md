# Systems Comparison

**Status:** COMPLETE  
**Last Updated:** 2026-02-03

---

## Overview

Detailed comparison of major systems between OpenClaw and Nexus.

---

## 1. Plugin/Provider System

### OpenClaw: Provider Registration

Providers are LLM-specific plugins:

```typescript
{
  id: "anthropic",
  label: "Anthropic",
  envVars: ["ANTHROPIC_API_KEY"],
  auth: [
    { id: "api-key", kind: "api_key", run: async (ctx) => { ... } }
  ]
}
```

Plugins can also register:
- Tools (agent capabilities)
- Hooks (lifecycle events)
- Channels (new platforms)
- Providers (model backends)

**Limitation:** Provider system is LLM-specific.

### Nexus: Connectors (Generic)

Connectors are skills that explain credential setup for *any* service:

```yaml
# skills/connectors/google-oauth/SKILL.md
---
type: connector
provides:
  - capability: email-read
    provider: gog
  - capability: calendar-read
    provider: gog
credentials:
  - name: google-oauth
    required: true
---
```

**Advantage:** Generic — works for Google, Twitter, Anthropic, anything. Ties directly into the unified credential system.

---

## 2. Credential System

### OpenClaw: Per-Channel, Scattered

- Each channel has its own auth config inline
- Auth provider extensions for OAuth flows
- `auth-profiles.json` for stored credentials
- No central registry or vault
- Resolution: profile → env → config (per-provider)

**Problem:** No unified view. Must configure each channel separately.

### Nexus: Unified Vault

```
state/credentials/
├── google-oauth.yaml     # Pointer to keychain
├── anthropic.yaml        # Env var reference
└── twitter.yaml          # 1Password reference
```

Features:
- `nexus credential list` — see all credentials
- `nexus credential scan` — detect from environment
- `nexus credential verify` — health checks
- `nexus credential flag` — mark broken

**Advantage:** Single view, health monitoring, ties into skill readiness.

---

## 3. Memory System

### OpenClaw: File-Based + QMD

```
MEMORY.md                 # Long-term curated
memory/
└── YYYY-MM-DD.md        # Daily logs (append-only)
```

QMD (opt-in) indexes files for better search:
- BM25 + vectors + reranking
- Still file-based storage
- QMD is search backend, not storage

**Problem:** Files are fragile. No structured queries. QMD is an index, not a database.

### Nexus: Cortex (Derived Layer)

Cortex derives understanding from the System of Record:

| Layer | What It Produces |
|-------|------------------|
| Episodes | Interaction summaries |
| Facets | Entity attributes extracted |
| Embeddings | Semantic vectors |
| Analyses | Aggregated insights |

**Advantage:** 
- Foundation is SQLite (queryable, atomic)
- Cortex builds *understanding*, not just search
- Can rebuild Cortex from ledgers anytime

---

## 4. Skill System

### OpenClaw: Hub + Bundled

ClawHub at clawhub.com for installation.

Load precedence:
1. Extra directories (config)
2. Bundled (`<packageRoot>/skills/`)
3. Managed (`~/.openclaw/skills/`)
4. Workspace (`<workspace>/skills/`)

Enable/disable via config — computed at runtime from filesystem.

**Difference from Nexus:**
- Both have hubs
- OpenClaw computes status at runtime
- Nexus has first-class status tracking (✅⭐🔧📥⛔❌)
- Nexus tracks "has this been used" — OpenClaw doesn't

### Nexus: Hub + Status Tracking

Skills installed from hub with explicit status:

| Status | Meaning |
|--------|---------|
| ✅ active | Configured AND used |
| ⭐ ready | Configured, never used |
| 🔧 needs-setup | Installed, needs credentials |
| 📥 needs-install | Tool needs installation |
| ⛔ unavailable | Not available on platform |
| ❌ broken | Was working, now failing |

**Advantage:** Clear visibility into what's working.

---

## 5. Command System

### OpenClaw: Command-Dispatch

Skills can bypass LLM for deterministic execution:

```yaml
---
command-dispatch: tool
command-tool: sessions_send
---
```

Flow: User → Command → Tool directly → Response (no LLM)

### Nexus: Different Concept

**Skills ≠ Commands**

- **Skills:** Documentation files injected for agents when needed
- **Commands:** Deterministic scripts/macros that execute without agent thinking

These should not be lumped together. Commands are more like **macros** — language is important.

If adopted, commands would need separate treatment, not mixed with skills.

---

## 6. Access Control

### OpenClaw: Skill Allowlisting

```json5
{
  skills: {
    allowBundled: ["gemini", "peekaboo"]
  },
  agents: {
    list: [{ name: "atlas", skills: ["gog", "calendar"] }]
  }
}
```

Layers:
1. Requirements (OS, binaries, env)
2. Bundled allowlist
3. Per-agent allowlist
4. Invocation policy

**Problem:** Blocking at skill level does nothing — the binary is on your computer. Agent can still use the tool directly.

### Nexus: Full IAM

Declarative policies control actual access:

```yaml
policies:
  - name: tool-restrictions
    subjects: [agent:atlas]
    actions: [tool:execute]
    resources: [tool:shell, tool:write]
    effect: deny
    conditions:
      workspace: [external]
```

**Advantage:** IAM controls what actually happens, not just what documentation is injected.

---

## 7. Multi-Agent Patterns

### OpenClaw: Ad-Hoc Delegation

`sessions_spawn` tool creates one-off subagents:
- Fire-and-forget
- `spawnedBy` tracks parent-child
- Announce pattern for results
- No direct coordination during execution
- Subagents can't spawn subagents

**Pattern:** "Spawn a helper and see what happens"

### Nexus: Manager-Worker Pattern (MWP)

Structured orchestration:
- Manager decomposes work explicitly
- Workers have defined interfaces
- Coordination is structured
- Multi-level delegation supported
- Task queue and prioritization

**Pattern:** "Orchestrate a team to accomplish complex work"

---

## 8. Identity Management

### OpenClaw: Ad-Hoc Links

```json5
{
  identityLinks: {
    alice: ["telegram:111", "discord:222"]
  }
}
```

Collapses sessions across channels. That's it.

### Nexus: Identity Graph

```
Contacts → Entities → Mappings
```

Three-layer system:
1. **Contacts:** Raw platform identifiers
2. **Entities:** Resolved people/organizations
3. **Mappings:** Relationships and attributes

**Advantage:** Can query "who is this person across all platforms" and understand relationships.

---

## 9. Event Tracing

### OpenClaw: None

Events fire and disappear. No audit trail.

### Nexus: Nexus Ledger

Every `NexusRequest` is traced:
- Pipeline stages executed
- Decisions made
- Timing data
- Errors encountered

**Advantage:** Can debug any request after the fact. Auditable.

---

## Summary Table

| System | OpenClaw | Nexus | Nexus Advantage |
|--------|----------|-------|-----------------|
| Providers | LLM-specific | Generic connectors | Works for any service |
| Credentials | Per-channel | Unified vault | Single view, health checks |
| Memory | Files + QMD | Cortex | Understanding, not just search |
| Skills | Computed at runtime | Status tracking | Visibility into what's working |
| Commands | Skill-based dispatch | Separate concept | Clean separation |
| Access Control | Skill allowlisting | Full IAM | Controls actual access |
| Multi-Agent | Ad-hoc delegation | MWP | Structured orchestration |
| Identity | Ad-hoc links | Identity Graph | Queryable relationships |
| Event Tracing | None | Nexus Ledger | Auditable, debuggable |

---

*Nexus has everything but better — except perhaps compaction (see COMPACTION.md).*
