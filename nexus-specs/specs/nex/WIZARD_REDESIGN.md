# Wizard: Full Redesign

**Status:** TODO — seed spec, full design session required after Nex runtime solidifies
**Last Updated:** 2026-03-04

---

## Decision

The wizard needs a **full ground-up redesign** after the Nex runtime and adapter/connection systems are solidified. The current implementation is tightly coupled to the OpenClaw upstream's specific onboarding flow. The 4 RPC operations are a solid protocol and will be kept.

---

## Current State (What Exists Today)

### RPC Protocol (Keep)
```
wizard.start(mode)    → { sessionId, step }
wizard.next(answer)   → { step } or { done: true }
wizard.cancel()       → void
wizard.status()       → { active, sessionId, currentStep }
```

Step types: `note`, `select`, `text`, `confirm`, `multiselect`, `progress`, `action`

### Current Wizard Steps (11, Needs Redesign)
1. Risk acknowledgement / disclaimer
2. Config detection (existing installs)
3. Flow selection (new vs existing)
4. LLM provider authentication (Anthropic, OpenAI, xAI, custom, OAuth)
5. Model selection
6. Workspace directory setup + file seeding
7. Gateway config (port, bind, auth, Tailscale)
8. Communication channel setup (WhatsApp, Telegram, Discord, BotFather tokens)
9. Skills installation
10. Daemon installation (LaunchAgent/systemd)
11. Health check verification

### Agent-Driven Bootstrap (Keep, Refine)
Post-wizard conversational onboarding:
- Seeds workspace with `AGENTS.md`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `BOOTSTRAP.md`
- On first agent chat, agent runs through conversational ritual (name, preferences, personality)
- Deletes `BOOTSTRAP.md` when complete

### Cross-Platform Clients
- CLI (primary, implemented)
- macOS app (via embedded wizard UI)
- Control UI web (via RPC protocol)

---

## Target Architecture (High-Level Direction)

### Wizard Should Focus On:
1. **Credential provisioning** — Using the new adapter connections system (not hardcoded BotFather flows)
2. **Adapter connection setup** — Adapters provide their own auth manifests, wizard orchestrates
3. **Agent workspace bootstrapping** — Seeding workspace files (good as-is)
4. **Runtime configuration** — Gateway, daemon, basic settings

### Wizard Should NOT Do:
- Channel-specific setup logic (adapters handle their own auth via manifests now)
- Hardcoded platform flows (WhatsApp business API, Telegram BotFather, etc.)
- Skills installation (adapters/apps supersede skills hub)

### Key Principle
The wizard becomes a **thin orchestrator** that calls into the adapter connection service and credential system. Each adapter's manifest declares what auth it needs, and the wizard renders the appropriate UI steps dynamically.

---

## Operations (Keep As-Is)
```
wizard.start     — Begin wizard session
wizard.next      — Advance to next step with answer
wizard.cancel    — Cancel wizard session
wizard.status    — Get current wizard state
```

These 4 operations are protocol-level and don't need to change regardless of what the wizard content looks like.

---

## Implementation Notes

### Key Source Files (Current)
- Wizard service: `nex/src/nex/wizard/` or similar
- CLI client: command-line wizard rendering
- Step definitions: hardcoded step configurations

### Redesign Dependencies
- Adapter connection service must be stable (manifests, auth flows)
- Credential system must be stable (storage, resolution)
- Gateway configuration model must be finalized

---

## Cross-References
- Adapter Connection Service: [adapters/ADAPTER_CONNECTION_SERVICE.md](./adapters/ADAPTER_CONNECTION_SERVICE.md)
- Credential System: [CREDENTIAL_AND_ADAPTER_CONNECTION_SYSTEM.md](./CREDENTIAL_AND_ADAPTER_CONNECTION_SYSTEM.md)
- Batch 6 decision: [API_DESIGN_BATCH_6.md](./API_DESIGN_BATCH_6.md)
