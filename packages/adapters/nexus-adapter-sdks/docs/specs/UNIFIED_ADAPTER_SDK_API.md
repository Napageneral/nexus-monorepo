---
summary: "Exact TS-first unified adapter SDK API contract for defineAdapter, helper surfaces, and proof-of-migration work."
title: "Unified Adapter SDK API"
---

# Unified Adapter SDK API

## Purpose

This document defines the exact shared adapter SDK API that concrete adapters
should author against after the SDK lift.

It translates the platform-level target in:

- [Unified Adapter SDK and Authoring Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/unified-adapter-sdk-and-authoring-model.md)

into a concrete SDK contract.

This is the SDK-author and adapter-author reference.

## Customer Experience

An adapter author should be able to:

1. import one top-level `defineAdapter(...)`
2. declare package metadata once
3. optionally declare typed methods once
4. plug in provider-specific connection, ingest, and delivery handlers
5. reuse helpers for credentials, targets, retries, records, and polling

The author should not need to:

- manually assemble the `operations` table
- manually repeat `adapter.info`
- manually duplicate method discovery metadata and method handlers
- hand-roll common connection and retry plumbing

## Core Decision

The SDK contract should provide one top-level authoring model:

- `defineAdapter(...)`

Everything else is a helper under that model.

There should not be:

- a separate higher-level communication SDK
- a second competing adapter authoring surface

## Exact Top-Level Shape

The SDK should expose:

```ts
defineAdapter(...)
method(...)
pollMonitor(...)
pollBackfill(...)
requireCredential(...)
requireContainerTarget(...)
readThreadTarget(...)
readReplyToTarget(...)
sleepWithSignal(...)
withRetry(...)
messageRecord(...)
```

## `defineAdapter(...)`

Canonical illustrative shape:

```ts
export default defineAdapter({
  platform: "telegram",
  name: "telegram",
  version: "0.1.0",
  multi_account: true,
  credential_service: "telegram",
  auth: { ... },
  capabilities: { ... },

  client: {
    create: async ({ ctx }) => {
      const token = requireCredential(ctx, {
        fields: ["bot_token", "token"],
        env: ["TELEGRAM_BOT_TOKEN"],
      });
      return { token };
    },
  },

  connection: {
    accounts: async ({ ctx }) => [ ... ],
    health: async ({ client, connectionId, ctx }) => ({ ... }),
  },

  ingest: {
    monitor: pollMonitor({ ... }),
    backfill: pollBackfill({ ... }),
  },

  delivery: {
    send: async ({ client, target, text, media, caption, ctx }) => ({ ... }),
    stream: { ... },
    edit: async (...) => ({ ... }),
    delete: async (...) => ({ ... }),
  },

  methods: {
    "jira.issues.transition": method({
      description: "Transition a Jira issue",
      action: "write",
      params: { ... },
      response: { ... },
      connection_required: true,
      mutates_remote: true,
      handler: async ({ client, input, connectionId, ctx }) => ({ ... }),
    }),
  },
});
```

## `defineAdapter(...)` Rules

Rules:

1. authors declare adapter metadata once
2. the SDK derives `adapter.info.operations`
3. the SDK derives `adapter.info.methods`
4. the SDK derives runtime method dispatch from declared `methods`
5. adapter packages provide provider behavior only

## Client Factory

The unified model supports one optional client factory:

```ts
client: {
  create: async ({ ctx }) => client
}
```

Rules:

1. the factory runs per runtime invocation
2. it is optional for adapters that do not need a client object
3. helpers should make credential resolution inside it easy

## Connection Section

Canonical shape:

```ts
connection: {
  accounts?: async ({ ctx, client }) => AdapterAccount[],
  health?: async ({ ctx, client, connectionId }) => AdapterHealth,
}
```

Rules:

1. `accounts` should default to a single runtime-backed account when omitted
2. `health` may default to a client-creation probe when omitted
3. adapters may override either one

## Ingest Section

Canonical shape:

```ts
ingest: {
  monitor?: async ({ ctx, client, connectionId, emit, signal }) => void,
  backfill?: async ({ ctx, client, connectionId, since, emit, signal }) => void,
}
```

This is the canonical runtime ingest surface.

## `pollMonitor(...)`

`pollMonitor(...)` is a helper implementation strategy for `ingest.monitor`.

Canonical illustrative shape:

```ts
monitor: pollMonitor({
  initialCursor: () => 0,
  poll: async ({ client, cursor, signal }) => client.getUpdates(cursor),
  items: (page) => page,
  toRecord: ({ item, connectionId }) => buildTelegramRecord(item, connectionId),
  nextCursor: ({ item, cursor }) => item.update_id + 1,
  idleMs: 0,
  errorDelayMs: 1500,
})
```

Rules:

1. `pollMonitor(...)` returns a function compatible with `ingest.monitor`
2. adapters with socket or webhook behavior can skip it and implement
   `ingest.monitor` directly

## `pollBackfill(...)`

`pollBackfill(...)` is the same idea for historical ingest:

```ts
backfill: pollBackfill({
  initialCursor: ({ since }) => since,
  poll: async ({ client, cursor, since }) => client.fetchHistory(cursor, since),
  items: (page) => page.items,
  toRecord: ({ item, connectionId }) => buildRecord(item, connectionId),
  nextCursor: ({ page, item, cursor }) => ...,
})
```

Rules:

1. `backfill` remains a canonical distinct operation
2. the helper only standardizes one common cursoring pattern

## Delivery Section

Canonical shape:

```ts
delivery: {
  send?: async ({ ctx, client, target, text, media, caption, signal }) => DeliveryResult,
  stream?: StreamHandlers,
  edit?: async (...) => DeliveryResult,
  delete?: async (...) => DeliveryResult,
}
```

Rules:

1. communication delivery remains distinct from typed methods
2. the SDK should wire canonical `channels.*` operations from this section

## `method(...)`

Canonical shape:

```ts
methods: {
  "jira.issues.transition": method({
    description: "Transition a Jira issue",
    action: "write",
    params: { ... },
    response: { ... },
    connection_required: true,
    mutates_remote: true,
    handler: async ({ ctx, client, connectionId, input }) => ({ ... }),
  }),
}
```

Rules:

1. authors declare method descriptor and handler together
2. the SDK derives `adapter.info.methods` from this declaration
3. the SDK derives the runtime method handler map from this declaration
4. `methods` is the single source of truth for adapter-native methods

## Credential Helpers

The SDK should expose helpers like:

```ts
requireCredential(ctx, {
  fields: ["bot_token", "token"],
  env: ["TELEGRAM_BOT_TOKEN"],
})
```

Rules:

1. runtime credential fields win over runtime credential value when explicitly
   requested
2. env fallback is optional and explicit
3. errors should clearly name the missing credential source

## Target Helpers

The SDK should expose:

- `requireContainerTarget(target)`
- `readThreadTarget(target)`
- `readReplyToTarget(target)`

Rules:

1. helpers operate on canonical delivery targets
2. helpers standardize validation and error messages
3. provider-specific target syntax still belongs in the adapter

## Retry Helpers

The SDK should expose:

- `sleepWithSignal(signal, ms)`
- `withRetry(...)`
- `parseRetryAfterMs(...)`

Rules:

1. retry helpers should be generic and reusable
2. provider-specific retry policy stays adapter-local

## Record Helpers

The SDK should keep `newRecord(...)` and add a more convenient helper:

```ts
messageRecord({
  platform: "telegram",
  connectionId,
  externalRecordId,
  senderId,
  senderName,
  containerId,
  containerKind,
  content,
  timestamp,
  attachments,
  metadata,
})
```

Rules:

1. record helpers generate canonical `record.ingest`
2. they do not erase provider-specific metadata mapping

## First Proof Adapter

The first proof adapter should be:

- `telegram`

Why:

1. it is small
2. it is communication-oriented
3. it repeats many of the helpers we want to lift
4. it does not require a provider-native methods showcase in the first cut

## Validation Target

This SDK cutover is complete for the first tranche only when:

1. the SDK exports the unified authoring APIs
2. Telegram uses `defineAdapter(...)`
3. Telegram no longer hand-builds `adapter.info`
4. Telegram uses SDK credential, target, retry, and monitor helpers where
   appropriate
5. SDK tests and Telegram tests/builds pass
