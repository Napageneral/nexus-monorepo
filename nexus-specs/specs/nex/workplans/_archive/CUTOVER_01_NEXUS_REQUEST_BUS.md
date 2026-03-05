# Cutover 01 — NexusRequest Bus Rewrite

**Status:** COMPLETE (ARCHIVED)
**Phase:** 1 (foundation — everything depends on this)
**Target Spec:** [NEXUS_REQUEST_TARGET.md](../NEXUS_REQUEST_TARGET.md) · [ATTACHMENTS.md](../ATTACHMENTS.md)
**Source File:** `src/nex/request.ts` (369 lines → rewrite entirely)

---

## Summary

Replace the entire contents of `src/nex/request.ts` with the canonical NexusRequest type system. This file defines every type that flows through the pipeline. Every other file in the codebase imports from here, so this change is the foundation.

---

## Current State → Target State

### Top-Level NexusRequest

**Current** (15+ top-level fields):
```typescript
// src/nex/request.ts lines 301-316
type NexusRequest = {
  request_id: string;
  created_at: number;
  operation?: string;        // optional in current code
  event: EventContext;        // DELETE — becomes routing + payload
  delivery: DeliveryContext;  // DELETE — becomes routing
  sender?: SenderContext;     // DELETE — becomes principals.sender (Entity)
  receiver?: ReceiverContext; // DELETE — becomes principals.receiver (Entity)
  access?: AccessContext;     // REWRITE — simplified
  triggers?: TriggerContext;  // DELETE — becomes automations (AutomationContext)
  agent?: AgentContext;       // REWRITE — simplified (6 fields, not 18)
  response?: ResponseContext; // DELETE — broker-internal
  delivery_result?: DeliveryResult; // DELETE — broker-internal
  pipeline: PipelineTrace[];  // RENAME to stages: StageTrace[]
  status: RequestStatus;
};
```

**Target** (10 fields):
```typescript
type NexusRequest = {
  request_id: string;
  created_at: number;
  operation: string;             // required, not optional
  routing: Routing;              // NEW — replaces delivery + parts of event
  payload: unknown;              // NEW — replaces event (typed per operation)
  principals?: {
    sender: Entity;              // replaces SenderContext
    receiver: Entity;            // replaces ReceiverContext
    recipients?: Entity[];       // NEW — resolved from payload.recipients
  };
  access?: AccessContext;        // simplified
  automations?: AutomationContext; // replaces TriggerContext
  agent?: AgentContext;          // simplified
  stages: StageTrace[];          // renamed from pipeline
  status: RequestStatus;
};
```

---

## Schemas to DELETE (remove entirely)

Each of these Zod schemas and their corresponding TypeScript types must be deleted:

| Schema | Lines | Why |
|--------|-------|-----|
| `AttachmentSchema` | 17-25 | Replaced by canonical Attachment (different fields) |
| `ChannelCapabilitiesSchema` | 27-58 | Adapter-internal, off the bus |
| `AvailableChannelSchema` | 60-64 | Adapter-internal, off the bus |
| `EventContextSchema` | 68-75 | Replaced by EventPayload (part of `payload`) |
| `DeliveryContextSchema` | 77-95 | Replaced by Routing |
| `SenderContextSchema` | 99-114 | Replaced by Entity (from identity.db) |
| `ReceiverAgentContextSchema` | 118-128 | Replaced by Entity |
| `ReceiverSystemContextSchema` | 130-136 | Replaced by Entity |
| `ReceiverEntityContextSchema` | 138-144 | Replaced by Entity |
| `ReceiverUnknownContextSchema` | 146-151 | Replaced by Entity |
| `ReceiverContextSchema` | 153-158 | Replaced by Entity (no discriminated union) |
| `AccessPermissionsSchema` | 160-167 | Simplified — drop data_access |
| `AccessContextSchema` | 169-183 | Simplified — drop routing, drop ask |
| `TriggerContextSchema` | 185-212 | Renamed to AutomationContext, cleaned |
| `AgentContextSchema` | 214-236 | Simplified — 6 fields, not 18 |
| `ToolCallSummarySchema` | 238-244 | Broker-internal |
| `ResponseContextSchema` | 246-282 | Broker-internal |
| `DeliveryResultSchema` | 284-290 | Broker-internal |
| `NexusEventSchema` | 318-322 | Replaced — new input shape |

**Also delete these type aliases** (lines 324-341):
`QueueMode`, `Attachment` (old), `ChannelCapabilities`, `AvailableChannel`, `EventContext`, `DeliveryContext`, `SenderContext`, `ReceiverContext`, `TriggerContext`, `ToolCallSummary`, `ResponseContext`, `DeliveryResult`, `NexusEvent` (old)

---

## Schemas to CREATE (new canonical types)

### 1. Attachment (canonical)

From [ATTACHMENTS.md](../ATTACHMENTS.md):

```typescript
export const AttachmentSchema = z.object({
  id: z.string(),
  filename: z.string().optional(),
  mime_type: z.string(),
  media_type: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  url: z.string().optional(),
  local_path: z.string().optional(),
  content_hash: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type Attachment = z.infer<typeof AttachmentSchema>;
```

**Field changes from current:**
- `type` → `mime_type` (was overloaded, now explicit MIME)
- NEW: `media_type` (canonical kind: image/video/audio/document/file)
- NEW: `content_hash`
- `size` stays but adapters previously used `size_bytes`

### 2. RoutingParticipant

```typescript
export const RoutingParticipantSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  avatar_url: z.string().optional(),
  auth: z.record(z.string(), z.unknown()).optional(),
});

export type RoutingParticipant = z.infer<typeof RoutingParticipantSchema>;
```

### 3. Routing

Replaces `DeliveryContext`. Same location hierarchy fields, but:
- Sender/receiver are `RoutingParticipant` sub-objects (not flat `sender_id`/`sender_name` fields)
- `capabilities` and `available_channels` are GONE (adapter-internal)
- `account_id` is gone from top level (it's on the RoutingParticipant as part of auth or adapter-level)

```typescript
export const RoutingSchema = z.object({
  adapter: z.string(),
  platform: z.string(),

  // WHO
  sender: RoutingParticipantSchema,
  receiver: RoutingParticipantSchema,

  // WHERE
  space_id: z.string().optional(),
  space_name: z.string().optional(),
  container_kind: z.enum(["direct", "group"]).optional(),
  container_id: z.string().optional(),
  container_name: z.string().optional(),
  thread_id: z.string().optional(),
  reply_to_id: z.string().optional(),

  // Adapter-specific opaque data
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type Routing = z.infer<typeof RoutingSchema>;
```

**Mapping from current DeliveryContext:**
- `delivery.platform` → `routing.platform`
- `delivery.account_id` → dropped from Routing (adapter-level concern)
- `delivery.sender_id` → `routing.sender.id`
- `delivery.sender_name` → `routing.sender.name`
- `delivery.receiver_id` → `routing.receiver.id`
- `delivery.receiver_name` → `routing.receiver.name`
- `delivery.space_id` → `routing.space_id`
- `delivery.space_name` → `routing.space_name`
- `delivery.container_id` → `routing.container_id`
- `delivery.container_kind` → `routing.container_kind`
- `delivery.container_name` → `routing.container_name`
- `delivery.thread_id` → `routing.thread_id`
- `delivery.reply_to_id` → `routing.reply_to_id`
- `delivery.metadata` → `routing.metadata`
- `delivery.capabilities` → DELETE (adapter-internal)
- `delivery.available_channels` → DELETE (adapter-internal)
- NEW: `routing.adapter` (which adapter instance produced this)

### 4. EventPayload

This is the `payload` type for `event.ingest` operations. Other operations define their own payload schemas.

```typescript
export const EventPayloadSchema = z.object({
  id: z.string(),
  content: z.string(),
  content_type: z.enum(["text", "reaction", "membership"]),
  attachments: z.array(AttachmentSchema).optional(),
  recipients: z.array(RoutingParticipantSchema).optional(),
  timestamp: z.number().int(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type EventPayload = z.infer<typeof EventPayloadSchema>;
```

**Changes from current EventContext:**
- `event_id` → `id` (just `id` — the event's own identifier)
- `content_type` enum: DROP `"image"`, `"audio"`, `"video"`, `"file"` — those are attachment types, not content types. Only `"text"`, `"reaction"`, `"membership"`.
- NEW: `recipients` field (RoutingParticipant[] for email CC, group members)
- `timestamp` stays
- `attachments` uses new canonical Attachment type
- `metadata` stays

### 5. Entity

The Entity type is defined in identity.db and hydrated during `resolvePrincipals`. It's used for both sender and receiver — no wrapper types.

```typescript
export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  normalized: z.string().optional(),
  is_user: z.boolean(),
  origin: z.string().optional(),       // who created: "adapter", "writer", "manual"
  persona_path: z.string().optional(),
  tags: z.array(z.string()),
  merged_into: z.string().optional(),
  mention_count: z.number().int(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});

// NOTE: The identity.db schema may retain first_seen/last_seen as DB columns
// for query convenience, but the canonical Entity type exposed on NexusRequest
// uses created_at/updated_at only. See NEXUS_REQUEST_TARGET.md Entity type.

export type Entity = z.infer<typeof EntitySchema>;
```

**This replaces:**
- `SenderContext` (which had `type: "owner"|"known"|"unknown"|"system"|"webhook"|"agent"`, `entity_id`, `name`, `relationship`, `tags`, `identities`, `source`)
- `ReceiverContext` (discriminated union of 4 variants: agent, system, entity, unknown)
- Now it's just one Entity. The `type` field is free-form ("person", "org", "agent", "system", "bot", etc.)
- `persona_path` is hydrated from `entity_persona` table during resolvePrincipals

### 6. AccessContext (simplified)

```typescript
export const AccessContextSchema = z.object({
  decision: z.enum(["allow", "deny"]),
  matched_policy: z.string().optional(),
  permissions: z.object({
    tools: z.object({
      allow: z.array(z.string()),
      deny: z.array(z.string()),
    }),
    credentials: z.array(z.string()),
  }),
});

export type AccessContext = z.infer<typeof AccessContextSchema>;
```

**Changes from current:**
- DROP `"ask"` from decision enum — internally resolved to "deny" + permission_request row
- DROP `permissions.data_access` ("none"|"minimal"|"contextual"|"full") — not needed on bus
- DROP `routing` sub-object (agent_id, persona_ref, session_label, queue_mode) — session routing is broker-internal, lives on AgentContext or broker-internal
- DROP `rate_limited`, `rate_limit_remaining` — deferred design

### 7. AutomationContext (replaces TriggerContext)

```typescript
export const AutomationContextSchema = z.object({
  evaluated: z.array(z.string()),
  fired: z.array(z.string()),
  handled: z.boolean().optional(),
  handled_by: z.string().optional(),
  enrichment: z.record(z.string(), z.string()).optional(),
  agent_overrides: z.object({
    session_key: z.string().optional(),
    persona_path: z.string().optional(),
    model: z.string().optional(),
    provider: z.string().optional(),
    queue_mode: QueueModeSchema.optional(),
    role: z.string().optional(),
  }).optional(),
  results: z.array(z.object({
    automation_id: z.string(),
    invocation_id: z.string(),
    duration_ms: z.number().int().nonnegative(),
    error: z.string().optional(),
  })).optional(),
});

export type AutomationContext = z.infer<typeof AutomationContextSchema>;
```

**Changes from current TriggerContext:**
- RENAME: `automations_evaluated` → `evaluated`
- RENAME: `automations_fired` → `fired`
- DROP: `hooks_evaluated` — internal detail
- DROP: `routing_override` entirely — session targeting (target_kind, from_turn_id, label_hint, smart) is broker-internal
- DROP: `automation_results[].fire` — results only includes hooks that fired
- RENAME: `automation_results` → `results`
- ADD: `results[].invocation_id` (FK to hook_invocations table)
- ADD: `agent_overrides` (was mixed into routing_override)
- `enrichment` value type narrowed to `string` (each value is a text block for XML injection)

### 8. AgentContext (simplified)

```typescript
export const AgentContextSchema = z.object({
  session_key: z.string(),
  persona_path: z.string().optional(),
  queue_mode: QueueModeSchema.optional(),
  model: z.string(),
  provider: z.string(),
  role: z.enum(["manager", "worker", "unified"]),
});

export type AgentContext = z.infer<typeof AgentContextSchema>;
```

**Changes from current (18 fields → 6):**
- KEEP: `role`, `model`, `provider`
- RENAME: `session_label` → `session_key`
- RENAME: `persona_id` → `persona_path`
- ADD: `queue_mode` (moved from AccessContext.routing)
- DELETE all execution details (they're broker-internal, persisted to agents.db):
  - `parent_turn_id`, `turn_id`
  - `token_budget` (entire sub-object)
  - `system_prompt_hash`
  - `history_turns_count`
  - `compaction_applied`
  - `toolset_name`, `tools_available`
  - `permissions_snapshot`

### 9. StageTrace (renamed from PipelineTrace)

```typescript
export const StageTraceSchema = z.object({
  stage: z.string(),
  started_at: z.number().int(),
  duration_ms: z.number().int().nonnegative(),
  error: z.string().optional(),
});

export type StageTrace = z.infer<typeof StageTraceSchema>;
```

**Changes from current PipelineTrace:**
- RENAME: type name `PipelineTrace` → `StageTrace`
- DROP: `exit_reason` — status field on NexusRequest captures this
- DROP: `error_stack` — internal debug detail, not on the bus

### 10. RequestStatus (updated)

```typescript
export const RequestStatusSchema = z.enum([
  "processing",
  "completed",
  "denied",
  "skipped",
  "failed",
]);

export type RequestStatus = z.infer<typeof RequestStatusSchema>;
```

**Changes from current:**
- DROP: `"handled_by_automation"` — replaced by `status: "completed"` + `automations.handled === true`

### 11. QueueMode (keep as-is)

```typescript
export const QueueModeSchema = z.enum(["steer", "followup", "collect", "queue", "interrupt"]);
export type QueueMode = z.infer<typeof QueueModeSchema>;
```

---

## Functions to REWRITE

### `createNexusRequest()`

**Current** (lines 351-364):
```typescript
export function createNexusRequest(
  input: NexusEvent,
  opts?: { request_id?: string; created_at?: number },
): NexusRequest {
  return {
    request_id: opts?.request_id ?? randomUUID(),
    created_at: opts?.created_at ?? Date.now(),
    operation: input.operation,
    event: input.event,        // ← goes away
    delivery: input.delivery,  // ← goes away
    pipeline: [],              // ← renamed to stages
    status: "processing",
  };
}
```

**Target:**
```typescript
export function createNexusRequest(
  input: { operation: string; routing: Routing; payload: unknown },
  opts?: { request_id?: string; created_at?: number },
): NexusRequest {
  return {
    request_id: opts?.request_id ?? randomUUID(),
    created_at: opts?.created_at ?? Date.now(),
    operation: input.operation,
    routing: input.routing,
    payload: input.payload,
    stages: [],
    status: "processing",
  };
}
```

### `parseNexusEvent()`

**Current** (lines 343-345): Parses `{ operation, event, delivery }` via `NexusEventSchema`.

**Target:** Parses `{ operation, routing, payload }`. Rename to `parseNexusInput()` or keep name but update schema:

```typescript
export const NexusInputSchema = z.object({
  operation: z.string().trim().min(1),
  routing: RoutingSchema,
  payload: z.unknown(),
});

export type NexusInput = z.infer<typeof NexusInputSchema>;

export function parseNexusInput(input: unknown): NexusInput {
  return NexusInputSchema.parse(input);
}
```

### `appendPipelineTrace()` → `appendStageTrace()`

Rename only:
```typescript
export function appendStageTrace(request: NexusRequest, trace: StageTrace): void {
  request.stages.push(trace);
}
```

---

## Downstream Impact

Every file that imports from `request.ts` will break. This is expected — all downstream files are rewritten in subsequent phases. Key import sites:

| File | What it imports | Action |
|------|----------------|--------|
| `src/nex/pipeline.ts` | NexusRequest, PipelineTrace, createNexusRequest, parseNexusEvent, appendPipelineTrace, QueueMode | Rewrite in Phase 2 |
| `src/nex/nex.ts` | NexusRequest, PipelineTrace, createNexusRequest, parseNexusEvent, parseNexusRequest, appendPipelineTrace, QueueMode | Rewrite in Phase 2 |
| `src/nex/stages/*.ts` | NexusRequest, various sub-types | Rewrite in Phase 2 |
| `src/nex/adapters/protocol.ts` | NexusEventSchema, NexusEvent | Rewrite in Phase 6 |
| `src/nex/automations/*.ts` | NexusRequest, TriggerContext | Rewrite in Phase 7+ |
| `src/db/nexus.ts` | Indirect (serializes NexusRequest) | Rewrite in Phase 4-5 |
| `src/reply/**/*.ts` | NexusRequest, various sub-types | DELETE in Phase 7 |
| `src/nex/stages/finalize.ts` | NexusRequest | Rewrite in Phase 2 |

**Strategy:** Rewrite `request.ts` first. Then fix each downstream file as part of its respective phase. The codebase will not compile between Phase 1 and completion of Phase 2.

---

## Mechanical Checklist

- [ ] Delete all schemas listed in "Schemas to DELETE" section
- [ ] Delete all type aliases listed in "Schemas to DELETE" section
- [ ] Write all new schemas listed in "Schemas to CREATE" section
- [ ] Write all new type aliases (export `type X = z.infer<typeof XSchema>`)
- [ ] Rewrite `createNexusRequest()` with new signature
- [ ] Rename `parseNexusEvent()` → `parseNexusInput()` with new schema
- [ ] Rename `appendPipelineTrace()` → `appendStageTrace()`
- [ ] Rename `PipelineTraceSchema` → `StageTraceSchema`
- [ ] Export `inferMediaType()` utility function (from ATTACHMENTS.md spec)
- [ ] Verify all new types match canonical spec exactly (field names, optionality, enum values)
