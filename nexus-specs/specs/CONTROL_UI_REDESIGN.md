# Control UI Redesign — Graph-Navigable Workspace

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-26
**Related:** `DATABASE_ARCHITECTURE.md`, `ENTITY_ACTIVITY_DASHBOARD.md`, `nex/workplans/COMMAND_CENTER.md`, `nex/UNIFIED_RUNTIME_OPERATION_MODEL.md`

---

## 1. Overview

The Nex Control UI is being redesigned from the ground up to align with the new Nex data model. The legacy OpenClaw UI had 14 tabs organized around implementation concerns. The new UI has **7 tabs** organized around user intent, with a **graph-navigable** detail view system that lets you enter from any object and traverse relationships naturally.

### Design Principles

1. **Graph navigation, not tab silos.** Every object detail view shows related objects from other domains. Every related object is clickable, navigating to its own detail view. The tabs are entry points, not boundaries.
2. **Composable widgets.** A `<facts-table>` widget works the same whether embedded in an Entity detail (pre-filtered to that entity) or on the Memory tab (global search). ~12 composable widgets cover all object types.
3. **Collection + Detail pattern.** Each tab shows a collection view (filterable list/table). Clicking any item opens a detail view with related-object widgets. Breadcrumbs track traversal depth.
4. **User intent drives navigation.** Tabs are named for what you're trying to do, not what database you're querying.

---

## 2. Tab Structure

### 2.1 Seven Tabs

| # | Tab | Icon | Path | One-liner |
|---|---|---|---|---|
| 1 | **Command Center** | `terminal` | `/command-center` | Agent conversations, AIX imports, active coding work |
| 2 | **Agents** | `bot` | `/agents` | Agent entities, persona folders, platform accounts, skills |
| 3 | **Directory** | `users` | `/directory` | Everyone the system knows — entities, contacts, platform directory |
| 4 | **Access** | `shield` | `/access` | IAM — roles, groups, grants, policies, pending requests, audit log |
| 5 | **Adapters** | `plug` | `/adapters` | Platform connections, health, credential/secret setup |
| 6 | **Memory** | `brain` | `/memory` | Search facts, observations, mental models, episodes, events |
| 7 | **Automations** | `zap` | `/automations` | Hooks, triggers, cron jobs, meeseeks automation configs |

### 2.2 System Menu (Gear Icon, Not a Tab)

Accessed via a gear icon in the nav chrome. Contains:

- **Overview** — Runtime health, version, uptime, update availability, error summary
- **Config** — Edit `nexus.json` (form + raw modes)
- **Logs** — Live tail of runtime logs with level/subsystem filters
- **Debug** — Runtime snapshots, manual RPC calls, heartbeat status
- **Usage** — Cost tracking, token usage, model usage analytics

### 2.3 Legacy Tab Mapping

| Old Tab | New Location | Notes |
|---|---|---|
| `chat` | **Command Center** | Upgraded to full session browser + chat |
| `overview` | **System > Overview** | Runtime health moves to system menu |
| `approvals` | **Access > Pending Requests** | Sub-view of Access tab |
| `channels` | **Adapters** | Renamed; adapter-centric now |
| `integrations` | **Adapters** | Merged with channels into unified adapter view |
| `instances` | **System > Overview** | Presence beacons in overview health |
| `sessions` | **Command Center** | Session list is now part of command center |
| `memory` | **Memory** | Expanded to include events |
| `usage` | **System > Usage** | Moves to system menu |
| `cron` | **Automations** | Sub-view of automations |
| `agents` | **Agents** | Kept, now entity+persona focused |
| `skills` | **Agents > Skills** | Sub-view per agent |
| `nodes` | **Removed** | Legacy concept; device pairing absorbed into adapters |
| `config` | **System > Config** | Moves to system menu |
| `debug` | **System > Debug** | Moves to system menu |
| `logs` | **System > Logs** | Moves to system menu |

---

## 3. Data Model — Object Types

These are the first-class objects in the UI. Each has a collection view and a detail view.

### 3.1 Entity

**Source:** `identity.db` — `entities` table
**The gravitational center of the system.** Almost everything connects back to entities.

| Field | Type | Notes |
|---|---|---|
| `id` | string | ULID, globally unique |
| `name` | string | Display name |
| `type` | string | `person`, `org`, `agent`, `system`, `concept` |
| `merged_into` | string? | Union-find chain for entity merging |
| `normalized` | string | Normalized name for dedup |
| `is_user` | boolean | Whether this entity is the system owner |
| `persona_path` | string? | Filesystem path to persona folder (agent entities only) |
| `source` | string | How entity was created (`bootstrap`, `extraction`, `manual`, `import`) |
| `mention_count` | number | Total mentions across all sources |
| `first_seen` | number | Unix ms |
| `last_seen` | number | Unix ms |
| `created_at` | number | Unix ms |
| `updated_at` | number | Unix ms |

**Related objects (shown in detail view):**
- Contacts (via `contacts.entity_id`)
- Grants/Access (via `grants` scoped to entity)
- Facts (via `fact_entities.entity_id`)
- Observations (via `observations` referencing entity facts)
- Mental Models (via `mental_models.entity_id`)
- Sessions (via session keys containing entity id)
- Events (via `event_participants.entity_id`)
- Entity Tags (via `entity_tags.entity_id`)
- Co-occurrences (via `entity_cooccurrences`)

### 3.2 Contact

**Source:** `identity.db` — `contacts` table
**Maps platform identifiers to entities.** Used for both sender AND receiver identity resolution (symmetric).

| Field | Type | Notes |
|---|---|---|
| `platform` | string | `imessage`, `discord`, `email`, `slack`, etc. |
| `space_id` | string | Server/workspace scope |
| `sender_id` | string | Platform-specific identifier |
| `entity_id` | string | → entities.id |
| `sender_name` | string? | Display name on platform |
| `message_count` | number | Messages seen from this contact |
| `first_seen` | number | Unix ms |
| `last_seen` | number | Unix ms |

**Note on receiver resolution:** Adapter accounts are also contacts. When an adapter starts with `account_id=X` on `platform=Y`, a contacts row maps `(Y, '', X) → agent_entity_id`. Receiver resolution uses the exact same `contacts → entities` lookup as sender resolution. Identity resolution is fully symmetric.

### 3.3 Session

**Source:** `agents.db` — `sessions` table

| Field | Type | Notes |
|---|---|---|
| `key` | string | `dm:{sender}:{receiver}` or `group:{platform}:{container}:{receiver}` |
| `kind` | string | `direct`, `group`, `global` |
| `label` | string? | Human-readable label |
| `persona` | string? | Active persona_ref |
| `routing_key` | string? | |
| `origin` | json? | Where session originated (platform, provider, surface) |
| `status` | string | |
| `updated_at` | number | |

**Related objects:**
- Turns (via `turns.session_id`)
- Messages (via turns)
- Entities (parsed from session key — sender + receiver)
- Events (via session origin/thread mapping)

### 3.4 Fact

**Source:** `memory.db` — `facts` table

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `text` | string | The fact content |
| `context` | string? | Additional context |
| `as_of` | number | When this fact was true |
| `ingested_at` | number | When we learned it |
| `source_episode_id` | string? | Episode that produced this fact |
| `source_event_id` | string? | Original event that contained this info |
| `is_consolidated` | boolean | Whether this is a consolidated/merged fact |

**Related objects:**
- Entities (via `fact_entities`)
- Source Episode (via `source_episode_id`)
- Source Event (via `source_event_id`)
- Observations (via `observation_facts`)
- Causal Links (via `causal_links`)

### 3.5 Observation

**Source:** `memory.db` — `analysis_runs` table (observations are analysis run outputs)

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `episode_id` | string? | Source episode |
| `parent_id` | string? | Previous version (version chain) |
| `status` | string | |
| `output_text` | string? | The observation content |
| `is_stale` | boolean | Whether newer data may invalidate this |
| `created_at` | number | |
| `completed_at` | number? | |

**Related objects:**
- Supporting Facts (via `observation_facts`)
- Supporting Entities (derived from supporting facts)
- Source Episode
- Version Chain (via `parent_id`)

### 3.6 Mental Model

**Source:** `memory.db` — `mental_models` table

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `entity_id` | string | The entity this model is about |
| `name` | string | Model title |
| `description` | string | Full markdown content |
| `last_refreshed` | number | |
| `is_stale` | boolean | |
| `updated_at` | number | |

**Related objects:**
- Entity (via `entity_id`)

**UI note:** Mental models are larger documents. The collection/embedded view shows a table with name, last_refreshed, and staleness indicator. Clicking opens a rendered markdown view.

### 3.7 Event

**Source:** `events.db` — `events` table

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `source` | string | Platform identifier |
| `source_id` | string | Platform-specific event ID |
| `direction` | string | `inbound` / `outbound` |
| `content` | string | Event content |
| `content_type` | string | |
| `thread_id` | string? | |
| `created_at` | number | |

**Related objects:**
- Participants / Entities (via `event_participants`)
- Thread (via `threads`)
- Attachments (via `attachments`)
- Tags (via `event_tags`)
- Facts derived from this event (via `facts.source_event_id`)
- Episodes containing this event (via `episode_events`)

### 3.8 Adapter Instance

**Source:** `runtime.db` — `adapter_instances` table + adapter config

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `platform` | string | `imessage`, `discord`, `email`, etc. |
| `account_id` | string | |
| `status` | string | `running`, `stopped`, `error`, `backfilling` |
| `health` | string | |
| `restart_count` | number | |
| `backfill_cursor` | string? | Cached sync position snapshot |
| `last_error` | string? | |

**Related objects:**
- Platform directory (spaces, containers for this platform)
- Credentials/secrets configured for this adapter
- Entity (the agent entity this adapter account resolves to)

### 3.9 Grant

**Source:** `identity.db` — `grants` table

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `entity_id` | string? | Grantee entity |
| `group_id` | string? | Grantee group |
| `permission` | string | Permission key |
| `role` | string? | Role name |
| `policy_id` | string? | Source policy |
| `created_at` | number | |

**Related objects:**
- Entity (the grantee)
- Policy (source)
- Grant log (audit trail)

### 3.10 Automation

**Source:** `runtime.db` — `automations` table

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `name` | string | |
| `description` | string? | |
| `enabled` | boolean | |
| `trigger` | json | Event match criteria |
| `action` | json | What to do when triggered |
| `hook_point` | string? | Pipeline stage hook |

**Related objects:**
- Hook invocations (execution log)
- Meeseeks persona config (if automation spawns a meeseeks)

### 3.11 Cron Job

**Source:** runtime cron state (in-memory + persisted)

Existing `CronJob` type is well-defined. Lives under Automations as a sub-view.

**Related objects:**
- Target session/agent
- Run log entries

### 3.12 Episode

**Source:** `memory.db` — `episodes` table

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `platform` | string? | |
| `thread_id` | string? | |
| `event_count` | number | |
| `status` | string | |
| `start_time` | number? | |
| `end_time` | number? | |
| `definition_id` | string? | Episode type |

**Related objects:**
- Events (via `episode_events`)
- Facts produced (via `facts.source_episode_id`)
- Observations produced

---

## 4. Persona Model

### 4.1 Filesystem-First Storage

Personas are stored as folders in the filesystem. This keeps them freely editable with any text editor.

```
~/nexus/state/personas/{persona_name}/
  ├── identity.md       # Name, avatar, emoji, theme
  ├── system-prompt.md   # SOUL/IDENTITY prompt
  ├── config.json        # Tools, model prefs, behavior config
  └── ...                # Additional persona-specific files
```

### 4.2 DB Pointer on Entity

Agent entities have a `persona_path` field pointing to their persona folder:

```sql
-- entities table (identity.db)
ALTER TABLE entities ADD COLUMN persona_path TEXT;
-- Example: 'state/personas/atlas/'
```

When the runtime needs persona context for an agent entity, it reads `entity.persona_path` and loads the folder contents.

### 4.3 Per-Sender Persona Overrides (V2)

V1: One persona per agent entity via `persona_path` field.

V2 (deferred): Per-sender overrides allowing different personas for different relationships. Design options:

1. Convention-based: `atlas/overrides/entity-mom/system-prompt.md`
2. Small `persona_overrides` table: `(receiver_entity_id, sender_entity_id, persona_path)`
3. Field on grants: `persona_override_path`

Decision deferred to V2.

---

## 5. Collection Views (Tab-Level)

Each tab presents a collection view as its primary surface.

### 5.1 Command Center

**Layout:** Split-pane — session list (left) + active chat (right)

- **Session list**: All sessions from agents.db, including AIX imports
  - Filterable by: kind (direct/group), agent, date range, has-activity
  - Sortable by: last activity, turn count, session age
  - Shows: session label, kind badge, last activity timestamp, turn count, origin badge (native/cursor/codex/claude-code)
  - Imported sessions show provenance metadata
- **Active chat**: Full chat interface for the selected session
  - Message history with streaming
  - Tool call cards
  - Abort/interrupt controls
  - Compaction status

### 5.2 Agents

**Layout:** Agent list (left sidebar) + agent detail (main area)

- **Agent list**: All entities with `type='agent'` from identity.db
  - Shows: avatar, name, persona name, status indicator
  - Default agent highlighted
- **Agent detail** (see §6.2)

### 5.3 Directory

**Layout:** Entity list with search/filter bar

- **Entity list**: All non-merged entities from identity.db
  - Searchable by name, type, tag, platform
  - Filterable by: type (person/org/agent), lifecycle tag, platform presence, activity recency
  - Sortable by: name, last seen, message count, first seen
  - Shows: name, type badge, platform icons, last seen, message count, lifecycle tag
  - Supports entity merge action (select two entities → merge)
- Clicking an entity opens its detail view (see §6.1)

**Sub-views:**
- **Groups** — Entity groupings (family, work, etc.) with member management
- **Platform Directory** — Spaces, containers, threads from identity.db directory tables

### 5.4 Access

**Layout:** Multi-section dashboard

- **Roles & Permissions** — Define permission sets, view/edit roles
- **Groups** — Entity groups with assigned roles (shared with Directory)
- **Grants** — Filterable table of all grants with entity, permission, source
- **Policies** — YAML policy editor/viewer
- **Pending Requests** — Approval inbox (replaces old "approvals" tab)
- **Access Log** — Audit trail of access decisions

### 5.5 Adapters

**Layout:** Adapter grid/list

- **Adapter cards**: One card per registered adapter instance
  - Shows: platform icon, account name, status badge (running/stopped/error), last activity, sync status
  - Health indicators (connected, reconnect attempts, last error)
- **Adapter detail** (click to expand or navigate):
  - Credential/secret configuration
  - Sync status and history
  - Platform-specific settings (webhook URL, bot token source, etc.)
  - Directory entries for this platform (spaces, containers)
  - Entity this adapter account resolves to

### 5.6 Memory

**Layout:** Unified search interface with type tabs

- **Global search bar** at top — searches across all memory types
- **Type filter tabs**: All | Facts | Observations | Mental Models | Episodes | Events
- **Results area**: Mixed results ranked by relevance, or filtered to single type
- Each result is clickable → opens detail view for that object

**Sub-views per type:**
- **Facts**: Filterable table (entity, date range, consolidated status, source)
- **Observations**: Table with staleness indicator, version chain depth
- **Mental Models**: Table with entity, last refreshed, stale indicator → click opens rendered markdown
- **Episodes**: Table with platform, event count, processing status, date range
- **Events**: Full event stream browser with direction/platform/entity/date filters

### 5.7 Automations

**Layout:** Automation list + detail

- **Automation list**: All automations from runtime.db
  - Shows: name, enabled toggle, trigger summary, last fired, fire count
  - Quick enable/disable toggle
- **Cron sub-view**: Cron jobs with schedule, next run, last status
- **Hook invocation log**: Recent hook executions with timing and status

---

## 6. Detail Views

Detail views are the heart of graph navigation. Each shows the object's own data plus embedded widgets for related objects.

### 6.1 Entity Detail

```
┌─ Entity: {name} ──────────────────────────────────────────┐
│ Type: {type} · Tags: {tags}                                │
│ First seen: {date} · Last seen: {date} · Messages: {count} │
│ [Edit] [Merge] [Add Tag]                                   │
│                                                             │
│ ┌─ Contacts ──────────────────────────────────────────────┐ │
│ │ <contacts-table entity_id={id} />                       │ │
│ │ Columns: platform, sender_id, sender_name,              │ │
│ │          message_count, first_seen, last_seen            │ │
│ │ [Add Contact]                                            │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Access ────────────────────────────────────────────────┐ │
│ │ <grants-table entity_id={id} />                         │ │
│ │ Shows: permission grants, role memberships, group memberships │
│ │ Persona binding: {persona_ref} (for agent receiver)     │ │
│ │ [Edit Grants] [Add to Group]                             │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Facts ─────────────────────────────────────────────────┐ │
│ │ <facts-table entity_id={id} />                          │ │
│ │ Pre-filtered to this entity; additional search/filter   │ │
│ │ available. Columns: text, as_of, source, consolidated   │ │
│ │ [Show all: {count} facts]                                │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Observations ──────────────────────────────────────────┐ │
│ │ <observations-table entity_id={id} />                   │ │
│ │ Filtered to observations whose supporting facts         │ │
│ │ reference this entity. Shows: output_text summary,      │ │
│ │ updated, stale indicator, version depth                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Mental Models ─────────────────────────────────────────┐ │
│ │ <mental-models-table entity_id={id} />                  │ │
│ │ Table: name, last_refreshed, is_stale indicator         │ │
│ │ Click → rendered markdown view of full model             │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Sessions ──────────────────────────────────────────────┐ │
│ │ <sessions-table entity_id={id} />                       │ │
│ │ All sessions where this entity is sender or receiver    │ │
│ │ Click → opens in Command Center                          │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Events ────────────────────────────────────────────────┐ │
│ │ <events-table entity_id={id} />                         │ │
│ │ Recent events involving this entity                     │ │
│ │ Metrics row: msgs this week, platform breakdown         │ │
│ │ [View full event history →]                              │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Co-occurrences ────────────────────────────────────────┐ │
│ │ <cooccurrences-table entity_id={id} />                  │ │
│ │ Entities frequently mentioned together with this entity │ │
│ │ Click entity name → navigates to that entity's detail   │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Agent Detail

Extends Entity Detail with agent-specific sections:

```
┌─ Agent: {name} ───────────────────────────────────────────┐
│ Entity: {entity_id} · Persona: {persona_path}             │
│ [Edit Persona] [View Files]                                │
│                                                             │
│ ┌─ Persona ───────────────────────────────────────────────┐ │
│ │ Folder: {persona_path}                                  │ │
│ │ Name: {name} · Theme: {theme} · Avatar: {avatar}       │ │
│ │ System prompt preview (first ~200 chars)                │ │
│ │ [Edit Identity] [Edit System Prompt] [Edit Config]      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Platform Accounts ─────────────────────────────────────┐ │
│ │ <adapter-accounts-table receiver_entity_id={id} />      │ │
│ │ Adapters whose account resolves to this agent entity    │ │
│ │ Shows: platform, account_id, status, last activity      │ │
│ │ Click → navigates to Adapter detail                      │ │
│ │ [Add Account]                                            │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Skills ────────────────────────────────────────────────┐ │
│ │ <skills-table agent_id={id} />                          │ │
│ │ Skill availability, requirements, install status        │ │
│ │ [Install] [Toggle] [Configure API Key]                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Sessions ──────────────────────────────────────────────┐ │
│ │ <sessions-table receiver_entity_id={id} />              │ │
│ │ All sessions where this agent is the receiver           │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Access (Who Can Talk to This Agent) ───────────────────┐ │
│ │ <grants-table receiver_entity_id={id} />                │ │
│ │ Entities/groups with access to this agent               │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [Inherited from Entity Detail: Contacts, Facts, etc.]      │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Fact Detail

```
┌─ Fact ────────────────────────────────────────────────────┐
│ "{fact text}"                                              │
│ As of: {date} · Ingested: {date} · Consolidated: {yes/no} │
│                                                             │
│ ┌─ Linked Entities ───────────────────────────────────────┐ │
│ │ <entities-table fact_id={id} />                         │ │
│ │ Entities mentioned in this fact. Click → Entity detail  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Source ────────────────────────────────────────────────┐ │
│ │ Episode: {episode link} · Event: {event link}          │ │
│ │ Click → Episode detail or Event detail                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Observations Using This Fact ──────────────────────────┐ │
│ │ <observations-table fact_id={id} />                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Causal Links ──────────────────────────────────────────┐ │
│ │ Causes: [linked facts with strength]                    │ │
│ │ Caused by: [linked facts with strength]                 │ │
│ │ Click any → Fact detail                                  │ │
│ └─────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

### 6.4 Event Detail

```
┌─ Event ───────────────────────────────────────────────────┐
│ Platform: {source} · Direction: {inbound/outbound}        │
│ Time: {timestamp} · Thread: {thread_id}                    │
│                                                             │
│ ┌─ Content ───────────────────────────────────────────────┐ │
│ │ {rendered message content}                              │ │
│ │ Attachments: {list}                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Participants ──────────────────────────────────────────┐ │
│ │ <entities-table event_id={id} />                        │ │
│ │ Who was in this conversation. Click → Entity detail     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Derived Knowledge ─────────────────────────────────────┐ │
│ │ Facts extracted from this event: [list]                 │ │
│ │ Episodes containing this event: [list]                  │ │
│ └─────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

### 6.5 Adapter Detail

```
┌─ Adapter: {platform} / {account_id} ─────────────────────┐
│ Status: {running/stopped/error} · Restarts: {count}       │
│ Last error: {error or "none"}                              │
│                                                             │
│ ┌─ Credentials ───────────────────────────────────────────┐ │
│ │ Credential setup/management for this adapter            │ │
│ │ OAuth flows, API keys, token sources                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Configuration ─────────────────────────────────────────┐ │
│ │ Platform-specific settings                              │ │
│ │ (webhook URL, bot config, DM policy, etc.)              │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Sync Status ───────────────────────────────────────────┐ │
│ │ Last sync: {time} · Status: {idle/syncing/backfilling}  │ │
│ │ Events synced: {count} · Cursor: {position}             │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Receiver Entity ───────────────────────────────────────┐ │
│ │ This adapter account resolves to: {entity name}         │ │
│ │ Click → Entity detail                                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Platform Directory ────────────────────────────────────┐ │
│ │ Spaces, containers, threads discovered by this adapter  │ │
│ │ <directory-table platform={platform} />                 │ │
│ └─────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

### 6.6 Observation Detail

```
┌─ Observation ─────────────────────────────────────────────┐
│ Status: {status} · Stale: {yes/no}                        │
│ Created: {date} · Completed: {date}                        │
│                                                             │
│ ┌─ Content ───────────────────────────────────────────────┐ │
│ │ {rendered observation output text}                      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Version Chain ─────────────────────────────────────────┐ │
│ │ Previous versions of this observation                   │ │
│ │ [v3 (current)] → [v2] → [v1]                           │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Supporting Facts ──────────────────────────────────────┐ │
│ │ <facts-table observation_id={id} />                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Related Entities ──────────────────────────────────────┐ │
│ │ Entities referenced by supporting facts                 │ │
│ │ Click → Entity detail                                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Source Episode ────────────────────────────────────────┐ │
│ │ Click → Episode detail                                   │ │
│ └─────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

---

## 7. Composable Widgets

These are the reusable UI components that appear in both collection views and embedded in detail views.

| Widget | Props | Used In |
|---|---|---|
| `<entities-table>` | `filter?: { fact_id, event_id, group_id, ... }` | Directory, Fact detail, Event detail, Observation detail, Co-occurrences |
| `<contacts-table>` | `entity_id?: string` | Entity detail, Directory |
| `<grants-table>` | `entity_id?: string, receiver_entity_id?: string` | Access tab, Entity detail, Agent detail |
| `<facts-table>` | `entity_id?: string, observation_id?: string, episode_id?: string` | Memory tab, Entity detail, Observation detail, Episode detail |
| `<observations-table>` | `entity_id?: string, fact_id?: string` | Memory tab, Entity detail, Fact detail |
| `<mental-models-table>` | `entity_id?: string` | Memory tab, Entity detail |
| `<sessions-table>` | `entity_id?: string, receiver_entity_id?: string` | Command Center, Entity detail, Agent detail |
| `<events-table>` | `entity_id?: string, thread_id?: string, episode_id?: string` | Memory tab, Entity detail, Episode detail |
| `<adapter-card>` | `adapter_id?: string` | Adapters tab, Agent detail (as accounts) |
| `<episodes-table>` | `entity_id?: string, platform?: string` | Memory tab |
| `<hook-invocations-table>` | `automation_id?: string` | Automations tab, Automation detail |
| `<cron-table>` | `agent_id?: string` | Automations tab |
| `<directory-table>` | `platform?: string` | Adapters detail, Directory sub-view |
| `<skills-table>` | `agent_id?: string` | Agent detail |

### Widget Contract

Every widget follows the same interface:

```typescript
interface WidgetProps<T> {
  // Pre-filter: when embedded in a detail view, scope to related items
  filter?: Record<string, string | string[]>;

  // Pagination
  limit?: number;
  offset?: number;

  // Additional user-driven filters (search, date range, etc.)
  searchQuery?: string;
  additionalFilters?: Record<string, unknown>;

  // Callbacks
  onItemClick?: (item: T) => void;  // Navigate to detail view
  onLoadMore?: () => void;

  // Display mode
  compact?: boolean;  // Fewer columns, smaller rows for embedded use
}
```

When a widget is used at the tab level (collection view), it gets full-width with all columns and full filter controls. When embedded in a detail view, it uses `compact=true` with fewer columns and a "Show all →" link that navigates to the full collection view with the filter pre-applied.

---

## 8. Graph Navigation

### 8.1 Navigation Model

Clicking a related object in a detail view navigates to that object's detail view. Navigation is tracked via:

1. **URL path**: `/directory/{entity_id}`, `/memory/facts/{fact_id}`, `/agents/{agent_id}`
2. **Breadcrumbs**: Show traversal path, e.g., `Directory > Mom > Facts > "Mom's birthday..." > Source Event`
3. **Back button**: Standard browser back works because each view has a unique URL

### 8.2 Cross-Tab Navigation

Some navigations cross tab boundaries:
- Entity detail → click session → opens in Command Center tab
- Agent detail → click adapter → opens in Adapters tab
- Memory fact → click entity → opens in Directory tab

The active tab in the nav updates to reflect where you are. The breadcrumb shows the full traversal path regardless of tab boundaries.

### 8.3 URL Scheme

```
/command-center                          # Session list + chat
/command-center/{session_key}            # Specific session open

/agents                                  # Agent list
/agents/{entity_id}                      # Agent detail
/agents/{entity_id}/persona              # Persona editor
/agents/{entity_id}/skills               # Skills sub-view

/directory                               # Entity list
/directory/{entity_id}                   # Entity detail
/directory/groups                        # Groups sub-view
/directory/groups/{group_id}             # Group detail
/directory/platforms                     # Platform directory

/access                                  # IAM dashboard
/access/grants                           # Grants list
/access/roles                            # Roles management
/access/policies                         # Policy editor
/access/requests                         # Pending requests
/access/log                              # Access audit log

/adapters                                # Adapter grid
/adapters/{adapter_id}                   # Adapter detail

/memory                                  # Unified search
/memory/facts                            # Facts collection
/memory/facts/{fact_id}                  # Fact detail
/memory/observations                     # Observations collection
/memory/observations/{observation_id}    # Observation detail
/memory/mental-models/{model_id}         # Mental model rendered view
/memory/episodes                         # Episodes collection
/memory/episodes/{episode_id}            # Episode detail
/memory/events                           # Events collection
/memory/events/{event_id}               # Event detail

/automations                             # Automation list
/automations/{automation_id}             # Automation detail
/automations/cron                        # Cron jobs sub-view
/automations/cron/{job_id}              # Cron job detail
/automations/log                         # Hook invocation log

/system/overview                         # Runtime health
/system/config                           # Config editor
/system/logs                             # Log tail
/system/debug                            # Debug tools
/system/usage                            # Usage analytics
```

---

## 9. Data Flow — Queries Per View

### 9.1 Entity Detail (Cross-Database)

Entity detail requires queries across multiple databases. Since SQLite doesn't support cross-database JOINs without ATTACH, the application layer performs separate queries and joins in code:

1. `identity.db`: entity row, contacts, entity_tags, grants, entity_cooccurrences
2. `memory.db`: facts (via fact_entities), mental_models, episodes
3. `events.db`: recent events (via event_participants), thread aggregates
4. `agents.db`: sessions (key contains entity_id)
5. `embeddings.db`: (only for semantic search, not displayed directly)

### 9.2 Memory Search (Cross-Database)

Unified search queries:

1. `memory.db`: FTS on facts_fts, mental_models, observation output_text
2. `events.db`: FTS on events_fts
3. `embeddings.db`: Semantic similarity via vec_embeddings
4. `identity.db`: Entity name matching for entity-scoped results

Results are merged and ranked by relevance at the application layer.

---

## 10. Identity Resolution — Symmetric Model

**Critical architectural decision:** Sender and receiver identity resolution use the exact same code path.

Both resolve through: `contacts(platform, space_id, sender_id) → entity_id → entities(id)`

- **Sender resolution**: Platform event arrives with sender metadata → look up contact → resolve entity
- **Receiver resolution**: Adapter config declares account_id → contact row maps account to agent entity → resolve entity

No separate `account_receiver_bindings` table exists. The contacts table is the single source of truth for all identity resolution, in both directions.

When an adapter starts, it ensures a contacts row exists mapping its `(platform, account_id)` to the agent entity. This is seeded during adapter configuration and bootstrap.

---

## 11. Implementation Notes

### 11.1 Technology

- UI framework: Lit (existing)
- Styling: CSS (existing stylesheet system)
- Data fetching: WebSocket RPC via existing control plane
- Routing: URL-based with history API (existing pattern, extended)

### 11.2 Migration Strategy

1. Build new tab structure alongside old tabs
2. Implement composable widgets as standalone components
3. Build detail views by composing widgets
4. Migrate old views to new structure one at a time
5. Remove legacy tabs when all functionality is covered

### 11.3 New RPC Methods Needed

| Method | Purpose |
|---|---|
| `entity.profile` | Composite entity profile (contacts, metrics, recent facts, mental model) |
| `entity.list` | Filterable entity list with basic metrics |
| `memory.search` | Unified search across facts, observations, events |
| `directory.spaces` | Platform directory (spaces, containers) |
| `access.grants.list` | Filterable grants with entity resolution |
| `access.log` | Access decision audit log |
| `adapters.status` | Adapter health and sync status via `getSyncStatus()` |

### 11.4 Existing RPC Methods Reused

- `chat.send`, `chat.history`, `chat.abort` — Command Center
- `sessions.list`, `sessions.patch` — Command Center
- `agents.list`, `agents.files.*` — Agents tab
- `config.*` — System > Config
- `memory.review.*` — Memory tab (existing memory review endpoints)
- `channels.status` — Adapters tab (adapter status)
- `cron.*` — Automations > Cron
- `skills.*` — Agents > Skills

---

## 12. Open Questions

1. **Should Command Center support multi-pane layout (Phase 0 vs Phase 2)?**
   - Phase 0: session list + chat (2-pane)
   - Phase 2: agent menu + chat + file panel + project tree (4-pane)

2. **Should Memory search results use semantic (embedding) search or keyword (FTS) or both?**
   - Recommendation: Both, with a toggle. FTS for exact recall, semantic for fuzzy.

3. **How deep should graph traversal go before we suggest "open in new tab"?**
   - Recommendation: Breadcrumb depth 5+, show "open in [tab name]" link.

4. **Should the System menu items have their own URL paths or be modal overlays?**
   - Recommendation: URL paths under `/system/*` so they're bookmarkable.

---

## See Also

- `DATABASE_ARCHITECTURE.md` — Canonical 6-database layout
- `ENTITY_ACTIVITY_DASHBOARD.md` — Entity CRM metrics and queries
- `nex/workplans/COMMAND_CENTER.md` — Command Center detailed workplan
- `nex/UNIFIED_RUNTIME_OPERATION_MODEL.md` — Runtime operation model
- `nex/ENTITY_SYMMETRIC_ROUTING_AND_PERSONA_BINDING.md` — Identity resolution architecture
