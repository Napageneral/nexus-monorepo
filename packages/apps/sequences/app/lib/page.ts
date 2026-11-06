// sequences.page.get: the read the ops-ui Sequences page draws (apps/ops-ui/src/sequencesClient.ts,
// contract sequences_page_v1). The page parses fail-closed, so this shape is exact: every time a UTC
// instant (the page prints Central), people only as entry ids, null for unknown (never 0, P6).
import type { AlertView } from "./render.js";
import { resultText, stepState } from "./render.js";
import type { SeriesRow, StepRow, StoredDrawing } from "./repo.js";

export const PAGE_CONTRACT = "sequences_page_v1";

const STEP_TYPE: Record<string, string> = {
  send_flow_event: "email",
  draw: "drawing",
  free_entry_intake: "entries",
  spawn: "claim_close",
  wait_for: "claim_close",
  promote_alternates: "claim_close",
  issue_codes: "codes",
  task: "task",
  desk_handoff: "task",
  agent: "task",
  assert: "check",
  approval: "check",
  wait_until: "check",
  notify: "check",
  arm_flows: "check",
};

const LABELS: Record<string, string> = {
  preflight: "Pre-checks",
  night_ask: "Night invite",
  followup: "Follow-up",
  code_go: "Your OK for the codes",
  codes: "Half-off codes",
  half_off_note: "Half-off note",
};

/** A step's words for the page: "Drawing 1", "Winner note 2", "Free entries 1", "Prize claims 1". */
export function stepLabel(stepId: string): string {
  if (LABELS[stepId]) return LABELS[stepId]!;
  const match = /^(.*?)_(\d)$/.exec(stepId);
  const base = (match ? match[1]! : stepId).replace(/_/g, " ");
  const named: Record<string, string> = { draw: "Drawing", winner_note: "Winner note", still_entered: "Still-entered note", entries: "Free entries", claims: "Prize claims" };
  const words = named[match ? match[1]! : stepId] ?? base.charAt(0).toUpperCase() + base.slice(1);
  return match ? `${words} ${match[2]}` : words;
}

function targetText(step: StepRow): string | null {
  const target = step.target as Record<string, unknown> | null;
  if (!target) return null;
  const parts = Object.entries(target).filter(([, value]) => typeof value === "string" || typeof value === "number").map(([key, value]) => `${key} ${String(value)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

type ShadowCompare = {
  pass?: boolean;
  diffs?: Array<{ class: string }>;
  read?: { phase?: string; as_of?: string };
  engine_entries?: number;
  engine_entry_list_sha256?: string;
  winners_match?: boolean;
};

function shadowOf(shadow: StoredDrawing | undefined): Record<string, unknown> | null {
  if (!shadow) return null;
  const compare = (shadow.compare ?? null) as ShadowCompare | null;
  if (!compare || compare.pass === undefined) {
    return { result: "pending", read: null, read_at: null, engine_entries: null, engine_entry_list_sha256: null, winners_match: null, diffs: [] };
  }
  const counts = new Map<string, number>();
  for (const diff of compare.diffs ?? []) counts.set(diff.class, (counts.get(diff.class) ?? 0) + 1);
  const phase = (compare.read?.phase ?? "").toUpperCase();
  return {
    result: compare.pass ? "match" : "mismatch",
    read: phase === "S1" || phase === "S2" ? phase : null,
    read_at: compare.read?.as_of ?? null,
    engine_entries: typeof compare.engine_entries === "number" ? compare.engine_entries : shadow.receipt.entry_ids.length,
    engine_entry_list_sha256: compare.engine_entry_list_sha256 ?? shadow.receipt.commit.entry_list_sha256 ?? null,
    winners_match: typeof compare.winners_match === "boolean" ? compare.winners_match : compare.pass,
    diffs: [...counts.entries()].map(([klass, count]) => ({ class: klass, count })),
  };
}

export type PageInput = {
  series: SeriesRow | null;
  steps: StepRow[];
  alerts: AlertView[];
  drawings: StoredDrawing[];
  shadows: StoredDrawing[];
  campaigns: Array<Record<string, unknown>>;
  health: Record<string, unknown>;
  now: Date;
};

export function buildPage(input: PageInput): Record<string, unknown> {
  const { series, steps, alerts, now } = input;
  const health = input.health;
  const probe = (health.probe ?? {}) as Record<string, unknown>;
  const healthOut = {
    last_tick_at: health.last_tick_at ?? null,
    tick_age_s: health.tick_age_s ?? null,
    ticks: Number(health.ticks ?? 0),
    last_ops_reach_at: probe.ops_reach_at ?? null,
    last_ops_reach_ok: probe.ops_reach_ok ?? null,
    last_drand_reach_ok: probe.drand_reach_ok ?? null,
    alert_delivery: health.alert_delivery === "smtp" ? "smtp" : "deadman",
    runs: null,
    overdue: Number(health.overdue ?? 0),
    next_due_at: health.next_due_at ?? null,
  };
  if (!series) {
    return { ok: true, contract: PAGE_CONTRACT, as_of: now.toISOString(), series: null, verdict: "Not imported yet", sentence: null, worth_knowing: [], alerts: [], instances: [], steps: [], drawings: [], notes: [], health: healthOut };
  }
  const instances = series.plan.instances.map((instance, index) => ({ id: instance.id, label: `Group ${index + 1}`, night: String(instance.params.night ?? "") }));
  const nightOf = new Map(instances.map((instance) => [instance.id, instance.night]));
  const instanceOfNight = new Map(instances.map((instance) => [instance.night, instance.id]));
  const open = alerts.filter((alert) => alert.state === "open" || alert.state === "taken");
  const shadowsByKey = new Map(input.shadows.map((shadow) => [`${shadow.night}#${shadow.drawing_no}`, shadow]));
  const replays = input.drawings.filter((drawing) => (drawing.replay as { pass?: boolean } | null)?.pass === true).length;
  const shadowsDone = input.shadows.filter((shadow) => (shadow.compare as ShadowCompare | null)?.pass !== undefined);
  const shadowsMatched = shadowsDone.filter((shadow) => (shadow.compare as ShadowCompare).pass === true).length;
  const worth: string[] = [];
  if (input.drawings.length > 0) worth.push(`${replays} of ${input.drawings.length} past drawings replay exactly from their records.`);
  if (shadowsDone.length > 0) worth.push(`${shadowsMatched} of ${shadowsDone.length} shadow drawings matched the Mac's winners.`);
  worth.push("This week the Mac and the review sender run every step; the server watches and checks.");
  return {
    ok: true,
    contract: PAGE_CONTRACT,
    as_of: now.toISOString(),
    series: {
      id: series.id,
      title: typeof (series.body as { title?: unknown }).title === "string" ? String((series.body as { title?: unknown }).title) : series.id,
      state: series.state,
      definition: { name: series.definition_name, revision: series.definition_revision, sha256: series.plan.definition?.sha256 ?? "" },
      plan_sha256: series.plan_sha256,
    },
    verdict: open.length === 0 ? (series.state === "observing" ? "Observing · nothing needs you" : `${series.state} · nothing needs you`) : `${open.length} open alert${open.length === 1 ? "" : "s"}`,
    sentence: open.length === 0 ? null : open.map((alert) => String(alert.detail.message ?? alert.rule)).slice(0, 2).join(" "),
    worth_knowing: worth.slice(0, 3),
    alerts: alerts.map((alert) => ({
      id: alert.id,
      rule: alert.rule,
      subject_ref: alert.subject_ref,
      immediate: alert.immediate,
      state: alert.state,
      title: String(alert.detail.message ?? alert.rule).split("\n")[0]!.slice(0, 160),
      relay: String(alert.detail.relay ?? alert.detail.message ?? ""),
      opened_at: alert.opened_at,
      fix_by: typeof alert.detail.fix_by === "string" ? alert.detail.fix_by : null,
      taken_by: alert.lease?.holder ?? null,
      taken_until: alert.lease?.until ?? null,
      told_at: alert.told_at,
    })),
    instances,
    steps: steps.map((step) => ({
      ref: step.ref,
      instance: step.instance_id,
      step: step.step_id,
      step_type: STEP_TYPE[step.do] ?? "check",
      label: stepLabel(step.step_id),
      owner: step.owner,
      mode: step.mode,
      state: step.state,
      waiting_because: step.waiting_because ?? (step.state === "observing" || step.state === "waiting" ? stepState(step) : null),
      hold_code: step.hold_code,
      due_at: step.due_at,
      result: resultText(step) || null,
      target: targetText(step),
    })),
    drawings: input.drawings.map((drawing) => {
      const commit = drawing.receipt.commit as unknown as Record<string, unknown>;
      return {
        instance: instanceOfNight.get(drawing.night) ?? "",
        night: drawing.night,
        drawing_no: drawing.drawing_no,
        mode: "adopted",
        committed_at: drawing.committed_at,
        entries: drawing.receipt.entry_ids.length,
        entry_list_sha256: (commit.entry_list_sha256 as string | undefined) ?? null,
        drand: typeof commit.drand_round === "number" ? { chain: String(commit.drand_chain ?? ""), round: commit.drand_round as number, randomness: drawing.receipt.drand_randomness } : null,
        beacon_check: drawing.beacon_check === "ok" || drawing.beacon_check === "mismatch" ? drawing.beacon_check : "unknown",
        winners: drawing.receipt.winners,
        alternates: drawing.receipt.alternates,
        promoted: drawing.receipt.promoted.map((promotion) => ({ entry_id: promotion.entry_id, replaced: promotion.replaces, at: promotion.at_utc })),
        replay: drawing.replay ? { ok: (drawing.replay as { pass?: boolean }).pass === true, failed: ((drawing.replay as { checks?: Array<{ id: string; status: string }> }).checks ?? []).filter((check) => check.status === "FAIL").map((check) => check.id) } : null,
        shadow: shadowOf(shadowsByKey.get(`${drawing.night}#${drawing.drawing_no}`)),
      };
    }),
    notes: steps
      .filter((step) => typeof step.expected.note === "string")
      .map((step) => ({
        instance: step.instance_id,
        night: nightOf.get(step.instance_id) ?? "",
        drawing_no: Number(step.expected.drawing_no ?? 1),
        note: step.expected.note === "still_entered" ? "still_entered" : "winner",
        planned: typeof step.result.planned === "number" ? step.result.planned : null,
        receipt_kind: "campaign_only",
        received: typeof step.result.received === "number" ? step.result.received : null,
        campaigns: input.campaigns
          .filter((campaign) => campaign.step_instance_id === step.id)
          .map((campaign) => ({
            campaign_id: (campaign.campaign_id as string | null) ?? null,
            name: (campaign.name as string | null) ?? `resend ${String(campaign.resend_no ?? 1)}`,
            status: (campaign.status as string | null) ?? null,
            sent_at: campaign.sent_at instanceof Date ? campaign.sent_at.toISOString() : ((campaign.sent_at as string | null) ?? null),
            list_exact: (campaign.list_exact as number | null) ?? null,
            received: (campaign.received as number | null) ?? null,
            trust: String(campaign.trust),
          })),
      })),
    health: healthOut,
  };
}
