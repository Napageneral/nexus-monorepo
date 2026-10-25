// The import's replay verifier (build manual §3c-§3d): V1-V10 over every drawing receipt, with the
// ledger rebuilt in time order so a promotion sees every drawing committed before it. The Python
// oracle (moonsleep-v1 scripts/sequences_replay.py) must agree with this on every drawing.
import { createHash } from "node:crypto";
import { ENTRY_ID_RE, PICK_ALTERNATES, PICK_WINNERS, QUICKNET_LABEL, entryIdOf, entryListSha256, pick, rank, roundPublishedAt } from "./rank.js";

export type Promotion = { replaces: string; entry_id: string | null; why?: string; at_utc: string };

export type Receipt = {
  commit: Record<string, unknown> & {
    entries: number;
    entry_list_sha256: string;
    committed_at_utc: string;
    drand_round: number;
    drand_chain: string;
  };
  entry_ids: string[];
  drand_randomness: string;
  winners: string[];
  alternates: string[];
  promoted: Promotion[];
  method: string;
};

export type DrawingInput = {
  night: string;
  drawing_no: number;
  receipt: Receipt;
  entries: Array<{ entry_id: string; address_sha256: string; basis: string[] }>;
  free_hashes: string[];
  beacon?: { round: number; randomness: string; signature: string } | null;
};

export type CheckStatus = "PASS" | "FAIL" | "UNKNOWN" | "PENDING";
export type Check = { id: string; status: CheckStatus; detail: string };
export type DrawingReplay = { night: string; drawing_no: number; checks: Check[]; pass: boolean; final_winners: string[] };
export type ReplayResult = { drawings: DrawingReplay[]; ledger: Check; pass: boolean; final_ledger: string[] };

const BASIS_RE = /^(review:rev_[0-9a-f]{32}|free)$/;

function parseUtc(text: string): number {
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) throw new Error(`not a time: ${text}`);
  return ms;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** V1-V4, V6, V9 and V10 for one drawing (V5, V7 and V8 need the ledger timeline: replayAll). */
export function verifyDrawing(drawing: DrawingInput, teamHashes: ReadonlySet<string>, picks = { winners: PICK_WINNERS, alternates: PICK_ALTERNATES }): Check[] {
  const { receipt } = drawing;
  const { commit } = receipt;
  const ids = receipt.entry_ids;
  const checks: Check[] = [];

  const sorted = ids.every((id, index) => index === 0 || ids[index - 1]! < id);
  const shaped = ids.every((id) => ENTRY_ID_RE.test(id));
  const v1 = sorted && shaped && ids.length === commit.entries;
  checks.push({ id: "V1", status: v1 ? "PASS" : "FAIL", detail: v1 ? `${ids.length} ids, sorted and unique` : `sorted+unique ${sorted}, shaped ${shaped}, ${ids.length} ids vs commit.entries ${commit.entries}` });

  const sha = entryListSha256(ids);
  checks.push({ id: "V2", status: sha === commit.entry_list_sha256 ? "PASS" : "FAIL", detail: sha === commit.entry_list_sha256 ? `entry_list_sha256 ${sha.slice(0, 12)}` : `entry list hashes to ${sha.slice(0, 12)}, commit says ${String(commit.entry_list_sha256).slice(0, 12)}` });

  let v3 = commit.drand_chain === QUICKNET_LABEL;
  let v3detail = v3 ? "" : `chain '${commit.drand_chain}'`;
  try {
    const published = roundPublishedAt(commit.drand_round) * 1000;
    const committed = parseUtc(commit.committed_at_utc);
    if (published <= committed) {
      v3 = false;
      v3detail = `round ${commit.drand_round} was published before the commit`;
    } else if (v3) v3detail = `round ${commit.drand_round} published ${Math.round((published - committed) / 1000)} s after the commit`;
  } catch (error) {
    v3 = false;
    v3detail = (error as Error).message;
  }
  checks.push({ id: "V3", status: v3 ? "PASS" : "FAIL", detail: v3detail });

  let v4 = false;
  let v4detail = "";
  try {
    const picked = pick(rank(receipt.drand_randomness, ids), picks.winners, picks.alternates);
    v4 = sameList(picked.winners, receipt.winners) && sameList(picked.alternates, receipt.alternates);
    v4detail = v4 ? `${picked.winners.length} winners + ${picked.alternates.length} alternates reproduce` : "the ranking does not reproduce the published winners and alternates";
  } catch (error) {
    v4detail = (error as Error).message;
  }
  checks.push({ id: "V4", status: v4 ? "PASS" : "FAIL", detail: v4detail });

  const entryIds = drawing.entries.map((entry) => entry.entry_id).sort();
  const v6Problems: string[] = [];
  if (!sameList(entryIds, ids)) v6Problems.push(`entries cover ${entryIds.length} ids, receipt has ${ids.length}`);
  for (const entry of drawing.entries) {
    if (entryIdOf(entry.address_sha256) !== entry.entry_id) v6Problems.push(`${entry.entry_id} is not e_ + its address hash`);
    if (!entry.basis.every((basis) => BASIS_RE.test(basis)) || entry.basis.length === 0) v6Problems.push(`${entry.entry_id} has a basis outside review:rev_<32 hex>|free`);
  }
  checks.push({ id: "V6", status: v6Problems.length === 0 ? "PASS" : "FAIL", detail: v6Problems.length === 0 ? `${drawing.entries.length} entries match their hashes` : v6Problems.slice(0, 3).join("; ") });

  const teamIn = drawing.entries.filter((entry) => teamHashes.has(entry.address_sha256)).map((entry) => entry.entry_id);
  checks.push({ id: "V8.team", status: teamIn.length === 0 ? "PASS" : "FAIL", detail: teamIn.length === 0 ? "no entry hashes to a team mailbox" : `${teamIn.length} entries hash to a team mailbox` });

  if (drawing.beacon) {
    const signatureSha = createHash("sha256").update(Buffer.from(drawing.beacon.signature, "hex")).digest("hex");
    const ok = drawing.beacon.round === commit.drand_round && signatureSha === drawing.beacon.randomness && drawing.beacon.randomness === receipt.drand_randomness;
    checks.push({ id: "V9", status: ok ? "PASS" : "FAIL", detail: ok ? "beacon: sha256(signature) == randomness == the receipt's" : "the beacon does not match the receipt" });
  } else {
    checks.push({ id: "V9", status: "UNKNOWN", detail: "no beacon in the bundle: beacon_check unknown (offline BLS verification is P3)" });
  }
  checks.push({ id: "V10", status: "PENDING", detail: `group_email_at_utc ${String(commit.group_email_at_utc ?? "null")} is compared with the engine's own invitations read (observe)` });
  return checks;
}

/**
 * Every drawing in commit order, interleaving promotions by their own time. `ledger` is
 * drawings/winners.json; `teamHashes` the TEAM hashes. Returns per-drawing checks plus V7.
 */
export function replayAll(drawings: readonly DrawingInput[], ledger: Record<string, string>, teamHashes: readonly string[]): ReplayResult {
  const team = new Set(teamHashes);
  const ordered = [...drawings].sort((a, b) => parseUtc(a.receipt.commit.committed_at_utc) - parseUtc(b.receipt.commit.committed_at_utc));
  const results = new Map<DrawingInput, DrawingReplay>();
  const current = new Map<DrawingInput, string[]>();
  const used = new Map<DrawingInput, Set<string>>();
  for (const drawing of ordered) {
    const checks = verifyDrawing(drawing, team);
    results.set(drawing, { night: drawing.night, drawing_no: drawing.drawing_no, checks, pass: false, final_winners: [] });
    current.set(drawing, [...drawing.receipt.winners]);
    used.set(drawing, new Set());
  }

  type Event = { at: number; order: number; drawing: DrawingInput; promotion?: Promotion };
  const events: Event[] = [];
  for (const drawing of ordered) {
    events.push({ at: parseUtc(drawing.receipt.commit.committed_at_utc), order: 0, drawing });
    drawing.receipt.promoted.forEach((promotion, index) => events.push({ at: parseUtc(promotion.at_utc), order: 1 + index, drawing, promotion }));
  }
  events.sort((a, b) => a.at - b.at || a.order - b.order);

  const held = new Set<string>(); // the ledger as it stood at each event
  const v5 = new Map<DrawingInput, string[]>();
  const v8 = new Map<DrawingInput, string[]>();
  for (const event of events) {
    const { drawing } = event;
    if (!event.promotion) {
      const already = drawing.receipt.entry_ids.filter((id) => held.has(id));
      v8.set(drawing, already);
      for (const id of drawing.receipt.winners) held.add(id);
      continue;
    }
    const promotion = event.promotion;
    const winners = current.get(drawing)!;
    const issues = v5.get(drawing) ?? [];
    if (!winners.includes(promotion.replaces)) issues.push(`${promotion.replaces} is not a current winner when it is replaced`);
    const usedHere = used.get(drawing)!;
    const expected = drawing.receipt.alternates.find((id) => !usedHere.has(id) && !held.has(id)) ?? null;
    if (promotion.entry_id !== expected) issues.push(`expected ${expected ?? "no alternate left (prize not awarded)"}, receipt has ${promotion.entry_id ?? "none"}`);
    held.delete(promotion.replaces);
    current.set(drawing, winners.filter((id) => id !== promotion.replaces).concat(promotion.entry_id ? [promotion.entry_id] : []));
    if (promotion.entry_id) {
      usedHere.add(promotion.entry_id);
      held.add(promotion.entry_id);
    }
    v5.set(drawing, issues);
  }

  const finals = new Set<string>();
  for (const drawing of ordered) {
    const result = results.get(drawing)!;
    const promoIssues = v5.get(drawing) ?? [];
    result.checks.splice(4, 0, {
      id: "V5",
      status: promoIssues.length === 0 ? "PASS" : "FAIL",
      detail: drawing.receipt.promoted.length === 0 ? "no promotions" : promoIssues.length === 0 ? `${drawing.receipt.promoted.length} promotions take the first unused alternate` : promoIssues.join("; "),
    });
    const leftOut = v8.get(drawing) ?? [];
    result.checks.push({ id: "V8.ledger", status: leftOut.length === 0 ? "PASS" : "FAIL", detail: leftOut.length === 0 ? "no entry was already in the ledger at commit" : `${leftOut.length} entries were already winners at commit` });
    result.final_winners = current.get(drawing)!;
    result.final_winners.forEach((id) => finals.add(id));
    result.pass = result.checks.every((check) => check.status !== "FAIL");
  }

  const ledgerKeys = Object.keys(ledger).sort();
  const expectedKeys = [...finals].sort();
  const mismatch: string[] = [];
  if (!sameList(ledgerKeys, expectedKeys)) mismatch.push(`winners.json has ${ledgerKeys.length} keys, the receipts give ${expectedKeys.length}`);
  for (const [id, address] of Object.entries(ledger)) {
    if (address.slice(0, 16) !== id.slice(2)) mismatch.push(`${id} does not match its address hash`);
  }
  for (const drawing of ordered) {
    for (const entry of drawing.entries) {
      if (finals.has(entry.entry_id) && ledger[entry.entry_id] !== undefined && ledger[entry.entry_id] !== entry.address_sha256) {
        mismatch.push(`${entry.entry_id}: winners.json and the entries disagree on its hash`);
      }
    }
  }
  const ledgerCheck: Check = { id: "V7", status: mismatch.length === 0 ? "PASS" : "FAIL", detail: mismatch.length === 0 ? `ledger ${ledgerKeys.length} = the union of every final winner set` : mismatch.slice(0, 3).join("; ") };
  const out = ordered.map((drawing) => results.get(drawing)!);
  return { drawings: out, ledger: ledgerCheck, pass: ledgerCheck.status === "PASS" && out.every((result) => result.pass), final_ledger: expectedKeys };
}
