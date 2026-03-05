# Iterative Validation Ladder

**Status:** ACTIVE
**Created:** 2026-03-04
**Scope:** Validates ALL changes across WP1–WP12 and Phases 1–10
**Cross-references:** [SPEC_INDEX.md](./SPEC_INDEX.md) · [CUTOVER_INDEX.md](./workplans/CUTOVER_INDEX.md) · [RESOLVED_DECISIONS.md](./RESOLVED_DECISIONS.md)

---

## Overview

This document defines a 7-level validation ladder that can be run iteratively as workplans are implemented. Each level builds on the previous one. Levels 0–2 are fully automated (grep/script). Levels 3–4 are test-driven. Levels 5–6 are integration/smoke tests run after waves complete.

**When to run:**
- **After every workplan lands:** Run Levels 0–4 for that workplan's scope
- **After each wave completes:** Run Level 5 for cross-workplan integration
- **After ALL workplans complete:** Run Level 6 full system validation

---

## Level 0: Dead Reference Sweep (Automated — Grep)

**Purpose:** Ensure no references to dropped, renamed, or superseded concepts survive in production code.

**When to run:** After every workplan lands. Can be run continuously in CI.

### 0.1 Dropped Operations

Verify ZERO references to any dropped operation string literal in production code (excluding test fixtures, archived docs, and comments):

```bash
# Dropped operations — must return zero matches
grep -rn \
  '"usage\.status"\|"usage\.cost"\|"sessions\.usage"\|"sessions\.usage\.timeseries"\|"sessions\.usage\.logs"' \
  src/ --include="*.ts" | grep -v "\.test\." | grep -v "node_modules"

grep -rn \
  '"device\.pair\.\|"device\.host\.\|"device\.token\.\|"system-presence"\|"system\.presence"' \
  src/ --include="*.ts" | grep -v "\.test\." | grep -v "node_modules"

grep -rn \
  '"delivery\.poll"\|"delivery\.send"\|"delivery\.stream"\|"delivery\.react"\|"delivery\.edit"\|"delivery\.delete"' \
  src/ --include="*.ts" | grep -v "\.test\." | grep -v "node_modules"

grep -rn \
  '"tts\.\|"talk\.\|"voicewake\."' \
  src/ --include="*.ts" | grep -v "\.test\." | grep -v "node_modules"

grep -rn \
  '"packs\.\|"capabilities\.\|"skills\.install"\|"skills\.update"\|"skills\.updates"' \
  src/ --include="*.ts" | grep -v "\.test\." | grep -v "node_modules"

grep -rn \
  '"work\.tasks\.\|"work\.items\.\|"work\.workflows\.\|"work\.sequences\.\|"work\.campaigns\.\|"work\.dashboard\.\|"work\.entities\."' \
  src/ --include="*.ts" | grep -v "\.test\." | grep -v "node_modules"

grep -rn \
  '"clock\.schedule\."' \
  src/ --include="*.ts" | grep -v "\.test\." | grep -v "node_modules"

grep -rn \
  '"chat\.inject"' \
  src/ --include="*.ts" | grep -v "\.test\." | grep -v "node_modules"

grep -rn \
  '"events\.emit"' \
  src/ --include="*.ts" | grep -v "\.test\." | grep -v "node_modules"
```

### 0.2 Singular → Plural Namespace Renames

Verify all operation references use plural domain names:

```bash
# Must return zero — singular forms should be gone
grep -rn '"event\.ingest"\|"event\.backfill"' src/ --include="*.ts" | grep -v "\.test\."
grep -rn '"agent\.identity\.get"\|"agent\.wait"' src/ --include="*.ts" | grep -v "\.test\."
grep -rn '"adapter\.connections\."' src/ --include="*.ts" | grep -v "\.test\."
```

### 0.3 Removed Types and Concepts

```bash
# SenderContext / ReceiverContext — must be zero (WP12 / CUTOVER_06)
grep -rn 'SenderContext\|ReceiverContext' src/ --include="*.ts" | grep -v "\.test\." | grep -v "node_modules"

# data_access — must be zero (removed in Batch 2)
grep -rn 'data_access' src/ --include="*.ts" | grep -v "\.test\." | grep -v "node_modules"

# AuthTokenAudience / audience field — must be zero (WP3)
grep -rn 'AuthTokenAudience\|audience.*ingress\|audience.*control' src/ --include="*.ts" | grep -v "\.test\."

# Old session routing — must be zero (WP4)
grep -rn 'session_label\b\|sessionLabel\b' src/ --include="*.ts" | grep -v "\.test\."

# persona_id on sessions/threads — must be zero (WP5)
grep -rn 'persona_id\b' src/ --include="*.ts" | grep -v "\.test\." | grep -v "persona_ref"

# workspace_path on turns — must be zero (WP5)
grep -rn 'workspace_path\b' src/ --include="*.ts" | grep -v "\.test\."
```

### 0.4 Deleted Files

```bash
# Reply module — must not exist (CUTOVER_06)
ls src/reply/ 2>/dev/null && echo "FAIL: src/reply/ still exists"

# TTS module — must not exist (WP12)
ls src/tts/ 2>/dev/null && echo "FAIL: src/tts/ still exists"

# Old work server methods — must not exist (WP7)
ls src/nex/control-plane/server-methods/work.ts 2>/dev/null && echo "FAIL: work.ts still exists"
```

**Pass criteria:** Every grep returns zero matches. Every `ls` fails.

---

## Level 1: Schema Compliance (Automated — SQL/Script)

**Purpose:** Every database table matches its target schema from the workplans.

**When to run:** After any workplan that modifies database schemas (WP1, WP2, WP5, WP7, WP9).

### 1.1 Identity DB Tables (WP1)

```sql
-- Verify new tables exist
SELECT name FROM sqlite_master WHERE type='table' AND name IN (
  'channels', 'channel_participants', 'groups', 'group_members', 'policies'
);
-- Expected: 5 rows

-- Verify old tables removed
SELECT name FROM sqlite_master WHERE type='table' AND name IN (
  'contact_name_observations', 'spaces', 'containers', 'threads',
  'names', 'membership_events'
);
-- Expected: 0 rows

-- Verify entities has is_agent, no first_seen/last_seen
PRAGMA table_info(entities);
-- Expected: is_agent present, first_seen absent, last_seen absent

-- Verify contacts uses immutable row pattern
PRAGMA table_info(contacts);
-- Expected: deleted_at column present
```

### 1.2 Credentials & Vault (WP2)

```sql
-- Verify new tables in identity.db
SELECT name FROM sqlite_master WHERE type='table' AND name IN (
  'credentials', 'vault', 'adapter_connections'
);
-- Expected: 3 rows

-- Verify credentials schema
PRAGMA table_info(credentials);
-- Expected: id, service, contact_id, kind, storage_type, storage_config,
--           expires_at, refresh_token_ref, status, last_validated, last_used,
--           last_error, error_count, source, note, created_at, updated_at
```

### 1.3 Work DB Tables (WP7)

```sql
-- Verify all 7 work tables
SELECT name FROM sqlite_master WHERE type='table' AND name IN (
  'job_definitions', 'cron_schedules', 'job_runs',
  'dag_definitions', 'dag_nodes', 'dag_runs', 'agent_configs'
);
-- Expected: 7 rows

-- Verify old tables removed from their original databases
-- In events.db:
SELECT name FROM sqlite_master WHERE type='table' AND name IN ('automations', 'hook_invocations');
-- Expected: 0 rows

-- In nexus.db:
SELECT name FROM sqlite_master WHERE type='table' AND name='cron_jobs';
-- Expected: 0 rows

-- In memory.db:
SELECT name FROM sqlite_master WHERE type='table' AND name IN ('job_types', 'jobs', 'job_outputs', 'processing_log');
-- Expected: 0 rows
```

### 1.4 Session Schema (WP5, WP9)

```sql
-- In agents.db:
PRAGMA table_info(sessions);
-- Expected: workspace_id present, type present, forked_from_session_id present, forked_at_turn_id present
-- Expected: persona_id absent (or renamed to workspace_id)

PRAGMA table_info(turns);
-- Expected: agent_config_id present, working_dir present
-- Expected: workspace_path absent
```

### 1.5 Workspaces Table (WP5)

```sql
-- In nexus.db (or agents.db):
SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces';
-- Expected: 1 row

PRAGMA table_info(workspaces);
-- Expected: id, name, working_dir, manifest_json, type, entity_id, created_at, updated_at
```

### 1.6 Auth Tokens (WP3)

```sql
-- Verify audience column removed
PRAGMA table_info(auth_tokens);
-- Expected: no 'audience' column
```

**Pass criteria:** All SQL assertions hold on a freshly initialized database.

---

## Level 2: Operation Registration (Automated — Script)

**Purpose:** Every operation from the spec is registered in the runtime. No phantom operations exist.

**When to run:** After any workplan that adds or removes operations.

### 2.1 Build Canonical Operation List

Extract every operation from `SPEC_INDEX.md` and the batch specs into a flat list. This is the **expected** set (~196 operations).

### 2.2 Extract Registered Operations

From the running runtime (or from code):

```typescript
// Query from a running instance
const registeredOps = await rpc('status'); // or inspect runtime-operations.ts

// Or extract from code:
grep -oP '"[a-z]+(\.[a-z]+)+"' src/nex/control-plane/runtime-operations.ts | sort -u
```

### 2.3 Diff

```
Expected - Registered = MISSING operations (spec says they should exist)
Registered - Expected = PHANTOM operations (code has them but spec doesn't)
```

**Pass criteria:** Both diffs are empty. Every spec operation is registered, no extra operations exist.

### 2.4 Operation Metadata Verification

For each registered operation, verify:
- `action` matches spec (read/write/admin)
- `resource` is correctly namespaced
- Handler function exists and is non-null

---

## Level 3: Pipeline Integration (Test-Driven)

**Purpose:** All operations flow through the 5-stage pipeline correctly.

**When to run:** After any workplan that modifies pipeline stages, IAM, or hooks.

### 3.1 Pipeline Stage Execution

For each operation, verify the request flows through all 5 stages:

```typescript
// Test: Every operation hits all pipeline stages
for (const op of allOperations) {
  const traces = await invokeAndCapture(op, validInput);
  assert(traces.includes('acceptRequest'));
  assert(traces.includes('resolvePrincipals'));
  assert(traces.includes('resolveAccess'));
  assert(traces.includes('executeOperation'));
  assert(traces.includes('finalizeRequest'));
}
```

### 3.2 IAM Enforcement

```typescript
// Test: Denied principal gets access denied
const result = await invoke('credentials.resolve', input, { role: 'customer' });
assert(result.error.code === 'ACCESS_DENIED');

// Test: Allowed principal succeeds
const result = await invoke('credentials.resolve', input, { role: 'operator' });
assert(result.ok === true);
```

### 3.3 Audit Logging

```typescript
// Test: Every operation produces an audit log entry
for (const op of allOperations) {
  await invoke(op, validInput);
  const auditRows = db.query('SELECT * FROM access_log WHERE operation = ?', [op]);
  assert(auditRows.length > 0);
}
```

### 3.4 Hook Point Firing

```typescript
// Test: Hook points fire at correct stages
const hooksFired = [];
registerTestHook('post-ingest', () => hooksFired.push('post-ingest'));
await invoke('events.ingest', validEvent);
assert(hooksFired.includes('post-ingest'));
```

**Pass criteria:** All assertions pass. No operation bypasses the pipeline.

---

## Level 4: Functional Verification (Per-Workplan)

**Purpose:** Each operation works correctly end-to-end.

**When to run:** After each workplan is implemented.

### 4.1 WP1: Identity DB

```
✅ entities.create → entities.get → entities.update → entities.list
✅ entities.tags.add → entities.tags.list → entities.tags.remove
✅ entities.merge → verify cascades to sessions, memory, contacts
✅ contacts.create → contacts.update (verify immutable row: old row soft-closed, new row inserted)
✅ contacts.search → returns results matching name/platform/entity
✅ channels.list → returns channels with adapter/account bindings
✅ groups.create → groups.members.add → groups.members.list
✅ acl.policies.create → verify policy matches in evaluateAccessPolicies
✅ acl.evaluate → dry-run returns correct decision
```

### 4.2 WP2: Credential System

```
✅ credentials.create (storage_type: "nex") → vault row encrypted
✅ credentials.resolve → correct secret value returned
✅ credentials.resolve (revoked) → error
✅ credentials.verify → updates last_validated/status
✅ credentials.scan → finds env vars matching known patterns
✅ Each storage resolver: nex, inline, env, keychain, 1password, external
✅ ACL gating: customer role denied credentials.resolve
```

### 4.3 WP3: Auth Unification

```
✅ Token works on any endpoint (no audience filtering)
✅ Loopback bypass only for role: "operator"
✅ Hosted mode: DB tokens work for non-operator roles only
✅ Customer identity: identity hints ignored when role === "customer"
✅ Single HTTP server serves all routes
```

### 4.4 WP4: Session Routing

```
✅ Pipeline computes canonical session key from resolved principals
✅ Policy template overrides canonical key when explicit
✅ Automation overrides on top of policy
✅ request.session_routing is the single source of truth
✅ session_label → session_key rename complete (zero references to old name)
```

### 4.5 WP5: Workspace Primitive

```
✅ workspaces.create → workspaces.get → workspaces.list
✅ workspaces.resolve → correct working_dir returned
✅ Sessions reference workspace_id (not persona_id)
✅ Turns reference working_dir (not workspace_path)
```

### 4.6 WP6: Hook System Collapse

```
✅ All 19 canonical hook points fire at correct stages
✅ registerInternalHook removed (zero references)
✅ NEXPlugin → hookpoint emitter (no separate hook registration)
✅ Job definitions can attach to multiple hook points via JSON array
```

### 4.7 WP7: Work Domain Unification

```
✅ jobs.create → jobs.get → jobs.list
✅ jobs.invoke → creates job_run with status tracking
✅ cron.create → verify next_run_at computed correctly
✅ Cron fires → job_run created with trigger_source='cron'
✅ dags.create (2 nodes) → dags.runs.start → verify node advancement
✅ agents.configs.create → config referenced by agent_config_id on turns
✅ Clock tick = cron schedule with expression "*/30 * * * * *"
```

### 4.8 WP8: Memory API

```
✅ memory.elements.list → returns elements from memory.db
✅ memory.elements.create → memory.elements.get
✅ memory.recall → returns relevant elements
✅ memory.sets.list → memory.sets.get
✅ All 20 operations accessible via RPC (not just agent tools)
```

### 4.9 WP9: Agents/Sessions API

```
✅ agents.list → agents.get → agents.create → agents.update
✅ agents.sessions.create → agents.sessions.get → agents.sessions.list
✅ agents.sessions.fork (from turn) → new session with branched history
✅ agents.sessions.archive → soft-archive
✅ agents.turns.list → agents.turns.get
✅ agents.messages.list → agents.messages.get
✅ chat.send (sync: true) → streaming response
✅ chat.send (role: "assistant") → inject mode works
✅ chat.abort → running agent stops
```

### 4.10 WP10: Adapters/Channels/Delivery

```
✅ channels.list → returns channels with adapter/account bindings
✅ channels.search({ participant_entity_id }) → finds channels for a contact
✅ channels.send(channel_id, message, { sender_account_id }) → dispatches to adapter
✅ channels.send → credential resolved → adapter spawned → delivery.send invoked
✅ channels.status → delegates to adapter health
✅ adapters.connections.list → returns all connections with status
✅ adapters.connections.oauth.start → returns redirect URL
✅ adapters.connections.oauth.complete → writes credential + connection
✅ events.ingest → event processed (plural namespace)
✅ events.backfill → triggers adapter backfill
```

### 4.11 WP11: Apps/Skills/Models/Runtime

```
✅ apps.list → returns installed apps (via RPC, not HTTP-only)
✅ apps.install → apps.start → apps.status
✅ skills.list → returns skills with status
✅ skills.use → returns SKILL.md content
✅ models.list → computed from active LLM provider credentials
✅ status → returns full sitrep with all domain summaries
✅ runtime.health → lightweight probe
✅ pubsub.subscribe → receives events
✅ pubsub.publish → publishes event to bus (client-facing)
```

### 4.12 WP12: Drops & Extractions

```
✅ TTS source code extracted (src/tts/ removed)
✅ All dropped operation handlers unregistered
✅ All singular namespace operations return "unknown operation"
✅ Level 0 dead reference sweep passes
```

**Pass criteria:** Every checklist item passes for the workplan under test.

---

## Level 5: Cross-Workplan Integration (After Waves)

**Purpose:** Verify that dependent workplans integrate correctly.

**When to run:** After each wave of workplans completes.

### 5.1 After Wave 2 (WP1 + WP2 integration)

```
✅ Credential with contact_id FK → contact exists in new 3-table schema
✅ Adapter connection → credential → vault → decrypted secret
✅ Policy in DB gates credential.resolve access correctly
✅ Group membership affects policy evaluation
```

### 5.2 After Wave 3 (WP2 + WP5 + WP6 + WP7 integration)

```
✅ Job definition references workspace_id from workspaces table
✅ Job definition attaches to canonical hook points from WP6
✅ Cron fires → job runs in correct workspace
✅ Session routing uses workspace_id (not persona_id)
✅ Channels.send resolves credential via WP2 pipeline
```

### 5.3 After Wave 4 (WP5 + WP7 + WP9 + WP11 integration)

```
✅ Agent session created with workspace_id
✅ Turn records agent_config_id from agent_configs table
✅ status command shows cron jobs, DAGs, workspace info
✅ models.list reflects credentials from WP2
✅ apps operations available via WS RPC
```

### 5.4 Full Channel→Account Resolution Chain

The complete delivery chain works end-to-end:

```
1. contacts.search("Casey") → Contact with entity_id          [WP1]
2. channels.list({ participant_entity_id, platform })          [WP10/WP1]
   → Returns channels with account_ids
3. channels.send(channel_id, message, { sender_account_id })   [WP10]
   → Looks up channel record                                   [WP1]
   → Finds adapter_connection for (adapter, account_id)        [WP2]
   → Gets credential_id from adapter_connection                [WP2]
   → Resolves credential via storage provider                  [WP2]
   → Spawns adapter binary with delivery.send                  [WP10]
```

### 5.5 Full Job Execution Chain

```
1. jobs.create with hook_points and workspace_id               [WP7]
2. cron.create binds job to schedule                           [WP7]
3. Cron fires → job_run created                                [WP7]
4. Hook fires in pipeline → job_run created                    [WP6+WP7]
5. Job runs in workspace with agent_config                     [WP5+WP7]
6. Turn created with agent_config_id                           [WP7+WP9]
7. Job run completes, output recorded                          [WP7]
```

**Pass criteria:** All integration chains pass with real data flowing through the full stack.

---

## Level 6: Full System Validation (After ALL Workplans)

**Purpose:** The system is fully converged to the target state.

**When to run:** Once after all 12 workplans are complete.

### 6.1 Operation Census

```typescript
// Load all operations from SPEC_INDEX.md
const specOps = parseSpecIndex();

// Load all registered operations from runtime
const registeredOps = getRegisteredOperations();

// Verify perfect match
assert.deepEqual(new Set(specOps), new Set(registeredOps));
console.log(`✅ ${specOps.length} operations match spec exactly`);
```

### 6.2 Database Census

```
✅ identity.db has: entities, entity_tags, entity_persona, merge_candidates,
   contacts, channels, channel_participants, groups, group_members, policies,
   auth_tokens, auth_passwords, credentials, vault, adapter_connections,
   grants, permission_requests, access_log

✅ agents.db has: sessions, turns, messages, tool_calls, session_history
   (sessions has workspace_id, type, forked fields; turns has agent_config_id, working_dir)

✅ events.db has: events, events_fts, attachments, attachment_interpretations
   (NO automations, hook_invocations tables)

✅ memory.db has: elements, elements_fts, element_entities, element_links,
   sets, set_members, set_definitions, resolution_log, access_log
   (NO jobs, job_types, job_outputs, processing_log)

✅ work.db has: job_definitions, cron_schedules, job_runs,
   dag_definitions, dag_nodes, dag_runs, agent_configs

✅ nexus.db has: nexus_requests, backfill_runs, workspaces
   (NO cron_jobs)
```

### 6.3 Full Dead Reference Sweep

Run ALL Level 0 checks. Every single one must pass with zero matches.

### 6.4 Status Command Shape

```typescript
const status = await rpc('status');

// Verify all sections present
assert(status.ts);
assert(status.identity?.user);
assert(status.identity?.agent);
assert(Array.isArray(status.adapters));
assert(status.channels?.total !== undefined);
assert(status.credentials?.total !== undefined);
assert(status.skills?.total !== undefined);
assert(status.memory?.entities !== undefined);
assert(status.cron?.enabled !== undefined);
assert(status.apps?.installed !== undefined);
assert(Array.isArray(status.capabilities));
assert(Array.isArray(status.suggestedActions));
```

### 6.5 Naming Consistency

```bash
# Every registered operation should use plural domain names
# Extract all operation names and verify
grep -oP '"[a-z]+(\.[a-z]+)+"' src/nex/control-plane/runtime-operations.ts | \
  grep -P '^"(event|agent|adapter|credential)\.' && echo "FAIL: singular domain name found"

# Should find only: events., agents., adapters., credentials. (plural)
```

### 6.6 No Orphan Handler Files

```bash
# Server method files should match active domains
ls src/nex/control-plane/server-methods/ | sort

# Should NOT contain:
# - work.ts (replaced by jobs.ts, cron.ts, dags.ts)
# - tts.ts, talk.ts, voicewake.ts (extracted)
# - devices.ts, device-host.ts (dropped)
# - usage.ts (dropped)
# - clock-schedule.ts (replaced by cron.ts)
```

### 6.7 Test Suite

```bash
# Full test suite passes
npm test

# Zero skipped tests referencing old concepts
grep -r "skip\|xit\|xdescribe" src/ --include="*.test.ts" | \
  grep -i "delivery\|reply\|persona\|audience\|clock\.schedule\|work\.tasks" && \
  echo "WARN: Skipped tests reference old concepts"
```

**Pass criteria:** The system is fully converged. Every operation matches the spec. Every database matches the target schema. Every dead reference is eliminated. The test suite passes clean.

---

## Running the Ladder

### Per-Workplan Checklist

When implementing workplan WP*N*:

1. [ ] Implement changes per workplan
2. [ ] Run Level 0 sweep for WP*N*'s scope
3. [ ] Run Level 1 schema checks for WP*N*'s tables
4. [ ] Run Level 2 operation registration check
5. [ ] Run Level 4 functional tests for WP*N*
6. [ ] Commit with passing checks noted

### Per-Wave Checklist

When all workplans in a wave are complete:

1. [ ] All per-workplan checklists passed
2. [ ] Run Level 5 cross-workplan integration tests for this wave
3. [ ] Run Level 0 full sweep (all checks, not just wave scope)
4. [ ] Document any deferred items

### Final Validation

When all 12 workplans are complete:

1. [ ] Run entire Level 6 validation suite
2. [ ] Verify SPEC_INDEX.md operation count matches runtime
3. [ ] Clean test suite run
4. [ ] Archive this document with final results

---

## Validation Script Organization

```
src/validation/
  level0-dead-refs.sh       — Shell script running all Level 0 greps
  level1-schema.ts          — Schema compliance checks (opens DBs, runs assertions)
  level2-operations.ts      — Operation registration diff
  level3-pipeline.test.ts   — Pipeline integration tests
  level4/                   — Per-workplan functional tests
    wp01-identity.test.ts
    wp02-credentials.test.ts
    wp03-auth.test.ts
    ...
    wp12-drops.test.ts
  level5-integration.test.ts — Cross-workplan integration tests
  level6-system.test.ts     — Full system validation
```

These validation scripts are first-class project artifacts, not throwaway checks. They serve as the regression suite going forward.
