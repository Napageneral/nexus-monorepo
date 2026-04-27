# OCH-003 Lane Directory, Hierarchy, And Conversation Scope Synthesis

## Goal

Synthesize the canonical lane model from existing Nex primitives.

## Why

The operator chat product is lane-based, not project-based or thread-based.
Nex needs one coherent read model for top-level manager lanes, worker lanes,
and linked public conversation context before snapshot reads can be truthful.

## Scope

- derive top-level lanes from the Nex agent directory
- derive worker-lane hierarchy from child-session and worker continuity
- derive lane-to-session binding rules
- derive conversation-scope grouping from conversations, records, and canonical
  identity resolution
- derive available delivery targets for lane continuation
- keep `conversation_scope_id` as a projection/read-model concept rather than a
  raw-record identifier

## Acceptance

- the runtime can derive a stable lane directory for the operator
- manager and worker lanes are represented truthfully
- linked public conversation context can be grouped into one lane-facing
  conversation scope
- raw records stay linked to canonical conversation ids instead of to
  conversation-scope ids
- delivery targets can be resolved without inventing a separate non-Nex routing
  model

## Completed Work

- added a Nex-owned chat projection synthesizer that derives top-level agent
  lanes from the runtime agent directory plus active top-level sessions
- derived worker-session lane hierarchy from `parent_session_id` continuity in
  `agents.db`
- derived agent-scoped `conversation_scope_id` values as projection-only read
  model fields
- linked lane-facing public conversation context from canonical conversation ids
  and `records.db` history without introducing any `conversation_scope_id`
  storage into raw records
- derived selected delivery targets from existing session routing metadata and
  stored them in the durable chat projection

## Validation

- `pnpm exec vitest run src/api/server-methods/chat.test.ts src/storage/agents.schema-cutover.test.ts src/storage/agents.chat-projection.test.ts`

## Notes

- the current synthesis chooses one top-level lane per agent and one worker lane
  per worker session, with worker lanes nested under the resolved parent lane
- lane synthesis is currently refreshed on `chat.snapshot` / `chat.replay`;
  later tickets can move the same projection updater behind live runtime
  normalizers without changing the contract
