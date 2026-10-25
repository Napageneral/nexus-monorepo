# Sequences P1b spec: the contracts this app exposes and expects

The design and build manual live in the session that built this (final_design.txt,
build_manual.md); this page pins what other pieces depend on. Decisions taken here where the
manual said UNCONFIRMED or conflicted with code or policy are marked **Decided**.

## Method params the ops API passes through (B1 route table)

GET query keys arrive as strings; booleans accept `1`/`true`. Every method also takes `by`
(actor id `^[a-z0-9][a-z0-9_-]*@[a-z0-9][a-z0-9_-]*(#…)?$`, no dots) and rejects unknown keys
and anything shaped like an email address (exit 1, usage).

| Route | Method | Params |
|---|---|---|
| GET brief | `sequences.brief.get` | `series`/`s`, `since` (`last-relay` or ISO), `needs`, `digest` (P2: refused) |
| GET timeline | `sequences.timeline.get` | `series` (`<series>` or `<series>/<instance>`)/`s`, `instance`, `from`, `to` (ISO), `owner` |
| GET explain | `sequences.explain` | `ref` (or `target`) |
| GET audit | `sequences.audit.query` | `step` (or `ref`), `against` (`winners`/`team`), `actions`, `missing` |
| GET check | `sequences.check.run` | `series`/`s`, `target` (`engine`) |
| GET help | `sequences.help.get` | `topic` (or `code`) |
| GET health | `sequences.health` | none |
| GET page | `sequences.page.get` | `series`/`s` |
| GET events | `sequences.events.list` | `series`/`s`, `after` (event id), `limit` (≤ 500) |
| POST import | `sequences.series.import` | `bundle`, `mode` (`preview`/`apply`), `preview_token` |
| POST items/take | `sequences.items.take` | `item`, `by`, `note`, `eta`, `release` |
| POST items/told | `sequences.items.told` | `items` (or `item`/`refs`), `by`, `note`, `asked` |
| POST check/file | `sequences.check.file` | `files: [{path, body}]` (PyYAML-parsed JSON) |

`sequences.runtime.configure` (admin) and `sequences.definitions.*` have no ops route: operators
call them on the site.

## Output contract (`schema/output-v1.json`)

`{contract: "sequences_output_v1", command, ok, exit, verdict{text,behind,ahead}, as_of{ct,utc},
subject{series,ref,resolved_from}, data, problems[], next[], apply, relay{text,facts[]},
tyler_told, links{page}, text}`. **Decided (NX-P17):** the ax draft's `next[].kind` and
`fix.kind` are `fix_type`. `text` is line 1 the verdict plus `· exit N`, then the body, problems,
`next:` lines and last `relay:`.

## `sequences.health` (the dead-man reads it every 5 minutes)

`{contract_id: "sequences_health_v1", app_version, phase, schema, as_of, last_tick_at,
last_tick_run_id, tick_age_s, ticks, probe{last_slot, ops_reach_at, ops_reach_ok,
drand_reach_ok}, series{observing, active, paused, total}, overdue, held, short, quarantined,
open_alerts, next_due_at, alert_delivery: "deadman", alerts_to_deliver: [{id, delivery_key,
rule, subject_ref, opened_at, text, next_round_after}], provider_write_authority: false}`.
**Decided:** the dead-man keys its R2 state by `delivery_key` (`<alert id>#<round>`); the notify
job starts a new round every 6 h until someone records `told`, so one email per round.

## Import bundle (`schema/import-bundle-v1.json`)

The manual's bundle with three changes the client (B2 `scripts/sequences_import.py`) must make:

1. **Decided (NX-P17):** the bundle's `kind` is `scope` (`full`/`drawing`) and a note's `kind` is
   `note` (`winner`/`still_entered`). A bundle with any `kind` field is refused with
   `check.field_kind_forbidden` naming the rename.
2. **Decided:** a full bundle for a new series carries `definitions: [{body, yaml_sha256,
   source_commit}]` (review-group-giveaway and prize-claim) and `series_file: {body, yaml_sha256,
   source_commit}`; nothing else registers them (there is no ops route for register).
3. **Decided:** the `'@'` guard applies to the evidence. The recipe bodies are checked for
   anything shaped like an address instead, because a series names `<sequence>@<rev>`.

`bundle_sha256` is sha256 of the RFC 8785 canonical bundle; for this bundle (strings, integers,
no floats) `json.dumps(b, sort_keys=True, separators=(",", ":"), ensure_ascii=False)` hashes the
same. Campaign rows may carry `campaign_id_prefix` (G1's truncated id) and `resend_of`.
YAML 1.1 reads a bare `on:`/`off:` key as a boolean: quote them in the recipes
(`check.yaml_bool_key` otherwise).

## Ops sources answers this app expects (B1)

Every answer: `{contract: "sequences_sources_v1", as_of, sha256, count, rows}`; anything else
holds the step (`hold.source_stale`). The client recomputes sha256 over the RFC 8785 form of
`rows` and records whether it matches (a mismatch is evidence, not a hold).

- `entries?night=&deadline=<ISO UTC>` → `rows: {group_size, invitation_statuses,
  group_email_at_utc, reviews_entered, review_entrants: [{address_sha256, entry_id,
  review_ids[]}], member_hashes?}`. With `&explain=<comma hashes>` the same rows plus
  `explain: {members: [{address_sha256, member?, invitation_status, last_error, created_at,
  updated_at}], reviews: [{address_sha256, review_id, at, moderation_status, rejected_at,
  updated_at}]}`. Membership of free-entry hashes comes from `member_hashes` if present, else
  from `explain.members` (a hash with no row is not a member).
- `invitations?night=` → preferred `rows: {night: {total, not_cancelled, first_created_at?},
  followup: {total, not_cancelled}}`; the GROUP_LEDGER_SQL tuples `[ledger, night, total,
  not_cancelled]` and objects naming the ledger are read too. `first_created_at` (the night's
  min(created_at) of members, the drawing's `group_email_at_utc`) is what V10 compares.
- `health` → any rows; the probe needs only the contract.

## Credentials (seeded on Tyler's go, §5 step 12)

`credentials.resolve {service: "sequences", account: "ops-access-client-id"}` and
`{…, account: "ops-access-client-secret"}`, sent as `CF-Access-Client-Id/Secret`. UNCONFIRMED
(§8 R-2): that a worker attempt may call `credentials.resolve`; the probe proves it on the first
armed tick.

## Store roles (B1 provisioning) — §8 R-1 settled

The migrator login needs `GRANT sequences_owner TO nex_moonsleep_migrator WITH ADMIN FALSE,
INHERIT TRUE, SET TRUE` **and** `GRANT sequences_app TO nex_moonsleep_migrator WITH ADMIN FALSE,
INHERIT FALSE, SET TRUE`: the migrator's post-apply verify goes through `createAppStore`, which
pins `SET ROLE sequences_app` (owner-only fails: "permission denied to set role"). The runtime
login needs `sequences_app` with SET.

## Engine decisions recorded here

- **Run keys** are `seq:<series>:<instance>:<step>:<phase>:a<n>` (the manual's key plus the
  phase: one step has several engine Runs, o1/o2 observe reads and s0/s1/c shadow Runs); Run input
  is `{step_instance_id, run_key}`, ids only. System Runs: `seq:_system:probe:<yyyymmddhhmm>`
  (every 30 min) and `seq:_system:notify:<yyyymmddhhmm>`.
- **Claim** is a compare-and-set on `step_runs` (not `step_instances`), because a step has
  several phases.
- **The tick reads job ids and revisions from `runtime_jobs`**, which the hooks and configure
  write; it holds no `jobs.list`.
- **A2's status filter**: `jobs.runs.list` accepts `status` (jobs.ts:804-846), so the tick lists
  each sequences job's quarantined/held/failed/dead_lettered Runs of the last 48 h.
- **sequences.agent's lane** is `automation`: there is no `agent` lane (work.ts WORK_LANE_IDS);
  agent turns run on automation (agent-turn-contract.ts).
- **Copy shas**: a placeholder on a message an engine step sends in THIS release is an ERROR;
  for engine steps whose type arrives later (P2: claims, codes, half-off) it is PENDING
  `check.copy_not_approved`, so the October definition registers today.
- **Engine steps due before the import** and not named in `owners.engine` (the five
  `preflight`s) start `skipped`; the named engine steps wait "because P2 not released".
- **`send_incomplete`** is a WARN in P1b (not in the P1b check list; the design's own followup and
  still-entered steps lack target/on_partial).
- **Ledger at a drawing's commit** excludes that drawing's own winners (strictly before).
