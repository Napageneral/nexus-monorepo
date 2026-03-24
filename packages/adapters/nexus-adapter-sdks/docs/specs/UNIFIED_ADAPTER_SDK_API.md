---
summary: "Exact TS-first unified adapter SDK API contract for a method-first adapter authoring model."
title: "Unified Adapter SDK API"
---

# Unified Adapter SDK API

## Purpose

This document defines the exact shared adapter SDK API that concrete adapters
must author against after the hard cut.

It translates:

- [Unified Adapter SDK and Authoring Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/unified-adapter-sdk-and-authoring-model.md)

into a concrete SDK contract.

## Customer Experience

An adapter author should be able to:

1. import one top-level `defineAdapter(...)`
2. declare package metadata once
3. declare outward methods once
4. plug in provider-specific connection, ingest, and method handlers
5. reuse helpers for credentials, targets, retries, records, and polling

The author should not need to:

- manually assemble the `operations` table
- manually repeat `adapter.info`
- manually duplicate method discovery metadata and method handlers
- maintain a second outward `delivery` declaration surface

## Core Decision

The SDK contract provides one top-level authoring model:

- `defineAdapter(...)`

Outward behavior is method-first.

There is not:

- a separate communication SDK
- a second competing outward declaration surface
- a target-state `delivery` block for `channels.*`
- a dual-surface `methods + delivery` model

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

Canonical authoring shape:

```ts
export default defineAdapter({
  platform: "slack",
  name: "slack",
  version: "0.1.0",
  multi_account: true,
  credential_service: "slack",
  auth: { ... },
  capabilities: { ... },
  client: { ... },
  connection: { ... },
  ingest: { ... },
  methods: { ... },
});
```

There is no top-level `delivery` section in the target-state SDK API.

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
    connections: async ({ ctx }) => [ ... ],
    health: async ({ client, connectionId, ctx }) => ({ ... }),
  },

  ingest: {
    monitor: pollMonitor({ ... }),
    backfill: pollBackfill({ ... }),
  },

  methods: {
    "telegram.send": method({
      description: "Send a Telegram message",
      action: "write",
      params: { ... },
      response: { ... },
      connection_required: true,
      mutates_remote: true,
      handler: async ({ client, input, connectionId, ctx }) => ({ ... }),
    }),

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
5. outward communication and provider mutation both live under truthful
   namespaced methods
6. package-native operational methods also live under `methods`, but keep their
   package-native namespace
7. the runtime/ingest `operations` surface is not a second outward method path

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
  connections?: async ({ ctx, client }) => AdapterConnectionIdentity[],
  health?: async ({ ctx, client, connectionId }) => AdapterHealth,
}
```

## Ingest Section

Canonical shape:

```ts
ingest: {
  monitor?: async ({ ctx, client, connectionId, emit, signal }) => void,
  backfill?: async ({ ctx, client, connectionId, since, emit, signal }) => void,
}
```

This remains the canonical runtime ingest surface.

## Method Section

Canonical shape:

```ts
methods: {
  "slack.send": method({ ... }),
  "slack.edit": method({ ... }),
  "jira.issues.transition": method({ ... }),
}
```

Rules:

1. authors declare outward communication and provider methods together
2. the SDK derives runtime dispatch from `methods`
3. the SDK derives `adapter.info.methods` from `methods`
4. there is no target-state `delivery` section that wires canonical
   `channels.*` operations
5. communication methods use truthful platform namespaces such as
   `slack.send`, `imessage.send`, or `discord.send`
6. provider/work/content methods use truthful provider namespaces such as
   `jira.issues.create`, `git.pull_requests.merge`, or
   `confluence.pages.update`

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
2. `methods` is the single source of truth for outward callables
3. the SDK derives both discovery and dispatch from this declaration

## Credential Helpers

The SDK should expose helpers like:

```ts
requireCredential(ctx, {
  fields: ["bot_token", "token"],
  env: ["TELEGRAM_BOT_TOKEN"],
})
```

## Target Helpers

Helpers such as `requireContainerTarget`, `readThreadTarget`, and
`readReplyToTarget` may still exist.

They survive the hard cut as reusable parsing helpers for truthful communication
methods.

They do not justify a separate canonical `delivery` declaration surface.

## Namespace Rules

Rules:

1. communication methods use platform-truthful namespaces
2. provider/work/content methods use provider-truthful namespaces
3. package-native operational methods use package-native namespaces only when
   they are not themselves the outward provider/platform action
4. the SDK must not normalize unlike provider actions through generic outward
   verbs

## Non-Negotiable Rules

1. the SDK authoring model is method-first
2. outward communication is expressed as truthful namespaced methods
3. provider-native work is expressed as truthful namespaced methods
4. there is no backward-compatible dual-surface `methods + delivery` target
   model
5. bundled outward channel-operation nouns are not target-state outward truth
