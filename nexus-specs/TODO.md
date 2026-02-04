# Spec TODOs

Tracking areas that need deep dives after the spec hierarchy is cleaned up.

---

## Broker Domain

| TODO | Location | Priority | Notes |
|------|----------|----------|-------|
| **Interfaces** | `broker/INTERFACES.md` | High | NEX ↔ Broker, Broker ↔ Cortex contracts |
| **Context Assembly** | `broker/CONTEXT_ASSEMBLY.md` | High | How context is built, token budgets, layer priority |
| **Streaming** | `broker/STREAMING.md` | Medium | Streaming bridge: agent → broker → NEX → adapter |
| **Smart Routing** | `broker/SMART_ROUTING.md` | Low | Cortex-powered routing (v2 feature) |

### Interfaces

Define exact contracts:
- What does NexusRequest contain when it reaches Broker?
- What does Broker return to NEX?
- How does Broker query Cortex?

### Context Assembly

Critical for agent quality:
- Token budget allocation across layers
- Priority when tokens are limited
- Cortex query strategy
- Compaction summary integration

### Streaming

Design the streaming bridge:
- Does Broker buffer or stream-through?
- How does NEX handle partial responses?
- Platform-specific considerations (some don't support streaming)

### Smart Routing

v2 feature, lower priority:
- Cortex integration for semantic routing
- Confidence thresholds
- A/B testing explicit vs smart routing

---

## NEX Domain

| TODO | Location | Priority | Notes |
|------|----------|----------|-------|
| **Interface Alignment** | `nex/INTERFACES.md` | Medium | Align BrokerDispatch, AgentInvoke, OutAdapterSend with NexusRequest |
| **Automation Skill** | `environment/capabilities/skills/guides/automations/` | Medium | Create skill guide for writing automations |
| **LedgerClient Interface** | `nex/automations/` | Medium | Define the LedgerClient API for automation scripts |
| **CortexClient Interface** | `nex/automations/` | Medium | Define the CortexClient API for semantic search |

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

---

## Other Domains

*(Add TODOs from other spec folders as they're cleaned up)*

---

*This file tracks spec work that needs deeper attention.*
