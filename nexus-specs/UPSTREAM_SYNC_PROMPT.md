# Upstream Sync Prompt

Use this prompt to spawn agents that analyze upstream OpenClaw code and document behavior.

---

## Phased Approach

### Phase 1: High-Level Overview (Do First, Together)

Before dispatching subagents, complete `specs/upstream/`:
- `ARCHITECTURE.md` — How OpenClaw is organized
- `DATA_FLOW.md` — Event lifecycle through the system
- `KEY_CONCEPTS.md` — Core abstractions and patterns

This requires broad exploration and is best done with a main agent or together.

### Phase 2: Domain Deep Dives (Can Dispatch to Subagents)

Once the overview exists, use domain-specific prompts below to populate:
- `specs/runtime/broker/upstream/`
- `specs/runtime/nex/upstream/`
- `specs/runtime/adapters/upstream/`
- etc.

### Phase 3: Synthesis (Do Last, Together)

Complete `specs/upstream/NEXUS_COMPARISON.md` — mapping OpenClaw → Nexus with rationale. This becomes the teardown blog source.

---

## Domain-Specific Prompts

Copy and customize for Phase 2 deep dives:

```
## Task: Document Upstream Behavior for {DOMAIN}

You are analyzing the OpenClaw codebase to document how it handles {DOMAIN_DESCRIPTION}.

### Context

- **Upstream repo:** `~/nexus/home/projects/openclaw/`
- **Output location:** `~/nexus/home/projects/nexus/nexus-specs/specs/{SPEC_PATH}/upstream/`
- **Nexus spec to compare:** `~/nexus/home/projects/nexus/nexus-specs/specs/{SPEC_PATH}/`

### Your Task

1. **Explore the upstream codebase** to understand how {DOMAIN} works:
   - Start with {STARTING_POINTS}
   - Look for key types, interfaces, and data flows
   - Note any configuration or extension points

2. **Create documentation** in the upstream folder:
   - Document the current upstream behavior objectively
   - Include code references (file paths, line numbers)
   - Note any edge cases or interesting patterns

3. **Do NOT modify** the Nexus specs — just document upstream behavior.

### Output Format

Create markdown files like:
- `UPSTREAM_{TOPIC}.md` — Main documentation
- Include code snippets with file paths
- Use tables to summarize structures
- Note version/commit if relevant

### Questions to Answer

- How does upstream handle {SPECIFIC_QUESTION_1}?
- What data structures are used for {SPECIFIC_QUESTION_2}?
- How does this compare to what Nexus specs describe?
- Are there patterns we should adopt or explicitly avoid?
```

---

## Domain-Specific Prompts

### Broker / Agent System

```
## Task: Document Upstream Behavior for Agent System

You are analyzing the OpenClaw codebase to document how it handles agent sessions, turns, and execution.

### Context

- **Upstream repo:** `~/nexus/home/projects/openclaw/`
- **Output location:** `~/nexus/home/projects/nexus/nexus-specs/specs/runtime/broker/upstream/`
- **Nexus spec to compare:** `~/nexus/home/projects/nexus/nexus-specs/specs/runtime/broker/`

### Your Task

1. **Explore the upstream codebase** to understand how agents work:
   - Start with `packages/core/src/session/`, `packages/core/src/agent/`
   - Look for session management, turn handling, context assembly
   - Note streaming, compaction, forking patterns

2. **Create/update documentation** in the upstream folder

3. **Do NOT modify** the Nexus specs

### Questions to Answer

- How are sessions created and managed?
- How is context assembled before agent execution?
- How does streaming work (agent → output)?
- How does compaction/summarization work?
- How are tool calls tracked and persisted?
```

---

### NEX / Event Pipeline

```
## Task: Document Upstream Behavior for Event Pipeline

You are analyzing the OpenClaw codebase to document how it handles event processing and plugins.

### Context

- **Upstream repo:** `~/nexus/home/projects/openclaw/`
- **Output location:** `~/nexus/home/projects/nexus/nexus-specs/specs/runtime/nex/upstream/`
- **Nexus spec to compare:** `~/nexus/home/projects/nexus/nexus-specs/specs/runtime/nex/`

### Your Task

1. **Explore the upstream codebase**:
   - Start with `packages/core/src/plugin/`, `packages/core/src/hooks/`
   - Look for event handling, plugin lifecycle, hook points
   - Note how events flow from input to output

2. **Create/update documentation** in the upstream folder

3. **Do NOT modify** the Nexus specs

### Questions to Answer

- What is the event/request lifecycle?
- What hook points exist and when do they fire?
- How do plugins register and execute?
- What data is available at each stage?
```

---

### IAM / Access Control

```
## Task: Document Upstream Behavior for Access Control

You are analyzing the OpenClaw codebase to document how it handles permissions and access control.

### Context

- **Upstream repo:** `~/nexus/home/projects/openclaw/`
- **Output location:** `~/nexus/home/projects/nexus/nexus-specs/specs/runtime/iam/upstream/`
- **Nexus spec to compare:** `~/nexus/home/projects/nexus/nexus-specs/specs/runtime/iam/`

### Your Task

1. **Explore the upstream codebase**:
   - Start with `packages/core/src/permissions/`, tool permission checks
   - Look for how sender identity affects what's allowed
   - Note per-call vs upfront permission patterns

2. **Create/update documentation** in the upstream folder

3. **Do NOT modify** the Nexus specs

### Questions to Answer

- How are permissions checked (per-call vs upfront)?
- How is sender identity determined?
- What tools/actions can be restricted?
- How does this differ from Nexus's declarative IAM?
```

---

### Adapters / Channels

```
## Task: Document Upstream Behavior for Adapters

You are analyzing the OpenClaw codebase to document how it handles external platform integrations.

### Context

- **Upstream repo:** `~/nexus/home/projects/openclaw/`
- **Output location:** `~/nexus/home/projects/nexus/nexus-specs/specs/runtime/adapters/upstream/`
- **Nexus spec to compare:** `~/nexus/home/projects/nexus/nexus-specs/specs/runtime/adapters/`

### Your Task

1. **Explore the upstream codebase**:
   - Start with `packages/telegram/`, `packages/discord/`, `packages/slack/`
   - Look for inbound event handling and outbound message sending
   - Note formatting, chunking, platform-specific logic

2. **Create/update documentation** in the upstream folder

3. **Do NOT modify** the Nexus specs

### Questions to Answer

- How do adapters receive and normalize events?
- How are responses formatted and chunked?
- What platform-specific handling exists?
- How are external tools (eve, gog) integrated?
```

---

### Data / Sessions & Storage

```
## Task: Document Upstream Behavior for Data Storage

You are analyzing the OpenClaw codebase to document how it stores sessions and data.

### Context

- **Upstream repo:** `~/nexus/home/projects/openclaw/`
- **Output location:** `~/nexus/home/projects/nexus/nexus-specs/specs/data/ledgers/upstream/`
- **Nexus spec to compare:** `~/nexus/home/projects/nexus/nexus-specs/specs/data/ledgers/`

### Your Task

1. **Explore the upstream codebase**:
   - Start with `packages/core/src/session/`
   - Look for JSONL file handling, sessions.json index
   - Note how messages, turns, and tool calls are stored

2. **Create/update documentation** in the upstream folder

3. **Do NOT modify** the Nexus specs

### Questions to Answer

- What is the JSONL transcript format?
- How is sessions.json structured?
- How are tool calls and results stored?
- How does compaction affect stored data?
- What are the limitations Nexus's SQLite approach solves?
```

---

### Cortex / Memory

```
## Task: Document Upstream Behavior for Memory System

You are analyzing the OpenClaw codebase to document how it handles memory and context retrieval.

### Context

- **Upstream repo:** `~/nexus/home/projects/openclaw/`
- **Output location:** `~/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/upstream/`
- **Nexus spec to compare:** `~/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/`

### Your Task

1. **Explore the upstream codebase**:
   - Start with `packages/core/src/memory/`
   - Look for MEMORY.md handling, vector search, BM25
   - Note indexing, retrieval, and injection patterns

2. **Create/update documentation** in the upstream folder

3. **Do NOT modify** the Nexus specs

### Questions to Answer

- How does the memory system work?
- What gets indexed (files, sessions, both)?
- How is relevant context retrieved?
- How does this compare to Nexus's Cortex design?
```

---

### Environment / Workspace

```
## Task: Document Upstream Behavior for Workspace

You are analyzing the OpenClaw codebase to document workspace structure and initialization.

### Context

- **Upstream repo:** `~/nexus/home/projects/openclaw/`
- **Output location:** `~/nexus/home/projects/nexus/nexus-specs/specs/environment/foundation/upstream/`
- **Nexus spec to compare:** `~/nexus/home/projects/nexus/nexus-specs/specs/environment/foundation/`

### Your Task

1. **Explore the upstream codebase**:
   - Start with workspace initialization, config files
   - Look for CLAUDE.md, hooks, settings patterns
   - Note how context is injected at session start

2. **Create/update documentation** in the upstream folder

3. **Do NOT modify** the Nexus specs

### Questions to Answer

- What files are created on init?
- How is context injected into agent sessions?
- What hooks/lifecycle events exist?
- How do different harnesses (Cursor, Claude Code) differ?
```

---

### Project Structure

```
## Task: Document Upstream Project Structure

You are analyzing the OpenClaw codebase to document its monorepo organization.

### Context

- **Upstream repo:** `~/nexus/home/projects/openclaw/`
- **Output location:** `~/nexus/home/projects/nexus/nexus-specs/specs/project-structure/upstream/`
- **Nexus spec to compare:** `~/nexus/home/projects/nexus/nexus-specs/specs/project-structure/`

### Your Task

1. **Explore the upstream codebase**:
   - Start with root `packages/`, `turbo.json`, build config
   - Look for package dependencies and boundaries
   - Note shared code patterns and module organization

2. **Create/update documentation** in the upstream folder

3. **Do NOT modify** the Nexus specs

### Questions to Answer

- How is the monorepo structured?
- What does each package do?
- How do packages depend on each other?
- What build tooling is used?
```

---

## Running the Sync

1. Pick a domain from above
2. Copy the prompt
3. Spawn an agent with readonly access
4. Review the documentation it creates
5. Use insights to refine Nexus specs

---

*This file provides prompts for systematically documenting upstream behavior.*
