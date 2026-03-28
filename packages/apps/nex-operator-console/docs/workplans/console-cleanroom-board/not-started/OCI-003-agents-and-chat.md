# OCI-003 Agents and Chat Domain Tests

## Goal

Prove the full agent CRUD lifecycle and chat conversation management paths work
against a real runtime.

## Scope

Tests for:

- `agents.list` — returns agents array
- `agents.create` — creates an agent, returns ID
- `agents.list` (post-create) — includes the new agent
- `agents.update` — updates agent properties
- `agents.delete` — removes the agent
- `agents.list` (post-delete) — no longer includes deleted agent
- `agents.identity.get` — returns agent identity for a known agent
- `agents.files.list` — returns file list for an agent
- `agents.files.write` + `agents.files.read` — round-trip a file
- `agents.skills.status` — returns skills report
- `agents.conversations.list` — returns conversations (may be empty)
- `agents.conversations.history` — returns history for a conversation
- `agents.sessions.send` — sends a message (may fail without model provider,
  that's acceptable — test the RPC call shape, not the model response)

## Dependencies

- OCI-001 (harness and boot)

## Acceptance

1. Agent CRUD lifecycle completes without errors
2. Agent file round-trip proves write-read consistency
3. Conversations and sessions endpoints return valid shapes
4. Chat send either succeeds or fails with a model-related error (not a
   protocol or type error)

## Validation

- Create returns an agent ID
- List after create includes the agent
- List after delete excludes the agent
- File write + read returns matching content
