---
name: linkedin
description: Use the LinkedIn adapter for LinkedIn organization publishing and LinkedIn-native read workflows inside Nex.
---

# Nexus LinkedIn Adapter

Use the shared LinkedIn adapter when Nex should own LinkedIn organization access
through a durable connection and adapter-native workflows.

## Use The LinkedIn Adapter For

- publishing organization posts through Nex-managed connections
- listing administered organizations for a connected LinkedIn member
- reading LinkedIn posts, comments, and social metadata without leaking provider
  credentials into callers

## Core Rules

1. the linkedin adapter owns provider-specific API behavior and runtime
   execution
2. callers should bind through Nex-managed connections instead of carrying raw
   provider credentials
3. package-specific workflows should go through the adapter surface instead of
   ad hoc scripts or direct SDK calls
4. emitted responses should stay secret-free
5. v1 is organization-feed scoped, not LinkedIn messaging scoped

## Main Nex Surfaces

- `adapters.connections.create`, `adapters.connections.update`,
  `adapters.connections.test`, and `adapters.connections.status` for connection
  lifecycle
- `channels.send` for organization post publishing
- declared `linkedin.*` adapter-native methods for LinkedIn-specific read and
  write workflows

## Do Not Do This

- do not store provider credentials in app docs, prompts, or record payloads
- do not bypass Nex connection management with ad hoc local scripts when the
  adapter already owns the platform contract
- do not assume LinkedIn messaging is part of this adapter surface

## Recommended Workflow

1. create or update the durable shared connection for this adapter
2. test connection health before running any publish or read workflow
3. list organizations and bind the intended organization URN
4. use `channels.send` or typed LinkedIn methods through the adapter surface
