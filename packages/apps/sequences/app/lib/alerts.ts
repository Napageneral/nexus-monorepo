// Alert rules active in P1b: A1 (late), A2 (a sequences Run quarantined/held/failed, or a refused
// claim), A4 (shortfall, and the shadow mismatch), A9 (audience above its band), A11 (a Mac
// drawing not imported by 09:30) and A13 (tick heartbeat). A3, A5-A8, A10 and A12 arrive with P2/P5.
// Open alerts are deduped by (rule, subject_ref) and re-sent every 6 h until someone records that
// Tyler was told; in P1b the off-host dead-man delivers them (no SMTP credential in Nex).
import { appendEvent, isoOrNull, jsonOf } from "./store.js";
import { formatCt } from "./time.js";
import type { AppStore } from "./types.js";

export const ACTIVE_RULES = ["A1", "A2", "A4", "A9", "A11", "A13"] as const;
export type Rule = (typeof ACTIVE_RULES)[number];
export const RESEND_MS = 6 * 60 * 60 * 1000;
export const GRACE_MS = 10 * 60 * 1000;
export const DRAW_GRACE_MS = 15 * 60 * 1000;

export const RULE_WORDS: Record<Rule, string> = {
  A1: "late",
  A2: "a sequences Run needs an operator",
  A4: "short of its target",
  A9: "audience outside its band",
  A11: "a Mac drawing is not imported",
  A13: "the tick heartbeat stopped",
};

export type DesiredAlert = {
  rule: Rule;
  subject_ref: string;
  immediate: boolean;
  fix_by: string | null;
  detail: { code: string; message: string; ref: string | null; series_id: string | null } & Record<string, unknown>;
};

export type StepView = {
  id: string;
  ref: string;
  series_id: string;
  series_created_at: string;
  step_id: string;
  owner: string;
  mode: string;
  state: string;
  due_at: string | null;
  expected: Record<string, unknown>;
  result: Record<string, unknown>;
  work: Array<{ phase: string; job: string; due_at: string | null; wait_for?: string; deadline_at?: string | null; supersedes_earlier?: boolean }>;
  runs: Array<{ phase: string; state: string }>;
};

/** Work an engine Run should have started by now; earlier phases a later due phase supersedes are skipped. */
export function phasesDue(step: StepView, now: Date): string[] {
  const due = step.work.filter((item) => item.due_at && Date.parse(item.due_at) <= now.getTime());
  const latestSuperseding = [...due].reverse().find((item) => item.supersedes_earlier);
  return due.filter((item) => !latestSuperseding || item === latestSuperseding || due.indexOf(item) > due.indexOf(latestSuperseding)).map((item) => item.phase);
}

export function evaluateStepAlerts(steps: readonly StepView[], now: Date, importedDrawings: ReadonlySet<string>): DesiredAlert[] {
  const out: DesiredAlert[] = [];
  const at = now.getTime();
  for (const step of steps) {
    const base = { ref: step.ref, series_id: step.series_id };
    const ownedFrom = Date.parse(step.series_created_at);
    // A1 on the engine's own Runs: not started within grace of when it fell due (or of when the
    // engine took the series, for work that was already past).
    for (const phase of phasesDue(step, now)) {
      const item = step.work.find((entry) => entry.phase === phase)!;
      const started = step.runs.some((run) => run.phase === phase && (run.state === "claimed" || run.state === "finished"));
      const grace = item.job === "sequences.draw" ? DRAW_GRACE_MS : GRACE_MS;
      const from = Math.max(Date.parse(item.due_at!), ownedFrom);
      if (!started && at > from + grace) {
        out.push({ rule: "A1", subject_ref: `${step.ref}#${phase}`, immediate: true, fix_by: null, detail: { code: "A1.run_not_started", message: `the engine's ${phase} Run (${item.job}) has not started`, ...base } });
      }
    }
    const verdict = typeof step.result.verdict === "string" ? step.result.verdict : null;
    const summary = typeof step.result.summary === "string" ? step.result.summary : "";
    if (verdict === "late") out.push({ rule: "A1", subject_ref: step.ref, immediate: true, fix_by: null, detail: { code: "A1.evidence_late", message: summary || "late", ...base } });
    if (verdict === "short") out.push({ rule: "A4", subject_ref: step.ref, immediate: true, fix_by: null, detail: { code: "A4.short", message: summary || "short", ...base } });
    if (verdict === "over") out.push({ rule: "A9", subject_ref: step.ref, immediate: true, fix_by: null, detail: { code: "A9.audience_over", message: summary || "above the band", ...base } });
    const shadow = step.result.shadow as Record<string, unknown> | undefined;
    if (shadow && shadow.pass === false) {
      out.push({ rule: "A4", subject_ref: `${step.ref}#shadow`, immediate: true, fix_by: null, detail: { code: "shadow.mismatch", message: `shadow mismatch: ${String(shadow.unexplained ?? 0)} unexplained of ${String((shadow.diffs as unknown[] | undefined)?.length ?? 0)} differences`, ...base } });
    }
    // A Mac note owes its evidence by 09:00 (sent) and 10:30 (received): no import at all, or an
    // import that still read 'pending' past received_by, is late too (unknown is never success).
    if (step.owner === "mac" && typeof step.expected.note === "string" && typeof step.expected.sent_by === "string") {
      const sentBy = Date.parse(step.expected.sent_by) + GRACE_MS;
      const receivedBy = Date.parse(String(step.expected.received_by)) + GRACE_MS;
      if (!verdict && at > Math.max(sentBy, ownedFrom + GRACE_MS)) {
        out.push({ rule: "A1", subject_ref: step.ref, immediate: true, fix_by: null, detail: { code: "A1.evidence_missing", message: `no ${String(step.expected.note).replace("_", "-")} note evidence imported (due sent by ${formatCt(step.expected.sent_by)})`, ...base } });
      } else if (verdict === "pending" && at > Math.max(receivedBy, ownedFrom + GRACE_MS)) {
        out.push({ rule: "A1", subject_ref: step.ref, immediate: true, fix_by: null, detail: { code: "A1.receipt_unconfirmed", message: `${summary || "sent"}; received not confirmed by ${formatCt(String(step.expected.received_by))}`, ...base } });
      }
    }
    // A11: an expected Mac drawing not imported by 09:30 on its morning (this week only).
    if (step.owner === "mac" && step.expected.evidence === "import" && typeof step.expected.import_by === "string" && typeof step.expected.drawing_no === "number") {
      const key = `${String(step.expected.night)}#${step.expected.drawing_no}`;
      if (at > Date.parse(step.expected.import_by) && !importedDrawings.has(key)) {
        out.push({ rule: "A11", subject_ref: step.ref, immediate: true, fix_by: null, detail: { code: "A11.not_imported", message: `drawing ${step.expected.drawing_no} of ${String(step.expected.night)} not imported by ${formatCt(step.expected.import_by)}`, ...base } });
      }
    }
  }
  return out;
}

/** A2 from the runtime's own Run states, listed per sequences job definition. */
export function evaluateRunAlerts(runs: ReadonlyArray<{ id: string; job_name: string; status: string; error?: string | null }>): DesiredAlert[] {
  return runs
    .filter((run) => ["quarantined", "held", "failed", "dead_lettered"].includes(run.status))
    .map((run) => ({
      rule: "A2" as const,
      subject_ref: `run:${run.id}`,
      immediate: true,
      fix_by: null,
      detail: { code: `A2.${run.status}`, message: `${run.job_name} Run ${run.id} is ${run.status}${run.error ? `: ${run.error.slice(0, 160)}` : ""}`, ref: null, series_id: null, run_id: run.id },
    }));
}

type AlertRow = { id: string; rule: string; subject_ref: string; state: string; detail: unknown; immediate: boolean };

/**
 * Makes the open alerts of `rules` equal `desired`: opens new ones, resolves ones whose cause
 * cleared, re-opens a told one that got worse (a new code). Returns what changed.
 */
export async function syncAlerts(
  q: AppStore,
  desired: readonly DesiredAlert[],
  rules: readonly string[],
  now: Date,
  actor = "engine:tick",
  manages: (row: { rule: string; subject_ref: string; detail: Record<string, unknown> }) => boolean = () => true,
): Promise<{ opened: string[]; resolved: string[]; reopened: string[] }> {
  const current = (
    await q.query<AlertRow>("SELECT id, rule, subject_ref, state, detail, immediate FROM alerts WHERE state <> 'resolved' AND rule = ANY($1::text[])", [rules as string[]])
  ).rows.filter((row) => manages({ rule: row.rule, subject_ref: row.subject_ref, detail: jsonOf<Record<string, unknown>>(row.detail, {}) }));
  const key = (rule: string, subject: string) => `${rule}\u001f${subject}`;
  const wanted = new Map(desired.filter((entry) => rules.includes(entry.rule)).map((entry) => [key(entry.rule, entry.subject_ref), entry]));
  const have = new Map(current.map((row) => [key(row.rule, row.subject_ref), row]));
  const changed = { opened: [] as string[], resolved: [] as string[], reopened: [] as string[] };
  for (const [name, entry] of wanted) {
    const row = have.get(name);
    if (!row) {
      const serial = Number((await q.query<{ n: string }>("SELECT nextval('alert_serial') AS n")).rows[0]!.n);
      const id = `${entry.rule}-${String(serial).padStart(4, "0")}`;
      const inserted = await q.query(
        "INSERT INTO alerts (id, rule, subject_ref, immediate, state, opened_at, fix_by, detail) VALUES ($1, $2, $3, $4, 'open', $5, $6, $7::jsonb) ON CONFLICT DO NOTHING",
        [id, entry.rule, entry.subject_ref, entry.immediate, now.toISOString(), entry.fix_by, JSON.stringify(entry.detail)],
      );
      if (inserted.rowCount === 1) {
        changed.opened.push(id);
        await appendEvent(q, { series_id: entry.detail.series_id, actor, event: "alert.opened", detail: { alert: id, rule: entry.rule, subject_ref: entry.subject_ref, code: entry.detail.code } });
      }
      continue;
    }
    const before = jsonOf<Record<string, unknown>>(row.detail, {});
    if (row.state === "told" && before.code !== entry.detail.code) {
      await q.query("UPDATE alerts SET state = 'open', detail = $2::jsonb, last_delivered_at = NULL WHERE id = $1", [row.id, JSON.stringify(entry.detail)]);
      changed.reopened.push(row.id);
      await appendEvent(q, { series_id: entry.detail.series_id, actor, event: "alert.reopened", detail: { alert: row.id, code: entry.detail.code } });
    } else if (JSON.stringify(before) !== JSON.stringify(entry.detail)) {
      await q.query("UPDATE alerts SET detail = $2::jsonb WHERE id = $1", [row.id, JSON.stringify(entry.detail)]);
    }
  }
  for (const [name, row] of have) {
    if (wanted.has(name)) continue;
    await q.query("UPDATE alerts SET state = 'resolved', resolved_at = $2 WHERE id = $1 AND state <> 'resolved'", [row.id, now.toISOString()]);
    changed.resolved.push(row.id);
    const detail = jsonOf<Record<string, unknown>>(row.detail, {});
    await appendEvent(q, { series_id: (detail.series_id as string | null) ?? null, actor, event: "alert.resolved", detail: { alert: row.id, rule: row.rule, subject_ref: row.subject_ref } });
  }
  return changed;
}

/** Opens one alert unless the same (rule, subject) is already open; never resolves anything. */
export async function openAlert(q: AppStore, entry: DesiredAlert, now: Date, actor: string): Promise<string | null> {
  const open = (await q.query<{ id: string }>("SELECT id FROM alerts WHERE rule = $1 AND subject_ref = $2 AND state <> 'resolved'", [entry.rule, entry.subject_ref])).rows[0];
  if (open) return open.id;
  const serial = Number((await q.query<{ n: string }>("SELECT nextval('alert_serial') AS n")).rows[0]!.n);
  const id = `${entry.rule}-${String(serial).padStart(4, "0")}`;
  const inserted = await q.query(
    "INSERT INTO alerts (id, rule, subject_ref, immediate, state, opened_at, fix_by, detail) VALUES ($1, $2, $3, $4, 'open', $5, $6, $7::jsonb) ON CONFLICT DO NOTHING",
    [id, entry.rule, entry.subject_ref, entry.immediate, now.toISOString(), entry.fix_by, JSON.stringify(entry.detail)],
  );
  if (inserted.rowCount !== 1) return null;
  await appendEvent(q, { series_id: entry.detail.series_id, actor, event: "alert.opened", detail: { alert: id, rule: entry.rule, subject_ref: entry.subject_ref, code: entry.detail.code } });
  return id;
}

/** The A2 alerts the tick derives from Run states (claim refusals stay until someone is told). */
export const RUN_STATE_A2_CODES = new Set(["A2.quarantined", "A2.held", "A2.failed", "A2.dead_lettered"]);

/** A lease that ran out hands its alert back to open, so re-sends resume. */
export async function releaseExpiredTakes(q: AppStore, now: Date): Promise<number> {
  const result = await q.query(
    "UPDATE alerts SET state = 'open' WHERE state = 'taken' AND NOT EXISTS (SELECT 1 FROM item_leases l WHERE l.item_ref = alerts.id AND l.until > $1)",
    [now.toISOString()],
  );
  return result.rowCount;
}

/** The words of one alert: ids and counts only, never an address (HR-21). */
export function renderAlert(row: { id: string; rule: string; subject_ref: string; opened_at: unknown; detail: unknown }): string {
  const detail = jsonOf<Record<string, unknown>>(row.detail, {});
  const rule = row.rule as Rule;
  return `${row.id} · ${RULE_WORDS[rule] ?? row.rule} · ${row.subject_ref} · ${String(detail.message ?? "")} · opened ${formatCt(isoOrNull(row.opened_at) ?? new Date().toISOString())}`;
}

/** Alerts due a delivery round now: open, immediate, never delivered or last delivered 6 h ago. */
export async function alertsDueDelivery(q: AppStore, now: Date): Promise<Array<{ id: string; rule: string; subject_ref: string; opened_at: unknown; detail: unknown; deliveries: number }>> {
  return (
    await q.query<{ id: string; rule: string; subject_ref: string; opened_at: unknown; detail: unknown; deliveries: number }>(
      "SELECT id, rule, subject_ref, opened_at, detail, deliveries FROM alerts WHERE state = 'open' AND immediate AND (last_delivered_at IS NULL OR last_delivered_at <= $1) ORDER BY opened_at, id",
      [new Date(now.getTime() - RESEND_MS).toISOString()],
    )
  ).rows;
}
