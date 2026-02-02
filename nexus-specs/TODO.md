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

## Environment Domain

| TODO | Location | Priority | Notes |
|------|----------|----------|-------|
| **Hooks Skill** | `environment/capabilities/skills/guides/hooks/` | Medium | Create skill guide pointing to `runtime/hooks/` spec |
| **Credential CLI** | `environment/capabilities/credentials/CREDENTIAL_CLI.md` | Low | Detailed credential CLI spec (if needed beyond COMMANDS.md) |

### Hooks Skill

The hook-examples/README.md in runtime/hooks is a skill guide for agents. Need to:
- Create a proper skill in `skills/guides/hooks/SKILL.md`
- Reference the runtime spec for full details
- Provide quick-start patterns for agents

---

## Other Domains

*(Add TODOs from other spec folders as they're cleaned up)*

---

*This file tracks spec work that needs deeper attention.*
