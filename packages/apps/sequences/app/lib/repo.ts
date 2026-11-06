// Reads and writes of the sequences schema shared by methods, jobs and the import. Every query is
// parameterized; DATE columns are read as text so a calendar day never shifts with the host zone.
import type { Definition, Series } from "./compile.js";
import type { DrawingInput, Promotion } from "./draw/replay.js";
import type { Plan, PlannedStep } from "./plan.js";
import { isoOrNull, jsonOf } from "./store.js";
import type { AppStore } from "./types.js";

export type SeriesRow = {
  id: string;
  definition_name: string;
  definition_revision: number;
  series_file_sha256: string;
  body: Series;
  plan: Plan;
  plan_sha256: string;
  state: string;
  send_switch: boolean;
  prize_scope: string | null;
  created_at: string;
  updated_at: string;
};

export type StepRow = PlannedStep & {
  state: string;
  waiting_because: string | null;
  hold_code: string | null;
  run_state: string;
  ready_at: string | null;
  nex_run_id: string | null;
  attempt_no: number;
  result: Record<string, unknown>;
  updated_at: string;
};

export type StepRunRow = {
  run_key: string;
  step_instance_id: string;
  phase: string;
  attempt_no: number;
  job_name: string;
  available_at: string | null;
  nex_run_id: string | null;
  job_revision_id: string | null;
  state: string;
  accepting_at: string;
  accepted_at: string | null;
  finished_at: string | null;
  detail: Record<string, unknown>;
};

function seriesFrom(row: Record<string, unknown>): SeriesRow {
  return {
    id: String(row.id),
    definition_name: String(row.definition_name),
    definition_revision: Number(row.definition_revision),
    series_file_sha256: String(row.series_file_sha256),
    body: jsonOf(row.body, {} as Series),
    plan: jsonOf(row.plan, {} as Plan),
    plan_sha256: String(row.plan_sha256),
    state: String(row.state),
    send_switch: row.send_switch === true,
    prize_scope: (row.prize_scope as string | null) ?? null,
    created_at: isoOrNull(row.created_at)!,
    updated_at: isoOrNull(row.updated_at)!,
  };
}

export async function loadSeries(q: AppStore, id: string): Promise<SeriesRow | null> {
  const row = (await q.query("SELECT * FROM series WHERE id = $1", [id])).rows[0];
  return row ? seriesFrom(row) : null;
}

export async function listSeries(q: AppStore, states?: string[]): Promise<SeriesRow[]> {
  const rows = states
    ? (await q.query("SELECT * FROM series WHERE state = ANY($1::text[]) ORDER BY created_at, id", [states])).rows
    : (await q.query("SELECT * FROM series ORDER BY created_at, id")).rows;
  return rows.map(seriesFrom);
}

const STEP_COLUMNS = `id, ref, series_id, instance_id, step_id, step_do, owner, mode, state, waiting_because, hold_code, run_state,
  due_at, ready_at, not_before, not_after, window_from, window_to, copy_valid_from, copy_valid_until, depends_on, nex_run_id,
  attempt_no, expected, target, work, result, updated_at`;

function stepFrom(row: Record<string, unknown>): StepRow {
  return {
    id: String(row.id),
    ref: String(row.ref),
    series_id: String(row.series_id),
    instance_id: String(row.instance_id),
    step_id: String(row.step_id),
    do: String(row.step_do),
    owner: row.owner as StepRow["owner"],
    mode: row.mode as StepRow["mode"],
    state: String(row.state),
    waiting_because: (row.waiting_because as string | null) ?? null,
    hold_code: (row.hold_code as string | null) ?? null,
    run_state: String(row.run_state),
    due_at: isoOrNull(row.due_at),
    ready_at: isoOrNull(row.ready_at),
    not_before: isoOrNull(row.not_before),
    not_after: isoOrNull(row.not_after),
    window_from: isoOrNull(row.window_from),
    window_to: isoOrNull(row.window_to),
    copy_valid_from: isoOrNull(row.copy_valid_from),
    copy_valid_until: isoOrNull(row.copy_valid_until),
    depends_on: (row.depends_on as string[] | null) ?? [],
    nex_run_id: (row.nex_run_id as string | null) ?? null,
    attempt_no: Number(row.attempt_no ?? 0),
    expected: jsonOf(row.expected, {}),
    target: jsonOf<Record<string, unknown> | null>(row.target, null),
    work: jsonOf(row.work, []),
    result: jsonOf(row.result, {}),
    updated_at: isoOrNull(row.updated_at)!,
  };
}

export async function loadSteps(q: AppStore, seriesId: string): Promise<StepRow[]> {
  return (await q.query(`SELECT ${STEP_COLUMNS} FROM step_instances WHERE series_id = $1 ORDER BY due_at NULLS LAST, ref`, [seriesId])).rows.map(stepFrom);
}

export async function loadStep(q: AppStore, id: string): Promise<StepRow | null> {
  const row = (await q.query(`SELECT ${STEP_COLUMNS} FROM step_instances WHERE id = $1`, [id])).rows[0];
  return row ? stepFrom(row) : null;
}

export async function loadStepByRef(q: AppStore, ref: string): Promise<StepRow | null> {
  const row = (await q.query(`SELECT ${STEP_COLUMNS} FROM step_instances WHERE ref = $1`, [ref])).rows[0];
  return row ? stepFrom(row) : null;
}

export async function allRefs(q: AppStore, seriesStates = ["draft", "awaiting_ok", "observing", "active", "paused"]): Promise<string[]> {
  return (
    await q.query<{ ref: string }>("SELECT s.ref FROM step_instances s JOIN series r ON r.id = s.series_id WHERE r.state = ANY($1::text[]) ORDER BY s.ref", [seriesStates])
  ).rows.map((row) => row.ref);
}

function runFrom(row: Record<string, unknown>): StepRunRow {
  return {
    run_key: String(row.run_key),
    step_instance_id: String(row.step_instance_id),
    phase: String(row.phase),
    attempt_no: Number(row.attempt_no),
    job_name: String(row.job_name),
    available_at: isoOrNull(row.available_at),
    nex_run_id: (row.nex_run_id as string | null) ?? null,
    job_revision_id: (row.job_revision_id as string | null) ?? null,
    state: String(row.state),
    accepting_at: isoOrNull(row.accepting_at)!,
    accepted_at: isoOrNull(row.accepted_at),
    finished_at: isoOrNull(row.finished_at),
    detail: jsonOf(row.detail, {}),
  };
}

export async function loadRuns(q: AppStore, stepIds: string[]): Promise<StepRunRow[]> {
  if (stepIds.length === 0) return [];
  return (await q.query("SELECT * FROM step_runs WHERE step_instance_id = ANY($1::text[]) ORDER BY step_instance_id, phase, attempt_no", [stepIds])).rows.map(runFrom);
}

export async function loadRun(q: AppStore, runKey: string): Promise<StepRunRow | null> {
  const row = (await q.query("SELECT * FROM step_runs WHERE run_key = $1", [runKey])).rows[0];
  return row ? runFrom(row) : null;
}

export async function loadDefinition(q: AppStore, name: string, revision: number): Promise<{ body: Definition; definition_sha256: string; revision: number } | null> {
  const row = (await q.query("SELECT body, definition_sha256, revision FROM definitions WHERE name = $1 AND revision = $2", [name, revision])).rows[0];
  return row ? { body: jsonOf(row.body, {} as Definition), definition_sha256: String(row.definition_sha256), revision: Number(row.revision) } : null;
}

export async function definitionRevisions(q: AppStore, name: string): Promise<Array<{ revision: number; definition_sha256: string; registered_at: string; source_commit: string }>> {
  return (
    await q.query("SELECT revision, definition_sha256, registered_at, source_commit FROM definitions WHERE name = $1 ORDER BY revision", [name])
  ).rows.map((row) => ({ revision: Number(row.revision), definition_sha256: String(row.definition_sha256), registered_at: isoOrNull(row.registered_at)!, source_commit: String(row.source_commit) }));
}

export type StoredDrawing = DrawingInput & { mode: string; committed_at: string | null; beacon_check: string | null; replay: Record<string, unknown> | null; compare: Record<string, unknown> | null; step_instance_id: string | null };

/** Drawings of a scope with their entries, in the replay's input shape. */
export async function loadDrawings(q: AppStore, prizeScope: string, mode: "adopted" | "shadow" | "live" = "adopted"): Promise<StoredDrawing[]> {
  const drawings = (
    await q.query(
      "SELECT night::text AS night, drawing_no, mode, step_instance_id, commit_body, drand_randomness, winners, alternates, promoted, free_hashes, method, committed_at, beacon_check, replay, compare FROM drawings WHERE prize_scope = $1 AND mode = $2 ORDER BY committed_at NULLS LAST, night, drawing_no",
      [prizeScope, mode],
    )
  ).rows;
  if (drawings.length === 0) return [];
  const entries = (
    await q.query("SELECT night::text AS night, drawing_no, entry_id, address_sha256, basis FROM drawing_entries WHERE prize_scope = $1 AND mode = $2 ORDER BY entry_id", [prizeScope, mode])
  ).rows;
  return drawings.map((row) => {
    const own = entries.filter((entry) => entry.night === row.night && Number(entry.drawing_no) === Number(row.drawing_no));
    return {
      night: String(row.night),
      drawing_no: Number(row.drawing_no),
      mode: String(row.mode),
      step_instance_id: (row.step_instance_id as string | null) ?? null,
      receipt: {
        commit: jsonOf(row.commit_body, {} as DrawingInput["receipt"]["commit"]),
        entry_ids: own.map((entry) => String(entry.entry_id)).sort(),
        drand_randomness: String(row.drand_randomness ?? ""),
        winners: (row.winners as string[]) ?? [],
        alternates: (row.alternates as string[]) ?? [],
        promoted: jsonOf<Promotion[]>(row.promoted, []),
        method: String(row.method ?? ""),
      },
      entries: own.map((entry) => ({ entry_id: String(entry.entry_id), address_sha256: String(entry.address_sha256), basis: (entry.basis as string[]) ?? [] })),
      free_hashes: (row.free_hashes as string[]) ?? [],
      beacon: null,
      committed_at: isoOrNull(row.committed_at),
      beacon_check: (row.beacon_check as string | null) ?? null,
      replay: jsonOf<Record<string, unknown> | null>(row.replay, null),
      compare: jsonOf<Record<string, unknown> | null>(row.compare, null),
    };
  });
}

/**
 * The prize ledger as entry ids just before an instant (a drawing's own winners, recorded at its
 * commit, are not in the ledger its entrants were checked against): winners rows before `at`. A
 * winner a promotion replaced stays in it, as in draw_group.py's winners.json.
 */
export async function ledgerAt(q: AppStore, prizeScope: string, at: string): Promise<Set<string>> {
  return new Set(
    (await q.query<{ entry_id: string }>("SELECT entry_id FROM winners WHERE prize_scope = $1 AND at < $2", [prizeScope, at])).rows.map((row) => row.entry_id),
  );
}

export async function latestTeamHashes(q: AppStore, seriesId: string): Promise<string[]> {
  const row = (await q.query("SELECT team_hashes FROM import_bundles WHERE series_id = $1 ORDER BY applied_at DESC LIMIT 1", [seriesId])).rows[0];
  return (row?.team_hashes as string[] | undefined) ?? [];
}

export async function updateStepResult(
  q: AppStore,
  id: string,
  patch: { state?: string; mode?: string; waiting_because?: string | null; hold_code?: string | null; run_state?: string; ready_at?: string | null; nex_run_id?: string | null; result?: Record<string, unknown> },
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [id];
  for (const [column, value] of Object.entries(patch)) {
    values.push(column === "result" ? JSON.stringify(value) : value);
    sets.push(`${column} = $${values.length}${column === "result" ? "::jsonb" : ""}`);
  }
  if (sets.length === 0) return;
  await q.query(`UPDATE step_instances SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, values);
}

export async function runtimeJobs(q: AppStore): Promise<Map<string, { job_id: string; revision_id: string | null; status: string; updated_at: string }>> {
  const rows = (await q.query("SELECT name, job_id, revision_id, status, updated_at FROM runtime_jobs")).rows;
  return new Map(rows.map((row) => [String(row.name), { job_id: String(row.job_id), revision_id: (row.revision_id as string | null) ?? null, status: String(row.status), updated_at: isoOrNull(row.updated_at)! }]));
}
