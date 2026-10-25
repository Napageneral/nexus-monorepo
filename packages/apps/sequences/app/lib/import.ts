// sequences.series.import (build manual §3b-§3c): validate a hashes-only October bundle, show every
// check (V1-V10), and on apply adopt it in one exclusive transaction: definitions and the series
// (state observing), the plan, the Mac's drawings and entries, the winners ledger, the notes'
// campaigns and campaign_only send decisions, and the adopted steps. Apply refuses on any FAIL,
// needs the preview's token, and is idempotent by bundle_sha256 (a replay returns the first result).
import { compileDefinition, compileSeries, type Definition, type Series, type Step } from "./compile.js";
import { replayAll, type DrawingInput, type ReplayResult } from "./draw/replay.js";
import { judgeMacNote, type CampaignEvidence } from "./observe.js";
import { problem, next, type Problem } from "./output.js";
import { initialState, materialize, type Plan, type PlannedStep } from "./plan.js";
import { loadDefinition, loadDrawings, loadSeries, loadSteps, type SeriesRow } from "./repo.js";
import { IMPORT_BUNDLE_SCHEMA } from "./schemas.js";
import { jcsSha256, sha256Hex, shortId } from "./sha.js";
import { appendEvent, jsonOf, tx } from "./store.js";
import type { AppStore } from "./types.js";
import { findKindFields, validateSchema } from "./validate.js";

export const BUNDLE_CONTRACT = "sequences.import.bundle.v1";
const FORBIDDEN_KEYS = new Set(["email", "emails", "first_name", "last_name", "name_first", "contact", "contacts", "address", "phone"]);
const LEDGER_SOURCE = "import:winners.json";
const ADDRESS_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/;

type Json = Record<string, unknown>;

export type Bundle = {
  contract: string;
  series: string;
  scope: "full" | "drawing";
  built_at: string;
  definitions?: Array<{ body: Json; yaml_sha256: string; source_commit: string }>;
  series_file?: { body: Json; yaml_sha256: string; source_commit: string };
  files: Array<{ path_rel: string; sha256: string; bytes: number }>;
  team_hashes: string[];
  ledger: Record<string, string>;
  drawings: DrawingInput[];
  notes?: Array<{ night: string; drawing_no: number; note: "winner" | "still_entered"; campaigns: NoteCampaign[] }>;
  nights?: Array<{ night: string; mac_send?: Json; followups?: Json[] }>;
  exclusion_refresh?: Json[];
};

export type NoteCampaign = CampaignEvidence & { list_id?: string | null; template?: string | null; received_read_at?: string | null; source: string };

export type ImportReport = {
  ok: boolean;
  problems: Problem[];
  data: Json;
  token: string | null;
  bundle_sha256: string | null;
};

function keysNamed(value: unknown, names: ReadonlySet<string>, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => keysNamed(item, names, `${path}/${index}`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Json).flatMap(([key, item]) => [...(names.has(key) ? [`${path}/${key}`] : []), ...keysNamed(item, names, `${path}/${key}`)]);
}

const refuse = (code: string, message: string, fixText?: string): Problem =>
  problem({ code, tier: "refuse", message, fixer: "agent", next: fixText ? [next(fixText, "what the client must change", "agent", "code_release", "~1 h")] : [] });
const fail = (code: string, message: string): Problem => problem({ code, tier: "error", message, fixer: "agent" });

/** The audience of a Mac note, from the engine's own drawing rows: P is always ours. */
function noteAudience(drawing: DrawingInput, note: "winner" | "still_entered"): string[] {
  const addresses = new Map(drawing.entries.map((entry) => [entry.entry_id, entry.address_sha256]));
  const finals = new Set(drawing.receipt.winners);
  const promoted = new Set<string>();
  for (const promotion of drawing.receipt.promoted) {
    finals.delete(promotion.replaces);
    if (promotion.entry_id) {
      finals.add(promotion.entry_id);
      promoted.add(promotion.entry_id);
    }
  }
  if (note === "winner") return [...finals].map((id) => addresses.get(id)).filter((hash): hash is string => Boolean(hash)).sort();
  const winnersEver = new Set([...drawing.receipt.winners, ...promoted]);
  return drawing.receipt.entry_ids.filter((id) => !winnersEver.has(id)).map((id) => addresses.get(id)).filter((hash): hash is string => Boolean(hash)).sort();
}

export function sendIdOf(series: string, instance: string, step: string, resendNo: number, recipientHash: string): string {
  return `ss_${sha256Hex([series, instance, step, String(resendNo), recipientHash].join("|")).slice(0, 32)}`;
}

function sameReceipt(a: DrawingInput["receipt"], b: DrawingInput["receipt"]): string | null {
  for (const field of ["entry_ids", "drand_randomness", "winners", "alternates"] as const) {
    if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) return field;
  }
  if (jcsSha256(a.commit) !== jcsSha256(b.commit)) return "commit";
  const before = a.promoted;
  const after = b.promoted;
  if (after.length < before.length || before.some((entry, index) => JSON.stringify(entry) !== JSON.stringify(after[index]))) return "promoted (only appends are allowed)";
  return null;
}

type Resolved = {
  existing: SeriesRow | null;
  def: Definition;
  defRevision: number;
  defSha: string;
  series: Series;
  seriesSha: string;
  plan: Plan;
  planSha: string;
  newDefinitions: Array<{ name: string; revision: number; sha: string; body: Definition; yaml_sha256: string; source_commit: string }>;
};

async function resolveSeries(q: AppStore, bundle: Bundle, problems: Problem[]): Promise<Resolved | null> {
  const existing = await loadSeries(q, bundle.series);
  const newDefinitions: Resolved["newDefinitions"] = [];
  const compiled = new Map<string, { normalized: Definition; sha: string; revision: number }>();
  for (const [index, entry] of (bundle.definitions ?? []).entries()) {
    const result = compileDefinition(entry.body, `definitions[${index}]`);
    if (!result.ok) {
      problems.push(...result.problems.filter((item) => item.tier === "error"));
      continue;
    }
    const name = result.normalized.sequence;
    const revisions = (await q.query<{ revision: number; definition_sha256: string }>("SELECT revision, definition_sha256 FROM definitions WHERE name = $1 ORDER BY revision", [name])).rows;
    const same = revisions.find((row) => row.definition_sha256 === result.sha256);
    const revision = same ? Number(same.revision) : Math.max(0, ...revisions.map((row) => Number(row.revision))) + 1 + newDefinitions.filter((item) => item.name === name).length;
    if (!same) newDefinitions.push({ name, revision, sha: result.sha256, body: result.normalized, yaml_sha256: entry.yaml_sha256, source_commit: entry.source_commit });
    compiled.set(`${name}@${revision}`, { normalized: result.normalized, sha: result.sha256, revision });
  }

  if (existing) {
    const stored = await loadDefinition(q, existing.definition_name, existing.definition_revision);
    if (!stored) {
      problems.push(fail("check.unknown_ref", `series ${existing.id} names ${existing.definition_name}@${existing.definition_revision}, which is not registered`));
      return null;
    }
    if (bundle.series_file) {
      const reread = compileSeries(stored.body, stored.revision, bundle.series_file.body, "series_file");
      if (reread.ok && reread.sha256 !== existing.series_file_sha256) {
        problems.push(fail("refuse.replan_needs_p2", "the bundle's series file differs from the registered one; a re-plan arrives with P2 (seqctl change)"));
      }
    }
    return {
      existing,
      def: stored.body,
      defRevision: stored.revision,
      defSha: stored.definition_sha256,
      series: existing.body,
      seriesSha: existing.series_file_sha256,
      plan: existing.plan,
      planSha: existing.plan_sha256,
      newDefinitions,
    };
  }

  if (bundle.scope !== "full" || !bundle.series_file) {
    problems.push(refuse("refuse.series_not_registered", `series ${bundle.series} is not registered: a full bundle with definitions and series_file creates it`, "sequences_import.py --all (scope full) carries definitions[] and series_file"));
    return null;
  }
  const named = String((bundle.series_file.body as Json).sequence ?? "");
  let target = compiled.get(named);
  if (!target) {
    const [name, rev] = named.split("@");
    const stored = name && rev ? await loadDefinition(q, name, Number(rev)) : null;
    if (stored) target = { normalized: stored.body, sha: stored.definition_sha256, revision: stored.revision };
  }
  if (!target) {
    problems.push(fail("check.unknown_ref", `the series file runs '${named}', which is neither registered nor in the bundle's definitions (or compiles to another revision)`));
    return null;
  }
  const series = compileSeries(target.normalized, target.revision, bundle.series_file.body, "series_file");
  problems.push(...series.problems.filter((item) => item.tier === "error"));
  if (!series.ok) return null;
  if (series.normalized.series !== bundle.series) {
    problems.push(fail("check.unknown_ref", `the bundle is for ${bundle.series} but its series file is ${series.normalized.series}`));
    return null;
  }
  const { plan, plan_sha256 } = materialize(target.normalized, { revision: target.revision, sha256: target.sha }, series.normalized, series.sha256);
  return { existing: null, def: target.normalized, defRevision: target.revision, defSha: target.sha, series: series.normalized, seriesSha: series.sha256, plan, planSha: plan_sha256, newDefinitions };
}

/** Which plan step holds a drawing, its intake and its notes. */
function stepsFor(plan: Plan, def: Definition, night: string, drawingNo: number) {
  const instance = plan.instances.find((entry) => entry.params.night === night);
  if (!instance) return null;
  const mine = plan.steps.filter((step) => step.instance_id === instance.id);
  const draw = mine.find((step) => step.do === "draw" && step.expected.drawing_no === drawingNo);
  const drawDef = draw ? (def.steps.find((step) => step.id === draw.step_id) as Step | undefined) : undefined;
  const intakeIds = ((drawDef?.entrants as Json | undefined)?.free_entries as string[] | undefined) ?? [];
  const intake = mine.find((step) => step.step_id === intakeIds[intakeIds.length - 1]);
  return {
    instance: instance.id,
    draw,
    intake,
    note: (note: string) => mine.find((step) => step.expected.note === note && step.expected.drawing_no === drawingNo),
  };
}

async function stateDigest(q: AppStore, seriesId: string): Promise<string> {
  const series = (await q.query<{ plan_sha256: string; updated_at: unknown }>("SELECT plan_sha256, updated_at FROM series WHERE id = $1", [seriesId])).rows[0];
  const bundles = (
    await q.query<{ n: string; last: string | null }>(
      "SELECT count(*) AS n, (SELECT bundle_sha256 FROM import_bundles WHERE series_id = $1 ORDER BY applied_at DESC, bundle_sha256 LIMIT 1) AS last FROM import_bundles WHERE series_id = $1",
      [seriesId],
    )
  ).rows[0];
  return jcsSha256({ plan: series?.plan_sha256 ?? null, updated_at: series ? String(series.updated_at) : null, bundles: Number(bundles?.n ?? 0), last: bundles?.last ?? null });
}

export function previewToken(bundleSha: string, digest: string): string {
  return `pt_${sha256Hex(`sequences.import|${bundleSha}|${digest}`).slice(0, 32)}`;
}

export async function importBundle(store: AppStore, raw: unknown, options: { mode: "preview" | "apply"; preview_token?: string; actor: string; now: Date }): Promise<ImportReport> {
  const problems: Problem[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, problems: [refuse("usage.params", "bundle must be the JSON object scripts/sequences_import.py writes")], data: {}, token: null, bundle_sha256: null };
  }
  const kinds = findKindFields(raw);
  if (kinds.length > 0) {
    return {
      ok: false,
      problems: [refuse("check.field_kind_forbidden", `the bundle carries a field named kind at ${kinds.slice(0, 3).join(", ")} (NX-P17): the bundle's kind is 'scope', a note's kind is 'note'`, "rename kind -> scope (bundle) and kind -> note (notes[])")],
      data: {},
      token: null,
      bundle_sha256: null,
    };
  }
  // The evidence carries no '@' at all; the recipe files may (a series names `<sequence>@<rev>`),
  // so they are checked for anything shaped like an address instead.
  const { definitions: recipes, series_file: seriesFile, ...evidence } = raw as Json;
  const text = JSON.stringify(evidence);
  const recipeText = JSON.stringify([recipes ?? null, seriesFile ?? null]);
  const contactKeys = keysNamed(evidence, FORBIDDEN_KEYS);
  if (text.includes("@") || contactKeys.length > 0 || ADDRESS_RE.test(recipeText)) {
    return {
      ok: false,
      problems: [refuse("refuse.address_in_bundle", `the bundle carries ${text.includes("@") ? "an '@'" : `contact keys (${contactKeys.slice(0, 3).join(", ")})`}: ids, hashes and counts only (HR-21)`, "the client deletes contact on load and asserts no '@' before writing")],
      data: {},
      token: null,
      bundle_sha256: null,
    };
  }
  const schemaErrors = validateSchema(IMPORT_BUNDLE_SCHEMA, raw);
  if (schemaErrors.length > 0) {
    return {
      ok: false,
      problems: schemaErrors.slice(0, 20).map((error) => fail("check.schema", `bundle${error.path}: ${error.message}`)),
      data: { schema_errors: schemaErrors.length },
      token: null,
      bundle_sha256: null,
    };
  }
  const bundle = raw as Bundle;
  const bundleSha = jcsSha256(bundle);

  const replayed = (await store.query<{ result: unknown; applied_at: unknown; applied_by: string }>("SELECT result, applied_at, applied_by FROM import_bundles WHERE bundle_sha256 = $1", [bundleSha])).rows[0];
  if (replayed) {
    return { ok: true, problems: [], data: { ...jsonOf<Json>(replayed.result, {}), replayed: true, bundle_sha256: bundleSha }, token: null, bundle_sha256: bundleSha };
  }

  const resolved = await resolveSeries(store, bundle, problems);
  const stored = resolved?.existing?.prize_scope ? await loadDrawings(store, resolved.existing.prize_scope, "adopted") : [];
  const merged = new Map<string, DrawingInput>(stored.map((drawing) => [`${drawing.night}#${drawing.drawing_no}`, drawing]));
  const updated: string[] = [];
  const added: string[] = [];
  for (const drawing of bundle.drawings) {
    const key = `${drawing.night}#${drawing.drawing_no}`;
    const before = merged.get(key);
    if (before) {
      const changed = sameReceipt(before.receipt, drawing.receipt);
      if (changed) problems.push(fail("refuse.drawing_changed", `drawing ${drawing.night} #${drawing.drawing_no} differs from the imported one in ${changed}`));
      if (drawing.receipt.promoted.length > before.receipt.promoted.length) updated.push(key);
    } else added.push(key);
    merged.set(key, drawing);
  }
  const replay: ReplayResult = replayAll([...merged.values()], bundle.ledger, bundle.team_hashes);
  for (const drawing of replay.drawings) {
    for (const check of drawing.checks.filter((entry) => entry.status === "FAIL")) {
      problems.push(fail(`import.${check.id}`, `${drawing.night} drawing ${drawing.drawing_no}: ${check.id} FAIL: ${check.detail}`));
    }
  }
  if (replay.ledger.status === "FAIL") problems.push(fail("import.V7", `V7 FAIL: ${replay.ledger.detail}`));

  // Map evidence to plan steps.
  const adoptions: Array<{ ref: string; id: string; state: string; mode?: string; result: Json; note?: string }> = [];
  const decisions: Array<{ send_id: string; step: PlannedStep; message: string; hash: string; campaign_id: string | null }> = [];
  const campaigns: Array<{ id: string; step: PlannedStep; row: NoteCampaign }> = [];
  if (resolved) {
    for (const drawing of bundle.drawings) {
      const found = stepsFor(resolved.plan, resolved.def, drawing.night, drawing.drawing_no);
      if (!found?.draw) {
        problems.push(fail("import.unmapped", `drawing ${drawing.night} #${drawing.drawing_no} has no draw step in the plan`));
        continue;
      }
      const result = replay.drawings.find((entry) => entry.night === drawing.night && entry.drawing_no === drawing.drawing_no);
      adoptions.push({
        ref: found.draw.ref,
        id: found.draw.id,
        state: "adopted",
        mode: found.draw.mode === "shadow" ? "shadow" : "adopted",
        result: {
          evidence: "import",
          verdict: result?.pass ? "ok" : "unknown",
          summary: `${drawing.receipt.entry_ids.length} -> ${drawing.receipt.winners.length} + ${drawing.receipt.alternates.length}`,
          entries: drawing.receipt.entry_ids.length,
          winners: result?.final_winners.length ?? drawing.receipt.winners.length,
          alternates: drawing.receipt.alternates.length,
          promoted: drawing.receipt.promoted.length,
          entry_list_sha256: drawing.receipt.commit.entry_list_sha256,
          committed_at_utc: drawing.receipt.commit.committed_at_utc,
          bundle_sha256: bundleSha,
        },
      });
      if (found.intake) {
        adoptions.push({
          ref: found.intake.ref,
          id: found.intake.id,
          state: "adopted",
          mode: "adopted",
          result: {
            evidence: "import",
            verdict: "ok",
            summary: `${drawing.free_hashes.length} free entries`,
            free_entries: drawing.free_hashes.length,
            free_entries_from_group: drawing.receipt.commit.free_entries_from_group ?? null,
            free_carried_from_drawing_1: drawing.receipt.commit.free_carried_from_drawing_1 ?? null,
          },
        });
      }
    }
    for (const note of bundle.notes ?? []) {
      const found = stepsFor(resolved.plan, resolved.def, note.night, note.drawing_no);
      const step = found?.note(note.note);
      const drawing = merged.get(`${note.night}#${note.drawing_no}`);
      if (!found || !step) {
        problems.push(fail("import.unmapped", `${note.note} note for ${note.night} #${note.drawing_no} has no step in the plan`));
        continue;
      }
      const audience = drawing ? noteAudience(drawing, note.note) : [];
      const judged = judgeMacNote(step.expected, note.campaigns, drawing ? audience.length : null, options.now);
      adoptions.push({
        ref: step.ref,
        id: step.id,
        state: judged.verdict === "short" ? "short" : "adopted",
        mode: "adopted",
        note: note.note,
        result: { evidence: "import", verdict: judged.verdict, summary: judged.summary, receipt_kind: "campaign_only", planned: audience.length, ...judged.detail },
      });
      for (const campaign of note.campaigns) {
        campaigns.push({ id: shortId("pc", campaign.name, campaign.campaign_id ?? "", campaign.campaign_id_prefix ?? "", campaign.source), step, row: campaign });
      }
      const firstSent = note.campaigns.find((campaign) => campaign.trust !== "untrusted" && campaign.campaign_id && !campaign.resend_of)?.campaign_id ?? null;
      for (const hash of audience) {
        decisions.push({ send_id: sendIdOf(resolved.series.series, found.instance, step.step_id, 0, hash), step, message: String(resolved.def.steps.find((entry) => entry.id === step.step_id)?.message ?? note.note), hash, campaign_id: firstSent });
      }
    }
    for (const night of bundle.nights ?? []) {
      const instance = resolved.plan.instances.find((entry) => entry.params.night === night.night);
      const ask = resolved.plan.steps.find((step) => step.instance_id === instance?.id && step.expected.ledger === "night");
      const follow = resolved.plan.steps.find((step) => step.instance_id === instance?.id && step.expected.ledger === "followup");
      if (ask && night.mac_send) adoptions.push({ ref: ask.ref, id: ask.id, state: "observing", result: { mac_send: night.mac_send } });
      if (follow && night.followups) adoptions.push({ ref: follow.ref, id: follow.id, state: "observing", result: { mac_followups: night.followups } });
    }
  }

  const digest = await stateDigest(store, bundle.series);
  const token = previewToken(bundleSha, digest);
  const pass = !problems.some((entry) => entry.tier === "error" || entry.tier === "refuse");
  const counts = {
    drawings: bundle.drawings.length,
    drawings_new: added.length,
    drawings_promoted: updated.length,
    entries: bundle.drawings.reduce((sum, drawing) => sum + drawing.entries.length, 0),
    ledger: Object.keys(bundle.ledger).length,
    notes: (bundle.notes ?? []).length,
    campaigns: campaigns.length,
    send_decisions: decisions.length,
    files: bundle.files.length,
    adopted_steps: adoptions.filter((entry) => entry.state !== "observing").length,
  };
  const data: Json = {
    bundle_sha256: bundleSha,
    mode: options.mode,
    series: bundle.series,
    scope: bundle.scope,
    built_at: bundle.built_at,
    new_series: resolved ? !resolved.existing : null,
    definitions: resolved
      ? [
          { name: resolved.def.sequence, revision: resolved.defRevision, definition_sha256: resolved.defSha, new: resolved.newDefinitions.some((entry) => entry.sha === resolved.defSha) },
          ...resolved.newDefinitions.filter((entry) => entry.sha !== resolved.defSha).map((entry) => ({ name: entry.name, revision: entry.revision, definition_sha256: entry.sha, new: true })),
        ]
      : [],
    plan_sha256: resolved?.planSha ?? null,
    validation: { pass, drawings: replay.drawings.map(({ night, drawing_no, checks, pass: ok }) => ({ night, drawing_no, pass: ok, checks })), ledger: replay.ledger },
    counts,
    adopt: adoptions.map((entry) => ({ ref: entry.ref, state: entry.state, verdict: entry.result.verdict ?? null })),
  };
  if (options.mode === "preview" || !resolved) return { ok: pass, problems, data, token: pass ? token : null, bundle_sha256: bundleSha };

  if (!pass) return { ok: false, problems, data, token: null, bundle_sha256: bundleSha };
  if (options.preview_token !== token) {
    return {
      ok: false,
      problems: [problem({ code: "refuse.token_stale", tier: "refuse", message: options.preview_token ? "the preview token is stale: the series moved since the preview; preview again" : "apply needs the preview's token (pt_…)", fixer: "agent", next: [next("sequences_import.py … --push (fresh preview), then --apply <the new pt_…>", "a fresh preview", "agent")] })],
      data,
      token: null,
      bundle_sha256: bundleSha,
    };
  }

  const applied = await tx(
    store,
    async (q) => {
      // Re-check inside the lock: a concurrent apply of the same bundle returns the first result.
      const again = (await q.query<{ result: unknown }>("SELECT result FROM import_bundles WHERE bundle_sha256 = $1", [bundleSha])).rows[0];
      if (again) return { ...jsonOf<Json>(again.result, {}), replayed: true };
      for (const entry of resolved.newDefinitions) {
        await q.query(
          "INSERT INTO definitions (name, revision, definition_sha256, body, yaml_sha256, source_commit, registered_by) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)",
          [entry.name, entry.revision, entry.sha, JSON.stringify(entry.body), entry.yaml_sha256, entry.source_commit, options.actor],
        );
        await appendEvent(q, { actor: options.actor, event: "definition.registered", detail: { name: entry.name, revision: entry.revision, definition_sha256: entry.sha, via: "import", bundle_sha256: bundleSha } });
      }
      const prizeScope = resolved.plan.prize_scope;
      if (!resolved.existing) {
        await q.query(
          "INSERT INTO series (id, definition_name, definition_revision, series_file_sha256, body, plan, plan_sha256, state, prize_scope, created_at, updated_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, 'observing', $8, $9, $9)",
          [bundle.series, resolved.def.sequence, resolved.defRevision, resolved.seriesSha, JSON.stringify(resolved.series), JSON.stringify(resolved.plan), resolved.planSha, prizeScope, options.now.toISOString()],
        );
        for (const instance of resolved.plan.instances) {
          await q.query("INSERT INTO instances (series_id, id, params) VALUES ($1, $2, $3::jsonb)", [bundle.series, instance.id, JSON.stringify(instance.params)]);
        }
        const namedEngine = new Set(resolved.series.owners.engine);
        for (const step of resolved.plan.steps) {
          const start = initialState(step, options.now, namedEngine);
          await q.query(
            `INSERT INTO step_instances (id, ref, series_id, instance_id, step_id, step_do, owner, mode, state, waiting_because, due_at, not_before, not_after,
               window_from, window_to, copy_valid_from, copy_valid_until, depends_on, plan_sha256, expected, target, work, result)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::text[], $19, $20::jsonb, $21::jsonb, $22::jsonb, '{}'::jsonb)`,
            [step.id, step.ref, bundle.series, step.instance_id, step.step_id, step.do, step.owner, step.mode, start.state, start.because, step.due_at, step.not_before, step.not_after,
              step.window_from, step.window_to, step.copy_valid_from, step.copy_valid_until, step.depends_on, resolved.planSha, JSON.stringify(step.expected), JSON.stringify(step.target), JSON.stringify(step.work)],
          );
        }
        await appendEvent(q, { series_id: bundle.series, actor: options.actor, event: "series.created", detail: { state: "observing", plan_sha256: resolved.planSha, definition: `${resolved.def.sequence}@${resolved.defRevision}`, steps: resolved.plan.steps.length } });
      }
      const scope = prizeScope ?? bundle.series;
      for (const drawing of bundle.drawings) {
        const result = replay.drawings.find((entry) => entry.night === drawing.night && entry.drawing_no === drawing.drawing_no);
        const step = stepsFor(resolved.plan, resolved.def, drawing.night, drawing.drawing_no)?.draw;
        const commit = drawing.receipt.commit;
        const beaconCheck = result?.checks.find((check) => check.id === "V9")?.status === "PASS" ? "ok" : result?.checks.find((check) => check.id === "V9")?.status === "FAIL" ? "mismatch" : "unknown";
        const file = bundle.files.find((entry) => entry.path_rel.endsWith(`group-${drawing.night}-drawing-${drawing.drawing_no}.json`));
        await q.query(
          `INSERT INTO drawings (prize_scope, night, drawing_no, mode, series_id, step_instance_id, commit_body, entry_list_sha256, entries, drand_chain, drand_round,
             drand_randomness, beacon_check, winners, alternates, promoted, free_hashes, method, committed_at, source_file_sha256, replay)
           VALUES ($1, $2::date, $3, 'adopted', $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13::text[], $14::text[], $15::jsonb, $16::text[], $17, $18, $19, $20::jsonb)
           ON CONFLICT (prize_scope, night, drawing_no, mode) DO UPDATE SET promoted = EXCLUDED.promoted, replay = EXCLUDED.replay, beacon_check = EXCLUDED.beacon_check`,
          [scope, drawing.night, drawing.drawing_no, bundle.series, step?.id ?? null, JSON.stringify(commit), commit.entry_list_sha256, commit.entries, commit.drand_chain, commit.drand_round,
            drawing.receipt.drand_randomness, beaconCheck, drawing.receipt.winners, drawing.receipt.alternates, JSON.stringify(drawing.receipt.promoted), drawing.free_hashes,
            drawing.receipt.method, commit.committed_at_utc, file?.sha256 ?? null, JSON.stringify({ pass: result?.pass ?? false, checks: result?.checks ?? [], bundle_sha256: bundleSha })],
        );
        for (const entry of drawing.entries) {
          await q.query(
            "INSERT INTO drawing_entries (prize_scope, night, drawing_no, mode, entry_id, address_sha256, basis) VALUES ($1, $2::date, $3, 'adopted', $4, $5, $6::text[]) ON CONFLICT DO NOTHING",
            [scope, drawing.night, drawing.drawing_no, entry.entry_id, entry.address_sha256, entry.basis],
          );
        }
      }
      // The ledger: one row per winners.json key, placed on the drawing that awarded it.
      const ordered = [...merged.values()];
      for (const [entryId, hash] of Object.entries(bundle.ledger)) {
        const promotedIn = ordered.find((drawing) => drawing.receipt.promoted.some((entry) => entry.entry_id === entryId));
        const wonIn = promotedIn ?? ordered.find((drawing) => drawing.receipt.winners.includes(entryId));
        if (!wonIn) continue;
        const promotion = promotedIn?.receipt.promoted.find((entry) => entry.entry_id === entryId);
        await q.query(
          "INSERT INTO winners (prize_scope, recipient_hash, entry_id, night, drawing_no, role, at, source) VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8) ON CONFLICT DO NOTHING",
          [scope, hash, entryId, wonIn.night, wonIn.drawing_no, promotion ? "promoted" : "winner", promotion ? promotion.at_utc : wonIn.receipt.commit.committed_at_utc, LEDGER_SOURCE],
        );
      }
      for (const campaign of campaigns) {
        const row = campaign.row;
        await q.query(
          `INSERT INTO provider_campaigns (id, campaign_id, campaign_id_prefix, name, list_id, template, status, sent_at, list_exact, received, received_read_at, resend_of, trust, step_instance_id, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, received = EXCLUDED.received, received_read_at = EXCLUDED.received_read_at, list_exact = EXCLUDED.list_exact, trust = EXCLUDED.trust`,
          [campaign.id, row.campaign_id ?? null, row.campaign_id_prefix ?? null, row.name, row.list_id ?? null, row.template ?? null, row.status ?? null, row.sent_at ?? null, row.list_exact ?? null,
            row.received ?? null, row.received_read_at ?? null, row.resend_of ?? null, row.trust, campaign.step.id, row.source],
        );
      }
      for (const decision of decisions) {
        await q.query(
          `INSERT INTO send_decisions (send_id, series_id, step_instance_id, message, resend_no, recipient_hash, status, delivery_receipt_kind, campaign_id)
           VALUES ($1, $2, $3, $4, 0, $5, 'adopted', 'campaign_only', $6) ON CONFLICT DO NOTHING`,
          [decision.send_id, bundle.series, decision.step.id, decision.message, decision.hash, decision.campaign_id],
        );
      }
      const steps = new Map((await loadSteps(q, bundle.series)).map((step) => [step.id, step]));
      for (const adoption of adoptions) {
        const current = steps.get(adoption.id);
        const result = { ...(current?.result ?? {}), ...adoption.result };
        await q.query(
          "UPDATE step_instances SET state = $2, mode = COALESCE($3, mode), waiting_because = NULL, result = $4::jsonb, updated_at = $5 WHERE id = $1",
          [adoption.id, adoption.state, adoption.mode ?? null, JSON.stringify(result), options.now.toISOString()],
        );
        await appendEvent(q, { series_id: bundle.series, step_instance_id: adoption.id, actor: options.actor, event: adoption.state === "observing" ? "step.evidence" : "step.adopted", detail: { ref: adoption.ref, verdict: adoption.result.verdict ?? null, bundle_sha256: bundleSha } });
      }
      for (const refresh of bundle.exclusion_refresh ?? []) {
        await appendEvent(q, { series_id: bundle.series, actor: options.actor, event: "evidence.exclusion_refresh", detail: refresh });
      }
      const result = { ...data, mode: "apply", applied_at: options.now.toISOString(), applied_by: options.actor };
      await q.query(
        "INSERT INTO import_bundles (bundle_sha256, contract, series_id, scope, files, team_hashes, validation, result, applied_at, applied_by) VALUES ($1, $2, $3, $4, $5::jsonb, $6::text[], $7::jsonb, $8::jsonb, $9, $10)",
        [bundleSha, bundle.contract, bundle.series, bundle.scope, JSON.stringify(bundle.files), bundle.team_hashes, JSON.stringify(data.validation), JSON.stringify(result), options.now.toISOString(), options.actor],
      );
      await q.query("UPDATE series SET updated_at = $2 WHERE id = $1", [bundle.series, options.now.toISOString()]);
      await appendEvent(q, { series_id: bundle.series, actor: options.actor, event: "import.applied", detail: { bundle_sha256: bundleSha, scope: bundle.scope, counts } });
      return result;
    },
    { exclusive: true },
  );
  return { ok: true, problems: [], data: applied, token: null, bundle_sha256: bundleSha };
}
