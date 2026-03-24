---
summary: "Exact Go unified adapter SDK API contract for DefineAdapter, helper surfaces, and proof-of-migration work."
title: "Unified Go Adapter SDK API"
---

# Unified Go Adapter SDK API

## Purpose

This document defines the exact shared Go adapter SDK authoring surface after
the unified SDK cutover.

It applies the platform model from:

- [Unified Adapter SDK and Authoring Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/unified-adapter-sdk-and-authoring-model.md)

to the Go SDK specifically.

## Customer Experience

A Go adapter author should be able to:

1. declare one adapter definition with `DefineAdapter(...)`
2. declare typed methods once
3. plug in provider-specific connection, ingest, method, and setup handlers
4. reuse helpers for credentials, targets, retries, records, and polling
5. call `Run(...)` from a tiny package entrypoint

The author should not need to:

- hand-build `AdapterOperations`
- hand-build `AdapterInfo`
- duplicate method metadata in `info` and handler registration
- re-implement default `adapter.connections.list`
- re-implement the same connection and target validation in every package
- maintain a second outward `Delivery` surface

## Core Decision

The Go SDK should expose one top-level authoring model:

- `DefineAdapter(...)`

Everything else is a helper under that model.

There should not be a second competing higher-level Go authoring surface.

Outward behavior is method-first.

## Exact Top-Level Shape

The Go SDK should expose:

```go
DefineAdapter(...)
Method(...)
PollMonitor(...)
PollBackfill(...)
RequireCredential(...)
RequireContainerTarget(...)
ReadThreadTarget(...)
ReadReplyToTarget(...)
SleepContext(...)
WithRetry(...)
MessageRecord(...)
```

## `DefineAdapter(...)`

Canonical illustrative shape:

```go
func main() {
	nexadapter.Run(nexadapter.DefineAdapter(nexadapter.DefineAdapterConfig[*telegramClient]{
		Platform:          "telegram",
		Name:              "telegram",
		Version:           "0.1.0",
		MultiAccount:      true,
		CredentialService: "telegram",
		Capabilities:      capabilities,
		Auth:              authManifest,
		Client: nexadapter.ClientFactory[*telegramClient]{
			Create: func(ctx nexadapter.AdapterRuntimeContext) (*telegramClient, error) {
				token, err := nexadapter.RequireCredential(ctx, nexadapter.CredentialLookupOptions{
					Fields: []string{"bot_token", "token"},
					Env:    []string{"TELEGRAM_BOT_TOKEN"},
					Label:  "telegram bot token",
				})
				if err != nil {
					return nil, err
				}
				return newTelegramClient(token), nil
			},
		},
		Connection: nexadapter.ConnectionHandlers[*telegramClient]{
			Health: func(ctx nexadapter.AdapterContext[*telegramClient]) (*nexadapter.AdapterHealth, error) {
				return &nexadapter.AdapterHealth{Connected: true}, nil
			},
		},
		Ingest: nexadapter.IngestHandlers[*telegramClient]{
			Monitor: nexadapter.PollMonitor(...),
			Backfill: nexadapter.PollBackfill(...),
		},
		Methods: map[string]nexadapter.DeclaredMethod[*telegramClient]{
			"telegram.send": nexadapter.Method(nexadapter.DeclaredMethod[*telegramClient]{
				Description: "Send a Telegram message",
				Action:      "write",
				Params: map[string]any{
					"type": "object",
				},
				Response: map[string]any{
					"type": "object",
				},
				Handler: func(ctx nexadapter.AdapterContext[*telegramClient], req nexadapter.AdapterMethodRequest) (any, error) {
					return map[string]any{
						"success":     true,
						"message_ids": []string{"sent:1"},
						"chunks_sent": 1,
					}, nil
				},
			}),
			"telegram.messages.lookup": nexadapter.Method(...),
		},
	}))
}
```

## `DefineAdapter(...)` Rules

Rules:

1. authors declare adapter metadata once
2. the SDK derives `adapter.info.operations`
3. the SDK derives `adapter.info.methods`
4. the SDK derives runtime method dispatch from declared `Methods`
5. truthful communication methods and provider-native mutation methods both live
   under `Methods`
6. adapter packages provide provider behavior only

## Client Factory

The unified model supports one optional client factory:

```go
Client: ClientFactory[T]{
	Create: func(ctx AdapterRuntimeContext) (T, error)
}
```

Rules:

1. it runs once per runtime invocation
2. it is optional for adapters that do not need a reusable client object
3. helpers should make credential resolution inside it easy

## Connection Section

Canonical shape:

```go
Connection: ConnectionHandlers[T]{
	Connections: func(ctx AdapterContext[T]) ([]AdapterConnectionIdentity, error),
	Health: func(ctx AdapterContext[T]) (*AdapterHealth, error),
}
```

Rules:

1. `Connections` should default to one runtime-backed connection identity when omitted
2. `Health` should default to a connected result when omitted
3. adapters may override either one

## Ingest Section

Canonical shape:

```go
Ingest: IngestHandlers[T]{
	Monitor: func(ctx AdapterContext[T], emit EmitFunc) error,
	Backfill: func(ctx AdapterContext[T], since time.Time, emit EmitFunc) error,
}
```

This is the canonical runtime ingest surface.

## `PollMonitor(...)`

`PollMonitor(...)` is a helper implementation strategy for `Ingest.Monitor`.

Canonical illustrative shape:

```go
Monitor: nexadapter.PollMonitor(nexadapter.PollConfig[Item]{
	Interval: 10 * time.Second,
	Fetch: func(ctx context.Context, since time.Time) ([]Item, time.Time, error) { ... },
	ToRecord: func(item Item) nexadapter.AdapterInboundRecord { ... },
})
```

Rules:

1. `PollMonitor(...)` returns a function compatible with `Ingest.Monitor`
2. adapters with socket or webhook behavior can skip it and implement
   `Ingest.Monitor` directly

## `PollBackfill(...)`

`PollBackfill(...)` is the same idea for historical ingest.

Rules:

1. `Backfill` remains a canonical distinct operation
2. the helper only standardizes one common cursoring pattern
3. adapters may implement `Ingest.Backfill` directly when the provider does not
   fit the helper

## `Method(...)`

Canonical shape:

```go
Methods: map[string]DeclaredMethod[T]{
	"jira.issues.transition": nexadapter.Method(DeclaredMethod[T]{
		Description:        "Transition a Jira issue",
		Action:             "write",
		Params:             map[string]any{...},
		Response:           map[string]any{...},
		ConnectionRequired: true,
		MutatesRemote:      true,
		Handler: func(ctx AdapterContext[T], req AdapterMethodRequest) (any, error) { ... },
	}),
}
```

Rules:

1. method metadata is declared once
2. the SDK derives the `adapter.info.methods` descriptor from the declaration
3. the SDK derives the runtime method handler from the same declaration
4. outward communication uses truthful platform namespaces such as
   `slack.send`, `imessage.send`, or `discord.send`
5. provider/work/content methods use truthful provider namespaces such as
   `jira.issues.create`, `git.pull_requests.merge`, or
   `confluence.pages.update`

## Helper Set

The first shared helper tranche should include:

- credential helpers
- delivery target helpers
- retry/sleep helpers
- message-record helpers
- polling/backfill helpers

These helpers may still support communication-oriented method payloads, but
they do not justify a parallel outward `Delivery` authoring surface.

## Out Of Scope

The Go SDK should not absorb:

- provider-specific route parsing
- provider-specific API clients
- provider-specific field mapping
- provider-specific backfill semantics
- provider-specific write/read coherence rules

## Non-Negotiable Rules

1. the Go SDK authoring model is method-first
2. there is no target-state `Delivery` section
3. there is no target-state bundled outward channel-operation contract
4. there is no backward-compatible dual-surface `Methods + Delivery` model

Those remain adapter-local.
