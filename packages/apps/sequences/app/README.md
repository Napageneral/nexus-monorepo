# Sequences

First-party Nex app that runs approved, time-anchored email and giveaway sequences on the Nex
Jobs kernel. A sequence is written once as a recipe (`sequences/<name>.yaml` in moonsleep-v1,
normalized to JSON by the client); a series is one run of it. Every step instance and every
recipient is a row in the app's PostgreSQL store (`storage.postgres`, schema `sequences`),
reached only through `ctx.app.store`. Every queue entry, attempt, retry and provider
authorization is a Nex Job, Run or Effect: the tables here are business plan and send-decision
records, not a second queue.

## Current scope: P1b (read-only toward the world)

Import, observe, replay, shadow, and the read surfaces. No Klaviyo, Shopify or desk writes, no
sends, no provider credential. The Mac and the review sender stay the owners of every October
step through Fri 10/30; the engine observes them, adopts their evidence and shadows the last three
drawings.

| Method | Access | What it does |
|---|---|---|
| `sequences.health` | authenticated | Tick age, counts and the alert delivery rounds the off-host dead-man emails |
| `sequences.runtime.configure` | **admin** | Plan / apply (sha + `CONFIGURE_SEQUENCES_RUNTIME`) the six jobs and the tick schedule |
| `sequences.definitions.register` / `.get` | authenticated | Compile and store an immutable definition revision / read one |
| `sequences.series.import` | authenticated | October bundle: V1-V10 preview with a `pt_` token, idempotent apply |
| `sequences.brief.get` | authenticated | "How's it going": `BEHIND: … · AHEAD: …` |
| `sequences.timeline.get` | authenticated | The group grid, or one group's step rows |
| `sequences.explain` | authenticated | A ref, an alert id, `msg:<name>` or `src:<name>` under fixed headings |
| `sequences.audit.query` | authenticated | By step (the person view is P4) |
| `sequences.check.run` / `.check.file` | authenticated | Live engine check / offline recipe check |
| `sequences.help.get` | authenticated | Code playbooks, step types, sources, grammars, the output schema |
| `sequences.page.get` | authenticated | The read-only page model (`sequences_page_v1`) |
| `sequences.events.list` | authenticated | Step events after a cursor (what `seqctl watch` polls) |
| `sequences.items.take` / `.items.told` | authenticated | Coordination: lease an item; record that Tyler was told |

Every method except `sequences.health` returns the one output contract
(`schema/output-v1.json`): `{ok, exit, verdict, as_of, subject, data, problems[], next[], apply,
relay, tyler_told, links, text}`. Refusals and bad params come back as `ok: false` in the payload,
never as a thrown error.

### Jobs (registered by the hooks; no manifest field)

| Job | Lane · profile | Allowlist (P1b) | Status |
|---|---|---|---|
| `sequences.tick` | control · `job_profile_control_r1`, 50 s | `jobs.invoke, jobs.invokeMany, jobs.runs.get, jobs.runs.list, jobs.cancel, runtime.health` | active |
| `sequences.step` | workflow · `job_profile_adapter_projection_r1`, 840 s | `credentials.resolve, runtime.health` | active |
| `sequences.draw` | workflow · `job_profile_adapter_projection_r1`, 840 s | `credentials.resolve, runtime.health` | active |
| `sequences.send` | workflow · `job_profile_adapter_projection_r1`, 840 s | `runtime.health` (refuses every Run in P1b) | active |
| `sequences.notify` | control · `job_profile_control_r1`, 60 s | `runtime.health` | active |
| `sequences.agent` | automation · `job_profile_agent_r1` | `runtime.health` | **inactive** until P5 |

One schedule only: `sequences.tick`, `0 * * * * *` UTC, created disabled. No hook ever writes
`enabled`; deactivate parks only the tick, so accepted delayed step Runs are never orphaned.

## Operating it

1. Provision the roles (moonsleep-v1 `provision_sequences_store_roles.sql`) and run the app-store
   migrator against the release root: `node dist/postgres-app-store-migrate.js --package-dir <pkg> --json`.
   The migrator login needs `sequences_owner` **and** `sequences_app` (`WITH INHERIT FALSE, SET TRUE`):
   its post-apply verify pins `SET ROLE sequences_app` (verified, `test/verify-nex.mts`, §8 R-1).
2. Release: `site-nexapp release <pkg> --archive <tar>`; the install hook registers the six jobs and
   the disabled tick schedule.
3. Arm: `sequences.runtime.configure {"mode":"plan","target":"armed"}`, show Tyler the plan sha,
   then on his go apply with `expected_plan_sha256` and `confirmation: "CONFIGURE_SEQUENCES_RUNTIME"`.
   Watch one natural tick (NX-P8). Park with `target: "parked"`.
4. Import October with the client (`scripts/sequences_import.py --all --push`, then `--apply pt_…`).

The app holds no provider write authority in this release (`provider_write_authority: false`).
