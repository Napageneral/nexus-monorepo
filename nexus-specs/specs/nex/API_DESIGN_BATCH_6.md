# API Design: Batch 6 — Jobs, Cron, DAGs, Agent Config, Browser, TTS, Wizard

**Status:** COMPLETE — all decisions locked
**Last Updated:** 2026-03-04

---

## Overview

Batch 6 covers the work domain unification (jobs, cron, DAGs), agent configuration profiles, and disposition decisions for browser, TTS, and wizard subsystems.

**Cross-references:**
- Work Domain Unification (primitives, schemas, reasoning): [WORK_DOMAIN_UNIFICATION.md](./WORK_DOMAIN_UNIFICATION.md)
- Clock/Cron (superseded): [API_DESIGN_BATCH_4.md](./API_DESIGN_BATCH_4.md) (Batch 4)
- Agents domain (extended): [API_DESIGN_BATCH_4.md](./API_DESIGN_BATCH_4.md) (Batch 4)
- Memory jobs (absorbed): [API_DESIGN_BATCH_3.md](./API_DESIGN_BATCH_3.md) (Batch 3)
- TTS Extraction: [TTS_EXTRACTION.md](./TTS_EXTRACTION.md)
- Wizard Redesign: [WIZARD_REDESIGN.md](./WIZARD_REDESIGN.md)

---

## Domain 1: Jobs (`jobs.*`)

Unified job management. Replaces: `automations.*`, `work.tasks.*`, `work.items.*`, memory `jobs.*`.

See [WORK_DOMAIN_UNIFICATION.md](./WORK_DOMAIN_UNIFICATION.md) for full schema and reasoning.

### Operations (8)

| Operation | Type | Description |
|-----------|------|-------------|
| `jobs.list` | read | List job definitions with optional filters (status, hook_points, created_by) |
| `jobs.get` | read | Get a specific job definition by ID or name |
| `jobs.create` | write | Create a new job definition (script_path, config, workspace_dir, hook_points) |
| `jobs.update` | write | Update a job definition (config, status, timeout, hook_points). Script changes detected via hash → auto-version. |
| `jobs.delete` | write | Disable a job definition (sets status to disabled, does not hard delete) |
| `jobs.invoke` | write | Manually invoke a job — creates a job run immediately |
| `jobs.runs.list` | read | List job runs with filters (job_definition_id, status, date range, dag_run_id) |
| `jobs.runs.get` | read | Get a specific job run with full details including turn_ids for agent behavior inspection |

### Naming Changes

| Old Operation | New Operation | Notes |
|---------------|---------------|-------|
| `automations.list` | `jobs.list` | Same concept, new name |
| `automations.create` | `jobs.create` | Triggers separated out |
| `automations.update` | `jobs.update` | Script hash versioning added |
| `automations.delete` | `jobs.delete` | Soft delete via status |
| `automations.invoke` | `jobs.invoke` | Manual trigger |
| `work.tasks.list` | `jobs.list` | Tasks are just job definitions |
| `work.tasks.create` | `jobs.create` | |
| `work.items.list` | `jobs.runs.list` | Work items are job runs |
| `work.items.get` | `jobs.runs.get` | |
| `work.items.create` | `jobs.invoke` | Creating a work item = invoking a job |
| `work.items.complete` | *(automatic)* | Job runs complete when the script/agent finishes |
| `work.items.cancel` | *(direct status update)* | Cancel via run management |
| `work.items.assign` | *(agent config)* | Assignment is handled by agent config profiles |
| `work.items.snooze` | *(reschedule via cron)* | Deferral is a scheduling concern |
| `work.items.events.list` | `jobs.runs.list` | Job runs ARE the audit trail |
| `work.dashboard.summary` | *(computed)* | Dashboard stats computed from job_runs queries |

### Dropped Operations

| Operation | Reason |
|-----------|--------|
| `work.entities.seed` | Entity management lives in identity domain (Batch 2) |
| `work.campaigns.instantiate` | Campaigns create DAG runs — use `dags.runs.start` with batch parameters |
| `work.workflows.instantiate` | Use `dags.runs.start` |

---

## Domain 2: Cron (`cron.*`)

Unified time-based scheduling. Replaces: `clock.schedule.*` from Batch 4, work scheduler, clock tick service.

See [WORK_DOMAIN_UNIFICATION.md](./WORK_DOMAIN_UNIFICATION.md) for full schema and cron expression examples.

### Operations (6)

| Operation | Type | Description |
|-----------|------|-------------|
| `cron.list` | read | List cron schedules with optional filters (job_definition_id, enabled) |
| `cron.get` | read | Get a specific cron schedule |
| `cron.create` | write | Create a cron schedule binding a job to a time pattern |
| `cron.update` | write | Update a schedule (expression, timezone, date range, enabled) |
| `cron.delete` | write | Delete a cron schedule |
| `cron.trigger` | write | Manually trigger a scheduled job now (creates an immediate job run, ignoring the schedule) |

### Naming Changes

| Old Operation | New Operation | Notes |
|---------------|---------------|-------|
| `clock.schedule.list` | `cron.list` | Keeping the cron name — agents understand cron well |
| `clock.schedule.get` | `cron.get` | |
| `clock.schedule.create` | `cron.create` | Schedule format simplified: expression + date range |
| `clock.schedule.update` | `cron.update` | |
| `clock.schedule.delete` | `cron.delete` | |
| `clock.schedule.trigger` | `cron.trigger` | |

### Key Design Decisions

**Everything is a cron expression.** No separate `kind` field for interval vs cron vs at. The 6-field cron expression (with seconds) handles all patterns. Date range fields (`active_from`, `active_until`) handle windowing and one-shots.

**Clock tick is just a cron schedule.** The `*/30 * * * * *` expression replaces the separate clock tick service and its fixed `setInterval`. One scheduling runtime for everything.

**No error tracking on schedules.** The cron schedule fires; the job either succeeds or fails. Error tracking lives on job runs. Circuit-breaker behavior (auto-disable after consecutive failures) is computed from recent job run status for the job_definition_id.

---

## Domain 3: DAGs (`dags.*`)

Directed Acyclic Graph workflow management. Replaces: `work.workflows.*`, `work.sequences.*`.

See [WORK_DOMAIN_UNIFICATION.md](./WORK_DOMAIN_UNIFICATION.md) for full schema and DAG advancement logic.

### Operations (10)

| Operation | Type | Description |
|-----------|------|-------------|
| `dags.list` | read | List DAG definitions |
| `dags.get` | read | Get a DAG definition with all its nodes |
| `dags.create` | write | Create a DAG definition with nodes (job refs, dependencies, conditions) |
| `dags.update` | write | Update a DAG definition (add/remove/modify nodes) |
| `dags.delete` | write | Delete a DAG definition |
| `dags.runs.list` | read | List DAG runs with filters (dag_definition_id, status) |
| `dags.runs.get` | read | Get a DAG run with all node statuses and job run references |
| `dags.runs.start` | write | Start a new DAG run (optionally with batch/campaign parameters for multiple entities) |
| `dags.runs.pause` | write | Pause a running DAG (stops advancing to new nodes, in-progress nodes complete) |
| `dags.runs.resume` | write | Resume a paused DAG |
| `dags.runs.cancel` | write | Cancel a DAG run (cancels pending job runs, in-progress nodes may complete) |

### Naming Changes

| Old Operation | New Operation | Notes |
|---------------|---------------|-------|
| `work.workflows.list` | `dags.list` | Workflows are DAG definitions |
| `work.workflows.create` | `dags.create` | Steps are now nodes with full dependency graph |
| `work.workflows.instantiate` | `dags.runs.start` | Instantiation creates a DAG run |
| `work.sequences.list` | `dags.runs.list` | Sequences are DAG runs |
| `work.sequences.get` | `dags.runs.get` | |
| `work.campaigns.instantiate` | `dags.runs.start` | Campaigns use batch parameters to create multiple DAG runs |

### DAG Use Cases

**Episode finalization** (memory processing chain):
```
DAG: "episode_finalization"
  node_1 → job: "retain"             (depends_on: [])
  node_2 → job: "retain_self"        (depends_on: [])
  node_3 → job: "consolidate"        (depends_on: [node_1])
  node_4 → job: "consolidate_self"   (depends_on: [node_2])
```

**Sales outreach sequence** (multi-step campaign):
```
DAG: "sales_sequence"
  node_1 → job: "initial_outreach"    (depends_on: [])
  node_2 → job: "first_followup"      (depends_on: [node_1], delay: 3 days)
  node_3 → job: "value_prop"          (depends_on: [node_2], delay: 5 days)
  node_4 → job: "objection_handling"  (depends_on: [node_3], condition: "not_replied")
  node_5 → job: "close_attempt"       (depends_on: [node_3], condition: "replied")
```

**Self-improvement workflow**:
```
DAG: "self_improve"
  node_1 → job: "execute_task"        (depends_on: [])
  node_2 → job: "evaluate_result"     (depends_on: [node_1])
  node_3 → job: "update_script"       (depends_on: [node_2], condition: "improvement_found")
```
When the "update_script" job modifies the script file, the next load detects the hash change and creates a new version — immutable lineage of improvements.

---

## Domain 4: Agent Configs (`agents.configs.*`)

Extends the agents domain from Batch 4. Database-backed named configuration presets.

See [WORK_DOMAIN_UNIFICATION.md](./WORK_DOMAIN_UNIFICATION.md) for full schema and the Persona/Role/Job trinity.

### Operations (5)

| Operation | Type | Description |
|-----------|------|-------------|
| `agents.configs.list` | read | List all agent config presets (both named and auto-generated) |
| `agents.configs.get` | read | Get a specific agent config |
| `agents.configs.create` | write | Create a named config preset |
| `agents.configs.update` | write | Update a named preset |
| `agents.configs.delete` | write | Delete a config preset |

### Key Design Decisions

**Config moves to database.** Currently agent config is file-based (`.nex.yaml`). Moving to database enables: named presets, A/B testing, runtime swapping, attribution tracking, and immutable snapshots per-turn.

**Agent turns reference agent_config_id.** All config fields come off the turn record. The turn points to an agent_config record. If runtime overrides change a value, a NEW agent_config record is auto-created and the turn references that specific snapshot.

**Replaces hardcoded role-caps.ts.** The current `MANAGER_MWP_TOOL_ALLOWLIST` and `WORKER_ROLE_TOOL_DENYLIST` become named agent_config records. Runtime looks up configs by name instead of referencing hardcoded arrays.

**Named presets vs auto-generated:**
- Named presets (`name` is set): Actively managed by users. "deep_researcher", "fast_worker", "manager_v2".
- Auto-generated (`name` is null): Created automatically when runtime overrides modify a named preset for a specific invocation. Provides exact config snapshot for that turn.

### Cross-Reference: Batch 4 Impact

The `agents.*` domain from Batch 4 gains this sub-resource. Agent turns gain an `agent_config_id` FK. The `effective_config_json` field on turns becomes optional/deprecated — the `agent_config_id` reference IS the config snapshot.

---

## Domain 5: Browser (`browser.*`)

### Decision: Light Touch, Defer Full Redesign

The browser subsystem is large (44 internal HTTP routes, 12 act kinds, 3 execution targets, Playwright-based) and warrants its own dedicated design session.

**For now:**
- Keep `browser.request` as the single proxy operation
- Acknowledge that `node` execution target is deprecated (device proxying folded into adapters)
- Defer promotion of internal routes to proper operations to a future batch

### Current Operations (1)

| Operation | Type | Description |
|-----------|------|-------------|
| `browser.request` | write | Proxy to internal browser HTTP API. Accepts method, path, body. |

### Deprecated Concepts

| Concept | Status | Notes |
|---------|--------|-------|
| `node` execution target | Deprecated | Device proxying folded into adapter system. Only `host` and `sandbox` targets remain. |
| Remote device proxy routes | Deprecated | Adapters handle device communication now. |

### Future Work (Deferred)

Full browser API redesign will:
- Promote key routes to proper operations (lifecycle, tabs, navigation, interaction, observation)
- Enable proper IAM/audit granularity per browser action
- Remove deprecated execution targets from code
- Design around the new adapter-based device model

---

## Domain 6: Speech/TTS — Extracted

### Decision: Extract to Standalone Package

Speech/TTS is NOT an adapter and NOT a core Nexus subsystem. It is a credential-backed utility that transforms text into audio. It will be extracted as its own standalone package.

**All `tts.*` and `talk.*` operations removed from the Nex operation taxonomy.**

See [TTS_EXTRACTION.md](./TTS_EXTRACTION.md) for the full seed spec.

### Summary

- Three providers (Edge TTS free, OpenAI paid, ElevenLabs paid) with auto-fallback
- Extracts to standalone npm package / CLI tool (like aix or gogcli)
- Nexus agents access via skill document that the MA can reference
- Provider API keys stored as Nexus credentials, passed at invocation time
- Talk mode (continuous voice) remains a client-side feature

### Removed Operations

| Operation | Status |
|-----------|--------|
| `tts.status` | Removed from core — package-internal |
| `tts.enable` | Removed from core |
| `tts.disable` | Removed from core |
| `tts.convert` | Removed from core |
| `tts.setProvider` | Removed from core |
| `tts.providers` | Removed from core |
| `talk.config` | Removed from core |
| `talk.mode` | Removed from core |

---

## Domain 7: Wizard — Deferred

### Decision: Full Redesign After Nex Runtime Solidifies

The wizard needs a ground-up redesign once the adapter connection system, credential system, and agent workspace primitives are stable. The current implementation is tightly coupled to upstream-specific flows.

**The 4 RPC operations are kept as-is.** They're a solid protocol regardless of what the wizard content looks like.

See [WIZARD_REDESIGN.md](./WIZARD_REDESIGN.md) for the full seed spec.

### Kept Operations (4)

| Operation | Type | Description |
|-----------|------|-------------|
| `wizard.start` | write | Begin wizard session |
| `wizard.next` | write | Advance to next step with answer |
| `wizard.cancel` | write | Cancel wizard session |
| `wizard.status` | read | Get current wizard state |

---

## Batch 6 Operation Count Summary

| Domain | Operations | Status |
|--------|-----------|--------|
| Jobs (`jobs.*`) | 8 | New (replaces automations + work tasks + memory jobs) |
| Cron (`cron.*`) | 6 | Renamed from `clock.schedule.*`, simplified |
| DAGs (`dags.*`) | 10 | New |
| Agent Configs (`agents.configs.*`) | 5 | New (extends Batch 4 agents domain) |
| Browser (`browser.*`) | 1 | Existing, deferred full redesign |
| TTS (`tts.*`, `talk.*`) | 0 | Extracted to standalone package |
| Wizard (`wizard.*`) | 4 | Existing, deferred redesign |

**Total: 34 operations** (29 new/renamed, 5 existing/kept)

---

## Dropped Operations (Full List)

Operations from the current taxonomy that are absorbed or eliminated:

| Old Operation | Disposition |
|---------------|------------|
| `work.tasks.list` | → `jobs.list` |
| `work.tasks.create` | → `jobs.create` |
| `work.workflows.list` | → `dags.list` |
| `work.workflows.create` | → `dags.create` |
| `work.workflows.instantiate` | → `dags.runs.start` |
| `work.campaigns.instantiate` | → `dags.runs.start` (with batch parameters) |
| `work.items.list` | → `jobs.runs.list` |
| `work.items.get` | → `jobs.runs.get` |
| `work.items.create` | → `jobs.invoke` |
| `work.items.assign` | Dropped — assignment via agent config |
| `work.items.snooze` | Dropped — deferral via cron rescheduling |
| `work.items.complete` | Dropped — job runs complete automatically |
| `work.items.cancel` | Absorbed into run management |
| `work.items.events.list` | → `jobs.runs.list` (runs ARE the audit trail) |
| `work.sequences.list` | → `dags.runs.list` |
| `work.sequences.get` | → `dags.runs.get` |
| `work.dashboard.summary` | Dropped — computed from job_runs queries |
| `work.entities.seed` | Dropped — entity management in identity domain |
| `clock.schedule.list` | → `cron.list` |
| `clock.schedule.get` | → `cron.get` |
| `clock.schedule.create` | → `cron.create` |
| `clock.schedule.update` | → `cron.update` |
| `clock.schedule.delete` | → `cron.delete` |
| `clock.schedule.trigger` | → `cron.trigger` |
| `tts.status` | Extracted to standalone package |
| `tts.enable` | Extracted |
| `tts.disable` | Extracted |
| `tts.convert` | Extracted |
| `tts.setProvider` | Extracted |
| `tts.providers` | Extracted |
| `talk.config` | Extracted |
| `talk.mode` | Extracted |
