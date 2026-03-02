# Workspace Lifecycle Specification

**Status:** CANONICAL
**Last Updated:** 2026-02-17
**Supersedes:** Portions of `INIT_REFERENCE.md`, `BOOTSTRAP_ONBOARDING.md`, `BOOTSTRAP_FILES_REFERENCE.md`, `WORKSPACE_SYSTEM.md`
**Database Layout:** See `specs/data/DATABASE_ARCHITECTURE.md` for the canonical 7-database layout

## Purpose

Define the complete lifecycle of a Nexus workspace from creation through fully-operational state. This is the single authoritative document for:

1. What `nexus init` creates
2. What happens when the runtime starts
3. How the first conversation onboards the user (always MWP)
4. How credentials are discovered and imported
5. What automations ship by default and how they're seeded
6. What signals mark each lifecycle phase as complete

### Core Principle

A workspace goes from **zero to operational** with `nexus init` + `nexus start` + one conversation. No manual config patching, no separate CLI invocations for credentials, no seed scripts for automations. Init creates the runway, the runtime boots cleanly from it, and the first conversation bootstraps everything else through natural agent interaction.

---

## Phase 1: `nexus init`

### What It Creates

```
{workspace_root}/
├── AGENTS.md                          # Workspace behavior contract (template)
├── skills/                            # Flat skills directory (metadata tracks type)
├── home/                              # User personal workspace
└── state/
    ├── data/
    │   ├── events.db                  # Event ledger (empty, schema applied)
    │   ├── agents.db                  # Agent sessions (empty, schema applied)
    │   ├── identity.db                # Contacts, directory, entities, auth, ACL (empty, schema applied)
    │   ├── memory.db                  # Elements, sets, jobs (empty, schema applied)
    │   ├── work.db                    # Tasks, work items, workflows, sequences (empty, schema applied)
    │   ├── embeddings.db              # Semantic vector index (empty, schema applied)
    │   └── runtime.db                 # Request traces, adapters, automations, bus (empty, schema applied)
    ├── agents/
    │   └── BOOTSTRAP.md               # Permanent onboarding conversation template
    ├── user/                          # Empty — IDENTITY.md created during onboarding
    ├── credentials/                   # Empty — populated during credential sync/scan
    ├── workspace/                     # Empty — automation workspaces created at runtime
    └── config.json                    # Seed config with generated auth token
```

### Design Decisions

**7 DBs are created eagerly.** Init owns the workspace shape. The runtime owns schemas and migrations, but the files themselves exist from init so the workspace is a complete artifact on disk. Init applies the current schema version to each of the 7 databases (events.db, agents.db, identity.db, memory.db, work.db, embeddings.db, runtime.db). See `specs/data/DATABASE_ARCHITECTURE.md` for the canonical database inventory.

**Auth token is generated.** Setting `auth.mode: "token"` without a token value creates a workspace that cannot boot an authenticated runtime without manual intervention. Init generates a token via `crypto.randomBytes(24).toString('hex')` and writes it into config.

**No `runtime.mode` field.** "Local" vs "remote" is a deployment concern. The runtime infers local mode from `bind: loopback`. If you're loopback, you're local.

**`skills/` is flat.** No `tools/`, `connectors/`, `guides/` subdirectories. Internal metadata on each skill tracks its type. This follows the agent skills standard.

**`BOOTSTRAP.md` is permanent.** It is never deleted. It serves as the reusable template for creating new agent personas at any time. Bootstrap detection uses a different signal (see Phase 3).

**`state/workspace/` is for automation workspaces.** Not for agent persona files. Meeseeks-pattern automations (memory-injection, memory-writer, etc.) get their own subdirectory here. See "Directory Concepts" below.

### Default Config

```json
{
  "runtime": {
    "port": 18789,
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "<generated-hex-token>"
    }
  }
}
```

### Idempotency

Running `nexus init` twice is safe. It creates missing paths and files without overwriting existing ones. DB files are not recreated if they already exist.

---

## Phase 2: Runtime Boot (`nexus start`)

### Startup Sequence

1. **Read config** — `state/config.json`
2. **Open/migrate DBs** — Run schema migrations on all 7 databases (events.db, agents.db, identity.db, memory.db, work.db, embeddings.db, runtime.db). Runtime owns migration logic.
3. **Auto-sync external CLI credentials** — Import provider credentials from Claude CLI, Codex CLI, Qwen CLI via keychain/file pointers. Uses 15-minute TTL cache. This is critical: the system cannot have a conversation without a provider.
4. **Seed owner entity** — Insert a placeholder owner entity in identity.db (`type: "person"`, `name: "Owner"`). Enriched with real details by the memory-writer during conversation.
5. **Seed default automations** — Check the automations table for canonical shipped automations. Insert missing ones. Create workspace directories under `state/workspace/` with seed files. See Phase 5 for details.
6. **Start HTTP/WS server** — Bind to configured port with token auth.
7. **Start adapter manager** — Adapters only. No legacy channels, gmail-watcher, or cron.
8. **Load registered automations** — Read active automations from the automations table, prepare hook point runner.
9. **Report healthy** — `/health` returns 200.

### External CLI Credential Sync

Runs on every daemon startup (subject to 15-min TTL cache). Sources:

| CLI | Keychain Entry | File Fallback |
|-----|---------------|---------------|
| Claude Code | `Claude Code-credentials` | `~/.claude/.credentials.json` |
| Codex | `Codex Auth` | `$CODEX_HOME/auth.json` |
| Qwen | — | `~/.qwen/oauth_creds.json` |

Sync creates external storage pointers — no plaintext secrets are copied. The pointer references the source location and refreshes on access.

### No Manual Patching Required

After `nexus init`, the runtime boots cleanly:

```bash
nexus init --workspace /tmp/test-workspace
nexus start --workspace /tmp/test-workspace
# No config patching. Token is in config.json. Port is in config.json.
```

The only override a test harness might need is `--port` (to avoid conflicts).

---

## Phase 3: Onboarding Conversation (Always MWP)

### No Unified Mode

The system starts in **MWP mode from the very first message**. There is no unified mode fallback. The MA operates without a persona — it still gets:

- `AGENTS.md` (workspace rules)
- Broker role instructions ("You are the user-facing manager agent...")
- Its restricted MWP toolset (`agent_send`, `wait`, `read`, `write`, `edit`, etc.)

The MA works fine without a persona. Identity/soul sections in the system prompt are simply empty until the persona is created. This is intentional — unified mode was a crutch that hid MWP bugs.

### Bootstrap Detection

```typescript
function needsBootstrap(stateDir: string): boolean {
  const agentsDir = path.join(stateDir, 'agents');
  const entries = fs.readdirSync(agentsDir);
  const agentDirs = entries.filter(e =>
    fs.statSync(path.join(agentsDir, e)).isDirectory()
  );
  return agentDirs.length === 0;
}
```

**Signal:** `state/agents/` contains no subdirectories (only the `BOOTSTRAP.md` file). This means no agent persona has been created yet.

**`BOOTSTRAP.md` is never deleted.** It is a permanent template. If the user wants to create a second agent persona later, the template is still there.

### Onboarding Context Injection

When `assembleContext` detects `needsBootstrap() === true`, it reads `state/agents/BOOTSTRAP.md` and appends its contents to the MA's system prompt as an `## Onboarding` section.

```typescript
// In assembleContext.ts, during system prompt construction
const needsBootstrap = !hasAgentPersonaDirs(stateDir);
if (needsBootstrap) {
  const bootstrapContent = fs.readFileSync(
    path.join(stateDir, 'agents/BOOTSTRAP.md'), 'utf8'
  );
  systemPromptSections.push(`## Onboarding\n${bootstrapContent}`);
}
```

The `BOOTSTRAP.md` template instructs the MA to:

1. **Talk to the user** — establish the agent's name, personality, and user preferences.
2. **Dispatch workers in parallel:**
   - Worker A: Run `nexus credential scan` and report findings.
   - Worker B: Run the filesystem scan skill if available.
3. **Dispatch a worker to write identity files** once enough info is gathered:
   - `state/agents/{name}/IDENTITY.md` — agent identity
   - `state/agents/{name}/SOUL.md` — agent persona, boundaries, values
   - `state/user/IDENTITY.md` — user profile and preferences
4. **Present credential scan results** to the user and ask for confirmation on imports.

### Completion Signal

Onboarding is complete when at least one directory exists in `state/agents/` containing an `IDENTITY.md` file.

```typescript
function isOnboarded(stateDir: string): boolean {
  const agentsDir = path.join(stateDir, 'agents');
  const entries = fs.readdirSync(agentsDir);
  return entries.some(e => {
    const dir = path.join(agentsDir, e);
    return fs.statSync(dir).isDirectory()
      && fs.existsSync(path.join(dir, 'IDENTITY.md'));
  });
}
```

On the next `chat.send`, `assembleContext` sees that a persona exists, does NOT inject onboarding instructions, and loads the persona's `IDENTITY.md` and `SOUL.md` into the MA's system prompt. Normal MWP operation begins.

### Entity Seeding

The runtime seeds a placeholder owner entity in identity.db at startup (Phase 2). During onboarding, as the agent learns the user's name and preferences, the **memory-writer automation** naturally observes these details and enriches the owner entity with real data. The agent persona entity is also created by the memory-writer when it observes the identity conversation.

No special seeding logic is needed beyond the initial owner placeholder — the memory system handles enrichment from conversation.

---

## Phase 4: Credential Scan (Agent-Driven, During Onboarding)

Credential discovery happens in two stages:

### Stage 1: External CLI Auto-Sync (Runtime Startup)

Handled automatically at daemon startup (Phase 2). Imports provider credentials from Claude CLI, Codex CLI, Qwen CLI. No user interaction needed. This gives the system the LLM provider credentials required for the first conversation.

### Stage 2: Environment Scan (Agent-Driven, During Onboarding)

The `BOOTSTRAP.md` onboarding instructions tell the MA to dispatch a worker that runs `nexus credential scan`. This discovers environment variable credentials (GITHUB_TOKEN, BRAVE_SEARCH_API_KEY, etc.).

The worker returns findings to the MA, which presents them to the user:

> "I found ANTHROPIC_API_KEY and GITHUB_TOKEN in your environment. Want me to import them?"

On confirmation, the MA dispatches a worker to run `nexus credential scan --import`.

### Post-Onboarding Follow-Up

If `state/credentials/` is still empty after onboarding (e.g., user declined or scan found nothing), subsequent `assembleContext` calls can inject a lightweight reminder:

```
[System: Credential scan has not been completed. Consider dispatching a worker to run `nexus credential scan`.]
```

This is a one-time conditional context injection in `assembleContext`, not an automation or hook.

---

## Phase 5: Default Shipped Automations

### What Ships

| Automation | Hook Point | Blocking | Timeout | Workspace |
|-----------|-----------|----------|---------|-----------|
| `memory-injection` | `worker:pre_execution` | Yes | 10s | `state/workspace/memory-injection/` |
| `memory-writer` | `episode-created` | No (async) | 30s | `state/workspace/memory-writer/` |
| `command-logger` | `command:execute` | No (async) | — | — |
| `boot-md` | `runtime:startup` | No (async) | — | — |

### Memory Injection

Fires before every worker execution. Searches memory (via recall against memory.db + embeddings.db) for context relevant to the worker's task. Returns enrichment that gets injected into the worker's assembled context.

- Hook: `worker:pre_execution`
- Blocking: yes — the worker waits for memory context
- Timeout: 10s (latency-sensitive)
- Workspace: `state/workspace/memory-injection/` with `ROLE.md`, `SKILLS.md`, `PATTERNS.md`, `ERRORS.md`, `skills/memory/`

### Memory Writer

Fires when an episode clips (token budget exceeded or 90-minute silence timer). Extracts facts and entities from the episode's events. Writes to memory.db (elements, sets, jobs) + identity.db (entities) + embeddings.db (vectors) asynchronously.

- Hook: `episode-created`
- Blocking: no — fire-and-forget
- Timeout: 30s (background, has time)
- Workspace: `state/workspace/memory-writer/` with same structure

### Memory Injection/Writer Collaboration

These two automations are linked by peer workspaces. Each can read the other's workspace files:

```
state/workspace/
├── memory-injection/
│   ├── ROLE.md
│   ├── SKILLS.md              ← writer reads to understand entity patterns
│   ├── PATTERNS.md
│   ├── ERRORS.md              ← writer reads to learn what searches fail
│   ├── NOTES_FOR_WRITER.md    ← injection leaves notes
│   └── skills/memory/
│       ├── SCHEMA.md
│       ├── QUERIES.md
│       ├── memory-search.sh
│       ├── memory-write.sh
│       └── DB_PATHS
├── memory-writer/
│   ├── ROLE.md
│   ├── SKILLS.md
│   ├── PATTERNS.md
│   ├── ERRORS.md
│   ├── NOTES_FOR_INJECTION.md ← writer leaves notes
│   └── skills/memory/...
└── {future-automation}/        ← new automation workspaces go here
```

Self-improvement is enabled for both — after each invocation, a reflection turn updates SKILLS.md, PATTERNS.md, and ERRORS.md in their workspace. They evolve independently but stay aware of each other through peer access.

### Command Logger

Logs commands that the agent executes. Fires on `command:execute` events. Useful audit trail. No workspace needed.

### Boot-MD

If a `BOOT.md` file exists in the workspace root, dispatches its contents as a chat event on daemon startup. Useful for "always check my calendar on startup" patterns. No workspace needed. The file is optional — if it doesn't exist, this automation is a no-op.

### Dropped (Not Shipped)

- **session-memory** — Replaced by the memory-injection/writer system.
- **soul-evil** — Not shipping.

### How Automations Are Seeded

At runtime startup (Phase 2, step 5), the **automation seeder** runs:

1. Reads the bundled automation definitions from `nex/src/nex/automations/bundled/`.
2. For each bundled automation, checks if a matching row exists in the `automations` table.
3. If missing, inserts the row with default config.
4. For automations with `workspace_dir`, creates the directory and populates seed files (ROLE.md, SKILLS.md, PATTERNS.md, ERRORS.md, skills/) if they don't exist.
5. Idempotent — running twice is safe.

### Bundled Automations Code Location

```
nex/src/nex/automations/
├── services.ts                        # LedgerClient, MemoryClient, LLMClient
├── hooks-runtime.ts                   # Hook point runner (evaluateAutomationsAtHook)
├── hooks-runtime.hookpoints.test.ts
├── cli.ts                             # Automation management CLI
└── bundled/                           # ALL shipped automations
    ├── memory-injection/
    │   ├── automation.ts              # Handler implementation
    │   ├── automation.test.ts
    │   └── seed/                      # Seed files for workspace
    │       ├── ROLE.md
    │       ├── SKILLS.md
    │       ├── PATTERNS.md
    │       ├── ERRORS.md
    │       └── skills/memory/...
    ├── memory-writer/
    │   ├── automation.ts
    │   ├── automation.test.ts
    │   └── seed/...
    ├── command-logger/
    │   └── automation.ts
    └── boot-md/
        └── automation.ts
```

---

## Directory Concepts

Two directory structures serve different purposes. They are hierarchical, not interchangeable.

### Agent Personas (`state/agents/{name}/`)

Agent personas define **who the agent is**. Identity, personality, values, boundaries.

```
state/agents/
├── BOOTSTRAP.md                       # Permanent onboarding template
└── echo/                              # Agent persona "Echo"
    ├── IDENTITY.md                    # Who I am, what I do
    └── SOUL.md                        # Personality, boundaries, values
```

- Created during onboarding conversation
- One directory per named agent persona (Echo, Atlas, etc.)
- Applied as the "who am I" layer during context assembly
- Read into the system prompt as `## Agent Identity` and `## Agent Soul`

### Automation Workspaces (`state/workspace/{name}/`)

Automation workspaces are **accumulated knowledge stores** for a specific function/role. They are the working directories for meeseeks-pattern automations.

```
state/workspace/
├── memory-injection/                  # Memory search specialist
│   ├── ROLE.md                        # Role instructions
│   ├── SKILLS.md                      # Accumulated skills (self-improving)
│   ├── PATTERNS.md                    # Common patterns (self-improving)
│   ├── ERRORS.md                      # Known failure modes (self-improving)
│   └── skills/                        # Skill files, scripts, schemas
└── memory-writer/                     # Memory extraction specialist
    └── ...
```

- Created by the automation seeder at runtime startup
- One directory per automation that has `workspace_dir` set
- Agent personas are applied ON TOP of these workspaces — Echo (a persona) might be the identity applied to a memory-injection execution. The persona says "who I am," the workspace says "what I know about this job."
- Self-improvement updates these files over time

### The Relationship

```
Agent Persona (state/agents/echo/)
  = "I am Echo, a helpful assistant who values precision"

Automation Workspace (state/workspace/memory-injection/)
  = "I know how to search memory, these queries work well, these patterns fail"

During execution:
  system_prompt = persona.IDENTITY + persona.SOUL + workspace.ROLE + workspace.SKILLS
```

---

## Lifecycle State Machine

```
                    ┌──────────────────┐
                    │   nexus init     │
                    │                  │
                    │  Creates dirs,   │
                    │  DBs, config,    │
                    │  BOOTSTRAP.md    │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │   nexus start    │
                    │                  │
                    │  Migrate DBs     │
                    │  Sync CLI creds  │
                    │  Seed owner      │
                    │  Seed automations│
                    │  /health → 200   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  First chat.send │
                    │  (MWP mode)      │
                    │                  │
                    │  Bootstrap       │◄── needsBootstrap() === true
                    │  detected →      │    (no agent persona dirs)
                    │  BOOTSTRAP.md    │
                    │  injected into   │
                    │  MA context      │
                    │                  │
                    │  MA dispatches:  │
                    │  • Identity conv │
                    │  • Cred scan     │
                    │  • FS scan       │
                    │                  │
                    │  Writes:         │
                    │  agents/{name}/  │
                    │  user/IDENTITY   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  Subsequent      │
                    │  chat.send       │
                    │  (MWP mode)      │◄── isOnboarded() === true
                    │                  │    (agent persona dir exists)
                    │  Normal MA/WA    │
                    │  Memory R/W      │
                    │  fires at hooks  │
                    │                  │
                    │  Fully           │
                    │  operational     │
                    └──────────────────┘
```

---

## E2E Harness Assertions

This section defines what the E2E harness should validate at each lifecycle phase.

### After `nexus init`

- Directory structure exists as specified above
- `state/config.json` exists with `runtime.port`, `runtime.bind: "loopback"`, `runtime.auth.mode: "token"`, `runtime.auth.token` (non-empty string)
- All 7 DB files exist: `events.db`, `agents.db`, `identity.db`, `memory.db`, `work.db`, `embeddings.db`, `runtime.db`
- `state/agents/BOOTSTRAP.md` exists and is non-empty
- `AGENTS.md` exists at workspace root
- `skills/` directory exists (empty)
- `state/workspace/` directory exists (empty)
- `state/user/` directory exists (empty)
- `state/credentials/` directory exists (empty)

### After `nexus start` + `/health` 200

- External CLI credentials synced (at least one provider credential exists if Claude CLI / env vars are available)
- Owner entity exists in identity.db
- Automations table has rows for: `memory-injection`, `memory-writer`, `command-logger`, `boot-md`
- `state/workspace/memory-injection/` exists with seed files
- `state/workspace/memory-writer/` exists with seed files

### After Onboarding Conversation

- At least one directory exists in `state/agents/` (e.g., `state/agents/echo/`)
- That directory contains `IDENTITY.md` (non-empty, non-template)
- That directory contains `SOUL.md` (non-empty, non-template)
- `state/user/IDENTITY.md` exists (non-empty, non-template)
- `state/agents/BOOTSTRAP.md` still exists (was NOT deleted)
- Credential scan was executed (check `nexus_requests` for a credential scan trace)
- `needsBootstrap()` now returns `false`
- `isOnboarded()` now returns `true`

### After Post-Onboarding MWP Turn

- MA dispatched >= 1 worker via `agent_send op=dispatch`
- Worker turn recorded in agents ledger
- Memory-injection fired at `worker:pre_execution` (check automation invocation records)
- Memory-writer fired at `episode-created` (check automation invocation records)
- MA produced a user-facing response

---

## Code Changes Required

### `nex/src/commands/init.ts`

- Create all 7 DBs eagerly (events.db, agents.db, identity.db, memory.db, work.db, embeddings.db, runtime.db) with current schema
- Generate `runtime.auth.token` via `crypto.randomBytes(24).toString('hex')`
- Remove `runtime.mode` from default config
- Change `skills/` to flat directory (remove `tools/`, `connectors/`, `guides/` subdirs)
- Move config to `state/config.json` (not `state/nexus/config.json`)
- Create `state/workspace/` directory (empty)
- Ensure `BOOTSTRAP.md` goes to `state/agents/BOOTSTRAP.md`

### `nex/src/nex/stages/assembleContext.ts`

- Replace `shouldForceUnifiedRoleForBootstrap()` with `needsBootstrap()` — check for agent persona dirs, not `BOOTSTRAP.md` presence
- When `needsBootstrap()` is true: read `state/agents/BOOTSTRAP.md` content, append as `## Onboarding` section to MA system prompt
- Remove all unified-mode-forcing logic — system is always MWP
- Add conditional credential scan reminder when `state/credentials/` is empty and onboarding is complete

### `nex/src/nex/control-plane/server-startup.ts`

- Add external CLI credential sync step (early, before `/health`)
- Add owner entity seeding in identity.db
- Add automation seeder step (read bundled definitions, ensure rows exist, create workspace dirs)
- Remove legacy channel start (`startChannels`)
- Remove gmail watcher start
- Remove cron server start

### `nex/src/nex/automations/bundled/`

- Create this directory structure with all shipped automations
- Move `memory-injection` and `memory-writer` from `meeseeks/` to `bundled/`
- Add `command-logger` (migrated from `hooks/bundled/`)
- Add `boot-md` (migrated from `hooks/bundled/`)
- Remove `session-memory` (replaced by memory system)
- Remove `soul-evil` (not shipping)
- Each automation has handler code + seed files for workspace

### `state/agents/BOOTSTRAP.md` (template)

- Write the onboarding conversation template that instructs the MA to:
  1. Establish agent identity and user preferences
  2. Dispatch credential scan worker
  3. Dispatch filesystem scan worker (if skill available)
  4. Write identity files to canonical paths
  5. Present findings and get user confirmation

---

## Related Documents

- `specs/environment/foundation/WORKSPACE_SYSTEM.md` — Canonical workspace layout (to be updated)
- `specs/environment/foundation/INIT_REFERENCE.md` — Init command reference (to be updated)
- `specs/environment/foundation/BOOTSTRAP_ONBOARDING.md` — Onboarding flow (to be updated)
- `specs/environment/foundation/BOOTSTRAP_FILES_REFERENCE.md` — Bootstrap file catalog (to be updated)
- `specs/environment/capabilities/credentials/CREDENTIAL_SYSTEM.md` — Credential system
- `specs/runtime/broker/MEESEEKS_PATTERN.md` — Meeseeks automation pattern
- `specs/runtime/broker/CONTEXT_ASSEMBLY.md` — Context assembly for MWP
- `specs/data/DATABASE_ARCHITECTURE.md` — Canonical 7-database layout
- `specs/data/memory/MEMORY_SYSTEM.md` — Memory system architecture
- `specs/environment/foundation/harnesses/LIVE_E2E_HARNESS.md` — E2E harness workplan
