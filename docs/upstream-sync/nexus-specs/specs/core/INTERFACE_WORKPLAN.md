# Interface Workplan

**Status:** ACTIVE  
**Last Updated:** 2026-01-30

---

## Overview

This document tracks all component interfaces in the Nexus system. The master interface definitions are in `UNIFIED_SYSTEM.md` Section 10. This workplan tracks status, alignment with `NexusRequest`, and remaining work.

---

## The NexusRequest Flow

The `NexusRequest` is the data bus that accumulates context through the pipeline. Most interfaces either contribute to or consume from it.

```
Event Arrives
     │
     ▼
[1] In-Adapter ──► NexusRequest created with event + delivery context
     │
     ▼
[3] Identity Lookup ──► NexusRequest.principal added
     │
     ▼
[4] ACL ──► NexusRequest.permissions + session added
     │
     ▼
[5] Hooks ──► NexusRequest.hooks context added
     │
     ▼
[6] Broker ──► NexusRequest.agent context added
     │
     ▼
[9] Out-Adapter ──► NexusRequest.delivery_result added
     │
     ▼
[7,10] Ledgers ──► NexusRequest persisted
```

---

## Interface Status

### Pipeline Interfaces (NexusRequest Flow)

| # | Interface | From → To | Status | Notes |
|---|-----------|-----------|--------|-------|
| 1 | `NormalizedEvent` | In-Adapter → Event Ledger | ✅ Defined | Aligns with `NexusEvent` in adapters spec |
| 2 | `EventTrigger` | Event Ledger → Handler | ✅ Defined | Trigger mechanism |
| 3 | `IdentityLookup` | Handler ↔ Identity Ledger | ✅ Defined | Query + result |
| 4 | `ACLResult` | ACL → Handler | ✅ Defined | Decision + permissions |
| 5 | `BrokerDispatch` | Handler → Broker | ⚠️ Needs Alignment | Should be `NexusRequest` |
| 6 | `AgentInvoke` | Broker → Agent | ⚠️ Needs Alignment | Should consume `NexusRequest` |
| 7 | `LedgerWrite` | Broker → Agent Ledger | ✅ Defined | SQL writes |
| 8 | `IdentityEnrichment` | Index → Identity Ledger | ✅ Defined | Passive write-back |
| 9 | `OutAdapterSend` | Agent → Out-Adapter | ⚠️ Needs Alignment | Should use `NexusRequest.delivery` |
| 10 | `ResponseEvent` | Out-Adapter → Event Ledger | ✅ Defined | Closes loop |

### Alignment Needed

**Interface 5 (`BrokerDispatch`)** and **Interface 6 (`AgentInvoke`)** need to be updated to explicitly reference `NexusRequest` as the carrier object rather than defining standalone types.

**Interface 9 (`OutAdapterSend`)** should pull from `NexusRequest.delivery` rather than duplicating fields.

---

## Detailed Status

### ✅ Well-Defined (6 interfaces)

| # | Interface | Definition Location |
|---|-----------|---------------------|
| 1 | `NormalizedEvent` | `UNIFIED_SYSTEM.md` + `adapters/INBOUND_INTERFACE.md` |
| 2 | `EventTrigger` | `UNIFIED_SYSTEM.md` |
| 3 | `IdentityLookup` | `UNIFIED_SYSTEM.md` + `acl/ACCESS_CONTROL_SYSTEM.md` |
| 4 | `ACLResult` | `UNIFIED_SYSTEM.md` + `acl/ACCESS_CONTROL_SYSTEM.md` |
| 7 | `LedgerWrite` | `UNIFIED_SYSTEM.md` |
| 10 | `ResponseEvent` | `UNIFIED_SYSTEM.md` |

### ⚠️ Needs Alignment (3 interfaces)

| # | Interface | Issue | Resolution |
|---|-----------|-------|------------|
| 5 | `BrokerDispatch` | Standalone type, should be `NexusRequest` | Redefine as "Handler passes `NexusRequest` to Broker" |
| 6 | `AgentInvoke` | Doesn't reference accumulated context | Agent should receive `NexusRequest.agent` subset |
| 9 | `OutAdapterSend` | Duplicates delivery info | Use `NexusRequest.delivery` directly |

### 📝 Needs Documentation (1 interface)

| # | Interface | Issue |
|---|-----------|-------|
| 8 | `IdentityEnrichment` | Defined but Index spec not complete |

---

## Work Items

### Phase 1: Align with NexusRequest

1. **Update `UNIFIED_SYSTEM.md` Section 10.2**
   - Interface 5: Remove `BrokerDispatch`, reference `NexusRequest` flow
   - Interface 6: Show how `AgentInvoke` pulls from `NexusRequest`
   - Interface 9: Show how `OutAdapterSend` uses `NexusRequest.delivery`

2. **Update `NEXUS_REQUEST.md`**
   - Add section showing which interfaces contribute which fields
   - Add section on persistence (what gets written to ledgers)

### Phase 2: Hook Interface Details

3. **Create `HOOK_INTERFACE.md`**
   - `HookContext` (what hooks receive)
   - `HookResult` (what hooks return)
   - How hooks modify `NexusRequest`

### Phase 3: Broker Interface Details

4. **Update `agent-system/BROKER.md`**
   - How broker receives `NexusRequest`
   - How broker creates `AgentInvoke` from it
   - How broker writes to ledgers

### Phase 4: Ledger Schemas

5. **Create `LEDGER_SCHEMAS.md`**
   - Event Ledger tables
   - Agent Ledger tables
   - Identity Ledger tables (entities, entity_identities)
   - How they align with interface types

---

## Cross-Reference

### NexusRequest Fields → Interfaces

| NexusRequest Field | Populated By | Interface |
|--------------------|--------------|-----------|
| `event` | In-Adapter | (1) NormalizedEvent |
| `delivery` | In-Adapter | (1) NormalizedEvent |
| `principal` | Identity Lookup | (3) IdentityLookup |
| `permissions` | ACL | (4) ACLResult |
| `session` | ACL | (4) ACLResult |
| `hooks` | Hook Eval | (5) implicit |
| `agent` | Broker | (6) AgentInvoke |
| `response` | Agent | (6) AgentInvoke result |
| `delivery_result` | Out-Adapter | (9) OutAdapterSend |

### Interfaces → Spec Documents

| Interface | Primary Spec | Secondary Specs |
|-----------|--------------|-----------------|
| (1) NormalizedEvent | `UNIFIED_SYSTEM.md` | `adapters/INBOUND_INTERFACE.md` |
| (2) EventTrigger | `UNIFIED_SYSTEM.md` | — |
| (3) IdentityLookup | `UNIFIED_SYSTEM.md` | `acl/ACCESS_CONTROL_SYSTEM.md` |
| (4) ACLResult | `UNIFIED_SYSTEM.md` | `acl/ACCESS_CONTROL_SYSTEM.md`, `acl/POLICIES.md` |
| (5) BrokerDispatch | `UNIFIED_SYSTEM.md` | `agent-system/BROKER.md` (needs update) |
| (6) AgentInvoke | `UNIFIED_SYSTEM.md` | `agent-system/BROKER.md` |
| (7) LedgerWrite | `UNIFIED_SYSTEM.md` | — |
| (8) IdentityEnrichment | `UNIFIED_SYSTEM.md` | (Index spec TODO) |
| (9) OutAdapterSend | `UNIFIED_SYSTEM.md` | `adapters/OUTBOUND_INTERFACE.md` |
| (10) ResponseEvent | `UNIFIED_SYSTEM.md` | — |

---

## Related Documents

- `NEXUS_REQUEST.md` — The data bus
- `../UNIFIED_SYSTEM.md` — Master interface definitions
- `../adapters/` — Adapter interface details
- `../acl/` — ACL interface details
- `../agent-system/BROKER.md` — Broker details (needs update)
