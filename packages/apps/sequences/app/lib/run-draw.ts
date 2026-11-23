// What a sequences.draw Run does in P1b: shadow only (a live draw is P3 and refused here).
//   S0 at close + 5 m and S1 at draw time + 30 s: read entries?night=&deadline= into a snapshot.
//   C on the Mac's import: read again (S2), compare the read nearest the Mac's commit, explain and
//   classify any difference, check the beacon, store drawings(mode 'shadow').compare.
import { claimRun, finishRun } from "./claim.js";
import { entryIdOf, entryListSha256 } from "./draw/rank.js";
import { compareShadow, diffHashes, nearestRead, type EntriesRows, type ExplainRows, type MacDrawing, type Snapshot } from "./draw/shadow.js";
import { latestTeamHashes, ledgerAt, loadDrawings, loadSeries } from "./repo.js";
import { RetryableError, saveSnapshot } from "./run-step.js";
import { entriesRowsOf, explainOf, readDrand, readSource, resolveOpsAccess, type SourceDeps } from "./sources.js";
import { isoOrNull, jsonOf, requireStore } from "./store.js";
import type { JobContext } from "./types.js";

export async function runShadowDraw(ctx: JobContext, deps: SourceDeps = {}): Promise<Record<string, unknown>> {
  const store = requireStore(ctx.app);
  const claim = await claimRun(store, ctx);
  if (!claim.ok) return { contract_id: "sequences_draw_v1", run_id: ctx.run.id, noop: claim.reason };
  const { step, run } = claim;
  if (step.mode !== "shadow") {
    // A live server draw waits for the P3 gate: 3 of 3 shadows pass and 10 of 10 replays.
    await finishRun(store, ctx, claim, { result: { [`phase_${run.phase}`]: { refused: "refuse.not_engine_owned" } }, event: "draw.refused", detail: { why: "live draws arrive with P3" } });
    return { contract_id: "sequences_draw_v1", run_id: ctx.run.id, refused: "refuse.not_engine_owned" };
  }
  const series = await loadSeries(store, step.series_id);
  const night = String(step.expected.night);
  const drawingNo = Number(step.expected.drawing_no);
  const deadline = String(step.expected.closes_at);
  const params = { night, deadline };
  const access = await resolveOpsAccess(ctx.nex);
  const read = await readSource("entries", params, access, { ...deps, abortSignal: ctx.abortSignal });
  if (!read.ok) {
    if (read.code !== "hold.source_stale") throw new RetryableError(`transient_dependency_failure: ${read.message}`);
    await finishRun(store, ctx, claim, { result: { [`phase_${run.phase}`]: { verdict: "unknown", unreadable: read.message } }, event: "shadow.read_unreadable" });
    return { contract_id: "sequences_draw_v1", run_id: ctx.run.id, phase: run.phase, verdict: "unknown" };
  }
  const by = `job:${ctx.run.id}`;
  const phaseName = run.phase === "c" ? "s2" : run.phase;
  if (run.phase !== "c") {
    await finishRun(store, ctx, claim, {
      result: { [`phase_${run.phase}`]: { as_of: read.answer.as_of, sha256: read.answer.sha256, count: read.answer.count } },
      event: "shadow.read",
      detail: { phase: run.phase, count: read.answer.count },
      also: async (q) => void (await saveSnapshot(q, read, "entries", params, step.id, phaseName, by)),
    });
    return { contract_id: "sequences_draw_v1", run_id: ctx.run.id, phase: run.phase, count: read.answer.count };
  }

  // C: the compare against the Mac's imported drawing.
  const scope = series?.prize_scope ?? step.series_id;
  const adopted = await loadDrawings(store, scope, "adopted");
  const macDrawing = adopted.find((drawing) => drawing.night === night && drawing.drawing_no === drawingNo);
  if (!macDrawing) throw new RetryableError(`transient_dependency_failure: the Mac's drawing ${night} #${drawingNo} is not imported`);
  const toMac = (drawing: typeof macDrawing): MacDrawing => ({ ...drawing.receipt, entries: drawing.entries, free_hashes: drawing.free_hashes });
  const mac = toMac(macDrawing);
  const drawing1 = drawingNo > 1 ? adopted.find((drawing) => drawing.night === night && drawing.drawing_no === 1) : undefined;
  const snapshots = (
    await store.query("SELECT phase, as_of, sha256, body FROM source_snapshots WHERE step_instance_id = $1 AND source = 'entries' ORDER BY as_of", [step.id])
  ).rows.map((row) => ({ phase: String(row.phase), as_of: isoOrNull(row.as_of)!, sha256: String(row.sha256), rows: jsonOf<EntriesRows>(row.body, {} as EntriesRows) }));
  const s2: Snapshot = { phase: "s2", as_of: read.answer.as_of, sha256: read.answer.sha256, rows: entriesRowsOf(read.answer) };
  const chosen = nearestRead([...snapshots, s2], mac.commit.committed_at_utc)!;
  const team = await latestTeamHashes(store, step.series_id);
  const ledger = await ledgerAt(store, scope, mac.commit.committed_at_utc);
  let compare = compareShadow({ read: chosen, explain: null, mac, drawing1: drawing1 ? toMac(drawing1) : null, teamHashes: team, ledgerAtCommit: ledger });
  let explain: ExplainRows | null = null;
  if (!compare.pass) {
    const hashes = diffHashes(compare, mac, chosen);
    if (hashes.length > 0) {
      const explained = await readSource("entries", { ...params, explain: hashes.join(",") }, access, { ...deps, abortSignal: ctx.abortSignal });
      if (explained.ok) {
        explain = explainOf(explained.answer);
        compare = compareShadow({ read: chosen, explain, mac, drawing1: drawing1 ? toMac(drawing1) : null, teamHashes: team, ledgerAtCommit: ledger });
      }
    }
  }
  const beacon = await readDrand(Number(mac.commit.drand_round), deps);
  const beaconCheck = beacon.ok ? (String(beacon.body.randomness) === mac.drand_randomness ? "ok" : "mismatch") : "unknown";
  const engineIds = chosen.rows.review_entrants.map((entrant) => entryIdOf(entrant.address_sha256));
  const shadowSummary = { pass: compare.pass && beaconCheck !== "mismatch", read: compare.read, mismatched: compare.mismatched, diffs: compare.diffs, unexplained: compare.unexplained, beacon_check: beaconCheck };
  await finishRun(store, ctx, claim, {
    result: { shadow: shadowSummary, phase_c: { verdict: shadowSummary.pass ? "match" : "mismatch", at: (ctx.now ?? new Date()).toISOString() } },
    event: shadowSummary.pass ? "shadow.match" : "shadow.mismatch",
    detail: { mismatched: compare.mismatched, diffs: compare.diffs.length, unexplained: compare.unexplained },
    also: async (q) => {
      await saveSnapshot(q, read, "entries", params, step.id, "s2", by);
      await q.query(
        `INSERT INTO drawings (prize_scope, night, drawing_no, mode, series_id, step_instance_id, commit_body, entry_list_sha256, entries, drand_chain, drand_round,
           drand_randomness, beacon_check, winners, alternates, method, committed_at, compare)
         VALUES ($1, $2::date, $3, 'shadow', $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13::text[], $14::text[], $15, $16, $17::jsonb)
         ON CONFLICT (prize_scope, night, drawing_no, mode) DO UPDATE SET commit_body = EXCLUDED.commit_body, entry_list_sha256 = EXCLUDED.entry_list_sha256,
           entries = EXCLUDED.entries, beacon_check = EXCLUDED.beacon_check, winners = EXCLUDED.winners, alternates = EXCLUDED.alternates, compare = EXCLUDED.compare`,
        [scope, night, drawingNo, step.series_id, step.id, JSON.stringify({ ...compare.engine, read: compare.read }), String(compare.engine.entry_list_sha256), Number(compare.engine.entries),
          String(mac.commit.drand_chain), Number(mac.commit.drand_round), mac.drand_randomness, beaconCheck, compare.engine.winners as string[], compare.engine.alternates as string[],
          "rank = sha256(drand randomness bytes || entry_id); lowest first", mac.commit.committed_at_utc, JSON.stringify(shadowSummary)],
      );
      for (const entrant of chosen.rows.review_entrants) {
        await q.query(
          "INSERT INTO drawing_entries (prize_scope, night, drawing_no, mode, entry_id, address_sha256, basis) VALUES ($1, $2::date, $3, 'shadow', $4, $5, $6::text[]) ON CONFLICT DO NOTHING",
          [scope, night, drawingNo, entryIdOf(entrant.address_sha256), entrant.address_sha256, (entrant.review_ids ?? []).length > 0 ? entrant.review_ids!.map((id) => `review:${id}`) : ["review"]],
        );
      }
    },
  });
  return { contract_id: "sequences_draw_v1", run_id: ctx.run.id, phase: "c", pass: shadowSummary.pass, entries: engineIds.length, engine_entry_list_sha256: entryListSha256([...engineIds].sort()) };
}
