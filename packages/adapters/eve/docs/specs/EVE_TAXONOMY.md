# Eve Taxonomy

## Purpose

This document defines the canonical nouns for Eve's long-term architecture.
Other active Eve specs should reference this taxonomy instead of redefining the
same boundaries ad hoc.

## Core Surfaces

- `Eve`
  - the complete Nex iMessage product surface formed by a macOS edge, Nex core,
    and client surfaces
- `eve-edge`
  - the macOS-resident Eve runtime that can read `chat.db`, maintain the local
    warehouse, discover attachments, and execute local iMessage actions
- `nex-core`
  - the canonical Nex runtime that stores Eve records, exposes APIs to apps and
    clients, routes commands, and owns search, memory, jobs, and subscriptions
- `client surface`
  - any human-facing Nex app or UI such as Android, Linux desktop, web,
    Dispatch, or operator consoles

## Identity Nouns

- `connection_id`
  - the durable Nex identity for one Eve connection
- `edge session`
  - one live runtime registration of an `eve-edge` process to `nex-core`
- `account`
  - the self identity that the local macOS Messages environment uses for the
    connection
- `account contact`
  - the canonical contact reference that describes the connection's self
    identity in Nex
- `host`
  - one physical or virtual macOS environment
- `macOS user session`
  - one logged-in macOS user context with Messages access

## Data Nouns

- `warehouse`
  - Eve's local normalized SQLite store derived from `chat.db`, AddressBook,
    and local reconciliation metadata
- `canonical record`
  - a durable Nex record emitted by Eve and stored by `nex-core`
- `live state event`
  - a runtime event for transient or operational state such as typing, delivery
    observations, read observations, edge presence, capability changes, or
    command progress
- `command`
  - a routed request from `nex-core` to `eve-edge` to perform an outbound or
    control action
- `command receipt`
  - the immediate execution result returned by `eve-edge` for a command
- `authoritative confirmation`
  - durable evidence from the ingest path that a locally executed action
    actually landed in iMessage history
- `attachment blob`
  - attachment bytes or a durable object reference uploaded from `eve-edge` to
    `nex-core`

## Conversation Nouns

- `thread`
  - the logical iMessage conversation surface that Nex clients present to
    humans
- `container`
  - the provider-native chat identity retained as Eve metadata
- `participant set`
  - the resolved contact set for a thread

## Target-State Vocabulary Rules

1. `eve-edge` is the only Eve surface that touches `chat.db`, Messages.app, or
   private local iMessage integration points.
2. `nex-core` is the only canonical system of record for remote clients, search,
   memory, and app integrations.
3. Clients never depend on direct reachability to a macOS host.
4. Durable history enters Nex through canonical record ingest, not through
   command receipts.
5. Live state events and canonical records are different surfaces and should not
   be collapsed into one undifferentiated model.
6. One Eve connection represents one macOS user session identity surface, even
   when multiple Eve connections live on the same physical Mac.
